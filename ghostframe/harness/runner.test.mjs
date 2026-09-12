import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { runGraph, LIMITS, fingerprintInputs } from './runner.mjs';
import { projectGraph } from './graphs.mjs';

const command = code => [process.execPath, '-e', code];
const graphWith = nodes => ({ id: 'fixture', inputs: ['input.json'], nodes });
const check = (id, code = 'process.exit(0)', deps = [], extra = {}) => ({ id, deps, command: command(code), idempotent: true, ...extra });
async function fixture() {
  const projectDir = path.resolve('.harness', 'runner-tests', randomUUID());
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, 'input.json'), JSON.stringify({ ready: false }));
  return { projectDir, stateDir: path.join(projectDir, '.harness', 'state') };
}
async function change(projectDir, value) { await fs.writeFile(path.join(projectDir, 'input.json'), JSON.stringify(value)); }
const readyCheck = "const fs=require('node:fs'); console.log('OUTPUT_MUST_NOT_ENTER_LOGS'); process.exit(JSON.parse(fs.readFileSync('input.json')).ready?0:2)";
const log = async result => (await fs.readFile(path.join(result.runDir, 'events.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));

test('independent checks overlap, dependency waits, and unchanged resume skips completed work', async () => {
  const env = await fixture();
  const graph = graphWith([
    check('first', "setTimeout(()=>process.exit(0),120)"),
    check('second', "setTimeout(()=>process.exit(0),120)"),
    check('finish', "require('node:fs').appendFileSync('count.txt','done\\n')", ['first', 'second']),
  ]);
  const result = await runGraph({ ...env, graph, newRun: true });
  assert.equal(result.state.status, 'complete');
  const events = await log(result);
  const starts = events.filter(event => event.event === 'started');
  assert.deepEqual(starts.map(event => event.node), ['first', 'second', 'finish']);
  assert.ok(events.findIndex(event => event.event === 'started' && event.node === 'second') < events.findIndex(event => event.event === 'passed'));
  assert.ok(events.findIndex(event => event.event === 'started' && event.node === 'finish') > events.findIndex(event => event.event === 'passed' && event.node === 'second'));
  const resumed = await runGraph({ ...env, graph, resume: true });
  assert.equal(resumed.state.steps, 3);
  assert.equal(await fs.readFile(path.join(env.projectDir, 'count.txt'), 'utf8'), 'done\n');
  assert.equal(resumed.state.runId, result.state.runId);
});

test('failed input needs a concrete changed correction, then recovery completes without logging output', async () => {
  const env = await fixture(), graph = graphWith([check('check', readyCheck), check('finish', 'process.exit(0)', ['check'])]);
  const failed = await runGraph({ ...env, graph, newRun: true });
  assert.equal(failed.state.status, 'blocked');
  assert.equal(failed.state.nodes.check.attempts, 1);
  await assert.rejects(runGraph({ ...env, graph, resume: true, retry: { nodeId: 'check', reason: 'Changed the expected input flag.' } }), /Unchanged/);
  await change(env.projectDir, { ready: true });
  await assert.rejects(runGraph({ ...env, graph, resume: true, retry: { nodeId: 'check', reason: 'retry' } }), /concrete/);
  const recovered = await runGraph({ ...env, graph, resume: true, retry: { nodeId: 'check', reason: 'Changed the fixture ready flag to true.' } });
  assert.equal(recovered.state.status, 'complete');
  assert.equal(recovered.state.nodes.check.attempts, 2);
  const raw = await fs.readFile(path.join(recovered.runDir, 'events.jsonl'), 'utf8');
  assert.ok(!raw.includes('OUTPUT_MUST_NOT_ENTER_LOGS'));
  assert.ok(!raw.includes('Changed the fixture'));
});

test('three attempts persist across resumes and cannot be reset with larger supplied limits', async () => {
  const env = await fixture(), graph = graphWith([check('check', readyCheck)]);
  await runGraph({ ...env, graph, newRun: true });
  await change(env.projectDir, { ready: false, revision: 2 });
  await runGraph({ ...env, graph, resume: true, retry: { nodeId: 'check', reason: 'Changed the first fixture revision for verification.' } });
  await change(env.projectDir, { ready: false, revision: 3 });
  const third = await runGraph({ ...env, graph, resume: true, retry: { nodeId: 'check', reason: 'Changed the second fixture revision for verification.' } });
  assert.equal(third.state.nodes.check.attempts, 3);
  await change(env.projectDir, { ready: true, revision: 4 });
  const capped = await runGraph({ ...env, graph, resume: true, retry: { nodeId: 'check', reason: 'Enabled the ready flag after the third attempt.' } });
  assert.equal(capped.state.reason, 'attempt-cap');
  assert.equal(capped.state.nodes.check.attempts, 3);
  await assert.rejects(runGraph({ ...env, graph, resume: true, limits: { attempts: 4 } }), /reduce/);
});

test('step cap prevents dispatch and stays in force on resume', async () => {
  const env = await fixture(), graph = graphWith([check('first'), check('second', 'process.exit(0)', ['first'])]);
  const result = await runGraph({ ...env, graph, newRun: true, limits: { steps: 1 } });
  assert.equal(result.state.reason, 'step-cap');
  assert.equal(result.state.nodes.second.attempts, 0);
  const resumed = await runGraph({ ...env, graph, resume: true });
  assert.equal(resumed.state.limits.steps, 1);
  assert.equal(resumed.state.steps, 1);
  assert.equal(resumed.state.nodes.second.attempts, 0);
});

test('remaining active time bounds a subprocess and leaves its dependent unstarted', async () => {
  const env = await fixture(), graph = graphWith([check('slow', 'setTimeout(()=>process.exit(0),5000)'), check('after', 'process.exit(0)', ['slow'])]);
  const start = Date.now();
  const result = await runGraph({ ...env, graph, newRun: true, limits: { activeMs: 180 } });
  assert.equal(result.state.status, 'blocked');
  assert.equal(result.state.reason, 'time-cap');
  assert.equal(result.state.nodes.slow.result.category, 'timeout');
  assert.equal(result.state.nodes.after.attempts, 0);
  assert.ok(Date.now() - start < 2000);
});

test('command-specific timeout fails without automatically retrying a check', async () => {
  const env = await fixture(), graph = graphWith([check('slow', 'setTimeout(()=>process.exit(0),5000)', [], { timeoutMs: 50 })]);
  const result = await runGraph({ ...env, graph, newRun: true });
  assert.equal(result.state.nodes.slow.result.category, 'timeout');
  const resumed = await runGraph({ ...env, graph, resume: true });
  assert.equal(resumed.state.nodes.slow.attempts, 1);
  assert.equal(resumed.state.reason, 'correction-required');
});

test('interrupted side effect remains ambiguous and cannot be repeated by resume or safe-check acknowledgment', async () => {
  const env = await fixture();
  const graph = graphWith([check('publish-fixture', "require('node:fs').appendFileSync('published.txt','once\\n')", [], { idempotent: false })]);
  const first = await runGraph({ ...env, graph, newRun: true });
  // Model the crash window after an external effect but before its completion receipt.
  const checkpoint = path.join(first.runDir, 'checkpoint.json');
  const uncertain = JSON.parse(await fs.readFile(checkpoint, 'utf8'));
  uncertain.status = 'running'; uncertain.nodes['publish-fixture'].status = 'running';
  await fs.writeFile(checkpoint, JSON.stringify(uncertain));
  const resumed = await runGraph({ ...env, graph, resume: true });
  assert.equal(resumed.state.reason, 'ambiguous-interrupted-node');
  assert.equal(resumed.state.nodes['publish-fixture'].status, 'ambiguous');
  assert.equal(await fs.readFile(path.join(env.projectDir, 'published.txt'), 'utf8'), 'once\n');
  await assert.rejects(runGraph({ ...env, graph, resume: true, acknowledgeInterrupted: { nodeId: 'publish-fixture', reason: 'Attempt to acknowledge uncertain publication without checking.' } }), /idempotent/);
});

test('exclusive lock rejects a second live runner', async () => {
  const env = await fixture(), graph = graphWith([check('wait', 'setTimeout(()=>process.exit(0),250)')]);
  const active = runGraph({ ...env, graph, newRun: true });
  for (let tries = 0; tries < 100; tries++) {
    try { await fs.access(path.join(env.stateDir, 'runner.lock')); break; } catch { await delay(5); }
  }
  await assert.rejects(runGraph({ ...env, graph, resume: true }), /owns this checkpoint/);
  assert.equal((await active).state.status, 'complete');
  await assert.rejects(fs.access(path.join(env.stateDir, 'runner.lock')));
});

test('external gates stay pending until valid source-bound receipts and retain their evidence boundary', async () => {
  const env = await fixture();
  const graph = graphWith([check('check'), { id: 'observed', kind: 'external', deps: ['check'], checks: ['real-result'] },
    { id: 'confirmed', kind: 'external', deps: ['observed'], checks: ['returned-result'] }]);
  const result = await runGraph({ ...env, graph, newRun: true });
  assert.equal(result.state.status, 'awaiting-evidence');
  const files = {};
  for (const [gate, checkName] of [['observed', 'real-result'], ['confirmed', 'returned-result']]) {
    const file = path.join(env.projectDir, `${gate}.json`); files[gate] = file;
    await fs.writeFile(file, JSON.stringify({ gate, status: 'passed', sourceFingerprint: result.state.sourceFingerprint,
      observedAt: new Date().toISOString(), checks: { [checkName]: true }, references: ['fixture-only-observation'] }));
  }
  const invalid = await runGraph({ ...env, graph, resume: true, evidence: { observed: files.confirmed } });
  assert.equal(invalid.state.reason, 'external-evidence-invalid');
  const completed = await runGraph({ ...env, graph, resume: true, evidence: files });
  assert.equal(completed.state.status, 'complete');
  assert.equal(completed.state.nodes.observed.evidence.kind, 'operator-supplied-external-evidence');
  await change(env.projectDir, { ready: true });
  const changed = await runGraph({ ...env, graph, resume: true });
  assert.equal(changed.state.status, 'awaiting-evidence');
  assert.equal(changed.state.nodes.observed.status, 'external-pending');
});

test('cycles and increases to the published bounds are rejected before execution', async () => {
  const env = await fixture();
  await assert.rejects(runGraph({ ...env, graph: graphWith([check('a', '', ['b']), check('b', '', ['a'])]), newRun: true }), /cycle/);
  await assert.rejects(runGraph({ ...env, graph: graphWith([check('a')]), newRun: true, limits: { activeMs: LIMITS.activeMs + 1 } }), /reduce/);
});

test('project fingerprints include authored vision code and the actual model/WASM bytes', async () => {
  const env = await fixture();
  await fs.mkdir(path.join(env.projectDir, 'tests'));
  await fs.mkdir(path.join(env.projectDir, 'public', 'wasm'), { recursive: true });
  await fs.writeFile(path.join(env.projectDir, 'public', 'vision-worker.js'), '// version one');
  const graph = await projectGraph(env.projectDir);
  const initial = await fingerprintInputs(env.projectDir, graph.inputs);
  await fs.writeFile(path.join(env.projectDir, 'public', 'vision-worker.js'), '// version two');
  const changedWorker = await fingerprintInputs(env.projectDir, graph.inputs);
  assert.notEqual(changedWorker, initial);
  await fs.writeFile(path.join(env.projectDir, 'public', 'wasm', 'test.wasm'), new Uint8Array([0, 1, 2, 3]));
  assert.notEqual(await fingerprintInputs(env.projectDir, graph.inputs), changedWorker);
});

test('a partially failed non-idempotent effect cannot be retried even with changed inputs', async () => {
  const env = await fixture();
  const graph = graphWith([check('partial', "require('node:fs').appendFileSync('effect.txt','once\\n');process.exit(2)", [], { idempotent: false })]);
  await runGraph({ ...env, graph, newRun: true });
  await change(env.projectDir, { ready: true });
  await assert.rejects(runGraph({ ...env, graph, resume: true, retry: { nodeId: 'partial', reason: 'Changed input but cannot establish external completion.' } }), /Non-idempotent/);
  assert.equal(await fs.readFile(path.join(env.projectDir, 'effect.txt'), 'utf8'), 'once\n');
});

test('a running checkpoint exists before the subprocess can perform work', async () => {
  const env = await fixture();
  const code = "const fs=require('node:fs'),path=require('node:path');const pointer=JSON.parse(fs.readFileSync('.harness/state/current.json'));const state=JSON.parse(fs.readFileSync(path.join('.harness/state/runs',pointer.runId,'checkpoint.json')));if(state.nodes.inspect.status!=='running'||state.nodes.inspect.attempts!==1||state.steps!==1)process.exit(2);";
  const result = await runGraph({ ...env, graph: graphWith([check('inspect', code)]), newRun: true });
  assert.equal(result.state.status, 'complete');
});

test('explicit cancellation stops the subprocess and persists ambiguity before handoff', async () => {
  const env = await fixture(), controller = new AbortController();
  const graph = graphWith([check('running', "require('node:fs').writeFileSync('started.txt','yes');setTimeout(()=>process.exit(0),5000)"), check('after', '', ['running'])]);
  const task = runGraph({ ...env, graph, newRun: true, signal: controller.signal });
  let started = false;
  for (let tries = 0; tries < 100; tries++) {
    try { await fs.access(path.join(env.projectDir, 'started.txt')); started = true; break; } catch { await delay(5); }
  }
  assert.equal(started, true);
  controller.abort();
  const result = await task;
  assert.equal(result.state.nodes.running.status, 'ambiguous');
  assert.equal(result.state.nodes.after.attempts, 0);
  const saved = JSON.parse(await fs.readFile(path.join(result.runDir, 'checkpoint.json'), 'utf8'));
  assert.equal(saved.nodes.running.result.category, 'interrupted');
});
