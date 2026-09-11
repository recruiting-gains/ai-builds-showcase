import type { Hand } from '../contracts';
import type { FramePose } from './perspective';
import { surfaceMap } from './surface';

/** Pin the complete photo to the thumb/index corners, including an inverted L.
 * Input uses the same canonical coordinates as HandOutlineTracker. The caller
 * still requires a valid measured aperture; missing/crossed hands never invent one.
 */
export function photoHandPose(hands: Hand[], depth = 0): FramePose | null {
  if (hands.length !== 2 || !Number.isFinite(depth) || hands.some(hand => !hand || hand.score < .5 || !Number.isFinite(hand.score))) return null;
  const pairs = hands.map(hand => [hand.landmarks?.[4], hand.landmarks?.[8]]);
  if (pairs.flat().some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return null;
  const sides = pairs.map(pair => pair.map(point => ({ x: 1 - point.x, y: point.y })).sort((a,b) => a.y - b.y))
    .sort((a,b) => (a[0].x + a[1].x) - (b[0].x + b[1].x));
  const [left,right] = sides;
  const quad: FramePose['quad'] = [left[0],right[0],right[1],left[1]];
  const area = Math.abs(quad.reduce((sum,p,i) => { const q=quad[(i+1)%4]; return sum+p.x*q.y-q.x*p.y; },0)/2);
  if (area < .0025) return null;
  try { surfaceMap(quad); } catch { return null; }
  const lx=(left[0].x+left[1].x)/2,ly=(left[0].y+left[1].y)/2;
  const rx=(right[0].x+right[1].x)/2,ry=(right[0].y+right[1].y)/2;
  return { quad, depth, roll: Math.atan2(ry-ly,(rx-lx)*16/9) };
}
