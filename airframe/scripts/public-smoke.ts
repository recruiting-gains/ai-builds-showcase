import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Read-only hosting checks, except layout validation (which has no persistence).
// Never opens a camera, uploads frames, or injects code into the deployed app.
const base = new URL(process.env.AIRFRAME_PUBLIC_URL ?? 'https://airframe.recruiting-gains.workers.dev/');
assert.equal(base.protocol, 'https:', 'Public camera deployment requires HTTPS.');
const checks: string[] = [];
async function get(path: string, init?: RequestInit) {
  const response = await fetch(new URL(path, base), { ...init, signal: AbortSignal.timeout(30_000) });
  assert.match(response.headers.get('content-security-policy') ?? '', /connect-src 'self'/);
  assert.match(response.headers.get('permissions-policy') ?? '', /microphone=\(\)/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  return response;
}

const home = await get('/');
assert.equal(home.status, 200);
const html = await home.text();
assert.match(html, /Airframe/);
const shipped = await readFile('dist/index.html', 'utf8');
assert.equal(html, shipped, 'Public homepage must match the local production build.');
checks.push('HTTPS homepage matches the built release; security headers present');

const health = await get('/api/health');
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: 'ok', service: 'airframe', version: 1, cameraProcessing: 'on-device', layoutStorage: 'none' });
checks.push('Public Worker health returns the expected service and privacy contract');

const presetsResponse = await get('/api/presets');
assert.equal(presetsResponse.status, 200);
const { presets } = await presetsResponse.json() as { presets: { id: string; cards: { id: string; x: number; y: number }[] }[] };
assert.equal(presets.length, 3);
const layout = { version: 1, presetId: presets[0].id, cards: presets[0].cards.map(({ id, x, y }) => ({ id, x, y })) };
const valid = await get('/api/layout/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(layout) });
assert.equal(valid.status, 200);
assert.deepEqual(await valid.json(), { valid: true, layout });
const invalid = await get('/api/layout/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(invalid.status, 400);
const missing = await get('/api/not-a-route');
assert.equal(missing.status, 404);
assert.match(missing.headers.get('content-type') ?? '', /application\/json/);
checks.push('Three presets, valid layout validation, invalid-layout rejection, and API JSON 404');

const model = await get('/models/hand_landmarker.task');
assert.equal(model.status, 200);
const modelBytes = Buffer.from(await model.arrayBuffer());
const modelSha256 = createHash('sha256').update(modelBytes).digest('hex');
assert.equal(modelBytes.length, 7_819_105);
assert.equal(modelSha256, 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1');
checks.push('Deployed model byte length and SHA-256 match the pinned official download');

for (const path of ['/airframe-preview.png', '/vision/vision_wasm_module_internal.wasm', '/LICENSE-MEDIAPIPE.txt']) {
  assert.equal((await get(path, { method: 'HEAD' })).status, 200, path);
}
const notices = await get('/THIRD-PARTY-NOTICES.txt');
assert.equal(notices.status, 200);
assert.equal(await notices.text(), await readFile('public/THIRD-PARTY-NOTICES.txt', 'utf8'));
checks.push('Screenshot, WASM, model license, and current third-party notices are served');

const report = { status: 'passed', checkedAt: new Date().toISOString(), baseURL: base.href, checks, modelSha256, physicalCameraTested: false };
await mkdir('test-results', { recursive: true });
await writeFile('test-results/public-release.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
