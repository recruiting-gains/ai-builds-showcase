import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export const LIMITS = Object.freeze({ steps: 30, activeMs: 90 * 60_000, attempts: 3 });
const digest = value => createHash('sha256').update(value).digest('hex');
const exists = file => fs.access(file).then(() => true, () => false);
const safeId = id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(id);

async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temporary, file);
}

async function appendEvent(file, value) {
  const handle = await fs.open(file, 'a', 0o600);
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
}

async function lockDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'runner.lock'), token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(file, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, token }));
      await handle.sync(); await handle.close();
      return async () => {
        const current = JSON.parse(await fs.readFile(file, 'utf8'));
        if (current.token === token) await fs.unlink(file);
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try { owner = JSON.parse(await fs.readFile(file, 'utf8')); }
      catch { throw new Error('Harness lock is unreadable; inspect it before recovery.'); }
      if (!Number.isInteger(owner.pid) || owner.pid < 1) throw new Error('Harness lock owner is invalid.');
      try { process.kill(owner.pid, 0); }
      catch (probe) {
        if (probe.code === 'ESRCH') {
          // Preserve stale lock evidence rather than hiding interrupted ownership.
          await fs.rename(file, `${file}.stale-${randomUUID()}`);
          continue;
        }
      }
      throw new Error('Another harness process owns this checkpoint.');
    }
  }
  throw new Error('Could not acquire the harness lock.');
}

export async function fingerprintInputs(projectDir, inputs = []) {
  const hash = createHash('sha256');
  hash.update(`node:${process.versions.node}\n`);
  async function visit(relative) {
    const absolute = path.resolve(projectDir, relative);
    if (absolute !== projectDir && !absolute.startsWith(projectDir + path.sep)) throw new Error('Input path escapes the project.');
    let stat;
    try { stat = await fs.lstat(absolute); }
    catch (error) { if (error.code === 'ENOENT') { hash.update(`missing:${relative}\n`); return; } throw error; }
    if (stat.isSymbolicLink()) throw new Error('Harness inputs must not follow symbolic links.');
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(absolute)).sort()) {
        if (name === 'node_modules' || name === '.git' || /^\.env|^\.dev\.vars/.test(name)) continue;
        await visit(path.join(relative, name));
      }
    } else if (stat.isFile()) {
      if (stat.size > 32_000_000) throw new Error('An input exceeds the 32 MB source/asset-file bound.');
      hash.update(relative + '\0'); hash.update(await fs.readFile(absolute)); hash.update('\0');
    }
  }
  for (const input of [...inputs].sort()) await visit(input);
  return hash.digest('hex');
}

function validateGraph(graph) {
  if (!safeId(graph.id) || !Array.isArray(graph.nodes) || !graph.nodes.length) throw new Error('Invalid graph.');
  const ids = new Set(graph.nodes.map(node => node.id));
  if (ids.size !== graph.nodes.length) throw new Error('Duplicate graph node.');
  for (const node of graph.nodes) {
    if (!safeId(node.id) || !Array.isArray(node.deps) || node.deps.some(dep => !ids.has(dep))) throw new Error('Invalid graph dependency.');
    if (node.kind !== 'external' && (!Array.isArray(node.command) || !node.command.length || node.command.some(value => typeof value !== 'string'))) throw new Error('Invalid command node.');
    if (node.kind === 'external' && (!node.checks?.length || node.checks.some(check => !safeId(check)))) throw new Error('External gates need explicit checks.');
  }
  const visited = new Set();
  while (visited.size < ids.size) {
    const ready = graph.nodes.filter(node => !visited.has(node.id) && node.deps.every(dep => visited.has(dep)));
    if (!ready.length) throw new Error('Workflow graph has a dependency cycle.');
    ready.forEach(node => visited.add(node.id));
  }
}

function runCommand(command, projectDir, timeoutMs, signal) {
  return new Promise(resolve => {
    let cause = null, settled = false, forceTimer;
    const child = spawn(command[0], command.slice(1), {
      cwd: projectDir, stdio: 'ignore', shell: false, detached: process.platform !== 'win32',
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    });
    const kill = type => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, type);
        else child.kill(type);
      } catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    const terminate = category => {
      if (settled || cause) return;
      cause = category; kill('SIGTERM');
      forceTimer = setTimeout(() => kill('SIGKILL'), 250);
    };
    const abort = () => terminate('interrupted');
    const timer = setTimeout(() => terminate('timeout'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    const finish = result => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(forceTimer);
      signal?.removeEventListener('abort', abort); resolve(result);
    };
    child.once('error', error => finish({ category: 'spawn-error', code: error.code ?? 'UNKNOWN' }));
    child.once('close', (exitCode, exitSignal) => finish({ category: cause ?? (exitCode === 0 ? 'passed' : 'command-failed'), exitCode, signal: exitSignal }));
    if (signal?.aborted) abort();
  });
}

function concreteReason(reason) {
  return typeof reason === 'string' && reason.trim().length >= 12 && reason.length <= 300 &&
    reason.trim().split(/\s+/).length >= 3 && !/[\u0000-\u001f]/.test(reason);
}

async function externalReceipt(file, node, inputFingerprint) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 32_768) throw new Error('Evidence must be a JSON file of at most 32 KB.');
  const bytes = await fs.readFile(file), evidence = JSON.parse(bytes);
  if (evidence.gate !== node.id || evidence.status !== 'passed' || evidence.sourceFingerprint !== inputFingerprint ||
    !Number.isFinite(Date.parse(evidence.observedAt)) || Date.parse(evidence.observedAt) > Date.now() + 60_000 ||
    node.checks.some(check => evidence.checks?.[check] !== true) ||
    !Array.isArray(evidence.references) || !evidence.references.length || evidence.references.some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Evidence does not satisfy this gate and source fingerprint.');
  }
  // Store the receipt digest, not raw references, comments, photographs or source contents.
  return { sha256: digest(bytes), observedAt: evidence.observedAt, kind: 'operator-supplied-external-evidence' };
}

/**
 * Execute bounded command nodes. This API neither launches AI agents nor deploys.
 * `newRun` is explicit; `resume` preserves attempts, steps and completed receipts.
 */
export async function runGraph({ graph, projectDir, stateDir, newRun = false, resume = false,
  retry, evidence = {}, acknowledgeInterrupted, signal, limits = {}, maxParallel = 2 }) {
  validateGraph(graph);
  projectDir = path.resolve(projectDir);
  stateDir = path.resolve(stateDir ?? path.join(projectDir, '.harness', graph.id));
  const caps = { ...LIMITS, ...limits };
  if (!Number.isInteger(caps.steps) || caps.steps < 1 || caps.steps > LIMITS.steps ||
    !Number.isFinite(caps.activeMs) || caps.activeMs < 1 || caps.activeMs > LIMITS.activeMs ||
    !Number.isInteger(caps.attempts) || caps.attempts < 1 || caps.attempts > LIMITS.attempts ||
    !Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 2) throw new Error('Limits may only reduce the published bounds.');
  const release = await lockDirectory(stateDir);
  const invocationBegan = performance.now();
  let persistence = Promise.resolve();
  const inFlight = new Map();
  const commandControl = new AbortController();
  const runSignal = signal ? AbortSignal.any([signal, commandControl.signal]) : commandControl.signal;
  try {
    const graphFingerprint = digest(JSON.stringify(graph));
    const inputFingerprint = await fingerprintInputs(projectDir, graph.inputs);
    const pointerFile = path.join(stateDir, 'current.json');
    let state, runDir;
    if (newRun || !(await exists(pointerFile))) {
      if (resume) throw new Error('No matching resumable run was selected.');
      const runId = `${Date.now()}-${randomUUID()}`;
      runDir = path.join(stateDir, 'runs', runId); await fs.mkdir(runDir, { recursive: true });
      state = { version: 1, runId, graphId: graph.id, graphFingerprint, sourceFingerprint: inputFingerprint,
        status: 'ready', reason: null, steps: 0, activeElapsedMs: 0, limits: caps, updatedAt: Date.now(),
        nodes: Object.fromEntries(graph.nodes.map(node => [node.id, { status: node.kind === 'external' ? 'external-pending' : 'pending', attempts: 0 }])) };
      await atomicJson(path.join(runDir, 'checkpoint.json'), state);
      await atomicJson(pointerFile, { runId });
    } else {
      if (!resume) throw new Error('A checkpoint exists. Use --resume or explicitly start --new.');
      const pointer = JSON.parse(await fs.readFile(pointerFile, 'utf8'));
      if (!/^[0-9]+-[0-9a-f-]+$/.test(pointer.runId)) throw new Error('Invalid run pointer.');
      runDir = path.join(stateDir, 'runs', pointer.runId);
      state = JSON.parse(await fs.readFile(path.join(runDir, 'checkpoint.json'), 'utf8'));
      if (state.version !== 1 || state.graphFingerprint !== graphFingerprint || state.graphId !== graph.id) throw new Error('Graph changed; use an explicit new run.');
      // A resume may tighten a budget but never silently reset or increase it.
      state.limits = Object.fromEntries(Object.keys(caps).map(key => [key, Math.min(caps[key], state.limits[key])]));
      const running = Object.values(state.nodes).filter(node => node.status === 'running');
      if (running.length) {
        // Time since a hard interruption is unknowable. Charge conservatively up
        // to the recorded command timeout; it may include downtime, never a reset.
        state.activeElapsedMs += Math.min(Math.max(0, Date.now() - state.updatedAt), Math.max(...running.map(node => node.timeoutMs)));
        running.forEach(node => { node.status = 'ambiguous'; node.result = { category: 'interrupted-without-receipt' }; });
      }
    }
    const began = invocationBegan, previousActive = state.activeElapsedMs;
    const active = () => previousActive + performance.now() - began;
    const persist = async (event, nodeId, detail = {}) => {
      state.activeElapsedMs = active(); state.updatedAt = Date.now();
      const snapshot = JSON.parse(JSON.stringify(state));
      persistence = persistence.then(async () => {
        await atomicJson(path.join(runDir, 'checkpoint.json'), snapshot);
        await appendEvent(path.join(runDir, 'events.jsonl'), { at: new Date().toISOString(), runId: state.runId, event, node: nodeId ?? null, ...detail });
      });
      await persistence;
    };
    const stop = async reason => {
      state.status = 'blocked'; state.reason = reason; await persist('blocked', null, { reason });
      return { state, runDir };
    };
    await persist(newRun ? 'new-run' : 'opened');

    if (acknowledgeInterrupted) {
      const node = graph.nodes.find(item => item.id === acknowledgeInterrupted.nodeId);
      const record = node && state.nodes[node.id];
      if (!record || record.status !== 'ambiguous' || node.idempotent !== true || !concreteReason(acknowledgeInterrupted.reason)) {
        throw new Error('Only an explicitly idempotent interrupted check can be acknowledged for retry.');
      }
      if (record.attempts >= state.limits.attempts) return stop('attempt-cap');
      record.status = 'pending'; record.acknowledgmentHash = digest(acknowledgeInterrupted.reason.trim());
      await persist('interruption-acknowledged', node.id);
    }
    if (retry) {
      const definition = graph.nodes.find(node => node.id === retry.nodeId);
      const record = state.nodes[retry.nodeId];
      if (!record || record.status !== 'failed' || !concreteReason(retry.reason)) throw new Error('Retry needs one failed node and a concrete correction reason.');
      if (definition?.idempotent !== true) throw new Error('Non-idempotent stages require external verification and cannot be retried by this runner.');
      if (record.attempts >= state.limits.attempts) return stop('attempt-cap');
      if (record.inputFingerprint === inputFingerprint) throw new Error('Unchanged failed inputs cannot be retried. Make and describe a concrete correction.');
      const reasonHash = digest(retry.reason.trim());
      if (record.corrections?.some(item => item.reasonHash === reasonHash)) throw new Error('Do not repeat an unchanged correction reason.');
      record.corrections = [...(record.corrections ?? []), { reasonHash, inputFingerprint }];
      record.status = 'pending'; await persist('correction-recorded', retry.nodeId);
    }
    if (state.sourceFingerprint !== inputFingerprint) {
      // A saved successful command is reusable only for unchanged source inputs.
      // External receipts also expire; a publication is never automatically repeated.
      for (const node of graph.nodes) {
        const record = state.nodes[node.id];
        if (record.status === 'passed') {
          if (node.kind !== 'external' && node.idempotent !== true) { record.status = 'ambiguous'; continue; }
          record.status = node.kind === 'external' ? 'external-pending' : 'pending';
        }
      }
      state.sourceFingerprint = inputFingerprint;
      await persist('source-changed');
    }
    if (Object.values(state.nodes).some(node => node.status === 'ambiguous')) return stop('ambiguous-interrupted-node');
    if (Object.values(state.nodes).some(node => node.status === 'failed')) return stop('correction-required');
    state.status = 'running'; state.reason = null;
    await persist('running');
    const launch = async node => {
      const record = state.nodes[node.id];
      record.status = 'running'; record.attempts++; state.steps++;
      record.inputFingerprint = inputFingerprint;
      record.timeoutMs = Math.max(1, Math.min(node.timeoutMs ?? 300_000, state.limits.activeMs - active()));
      await persist('started', node.id, { attempt: record.attempts, timeoutMs: record.timeoutMs });
      const remaining = state.limits.activeMs - active();
      const result = remaining <= 0 ? { category: 'time-cap' } :
        await runCommand(node.command, projectDir, Math.min(record.timeoutMs, remaining), runSignal);
      let changed;
      try { changed = await fingerprintInputs(projectDir, graph.inputs) !== inputFingerprint; }
      catch { changed = true; }
      record.result = changed ? { category: 'inputs-changed-during-check' } : result;
      record.status = record.result.category === 'passed' ? 'passed' : result.category === 'interrupted' ? 'ambiguous' : 'failed';
      await persist(record.status, node.id, { attempt: record.attempts, result: record.result });
    };
    while (true) {
      let reason = signal?.aborted ? 'interrupted' :
        active() >= state.limits.activeMs ? 'time-cap' :
          Object.values(state.nodes).some(node => ['failed', 'ambiguous'].includes(node.status)) ? 'correction-required' : null;
      const ready = graph.nodes.filter(node => ['pending', 'external-pending'].includes(state.nodes[node.id].status) && node.deps.every(dep => state.nodes[dep].status === 'passed'));
      for (const node of ready) {
        if (reason || inFlight.size >= maxParallel) break;
        const record = state.nodes[node.id];
        if (node.kind === 'external') {
          if (!evidence[node.id]) continue;
          if (state.steps >= state.limits.steps) { reason = 'step-cap'; break; }
          try { record.evidence = await externalReceipt(evidence[node.id], node, inputFingerprint); }
          catch { return stop('external-evidence-invalid'); }
          record.status = 'passed'; state.steps++;
          await persist('external-evidence-recorded', node.id, { evidence: record.evidence });
          continue;
        }
        if (state.steps >= state.limits.steps) { reason = 'step-cap'; break; }
        if (record.attempts >= state.limits.attempts) { reason = 'attempt-cap'; break; }
        const task = launch(node).finally(() => inFlight.delete(node.id));
        inFlight.set(node.id, task);
      }
      if (inFlight.size) { await Promise.race(inFlight.values()); continue; }
      if (reason) return stop(reason);
      if (Object.values(state.nodes).every(node => node.status === 'passed')) {
        state.status = 'complete'; state.reason = null; await persist('complete'); return { state, runDir };
      }
      if (graph.nodes.some(node => state.nodes[node.id].status === 'pending' && node.deps.every(dep => state.nodes[dep].status === 'passed'))) continue;
      if (graph.nodes.some(node => state.nodes[node.id].status === 'external-pending' && evidence[node.id] && node.deps.every(dep => state.nodes[dep].status === 'passed'))) continue;
      state.status = 'awaiting-evidence'; state.reason = 'external-observations-required';
      await persist('awaiting-external-evidence'); return { state, runDir };
    }
  } finally {
    commandControl.abort();
    await Promise.allSettled(inFlight.values());
    try { await persistence; } finally { await release(); }
  }
}
