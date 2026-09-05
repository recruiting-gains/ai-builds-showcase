import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_PRESETS } from '../src/shared/workspaces';

// Boot an actual workerd runtime, not an imported Node.js handler or a remote deployment.
const port = Number(process.env.AIRFRAME_SMOKE_PORT ?? '8797');
assert(Number.isSafeInteger(port) && port >= 1024 && port <= 65535, 'Choose a valid unprivileged smoke-test port.');
const base = `http://127.0.0.1:${port}`;
const root = fileURLToPath(new URL('../', import.meta.url));
const executable = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

// An existing dev server must not make a broken new Worker appear to pass.
await new Promise<void>((resolve, reject) => {
  const probe = createServer();
  probe.once('error', (error) => reject(new Error(`Smoke-test port ${port} is unavailable. Choose a different AIRFRAME_SMOKE_PORT; no existing process was stopped.`, { cause: error })));
  probe.listen(port, '127.0.0.1', () => probe.close((error) => error ? reject(error) : resolve()));
});

const grouped = process.platform !== 'win32';
const child = spawn(process.execPath, [executable, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port)], {
  cwd: root,
  env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: grouped,
});
let logs = '';
const capture = (chunk: Buffer) => { logs = `${logs}${chunk.toString()}`.slice(-12_000); };
child.stdout.on('data', capture);
child.stderr.on('data', capture);
let spawnError: Error | undefined;
child.once('error', (error) => { spawnError = error; });

function signalOwnedProcess(signal: NodeJS.Signals): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (grouped) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
  }
}

async function localFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(5_000) });
}

function verifyHeaders(response: Response): void {
  const csp = response.headers.get('Content-Security-Policy') ?? '';
  assert(csp.includes("script-src 'self' 'wasm-unsafe-eval'"), 'Production-style WASM CSP is missing.');
  assert(csp.includes("connect-src 'self'") && !csp.includes("'unsafe-eval'"), 'Connection/script policy widened unexpectedly.');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert(response.headers.get('Permissions-Policy')?.includes('camera=(self), microphone=()'));
}

try {
  const deadline = Date.now() + 45_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Wrangler exited before becoming ready.');
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        const health = await response.json();
        assert.equal(health.service, 'airframe');
        ready = true;
        break;
      }
    } catch { /* The socket can be unavailable while the isolated runtime boots. */ }
    await delay(250);
  }
  assert(ready, 'Local Wrangler did not become healthy within 45 seconds.');

  const health = await localFetch('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'airframe', version: 1, cameraProcessing: 'on-device', layoutStorage: 'none' });
  assert.equal(health.headers.get('Cache-Control'), 'no-store');
  verifyHeaders(health);

  const homepage = await localFetch('/');
  assert.equal(homepage.status, 200);
  assert(homepage.headers.get('Content-Type')?.includes('text/html'));
  assert.match(await homepage.text(), /<title>.*Airframe/i);
  verifyHeaders(homepage);

  const presets = await localFetch('/api/presets');
  assert.equal(presets.status, 200);
  assert.deepEqual(await presets.json(), { presets: WORKSPACE_PRESETS });

  const first = WORKSPACE_PRESETS[0]!;
  const layout = { version: 1, presetId: first.id, cards: first.cards.map(({ id, x, y }) => ({ id, x, y })) };
  const valid = await localFetch('/api/layout/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(layout) });
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { valid: true, layout });

  const invalid = await localFetch('/api/layout/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(invalid.status, 400);
  verifyHeaders(invalid);
  const oversized = await localFetch('/api/layout/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ' '.repeat(8_193) });
  assert.equal(oversized.status, 413);

  const missing = await localFetch('/api/not-a-route');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'not_found');
  const method = await localFetch('/api/layout/validate');
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('Allow'), 'POST');

  const model = await localFetch('/models/hand_landmarker.task', { method: 'HEAD' });
  assert.equal(model.status, 200, 'Built local model asset is missing.');
  assert.equal(await model.text(), '', 'HEAD must not include a model body.');
  verifyHeaders(model);

  assert(child.exitCode === null && child.signalCode === null, 'Worker stopped during its HTTP checks.');
  console.log(JSON.stringify({ status: 'passed', baseURL: base, runtime: 'actual local Wrangler/workerd',
    checks: ['startup', 'health', 'HTML assets', 'presets', 'valid layout', 'malformed JSON', 'body limit', 'JSON 404', 'method 405', 'model HEAD', 'security headers'],
    cameraAccessed: false, deployed: false }, null, 2));
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit').catch(() => undefined);
    signalOwnedProcess('SIGTERM');
    await Promise.race([exited, delay(3_000)]);
    signalOwnedProcess('SIGKILL');
  }
}
