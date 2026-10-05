import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const policy = Object.freeze({
  repository: 'recruiting-gains/ai-builds-showcase',
  branch: 'main',
  accountId: '3058ec0673db0768c53a7991b701ff3b',
  worker: 'retrace',
  productionUrl: 'https://retrace.recruiting-gains.workers.dev',
  compatibilityDate: '2026-10-04',
  migrationTag: 'v1',
  namespaceId: '6a248445ad03426b97d191db59649568',
  configHash: '19a4407051a3ceb31314ef8ee963ffda4b87c5fbf19e7d73e93a41483e303703',
  secrets: ['INGEST_SECRET', 'SESSION_SECRET', 'VIEWER_SECRET'],
  mediaFiles: [
    { file: 'ReTrace-landscape.mp4', bytes: 6802418, sha256: '7b49d0291f7f74af190a86fae27b0a218299e3ffbf9d2e563f2473677f5593df' },
    { file: 'ReTrace-portrait.mp4', bytes: 7830649, sha256: '898a5ad59294ad588bfe31f02ba301d31e170fd46860b87161596b8e7a54b976' },
  ],
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function requiredMedia(manifest) {
  assert.ok(Array.isArray(manifest.files), 'Missing media manifest.');
  const metadata = manifest.files.map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 })).sort((a, b) => a.file.localeCompare(b.file));
  assert.deepEqual(metadata, policy.mediaFiles, 'Production media changed; review release policy before uploading.');
  return policy.mediaFiles;
}
export function commitId(value) {
  assert.match(value ?? '', /^[a-f0-9]{40}$/, 'Use a full lowercase 40-character reviewed commit SHA.');
  return value;
}
export function versionId(value) {
  assert.match(value ?? '', /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, 'Expected a Cloudflare version UUID.');
  return value;
}
export function validateDispatch({ repository, ref, commit, mode, expectedVersion }) {
  assert.equal(repository, policy.repository, 'Wrong repository.');
  assert.equal(ref, `refs/heads/${policy.branch}`, 'Run the trusted workflow from main.');
  commitId(commit);
  assert.ok(['verify', 'upload', 'production'].includes(mode), 'Unknown release mode.');
  if (mode !== 'verify') versionId(expectedVersion);
}
export function liveVersion(deployment, expected) {
  assert.equal(deployment?.versions?.length, 1, 'Split traffic requires a separate reviewed release.');
  assert.equal(deployment.versions[0].percentage, 100, 'Expected one version serving 100%.');
  const id = versionId(deployment.versions[0].version_id);
  if (expected) assert.equal(id, versionId(expected), 'Production changed; inspect it before starting a new run.');
  return id;
}
export function bindingFingerprint(version) {
  const bindings = version.resources?.bindings;
  assert.ok(Array.isArray(bindings), 'Missing binding metadata.');
  const names = new Map(bindings.map(b => [b.name, b]));
  assert.equal(names.size, bindings.length, 'Duplicate binding names.');
  assert.equal(names.get('ASSETS')?.type, 'assets');
  const room = names.get('SIGNAL_ROOM');
  assert.equal(room?.type, 'durable_object_namespace');
  assert.equal(room.class_name, 'SignalRoom');
  assert.equal(room.namespace_id, policy.namespaceId, 'Durable Object namespace changed.');
  assert.equal(version.resources.script_runtime.migration_tag, policy.migrationTag, 'Migration changes need a separate release review.');
  for (const name of policy.secrets) assert.equal(names.get(name)?.type, 'secret_text', `Missing existing ${name} binding.`);
  for (const binding of bindings) {
    assert.ok(['assets', 'durable_object_namespace', 'secret_text', 'secret_key', 'plain_text', 'json'].includes(binding.type), 'An additional resource binding needs release-policy review.');
    if (binding.type === 'assets') assert.equal(binding.name, 'ASSETS');
    if (binding.type === 'durable_object_namespace') assert.equal(binding.name, 'SIGNAL_ROOM');
  }
  // Compare values in memory, but never persist or print plaintext binding values.
  const normalized = bindings.map(b => Object.fromEntries(Object.entries(b).sort())).sort((a,b) => a.name.localeCompare(b.name));
  return sha256(JSON.stringify(normalized));
}
export function uploadRecord(ndjson) {
  const records = ndjson.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(r => r.type === 'version-upload');
  assert.equal(records.length, 1, 'Expected exactly one successful Wrangler upload record; inspect before retrying.');
  const record = records[0];
  assert.equal(record.version, 1);
  assert.equal(record.worker_name, policy.worker);
  versionId(record.version_id);
  return record;
}
export function releaseConfig() {
  return {
    name: policy.worker,
    account_id: policy.accountId,
    main: './worker.js',
    compatibility_date: policy.compatibilityDate,
    workers_dev: true,
    assets: { directory: './dist', binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: ['/api/*'] },
    durable_objects: { bindings: [{ name: 'SIGNAL_ROOM', class_name: 'SignalRoom' }] },
    migrations: [{ tag: policy.migrationTag, new_sqlite_classes: ['SignalRoom'] }],
  };
}
