import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startOffice } from '../bridge/server.mjs';
function runHook(config, runtime, input) {
  return new Promise((ok, bad) => {
    const proc = execFile(
      process.execPath,
      [resolve('bridge/hook.mjs'), config, runtime],
      { timeout: 2000 },
      (error, stdout, stderr) => (error ? bad(error) : ok({ stdout, stderr })),
    );
    proc.stdin.end(JSON.stringify(input));
  });
}
test('hook fails silently with no decisions when config is absent', async () => {
  const result = await runHook(
    '/nonexistent-office-config',
    '/nonexistent-office-runtime',
    { prompt: 'PRIVATE' },
  );
  assert.deepEqual(result, { stdout: '{}\n', stderr: '' });
});
test('hook end-to-end projects sensitive fields into safe local events', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'office-hook-'));
  const cfg = join(dir, 'office.local.json'),
    runtime = join(dir, 'runtime.local.json');
  const config = {
    allowedPaths: ['/approved'],
    projects: [{ threadId: 'root', label: 'Test project' }],
  };
  await writeFile(cfg, JSON.stringify(config));
  await writeFile(join(dir, 'index.html'), 'office');
  const office = await startOffice({
    config,
    publicDir: dir,
    runtimeFile: runtime,
  });
  t.after(async () => {
    await new Promise((ok) => office.server.close(ok));
    await rm(dir, { recursive: true, force: true });
  });
  const result = await runHook(cfg, runtime, {
    cwd: '/approved',
    session_id: 'root',
    hook_event_name: 'PostToolUse',
    tool_response: { isError: true, text: 'PRIVATE' },
    prompt: 'PRIVATE',
    tool_input: { token: 'SECRET' },
  });
  assert.deepEqual(result, { stdout: '{}\n', stderr: '' });
  const snapshot = office.store.snapshot();
  assert.equal(snapshot.floors[0].agents[0].state, 'needs-help');
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(snapshot).includes('SECRET'), false);
});
