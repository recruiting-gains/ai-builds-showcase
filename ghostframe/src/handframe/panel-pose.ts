import type { FrameRect, Hand, Point } from '../contracts';
import type { FramePose } from './perspective';
import { photoHandPose } from './photo-pose';
import { surfaceMap } from './surface';

export type PanelPose = { rect: FrameRect; pose: FramePose };
const DEFAULT_ASPECT = 16 / 9;
const MISSING_GRACE_MS = 150;
const MAX_GAP_MS = 1000;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const metric = (aspect: number) => (a: Point, b: Point) =>
  Math.hypot((a.x - b.x) * aspect, a.y - b.y) / Math.min(1, aspect);
const copy = (result: PanelPose): PanelPose => ({ rect: { ...result.rect }, pose: {
  ...result.pose, quad: result.pose.quad.map(point => ({ ...point })) as FramePose['quad'],
} });

function validHand(hand: Hand, aspect: number): boolean {
  return Boolean(hand && Number.isFinite(hand.score) && hand.score >= .5 && hand.score <= 1 &&
    Array.isArray(hand.landmarks) && hand.landmarks.length === 21 &&
    Array.from(hand.landmarks).every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 &&
      (point.z === undefined || Number.isFinite(point.z))) &&
    metric(aspect)(hand.landmarks[0], hand.landmarks[9]) >= .035);
}

function fit(quad: FramePose['quad'], aspect: number): PanelPose | null {
  const distance = metric(aspect);
  if (quad.some((point, index) => point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 ||
    distance(point, quad[(index + 1) % 4]) < .025)) return null;
  try { surfaceMap(quad); } catch { return null; }
  const xs = quad.map(point => point.x), ys = quad.map(point => point.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const width = Math.max(...xs) - x, height = Math.max(...ys) - y;
  const area = Math.abs(quad.reduce((sum, point, index) => {
    const next = quad[(index + 1) % 4]; return sum + point.x * next.y - point.y * next.x;
  }, 0) / 2);
  const shorter = Math.min(1, aspect);
  if (width * aspect / shorter < .06 || height / shorter < .04 ||
    area * aspect / (shorter * shorter) < .003 || area / (width * height) < .20) return null;
  const left = { x: (quad[0].x + quad[3].x) / 2, y: (quad[0].y + quad[3].y) / 2 };
  const right = { x: (quad[1].x + quad[2].x) / 2, y: (quad[1].y + quad[2].y) / 2 };
  return { rect: { x, y, width, height }, pose: {
    quad, depth: 0, roll: Math.atan2(right.y - left.y, (right.x - left.x) * aspect),
  } };
}

function measure(hands: Hand[], aspect: number): PanelPose | null {
  if (hands.length !== 2 || !hands.every(hand => validHand(hand, aspect))) return null;
  // Wrist order supplies the hand-to-side association. Sorting tips alone could
  // silently turn crossed hands into a new, apparently valid panel.
  const [left, right] = [...hands].sort((a, b) => b.landmarks[0].x - a.landmarks[0].x);
  const horizontalScale = aspect / Math.min(1, aspect);
  if ((left.landmarks[0].x - right.landmarks[0].x) * horizontalScale < .07) return null;
  const leftTips = (left.landmarks[4].x + left.landmarks[8].x) / 2;
  const rightTips = (right.landmarks[4].x + right.landmarks[8].x) / 2;
  if ((leftTips - rightTips) * horizontalScale < .04) return null;
  // Reuse only the stateless corner ordering, including an inverted L. Internal
  // knuckles never become edges; no contour or hull can invent extra corners.
  const measured = photoHandPose(hands);
  return measured ? fit(measured.quad, aspect) : null;
}

/** A flat projective panel pinned to four thumb/index tips, not a joint contour.
 * Input follows HandOutlineTracker's canonical coordinates; output reflects x
 * once into display space. The four straight edges can form a perspective
 * quadrilateral; depth=0 means no metric 3D depth is inferred from these pixels.
 * Missing detections freeze, never extrapolate, for at most 150 ms. The caller
 * must also expire/reset the result if inference itself stops producing updates.
 */
export class PanelPoseTracker {
  private result: PanelPose | null = null;
  private aspect: number | null = null;
  private lastTimestamp: number | null = null;
  private lastMeasuredAt: number | null = null;

  reset(): void {
    this.result = null; this.aspect = null; this.lastTimestamp = null; this.lastMeasuredAt = null;
  }

  update(hands: Hand[], timestamp: number, aspect = DEFAULT_ASPECT): PanelPose | null {
    if (!Array.isArray(hands) || !Number.isFinite(timestamp) || timestamp < 0 ||
      !Number.isFinite(aspect) || aspect < .2 || aspect > 5) { this.reset(); return null; }
    if (this.aspect !== null && Math.abs(this.aspect - aspect) > .001) this.reset();
    this.aspect = aspect;
    if (this.lastTimestamp !== null) {
      if (timestamp < this.lastTimestamp || timestamp - this.lastTimestamp > MAX_GAP_MS) { this.reset(); return null; }
      if (timestamp === this.lastTimestamp) return this.result ? copy(this.result) : null;
    }
    const target = measure(hands, aspect);
    if (!target) {
      if (hands.length < 2 && hands.every(hand => validHand(hand, aspect)) && this.result &&
        this.lastMeasuredAt !== null && timestamp - this.lastMeasuredAt <= MISSING_GRACE_MS) {
        this.lastTimestamp = timestamp;
        return copy(this.result);
      }
      this.reset(); return null;
    }
    let result = target;
    if (this.result && this.lastMeasuredAt !== null) {
      const previous = this.result.pose.quad, distance = metric(aspect);
      const movement = Math.max(...target.pose.quad.map((point, index) => distance(point, previous[index])));
      if (movement > .40) { this.reset(); return null; }
      // One blend for the measured plane avoids independent corner lag. A small
      // tremor is damped; movement >=2.5% of the shorter view side follows directly.
      const nominal = .18 + .82 * clamp((movement - .002) / .023, 0, 1);
      const elapsed = timestamp - this.lastMeasuredAt;
      const blend = 1 - Math.pow(1 - nominal, elapsed / 33);
      const quad = target.pose.quad.map((point, index) => ({
        x: previous[index].x + (point.x - previous[index].x) * blend,
        y: previous[index].y + (point.y - previous[index].y) * blend,
      })) as FramePose['quad'];
      const smoothed = fit(quad, aspect);
      if (!smoothed) { this.reset(); return null; }
      result = smoothed;
    }
    this.result = result; this.lastTimestamp = timestamp; this.lastMeasuredAt = timestamp;
    return copy(result);
  }
}
