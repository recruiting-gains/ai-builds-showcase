import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { policy, releaseConfig, sha256 } from './policy.mjs';

const commit = 'd'.repeat(40);
const previousVersion = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const uploadedVersion = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const previousDeployment = '11111111-1111-1111-1111-111111111111';
const promotedDeployment = '33333333-3333-3333-3333-333333333333';
const expectedReads = [
  'GET /deployments',
  `GET /versions/${previousVersion}`,
  'wrangler versions upload',
  `GET /versions/${uploadedVersion}`,
  'GET /deployments',
];

// This preload replaces fetch completely: no request can reach Cloudflare.
const preload = `
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.RETRACE_TEST_FIXTURE, 'utf8'));
const record = event => appendFileSync(fixture.events, JSON.stringify(event) + '\\n');
let deploymentReads = 0;
let promoted = false;
globalThis.fetch = async (url, options) => {
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + fixture.account + '/workers/scripts/retrace';
  assert.ok(typeof url === 'string' && url.startsWith(base + '/'), 'Unexpected network destination');
  assert.equal(options.headers.Authorization, 'Bearer offline-test-token-not-a-credential');
  const path = url.slice(base.length);
  const method = options.method;
  record({ operation: method + ' ' + path, body: options.body && JSON.parse(options.body) });
  let result;
  if (method === 'GET' && path === '/deployments') {
    deploymentReads++;
    result = { deployments: [promoted ? fixture.after : fixture.scenario === 'changed' && deploymentReads > 1 ? fixture.changed : fixture.before] };
  } else if (method === 'GET' && path === '/versions/' + fixture.previousVersion) {
    result = fixture.version;
  } else if (method === 'GET' && path === '/versions/' + fixture.uploadedVersion) {
    result = fixture.version;
  } else if (method === 'POST' && path === '/deployments') {
    assert.ok(['production', 'timeout'].includes(fixture.scenario), 'This scenario must never promote production');
    const report = JSON.parse(readFileSync(fixture.report, 'utf8'));
    assert.equal(report.status, 'promotion-requested', 'Persist intent before the mutation');
    assert.equal(report.version, fixture.uploadedVersion);
    assert.equal(report.previousVersion, fixture.previousVersion);
    record({ operation: 'durable promotion intent', report });
    if (fixture.scenario === 'timeout') throw new DOMException('Simulated ambiguous promotion timeout', 'TimeoutError');
    assert.equal(promoted, false, 'Promotion must only be requested once');
    promoted = true;
    result = fixture.after;
  } else {
    throw new Error('Forbidden Cloudflare operation: ' + method + ' ' + path);
  }
  return new Response(JSON.stringify({ success: true, result }), { status: 200 });
};
`;

// The only child command permitted is an upload, never Wrangler deploy or secrets.
const fakeWrangler = `
const assert = require('node:assert/strict');
const { appendFileSync, readFileSync } = require('node:fs');
const fixture = JSON.parse(readFileSync(process.env.RETRACE_TEST_FIXTURE, 'utf8'));
const args = process.argv.slice(2);
assert.deepEqual(args.slice(0, 2), ['versions', 'upload']);
for (const flag of ['--no-bundle', '--keep-vars', '--strict']) assert.ok(args.includes(flag));
assert.equal(args[args.indexOf('--tag') + 1], fixture.commit);
assert.deepEqual(JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8')), fixture.config);
appendFileSync(fixture.events, JSON.stringify({ operation: 'wrangler versions upload' }) + '\\n');
appendFileSync(process.env.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify({
  type: 'version-upload', version: 1, worker_name: 'retrace', version_id: fixture.uploadedVersion,
}) + '\\n');
`;

async function exercise(t, scenario) {
  const root = await mkdtemp(join(tmpdir(), 'retrace-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const controller = join(root, 'controller');
  const scripts = join(controller, 'scripts/release');
  const artifact = join(root, 'artifact');
  const evidence = join(root, 'evidence');
  const events = join(root, 'events.ndjson');
  const reportPath = join(evidence, 'release-report.json');
  await mkdir(scripts, { recursive: true });
  for (const name of ['policy.mjs', 'release.mjs']) {
    await copyFile(new URL(name, import.meta.url), join(scripts, name));
  }
  const wrangler = join(controller, 'node_modules/wrangler/bin/wrangler.js');
  await mkdir(dirname(wrangler), { recursive: true });
  await writeFile(wrangler, fakeWrangler);
  const files = {};
  for (const [path, text] of [
    ['dist/index.html', '<!doctype html><title>Offline release fixture</title>'],
    ['worker.js', 'export default { fetch() { return new Response("offline"); } };'],
    ['wrangler.release.json', JSON.stringify(releaseConfig())],
  ]) {
    await mkdir(dirname(join(artifact, path)), { recursive: true });
    await writeFile(join(artifact, path), text);
    files[path] = { size: Buffer.byteLength(text), sha256: sha256(text) };
  }
  await writeFile(join(artifact, 'release.json'), JSON.stringify({ commit, worker: policy.worker, files }));
  await writeFile(events, '');
  const before = { id: previousDeployment, versions: [{ version_id: previousVersion, percentage: 100 }] };
  const fixture = {
    scenario, commit, account: policy.accountId, previousVersion, uploadedVersion, before,
    after: { id: promotedDeployment, versions: [{ version_id: uploadedVersion, percentage: 100 }] },
    changed: { ...before, id: '22222222-2222-2222-2222-222222222222' },
    events, report: reportPath, config: releaseConfig(),
    version: {
      annotations: { 'workers/tag': commit },
      resources: {
        script_runtime: { migration_tag: policy.migrationTag, compatibility_date: policy.compatibilityDate },
        bindings: [
          { name: 'ASSETS', type: 'assets' },
          { name: 'SIGNAL_ROOM', type: 'durable_object_namespace', class_name: 'SignalRoom', namespace_id: policy.namespaceId },
          ...policy.secrets.map(name => ({ name, type: 'secret_text' })),
        ],
      },
    },
  };
  const fixturePath = join(root, 'fixture.json');
  const preloadPath = join(root, 'preload.mjs');
  await writeFile(fixturePath, JSON.stringify(fixture));
  await writeFile(preloadPath, preload);
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preloadPath).href, join(scripts, 'release.mjs'), 'release'], {
    cwd: root, encoding: 'utf8', timeout: 5000,
    // Deliberately do not inherit credentials, NODE_OPTIONS, or runner output paths.
    env: {
      RETRACE_TEST_FIXTURE: fixturePath,
      RETRACE_ARTIFACT: artifact,
      RETRACE_RELEASE_EVIDENCE: evidence,
      RETRACE_ARTIFACT_HASH: sha256(JSON.stringify(files)),
      RETRACE_COMMIT_SHA: commit,
      RETRACE_RELEASE_MODE: scenario === 'upload' ? 'upload' : 'production',
      RETRACE_EXPECTED_VERSION: previousVersion,
      CLOUDFLARE_ACCOUNT_ID: policy.accountId,
      CLOUDFLARE_API_TOKEN: 'offline-test-token-not-a-credential',
    },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  const calls = (await readFile(events, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  let report;
  try { report = JSON.parse(await readFile(reportPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { ...result, calls, report, evidence };
}

test('upload mode records the new version while leaving production untouched', async t => {
  const result = await exercise(t, 'upload');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.map(call => call.operation), expectedReads);
  assert.equal(result.report.status, 'uploaded-production-unchanged');
  assert.equal(result.report.version, uploadedVersion);
  assert.equal(result.report.previousVersion, previousVersion);
  assert.equal(result.report.previousDeployment, previousDeployment);
  assert.match(await readFile(join(result.evidence, 'rollback.txt'), 'utf8'), new RegExp(previousVersion));
});

test('production promotes once and confirms the uploaded version serving all traffic', async t => {
  const result = await exercise(t, 'production');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.map(call => call.operation), [...expectedReads, 'POST /deployments', 'durable promotion intent', 'GET /deployments']);
  const promotion = result.calls.find(call => call.operation === 'POST /deployments');
  assert.deepEqual(promotion.body, {
    strategy: 'percentage',
    versions: [{ version_id: uploadedVersion, percentage: 100 }],
    annotations: { 'workers/message': `Approved release ${commit}` },
  });
  assert.equal(result.report.status, 'production-confirmed-awaiting-http-verification');
  assert.equal(result.report.deployment, promotedDeployment);
  assert.equal(result.report.version, uploadedVersion);
  assert.equal(result.report.previousVersion, previousVersion);
  assert.equal(result.report.previousDeployment, previousDeployment);
});

test('a concurrent deployment blocks promotion even when its version remains the same', async t => {
  const result = await exercise(t, 'changed');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Another deployment occurred during upload/);
  assert.deepEqual(result.calls.map(call => call.operation), expectedReads);
  assert.equal(result.report.status, 'uploaded');
  assert.equal(result.report.version, uploadedVersion);
});

test('an ambiguous promotion timeout preserves intent and never retries the POST', async t => {
  const result = await exercise(t, 'timeout');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Simulated ambiguous promotion timeout/);
  assert.deepEqual(result.calls.map(call => call.operation), [...expectedReads, 'POST /deployments', 'durable promotion intent']);
  const promotion = result.calls.find(call => call.operation === 'POST /deployments');
  assert.deepEqual(promotion.body, {
    strategy: 'percentage',
    versions: [{ version_id: uploadedVersion, percentage: 100 }],
    annotations: { 'workers/message': `Approved release ${commit}` },
  });
  assert.equal(result.report.status, 'promotion-requested');
  assert.equal(result.report.version, uploadedVersion);
  assert.equal(result.report.previousVersion, previousVersion);
  assert.ok(Number.isFinite(Date.parse(result.report.promotionRequestedAt)));
  assert.equal(result.report.deployment, undefined);
  assert.deepEqual(result.report, result.calls.at(-1).report);
});
