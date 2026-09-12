import type { Point } from '../contracts';
import type { FramePose } from './perspective';
import { shapePoints, validateOutline } from './shapes';

type Quad = FramePose['quad'];
const RECTANGLE = shapePoints('rectangle');
type PathContext = Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'lineTo' | 'closePath'>;

/** Map a texture square to a planar quadrilateral, including perspective foreshortening. */
export function surfaceMap(quad: Quad): (u: number, v: number) => Point {
  if(quad.length!==4)throw new RangeError('The surface requires four corners.');
  const finite=quad.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  const turns=quad.map((p,i)=>{const q=quad[(i+1)%4],r=quad[(i+2)%4];return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);});
  if(!finite||!turns.every(turn=>turn>1e-9))throw new RangeError('The surface must be finite, convex and ordered clockwise.');
  const [p0, p1, p2, p3] = quad;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const dx3 = p0.x - p1.x + p2.x - p3.x, dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (!quad.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) || Math.abs(det) < 1e-9) throw new RangeError('The surface must have four finite, non-degenerate corners.');
  const g = (dx3 * dy2 - dx2 * dy3) / det, h = (dx1 * dy3 - dx3 * dy1) / det;
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y;
  return (u, v) => {
    const denominator = g * u + h * v + 1;
    return { x: (a * u + b * v + p0.x) / denominator, y: (d * u + e * v + p0.y) / denominator };
  };
}

function mapOutline(map: (u: number, v: number) => Point, outline: readonly Point[]): Point[] {
  const error = validateOutline(outline);
  if (error) throw new RangeError(error);
  return outline.map(point => map(point.x, point.y));
}

/** The returned outline uses the same coordinate system as the supplied quad. */
export function mappedShape(quad: Quad, outline: readonly Point[] = RECTANGLE): Point[] {
  return mapOutline(surfaceMap(quad), outline);
}

/** Start a closed path, ready for the caller to stroke or clip without changing its styles. */
export function traceShape(ctx: PathContext, points: readonly Point[]): void {
  if (points.length < 3 || points.length > 64 || !points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    throw new RangeError('A shape path requires 3–64 finite points.');
  }
  ctx.beginPath();
  points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
  ctx.closePath();
}

function triangle(ctx: CanvasRenderingContext2D, texture: HTMLCanvasElement, source: Point[], target: Point[]) {
  const [s0, s1, s2] = source, [t0, t1, t2] = target;
  const sx1 = s1.x - s0.x, sx2 = s2.x - s0.x, sy1 = s1.y - s0.y, sy2 = s2.y - s0.y;
  const determinant = sx1 * sy2 - sx2 * sy1;
  const tx1 = t1.x - t0.x, tx2 = t2.x - t0.x, ty1 = t1.y - t0.y, ty2 = t2.y - t0.y;
  const a = (tx1 * sy2 - tx2 * sy1) / determinant, c = (tx2 * sx1 - tx1 * sx2) / determinant;
  const b = (ty1 * sy2 - ty2 * sy1) / determinant, d = (ty2 * sx1 - ty1 * sx2) / determinant;
  ctx.save();
  // A subpixel overlap hides anti-aliased seams between adjacent triangles.
  // The parent shape clip keeps even a concave surface silhouette exact.
  const center = {x:(t0.x+t1.x+t2.x)/3,y:(t0.y+t1.y+t2.y)/3};
  const area2=Math.abs(tx1*ty2-tx2*ty1);
  const longest=Math.max(Math.hypot(t1.x-t0.x,t1.y-t0.y),Math.hypot(t2.x-t1.x,t2.y-t1.y),Math.hypot(t0.x-t2.x,t0.y-t2.y));
  const expand=1+.75/(area2/(3*longest));
  ctx.beginPath();
  target.forEach((point, i) => {
    const x=center.x+(point.x-center.x)*expand,y=center.y+(point.y-center.y)*expand;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  });
  ctx.closePath();ctx.clip();
  ctx.transform(a,b,c,d,t0.x-a*s0.x-c*s0.y,t0.y-b*s0.x-d*s0.y);
  ctx.drawImage(texture,0,0);ctx.restore();
}

/** Bounded 8×6 projective mesh clipped to a normalized outline; rectangle by default. */
export function drawSurface(ctx: CanvasRenderingContext2D, texture: HTMLCanvasElement, pose: FramePose, width: number, height: number, outline: readonly Point[] = RECTANGLE): void {
  const quad = pose.quad.map(p=>({x:p.x*width,y:p.y*height})) as Quad;
  const map=surfaceMap(quad);
  // Clip once to the projectively mapped outline before any triangle expansion.
  // Canvas' polygon clip preserves concave notches, including the star's center valleys.
  const silhouette=mapOutline(map,outline);
  ctx.save();traceShape(ctx,silhouette);ctx.clip();
  // A neutral frame needs just one draw; even a rotated parallelogram is affine.
  const [tl,tr,br,bl]=quad;
  if(Math.abs(tl.x+br.x-tr.x-bl.x)+Math.abs(tl.y+br.y-tr.y-bl.y)<.01){
    ctx.transform((tr.x-tl.x)/texture.width,(tr.y-tl.y)/texture.width,(bl.x-tl.x)/texture.height,(bl.y-tl.y)/texture.height,tl.x,tl.y);
    ctx.drawImage(texture,0,0);
  }else{
    const columns=8,rows=6;
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const uv=[{x:x/columns,y:y/rows},{x:(x+1)/columns,y:y/rows},{x:(x+1)/columns,y:(y+1)/rows},{x:x/columns,y:(y+1)/rows}];
      const source=uv.map(p=>({x:p.x*texture.width,y:p.y*texture.height}));
      const target=uv.map(p=>map(p.x,p.y));
      for(const indices of [[0,1,2],[0,2,3]])triangle(ctx,texture,indices.map(i=>source[i]),indices.map(i=>target[i]));
    }
  }
  ctx.restore();
}
