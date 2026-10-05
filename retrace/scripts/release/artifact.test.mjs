import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { policy, sha256, releaseConfig } from './policy.mjs';

const cli = fileURLToPath(new URL('./release.mjs', import.meta.url));
const config = fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url));
const commit = 'd'.repeat(40);
const version = 'feaf8c42-f8b2-483a-9033-4dfeefb0b262';
async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'retrace-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['source/retrace/worker', 'source/retrace/dist/media', 'source/retrace/public/media']) await mkdir(resolve(root, dir), { recursive: true });
  await cp(config, resolve(root, 'source/retrace/wrangler.jsonc'));
  await writeFile(resolve(root, 'source/retrace/worker/index.ts'), 'export class SignalRoom {}\nexport default {fetch(){return new Response("fixture");}};\n');
  await writeFile(resolve(root, 'source/retrace/dist/index.html'), '<h1>Fixture</h1>');
  await writeFile(resolve(root, 'source/retrace/public/media/manifest.json'), JSON.stringify({ files: policy.mediaFiles }));
  const env = { ...process.env, CLOUDFLARE_API_TOKEN: '', RETRACE_SOURCE: resolve(root, 'source'), RETRACE_ARTIFACT: resolve(root, 'artifact'), RETRACE_RELEASE_EVIDENCE: resolve(root, 'evidence'), RETRACE_COMMIT_SHA: commit, RETRACE_RELEASE_MODE: 'upload', RETRACE_EXPECTED_VERSION: version, WRANGLER_SEND_METRICS: 'false', XDG_CONFIG_HOME: resolve(root, 'runtime'), GITHUB_OUTPUT: '' };
  return { root, env, run: command => spawnSync(process.execPath, [cli, command], { env, encoding: 'utf8' }) };
}
test('rejects altered build artifact bytes before any authenticated API call', async t => {
  const { root, env, run } = await fixture(t);
  await mkdir(resolve(root, 'artifact/dist'), { recursive: true });
  const content = { 'dist/index.html': '<h1>Reviewed fixture</h1>', 'worker.js': 'export default {};', 'wrangler.release.json': JSON.stringify(releaseConfig()) };
  const manifest = { commit, worker: policy.worker, files: {} };
  for (const [path, text] of Object.entries(content)) {
    await writeFile(resolve(root, 'artifact', path), text);
    manifest.files[path] = { size: Buffer.byteLength(text), sha256: sha256(text) };
  }
  await writeFile(resolve(root, 'artifact/release.json'), JSON.stringify(manifest));
  env.RETRACE_ARTIFACT_HASH = sha256(JSON.stringify(manifest.files));
  await writeFile(resolve(root, 'artifact/dist/index.html'), 'unreviewed content');
  const release = run('release');
  assert.notEqual(release.status, 0);
  assert.match(release.stderr, /Artifact bytes differ/);
});
test('missing production media stops packaging rather than publishing a partial site', async t => {
  const { run } = await fixture(t);
  const packed = run('pack');
  assert.notEqual(packed.status, 0);
  assert.match(packed.stderr, /ReTrace-landscape\.mp4/);
});
test('removing manifest entries cannot omit existing videos from a release', async t => {
  const { root, run } = await fixture(t);
  await writeFile(resolve(root, 'source/retrace/public/media/manifest.json'), '{"files":[]}');
  const packed = run('pack');
  assert.notEqual(packed.status, 0);
  assert.match(packed.stderr, /Production media changed/);
});
test('configuration changes require explicit release-policy review', async t => {
  const { root, run } = await fixture(t);
  await writeFile(resolve(root, 'source/retrace/wrangler.jsonc'), '{"name":"other-worker"}');
  const packed = run('pack');
  assert.notEqual(packed.status, 0);
  assert.match(packed.stderr, /Wrangler configuration changed/);
});
