import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHook, OfficeStore } from '../bridge/state.mjs';
const config = {
  allowedPaths: ['/approved/build'],
  projects: [{ threadId: 'root', label: 'My build' }],
};
const event = (name, more = {}) => ({
  cwd: '/approved/build',
  session_id: 'root',
  hook_event_name: name,
  ...more,
});
test('rejects unapproved directories and unknown events', () => {
  assert.equal(
    sanitizeHook(event('PreToolUse', { cwd: '/private' }), config.allowedPaths),
    null,
  );
  assert.equal(sanitizeHook(event('Invented'), config.allowedPaths), null);
  assert.equal(sanitizeHook(event('SubagentStart'), config.allowedPaths), null);
  const store = new OfficeStore(config);
  assert.equal(
    store.apply(event('UserPromptSubmit', { session_id: 'unapproved' })),
    false,
  );
});
test('redacts all prompt, code, paths, preview and credential-like values', () => {
  const store = new OfficeStore(config, () => 1000);
  store.apply(
    event('PostToolUse', {
      prompt: 'PRIVATE_PROMPT',
      preview: 'PRIVATE_PREVIEW',
      transcript_path: 'PRIVATE_TRANSCRIPT',
      tool_input: { token: 'SECRET_TOKEN' },
      tool_response: { exit_code: 1, text: 'PRIVATE_OUTPUT' },
    }),
  );
  const snapshot = JSON.stringify(store.snapshot());
  for (const s of [
    'PRIVATE',
    'SECRET',
    '/approved',
    'root',
    'tool_response',
    'transcript',
  ])
    assert.equal(snapshot.includes(s), false, s);
  assert.equal(store.snapshot().floors[0].agents[0].state, 'needs-help');
});
test('only structured failure flags cause an error state', () => {
  const store = new OfficeStore(config, () => 1);
  store.apply(event('PostToolUse', { tool_response: 'looks like failed' }));
  assert.equal(store.snapshot().floors[0].agents[0].state, 'working');
});
test('real subagent assignment stays on the parent floor', () => {
  const store = new OfficeStore(config, () => 1000);
  store.apply(event('UserPromptSubmit'));
  store.apply(event('SubagentStart', { agent_id: 'child' }));
  store.apply(event('PermissionRequest', { session_id: 'child' }));
  let snap = store.snapshot();
  assert.equal(snap.floors.length, 1);
  assert.equal(snap.floors[0].agents.length, 2);
  assert.equal(snap.floors[0].agents[1].parentId, snap.floors[0].agents[0].id);
  assert.equal(snap.floors[0].agents[1].state, 'waiting');
  store.apply(
    event('SubagentStop', {
      agent_id: 'child',
      last_assistant_message: 'PRIVATE',
    }),
  );
  assert.equal(store.snapshot().floors[0].agents[1].state, 'ended');
  assert.match(
    store.snapshot().floors[0].events[0].message,
    /outcome not evaluated/,
  );
});
test('silence becomes unknown, not successful', () => {
  let time = 1000;
  const store = new OfficeStore(config, () => time);
  store.apply(event('UserPromptSubmit'));
  time += 60001;
  assert.equal(store.snapshot().floors[0].agents[0].state, 'unknown');
  assert.equal(store.snapshot().observedAt, 1000);
});
test('interrupt and end do not imply project success', () => {
  const store = new OfficeStore(config, () => 1000);
  store.apply(event('Interrupt'));
  assert.equal(store.snapshot().floors[0].agents[0].state, 'idle');
  store.apply(event('Stop'));
  assert.equal(store.snapshot().floors[0].agents[0].state, 'ended');
});
test('separate tasks receive separate floors; history is bounded', () => {
  const store = new OfficeStore(
    {
      ...config,
      projects: Array.from({ length: 30 }, (_, i) => ({
        threadId: 'task-' + i,
      })),
    },
    () => 1000,
  );
  for (let i = 0; i < 30; i++)
    store.apply(event('SessionStart', { session_id: 'task-' + i }));
  assert.equal(store.snapshot().floors.length, 20);
  for (let i = 0; i < 50; i++)
    store.apply(
      event(i % 2 ? 'PreToolUse' : 'PermissionRequest', {
        session_id: 'task-0',
      }),
    );
  assert.equal(store.snapshot().floors[0].events.length, 20);
});
