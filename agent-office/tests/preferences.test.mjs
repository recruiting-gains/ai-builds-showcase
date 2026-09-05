import test from 'node:test';
import assert from 'node:assert/strict';
import { assignLayouts } from '../lib/preferences.mjs';
test('room rotation persists across reorder, relaunch and demo/live changes', () => {
  const rooms = ['a', 'b', 'c', 'd', 'e'];
  const first = assignLayouts({}, ['one', 'two', 'three'], rooms);
  assert.deepEqual(first, { one: 'a', two: 'b', three: 'c' });
  assert.equal(assignLayouts(first, ['three', 'one', 'two'], rooms), first);
  const restored = JSON.parse(JSON.stringify(first));
  const next = assignLayouts(
    restored,
    ['four', 'five', 'six', 'demo-0'],
    rooms,
  );
  assert.deepEqual(next, {
    one: 'a',
    two: 'b',
    three: 'c',
    four: 'd',
    five: 'e',
    six: 'a',
    'demo-0': 'a',
  });
});
