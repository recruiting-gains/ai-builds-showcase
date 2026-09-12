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

const DETECTION_GRACE_MS = 150;
const copyPose = (pose: FramePose): FramePose => ({ ...pose, quad: pose.quad.map(point => ({ ...point })) as FramePose['quad'] });
const plausibleMissingPair = (hands: Hand[]): boolean => hands.length < 2 && hands.every(hand => hand &&
  Number.isFinite(hand.score) && hand.score >= .5 && hand.score <= 1 && Array.isArray(hand.landmarks) &&
  hand.landmarks.length === 21 && Array.from(hand.landmarks).every(point => point &&
    Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 &&
    point.y >= 0 && point.y <= 1 && (point.z === undefined || Number.isFinite(point.z))));

/** Smooth the measured photo corners once per inference, independently of paint
 * rate. A small tremor is damped; larger intentional movement follows quickly.
 * Brief detector omissions hold the last measurement, never extrapolate it.
 */
export class PhotoPoseTracker {
  private pose: FramePose | null = null;
  private lastTimestamp: number | null = null;
  private lastMeasuredAt: number | null = null;

  reset(): void { this.pose = null; this.lastTimestamp = null; this.lastMeasuredAt = null; }

  update(hands: Hand[], timestamp: number, depth = 0): FramePose | null {
    if (!Array.isArray(hands) || !Number.isFinite(timestamp) || timestamp < 0 || !Number.isFinite(depth)) {
      this.reset(); return null;
    }
    if (this.lastTimestamp !== null) {
      if (timestamp < this.lastTimestamp || timestamp - this.lastTimestamp > 1000) { this.reset(); return null; }
      if (timestamp === this.lastTimestamp) return this.pose ? copyPose(this.pose) : null;
    }
    const target = photoHandPose(hands, depth);
    if (!target) {
      if (plausibleMissingPair(hands) && this.pose && this.lastMeasuredAt !== null &&
        timestamp - this.lastMeasuredAt <= DETECTION_GRACE_MS) {
        this.lastTimestamp = timestamp;
        return copyPose(this.pose);
      }
      this.reset(); return null;
    }
    if (this.pose) {
      const previous = this.pose;
      const movement = Math.max(...target.quad.map((point, index) =>
        Math.hypot(point.x - previous.quad[index].x, point.y - previous.quad[index].y)));
      if (movement > .4) { this.reset(); return null; }
      const quad = target.quad.map((point, index) => {
        const before = previous.quad[index], motion = Math.hypot(point.x - before.x, point.y - before.y);
        const blend = .18 + .82 * Math.max(0, Math.min(1, (motion - .002) / .020));
        return { x: before.x + (point.x - before.x) * blend, y: before.y + (point.y - before.y) * blend };
      }) as FramePose['quad'];
      // Keep the same convex, nondegenerate mapping contract as raw geometry.
      try { surfaceMap(quad); } catch { this.reset(); return null; }
      const left = { x: (quad[0].x + quad[3].x) / 2, y: (quad[0].y + quad[3].y) / 2 };
      const right = { x: (quad[1].x + quad[2].x) / 2, y: (quad[1].y + quad[2].y) / 2 };
      this.pose = { quad, depth, roll: Math.atan2(right.y - left.y, (right.x - left.x) * 16 / 9) };
    } else this.pose = target;
    this.lastTimestamp = timestamp; this.lastMeasuredAt = timestamp;
    return copyPose(this.pose);
  }
}
