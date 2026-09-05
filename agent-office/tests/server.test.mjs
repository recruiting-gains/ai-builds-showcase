import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import {
  startOffice,
  secretEqual,
  permittedRequest,
} from '../bridge/server.mjs';
test('secret comparison and origin guards fail closed', () => {
  assert.equal(secretEqual('abc', 'ab'), false);
  assert.equal(secretEqual(undefined, 'x'), false);
  assert.equal(secretEqual('ok', 'ok'), true);
  const origin = 'http://127.0.0.1:1111';
  assert.equal(
    permittedRequest({ headers: { host: 'evil.example:1111' } }, origin),
    false,
  );
  assert.equal(
    permittedRequest(
      { headers: { host: '127.0.0.1:1111', origin: 'https://evil.example' } },
      origin,
    ),
    false,
  );
  assert.equal(
    permittedRequest(
      { headers: { host: '127.0.0.1:1111', 'sec-fetch-site': 'cross-site' } },
      origin,
    ),
    false,
  );
});
test('local HTTP server is authenticated, origin-isolated, bounded and redacted', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-office-test-'));
  await writeFile(join(dir, 'index.html'), '<h1>Office</h1>');
  await symlink('/etc/hosts', join(dir, 'outside.txt'));
  const office = await startOffice({
    config: {
      allowedPaths: ['/approved'],
      projects: [{ threadId: 'root', label: 'Example' }],
    },
    publicDir: dir,
  });
  t.after(async () => {
    await new Promise((ok) => office.server.close(ok));
    await rm(dir, { recursive: true, force: true });
  });
  const headers = {
    Authorization: 'Bearer ' + office.token,
    'Content-Type': 'application/json',
  };
  assert.equal((await fetch(office.origin)).status, 200);
  assert.equal((await fetch(office.origin + '/outside.txt')).status, 403);
  assert.equal((await fetch(office.origin + '/api/status')).status, 401);
  assert.equal(
    (
      await fetch(office.origin + '/api/status', {
        headers: { ...headers, Origin: 'https://example.com' },
      })
    ).status,
    403,
  );
  const badHost = await new Promise((ok) => {
    const req = request(
      office.origin + '/api/status',
      { headers: { ...headers, Host: 'attacker.example' } },
      (res) => {
        res.resume();
        ok(res.statusCode);
      },
    );
    req.end();
  });
  assert.equal(badHost, 403);
  assert.equal(
    (
      await fetch(office.origin + '/api/execute', {
        method: 'POST',
        headers,
        body: '{}',
      })
    ).status,
    405,
  );
  let state = await (
    await fetch(office.origin + '/api/status', { headers })
  ).json();
  assert.equal(state.connected, false);
  assert.equal(state.floors.length, 0);
  const post = (body) =>
    fetch(office.origin + '/api/events', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  assert.equal(
    (await post({ cwd: '/no', session_id: 'root', hook_event_name: 'Stop' }))
      .status,
    400,
  );
  assert.equal(
    (
      await post({
        cwd: '/approved',
        session_id: 'root',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'PRIVATE',
      })
    ).status,
    202,
  );
  state = await (
    await fetch(office.origin + '/api/status', { headers })
  ).json();
  assert.equal(state.connected, true);
  assert.equal(JSON.stringify(state).includes('PRIVATE'), false);
  assert.equal(state.floors[0].agents[0].state, 'working');
  assert.equal((await post({ padding: 'x'.repeat(17000) })).status, 413);
  assert.equal((await fetch(office.origin, { method: 'POST' })).status, 405);
  await new Promise((ok) => {
    const req = request(office.origin + '/api/events', {
      method: 'POST',
      headers: { ...headers, 'Content-Length': '1000' },
    });
    req.on('error', () => ok());
    req.write('{"');
    setTimeout(() => {
      req.destroy();
      ok();
    }, 15);
  });
  assert.equal(
    (await fetch(office.origin + '/api/status', { headers })).status,
    200,
  );
});
