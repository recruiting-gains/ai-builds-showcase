import test from 'node:test';
import assert from 'node:assert/strict';
import type { Point } from '../src/contracts';
import { shapePoints, validateCustomShape, validateOutline, type FrameShape } from '../src/handframe/shapes';

const signedArea = (points: readonly Point[]) => points.reduce((sum, p, index) => {
  const q = points[(index + 1) % points.length];
  return sum + p.x * q.y - q.x * p.y;
}, 0) / 2;
const presets: FrameShape[] = ['rectangle', 'triangle', 'ellipse', 'diamond', 'hexagon', 'star'];

test('every preset is a fresh, finite, simple normalized polygon with clockwise winding', () => {
  for (const shape of presets) {
    const points = shapePoints(shape);
    assert.equal(validateOutline(points), null, shape);
    assert.ok(signedArea(points) > 0, `${shape} should be clockwise in screen coordinates`);
    assert.ok(points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
    const again = shapePoints(shape);
    assert.deepEqual(points, again);
    points[0].x = 0.12345;
    assert.deepEqual(shapePoints(shape), again, 'callers must not mutate later preset results');
  }
});

test('presets retain recognizable geometry, smooth ellipse sampling, and a concave five-point star', () => {
  assert.deepEqual(presets.map(shape => shapePoints(shape).length), [4, 3, 64, 4, 6, 10]);
  assert.equal(signedArea(shapePoints('rectangle')), 1);
  assert.equal(signedArea(shapePoints('triangle')), 0.5);
  assert.equal(signedArea(shapePoints('diamond')), 0.5);
  assert.equal(signedArea(shapePoints('hexagon')), 0.75);
  const ellipse = shapePoints('ellipse');
  for (const p of ellipse) assert.ok(Math.abs((p.x - 0.5) ** 2 + (p.y - 0.5) ** 2 - 0.25) < 1e-12);
  assert.ok(Math.abs(signedArea(ellipse) - Math.PI / 4) < 0.002);
  const star = shapePoints('star');
  const turns = star.map((p, index) => {
    const q = star[(index + 1) % 10], r = star[(index + 2) % 10];
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  });
  assert.equal(turns.filter(turn => turn < 0).length, 5, 'star must preserve its five concave notches');
  assert.equal(turns.filter(turn => turn > 0).length, 5);
});

test('custom shapes accept both windings, 3–12 vertices, and useful concave outlines', () => {
  const triangle = shapePoints('triangle');
  const concave = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.4 }, { x: 0, y: 1 }];
  const twelve = Array.from({ length: 12 }, (_, index) => ({
    x: 0.5 + Math.cos(index * Math.PI / 6) * 0.45,
    y: 0.5 + Math.sin(index * Math.PI / 6) * 0.45,
  }));
  for (const points of [triangle, concave, twelve]) {
    assert.equal(validateCustomShape(points), null);
    assert.equal(validateCustomShape([...points].reverse()), null);
    assert.deepEqual(shapePoints('custom', points), points);
    assert.deepEqual(shapePoints('custom', [...points].reverse()), [...points].reverse());
    const copy = shapePoints('custom', points); copy[0].x = 0.222;
    assert.notDeepEqual(copy, points, 'a returned custom outline must not alias the editor state');
  }
});

test('custom shape errors explain invalid count, coordinates, repeated vertices, and degeneracy', () => {
  const cases: [Point[], RegExp][] = [
    [[], /3 and 12/], [shapePoints('ellipse'), /3 and 12/],
    [[{ x: -0.1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], /inside/],
    [[{ x: 0, y: Number.NaN }, { x: 1, y: 0 }, { x: 0, y: 1 }], /finite/],
    [[{ x: 0, y: 0 }, { x: Infinity, y: 0 }, { x: 0, y: 1 }], /finite/],
    [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }], /distinct/],
    [[{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }], /area/],
    [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 0.00001 }], /area/],
  ];
  for (const [points, expected] of cases) {
    assert.match(validateCustomShape(points)!, expected);
    assert.throws(() => shapePoints('custom', points), RangeError);
  }
  assert.throws(() => shapePoints('custom'), /3 and 12/);
  assert.throws(() => shapePoints('unknown' as FrameShape), RangeError);
});

test('self-intersections, nonadjacent touches, and overlapping edges are rejected', () => {
  const crossed = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }];
  const touching = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0 }, { x: 0, y: 1 }];
  const overlap = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.75, y: 0 }, { x: 0.25, y: 0 }, { x: 0, y: 1 }];
  for (const points of [crossed, touching, overlap]) {
    assert.match(validateCustomShape(points)!, /cross, overlap, or touch/);
    assert.match(validateCustomShape([...points].reverse())!, /cross, overlap, or touch/);
  }
});
