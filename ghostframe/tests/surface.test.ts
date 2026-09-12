import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawSurface, mappedShape, surfaceMap, traceShape } from '../src/handframe/surface';
import { projectFrame } from '../src/handframe/perspective';
import { shapePoints, type FrameShape } from '../src/handframe/shapes';
import type { Point } from '../src/contracts';

const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('projective texture corners match all four surface corners for neutral and both depth directions',()=>{
  for(const depth of [-1,0,1])for(const roll of [-.4,0,.4]){
    const pose=projectFrame({x:.25,y:.25,width:.5,height:.5},depth,roll),map=surfaceMap(pose.quad);
    [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const p=map(u,v);close(p.x,pose.quad[i].x);close(p.y,pose.quad[i].y);});
  }
});
test('perspective keeps texture grid lines straight and finite throughout the surface',()=>{
  const {quad}=projectFrame({x:.2,y:.2,width:.6,height:.6},.8,.3),map=surfaceMap(quad);
  for(const fixed of [0,.2,.5,.8,1])for(const horizontal of [true,false]){
    const a=horizontal?map(0,fixed):map(fixed,0),b=horizontal?map(1,fixed):map(fixed,1);
    for(let i=0;i<=20;i++){
      const p=horizontal?map(i/20,fixed):map(fixed,i/20);
      assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
      close((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x),0);
    }
  }
});
test('neutral texture center stays centered and collapsed or crossed surfaces are rejected',()=>{
  const pose=projectFrame({x:.2,y:.3,width:.4,height:.3},0,0),p=surfaceMap(pose.quad)(.5,.5);close(p.x,.4);close(p.y,.45);
  assert.throws(()=>surfaceMap([{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]),RangeError);
  assert.throws(()=>surfaceMap([{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}]),RangeError);
  assert.throws(()=>surfaceMap([{x:NaN,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]),RangeError);
});

class RecordingContext {
  path: Point[] = [];
  clips: Point[][] = [];
  stack: Point[][][] = [];
  draws: { clips: Point[][] }[] = [];
  transforms: number[][] = [];
  closed = false;
  save() { this.stack.push([...this.clips]); }
  restore() { this.clips = this.stack.pop()!; }
  beginPath() { this.path = []; this.closed = false; }
  moveTo(x: number, y: number) { this.path.push({ x, y }); }
  lineTo(x: number, y: number) { this.path.push({ x, y }); }
  closePath() { this.closed = true; }
  clip() { assert.ok(this.closed); this.clips.push([...this.path]); }
  transform(...values: number[]) { this.transforms.push(values); }
  drawImage() { this.draws.push({ clips: [...this.clips] }); }
  get context() { return this as unknown as CanvasRenderingContext2D; }
}
const texture = { width: 384, height: 256 } as HTMLCanvasElement;
function contains(points: readonly Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

test('mapped outlines use the texture homography and preserve concave shape interiors', () => {
  const star = shapePoints('star');
  for (const depth of [-1, 0, 1]) {
    const pose = projectFrame({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, depth, 0.3);
    const map = surfaceMap(pose.quad), mapped = mappedShape(pose.quad, star);
    mapped.forEach((point, index) => {
      const expected = map(star[index].x, star[index].y);
      close(point.x, expected.x); close(point.y, expected.y);
    });
    for (const point of [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.1 }, { x: 0.1, y: 0.1 }, { x: 0.8, y: 0.15 }]) {
      assert.equal(contains(mapped, map(point.x, point.y)), contains(star, point));
    }
    assert.equal(contains(mapped, map(0.8, 0.15)), false, 'the star notch must remain outside the clip');
    assert.deepEqual(mappedShape(pose.quad), mappedShape(pose.quad, shapePoints('rectangle')));
  }
});

test('every shape clips the neutral affine draw and leaves the surrounding canvas clip unchanged', () => {
  const shapes: FrameShape[] = ['rectangle', 'triangle', 'ellipse', 'diamond', 'hexagon', 'star', 'custom'];
  const custom = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.7, y: 0.9 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.9 }];
  for (const shape of shapes) {
    const recorder = new RecordingContext(), pose = projectFrame({ x: 0.2, y: 0.2, width: 0.6, height: 0.5 }, 0, 0.25);
    const existing = shapePoints('rectangle'); recorder.clips = [existing];
    const outline = shapePoints(shape, custom), snapshot = structuredClone(outline);
    drawSurface(recorder.context, texture, pose, 640, 360, outline);
    assert.equal(recorder.draws.length, 1, `${shape} must keep the affine fast path`);
    const expected = mappedShape(pose.quad.map(p => ({ x: p.x * 640, y: p.y * 360 })) as typeof pose.quad, outline);
    assert.deepEqual(recorder.draws[0].clips[1], expected, `${shape} must clip before drawing the texture`);
    assert.deepEqual(recorder.clips, [existing], 'the raw camera outside this surface must not inherit its clip');
    assert.equal(recorder.stack.length, 0);
    assert.deepEqual(outline, snapshot);
  }
});

test('projective rendering keeps a single exact outer shape clip across the bounded triangle mesh', () => {
  for (const depth of [-0.8, 0.8]) {
    const recorder = new RecordingContext(), outline = shapePoints('star');
    const pose = projectFrame({ x: 0.2, y: 0.2, width: 0.6, height: 0.5 }, depth, 0.2);
    drawSurface(recorder.context, texture, pose, 640, 360, outline);
    const expected = mappedShape(pose.quad.map(p => ({ x: p.x * 640, y: p.y * 360 })) as typeof pose.quad, outline);
    assert.equal(recorder.draws.length, 8 * 6 * 2, 'shapes must not grow the projective mesh');
    for (const draw of recorder.draws) {
      assert.equal(draw.clips.length, 2, 'each triangle is additionally constrained by the silhouette');
      assert.deepEqual(draw.clips[0], expected);
      assert.equal(draw.clips[1].length, 3);
    }
    assert.equal(recorder.stack.length, 0); assert.equal(recorder.clips.length, 0);
  }
});

test('rectangle-default calls remain compatible and outline paths are available for border drawing', () => {
  const pose = projectFrame({ x: 0.2, y: 0.2, width: 0.6, height: 0.5 }, 0, 0);
  const implicit = new RecordingContext(), explicit = new RecordingContext();
  drawSurface(implicit.context, texture, pose, 640, 360);
  drawSurface(explicit.context, texture, pose, 640, 360, shapePoints('rectangle'));
  assert.deepEqual(implicit.draws, explicit.draws);
  const mapped = mappedShape(pose.quad, shapePoints('triangle'));
  const border = new RecordingContext(); traceShape(border, mapped);
  assert.deepEqual(border.path, mapped); assert.ok(border.closed);
  assert.equal(border.clips.length, 0, 'tracing a border must not install a clip itself');
});

test('invalid outlines fail before canvas state changes or texture drawing', () => {
  const pose = projectFrame({ x: 0.2, y: 0.2, width: 0.6, height: 0.5 }, 0.7, 0.2);
  for (const outline of [[], [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }],
    [{ x: -0.1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]]) {
    const recorder = new RecordingContext();
    assert.throws(() => drawSurface(recorder.context, texture, pose, 640, 360, outline), RangeError);
    assert.equal(recorder.stack.length, 0); assert.equal(recorder.draws.length, 0);
    assert.throws(() => mappedShape(pose.quad, outline), RangeError);
  }
  assert.throws(() => traceShape(new RecordingContext(), [{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]), RangeError);
});
