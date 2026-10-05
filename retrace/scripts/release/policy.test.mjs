import test from 'node:test';
import assert from 'node:assert/strict';
import { policy, commitId, validateDispatch, liveVersion, bindingFingerprint, uploadRecord, releaseConfig, requiredMedia } from './policy.mjs';

const sha = 'd'.repeat(40);
const version = 'feaf8c42-f8b2-483a-9033-4dfeefb0b262';
const dispatch = { repository: policy.repository, ref: 'refs/heads/main', commit: sha, mode: 'verify' };
const deployment = { versions: [{ version_id: version, percentage: 100 }] };
function fixture() {
  return { resources: {
    script_runtime: { migration_tag: 'v1' },
    bindings: [{ name: 'ASSETS', type: 'assets' }, { name: 'SIGNAL_ROOM', type: 'durable_object_namespace', class_name: 'SignalRoom', namespace_id: policy.namespaceId }, ...policy.secrets.map(name => ({ name, type: 'secret_text' }))],
  } };
}
test('requires a full immutable commit and trusted workflow ref', () => {
  assert.equal(commitId(sha), sha);
  for (const bad of ['main', 'dd0d654', sha + ';echo bad', 'D'.repeat(40), '../main']) assert.throws(() => commitId(bad));
  validateDispatch(dispatch);
  assert.throws(() => validateDispatch({ ...dispatch, ref: 'refs/heads/unreviewed' }));
  assert.throws(() => validateDispatch({ ...dispatch, repository: 'someone/other' }));
});
test('requires explicit known production version for every mutation mode', () => {
  for (const mode of ['upload', 'production']) {
    assert.throws(() => validateDispatch({ ...dispatch, mode }));
    validateDispatch({ ...dispatch, mode, expectedVersion: version });
  }
  assert.throws(() => validateDispatch({ ...dispatch, mode: 'deploy-all' }));
});
test('rejects changed or split live traffic instead of overwriting it', () => {
  assert.equal(liveVersion(deployment, version), version);
  assert.throws(() => liveVersion(deployment, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
  assert.throws(() => liveVersion({ versions: [{ version_id: version, percentage: 50 }] }));
  assert.throws(() => liveVersion({ versions: [...deployment.versions, ...deployment.versions] }));
});
test('preserves storage identity and detects missing secrets, extra resources and migrations', () => {
  const good = fixture();
  const fingerprint = bindingFingerprint(good);
  const reordered = fixture(); reordered.resources.bindings.reverse();
  assert.equal(bindingFingerprint(reordered), fingerprint);
  for (const mutate of [
    v => { v.resources.bindings[1].namespace_id = 'new-storage'; },
    v => { v.resources.bindings.pop(); },
    v => { v.resources.bindings.push({ name: 'UNREVIEWED', type: 'd1' }); },
    v => { v.resources.script_runtime.migration_tag = 'v2'; },
  ]) { const value = fixture(); mutate(value); assert.throws(() => bindingFingerprint(value)); }
});
test('unchanged plaintext variables are fingerprinted without printing their values', () => {
  const a = fixture(); const b = fixture();
  a.resources.bindings.push({ name: 'FEATURE', type: 'plain_text', text: 'old' });
  b.resources.bindings.push({ name: 'FEATURE', type: 'plain_text', text: 'changed' });
  assert.notEqual(bindingFingerprint(a), bindingFingerprint(b));
});
test('parses one typed Wrangler record and refuses stale, malformed or dry-run output', () => {
  const record = { type: 'version-upload', version: 1, worker_name: 'retrace', version_id: version };
  assert.equal(uploadRecord(JSON.stringify({ type: 'wrangler-session' }) + '\n' + JSON.stringify(record)).version_id, version);
  for (const data of [JSON.stringify(record) + '\n' + JSON.stringify(record), JSON.stringify({ ...record, version_id: null }), JSON.stringify({ ...record, worker_name: 'other-app' }), 'not json']) assert.throws(() => uploadRecord(data));
});
test('release configuration cannot target another service or add a storage migration', () => {
  const config = releaseConfig();
  assert.equal(config.name, 'retrace');
  assert.equal(config.account_id, policy.accountId);
  assert.deepEqual(config.migrations, [{ tag: 'v1', new_sqlite_classes: ['SignalRoom'] }]);
  assert.equal(config.build, undefined);
  assert.equal(config.routes, undefined);
  assert.equal(config.observability, undefined);
});
test('requires both original videos with their reviewed size and hash even if source manifest removes them', () => {
  assert.deepEqual(requiredMedia({ files: [...policy.mediaFiles].reverse() }), policy.mediaFiles);
  for (const files of [[], policy.mediaFiles.slice(0, 1), [...policy.mediaFiles, policy.mediaFiles[0]], policy.mediaFiles.map(f => ({ ...f, sha256: '0'.repeat(64) }))]) {
    assert.throws(() => requiredMedia({ files }), /Production media changed/);
  }
});
