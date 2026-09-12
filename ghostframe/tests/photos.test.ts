import test from 'node:test';
import assert from 'node:assert/strict';
import { PhotoSlots, validatePhoto, photoFit, MAX_PHOTO_BYTES, type PhotoAsset } from '../src/photos';
const file = { name: 'local.jpg', size: 300, type: 'image/jpeg' } as File;
function asset(name: string) { let disposed = 0; return { name, image: {} as ImageBitmap, preview: name, dispose() { disposed++; }, get disposed() { return disposed; } }; }

test('two photos retain the first selection and alternate once per next event', async () => {
  const a = asset('a'), b = asset('b'); let i = 0;
  const slots = new PhotoSlots(async () => [a, b][i++]);
  await slots.load(0, file); await slots.load(1, file);
  assert.equal(slots.current, a); slots.next(); assert.equal(slots.current, b); slots.next(); assert.equal(slots.current, a);
  assert.equal(a.disposed, 0); slots.dispose(); assert.equal(a.disposed, 1); assert.equal(b.disposed, 1);
});
test('single photo does not disappear on next; removing selected falls back to other slot', async () => {
  const slots = new PhotoSlots(async () => asset('picture'));
  await slots.load(1, file); assert.equal(slots.selected, 1); slots.next(); assert.equal(slots.selected, 1);
  await slots.load(0, file); slots.remove(1); assert.equal(slots.selected, 0); assert.equal(slots.count, 1);
});
test('failed replacement retains previous image and a subsequent load recovers', async () => {
  const a = asset('a'), b = asset('b'); let i = 0;
  const slots = new PhotoSlots(async () => { if (++i === 2) throw new Error('decode failed'); return i === 1 ? a : b; });
  await slots.load(0, file); await assert.rejects(slots.load(0, file), /decode failed/);
  assert.equal(slots.current, a); assert.equal(a.disposed, 0);
  await slots.load(0, file); assert.equal(slots.current, b); assert.equal(a.disposed, 1);
});
test('out-of-order decodes and clear during loading cannot restore stale images', async () => {
  const pending: ((asset: PhotoAsset) => void)[] = [];
  const slots = new PhotoSlots(() => new Promise(resolve => pending.push(resolve)));
  const old = asset('old'), fresh = asset('fresh');
  const p1 = slots.load(0, file), p2 = slots.load(0, file);
  pending[1](fresh); assert.equal(await p2, true); pending[0](old); assert.equal(await p1, false);
  assert.equal(slots.current, fresh); assert.equal(old.disposed, 1);
  const p3 = slots.load(1, file), cleared = asset('cleared'); slots.remove(1); pending[2](cleared);
  assert.equal(await p3, false); assert.equal(cleared.disposed, 1); assert.equal(slots.slots[1], null);
});
test('invalid or oversized files reject; ordinary iPhone/jpeg files accepted', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) assert.doesNotThrow(() => validatePhoto({ ...file, type }));
  assert.throws(() => validatePhoto({ ...file, size: 0 }), /empty/);
  assert.throws(() => validatePhoto({ ...file, size: MAX_PHOTO_BYTES + 1 }), /15 MB/);
  assert.throws(() => validatePhoto({ ...file, type: 'image/svg+xml' }), /Choose a JPG/);
});
test('picture fit keeps every edge for portrait and landscape', () => {
  assert.deepEqual(photoFit(100, 200, 400, 200), { x: 150, y: 0, width: 100, height: 200 });
  assert.deepEqual(photoFit(400, 200, 200, 200), { x: 0, y: 50, width: 200, height: 100 });
});
