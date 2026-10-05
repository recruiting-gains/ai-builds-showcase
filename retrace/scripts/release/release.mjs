import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { policy, sha256, commitId, versionId, validateDispatch, liveVersion, bindingFingerprint, uploadRecord, releaseConfig, requiredMedia } from './policy.mjs';

const command = process.argv[2];
const source = resolve(process.env.RETRACE_SOURCE || '.');
const artifact = resolve(process.env.RETRACE_ARTIFACT || 'release-artifact');
const evidence = resolve(process.env.RETRACE_RELEASE_EVIDENCE || 'release-evidence');
const commit = process.env.RETRACE_COMMIT_SHA;
const mode = process.env.RETRACE_RELEASE_MODE;
const expected = process.env.RETRACE_EXPECTED_VERSION;
const controller = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const wrangler = resolve(controller, 'node_modules/wrangler/bin/wrangler.js');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
function run(args, cwd) {
  const result = spawnSync(process.execPath, [wrangler, ...args], { cwd, stdio: 'inherit', env: process.env });
  assert.equal(result.status, 0, 'Wrangler failed. Inspect release evidence before retrying a mutation.');
}
async function files(root) {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Release artifacts must not contain symlinks.');
    if (entry.isDirectory()) found.push(...await files(path));
    else { assert.ok(entry.isFile()); found.push(path); }
  }
  return found.sort();
}
async function digestTree(root) {
  const output = {};
  for (const path of await files(root)) {
    const bytes = await readFile(path);
    output[relative(root, path)] = { size: bytes.length, sha256: sha256(bytes) };
  }
  return output;
}
async function validateArtifact() {
  const manifest = await json(resolve(artifact, 'release.json'));
  assert.equal(manifest.commit, commitId(commit));
  assert.equal(manifest.worker, policy.worker);
  assert.match(process.env.RETRACE_ARTIFACT_HASH || '', /^[a-f0-9]{64}$/, 'Missing trusted build-job artifact digest.');
  assert.equal(sha256(JSON.stringify(manifest.files)), process.env.RETRACE_ARTIFACT_HASH, 'Manifest differs from the build-job output.');
  const actual = await digestTree(artifact);
  delete actual['release.json'];
  assert.deepEqual(actual, manifest.files, 'Artifact bytes differ from the verified build.');
  assert.deepEqual(await json(resolve(artifact, 'wrangler.release.json')), releaseConfig(), 'Unexpected deployment configuration.');
  return manifest;
}
async function api(path, body) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  assert.ok(token, 'Set CLOUDFLARE_API_TOKEN only in the protected GitHub environment.');
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, policy.accountId);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${policy.accountId}/workers/scripts/${policy.worker}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  assert.ok(response.ok && data.success, `Cloudflare request failed (HTTP ${response.status}); inspect state before retrying. Codes: ${(data.errors || []).map(e => e.code).join(', ')}`);
  return data.result;
}
async function current() {
  const result = await api('/deployments');
  assert.ok(result.deployments?.[0], 'No existing production deployment; this workflow cannot create a new service.');
  return result.deployments[0];
}

await mkdir(evidence, { recursive: true });
if (command === 'validate') {
  validateDispatch({ repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, commit, mode, expectedVersion: expected });
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
  assert.equal(actual, commit);
  execFileSync('git', ['merge-base', '--is-ancestor', commit, `origin/${policy.branch}`], { cwd: source });
  console.log(`Reviewed main commit: ${commit}; mode: ${mode}`);
} else if (command === 'pack') {
  commitId(commit);
  const project = resolve(source, 'retrace');
  assert.equal(sha256(await readFile(resolve(project, 'wrangler.jsonc'))), policy.configHash, 'Wrangler configuration changed; review release policy before uploading.');
  await mkdir(artifact, { recursive: false });
  await cp(resolve(project, 'dist'), resolve(artifact, 'dist'), { recursive: true });
  const media = await json(resolve(project, 'public/media/manifest.json'));
  for (const item of requiredMedia(media)) {
    assert.match(item.file, /^[A-Za-z0-9_-]+\.mp4$/);
    const bytes = await readFile(resolve(artifact, 'dist/media', item.file));
    assert.equal(bytes.length, item.bytes, `Missing or incomplete ${item.file}`);
    assert.equal(sha256(bytes), item.sha256, `Changed ${item.file}`);
  }
  run(['deploy', '--dry-run', '--outdir', resolve(evidence, 'bundle')], project);
  await cp(resolve(evidence, 'bundle/index.js'), resolve(artifact, 'worker.js'));
  await save(resolve(artifact, 'wrangler.release.json'), releaseConfig());
  const manifest = { commit, worker: policy.worker, files: await digestTree(artifact) };
  await save(resolve(artifact, 'release.json'), manifest);
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `artifact_hash=${sha256(JSON.stringify(manifest.files))}\n`, { flag: 'a' });
  console.log(`Packaged ${Object.keys(manifest.files).length} verified files at ${commit}.`);
} else if (command === 'release') {
  assert.ok(['upload', 'production'].includes(mode));
  versionId(expected);
  const manifest = await validateArtifact();
  const before = await current();
  const previousVersion = liveVersion(before, expected);
  const old = await api(`/versions/${previousVersion}`);
  const fingerprint = bindingFingerprint(old);
  const report = { commit, mode, previousDeployment: before.id, previousVersion, artifactHash: sha256(JSON.stringify(manifest.files)), status: 'preflight-passed' };
  const reportFile = resolve(evidence, 'release-report.json');
  await save(reportFile, report);
  await writeFile(resolve(evidence, 'rollback.txt'), `Recorded previous version: ${previousVersion}\nPrevious deployment: ${before.id}\nRollback requires a separate explicit approval and current-state check. It does not restore stored data.\n`);
  const output = resolve(evidence, 'wrangler-upload.ndjson');
  // Unique per run; Wrangler appends. Never reuse an old upload record.
  await writeFile(output, '', { flag: 'wx' });
  process.env.WRANGLER_OUTPUT_FILE_PATH = output;
  run(['versions', 'upload', '--config', resolve(artifact, 'wrangler.release.json'), '--no-bundle', '--keep-vars', '--strict', '--tag', commit, '--message', `Reviewed GitHub commit ${commit}`], artifact);
  const uploaded = uploadRecord(await readFile(output, 'utf8'));
  report.version = uploaded.version_id;
  report.status = 'uploaded';
  await save(reportFile, report);
  const version = await api(`/versions/${report.version}`);
  assert.equal(version.annotations?.['workers/tag'], commit, 'Uploaded version does not identify this commit.');
  assert.equal(bindingFingerprint(version), fingerprint, 'Uploaded version changed runtime bindings. Do not promote.');
  assert.equal(version.resources.script_runtime.compatibility_date, policy.compatibilityDate);
  const unchanged = await current();
  assert.equal(unchanged.id, before.id, 'Another deployment occurred during upload; do not promote.');
  liveVersion(unchanged, expected);
  if (mode === 'production') {
    // Deployments API changes traffic only. Wrangler versions deploy also syncs settings.
    // No automatic retry or force flag: a failed response can be ambiguous.
    report.status = 'promotion-requested';
    report.promotionRequestedAt = new Date().toISOString();
    await save(reportFile, report);
    const deployed = await api('/deployments', { strategy: 'percentage', versions: [{ version_id: report.version, percentage: 100 }], annotations: { 'workers/message': `Approved release ${commit}` } });
    report.deployment = deployed.id;
    await save(reportFile, report);
    let after;
    for (let attempt = 0; attempt < 5; attempt++) {
      after = await current();
      if (after.id === report.deployment) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    liveVersion(after, report.version);
    assert.equal(after.id, report.deployment);
    report.status = 'production-confirmed-awaiting-http-verification';
  } else report.status = 'uploaded-production-unchanged';
  await save(reportFile, report);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `### ReTrace release\n\n- Commit: \`${commit}\`\n- Uploaded version: \`${report.version}\`\n- Previous production version: \`${previousVersion}\`\n- Result: ${report.status}\n\nVersion URLs are not assumed for this Durable Object Worker.\n`, { flag: 'a' });
  console.log(JSON.stringify(report, null, 2));
} else throw new Error('Use validate, pack, or release.');
