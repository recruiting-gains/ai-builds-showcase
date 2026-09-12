import type { FrameRect, Hand, Point } from '../contracts';

/** Mirrored display coordinates, clockwise from the original top-left corner. */
export type FramePose = { quad: [Point, Point, Point, Point]; depth: number; roll: number };

const ASPECT = 16 / 9;
const MAX_ROLL = 0.4;
const MAX_GAP_MS = 1000;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const metric = (aspect: number) => (a: Point, b: Point) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

function validRect(rect: FrameRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width >= 0.001 && rect.height >= 0.001 && rect.x >= 0 && rect.y >= 0 &&
    rect.x + rect.width <= 1 && rect.y + rect.height <= 1;
}

/**
 * A bounded perspective projection, not a reconstruction of metric 3D position.
 * Positive depth brings the displayed left edge nearer. Uniform fitting keeps
 * every corner visible without clipping individual vertices or moving the center.
 */
export function projectFrame(rect: FrameRect, depth: number, roll: number): FramePose {
  if (!validRect(rect) || !Number.isFinite(depth) || !Number.isFinite(roll)) {
    throw new RangeError('Perspective requires a finite, nondegenerate frame inside the image.');
  }
  depth = clamp(depth, -1, 1);
  roll = clamp(roll, -MAX_ROLL, MAX_ROLL);
  const centerX = rect.x + rect.width / 2, centerY = rect.y + rect.height / 2;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const projected = corners.map(([x, y]) => {
    // Denominators remain at least 0.62, so the surface cannot invert.
    const denominator = 1 + 0.38 * depth * x;
    return { x: x * rect.width / 2 / denominator, y: y * rect.height / 2 / denominator };
  });
  const offsetX = projected.reduce((sum, point) => sum + point.x, 0) / 4;
  const cos = Math.cos(roll), sin = Math.sin(roll);
  const rotated = projected.map(point => {
    const x = (point.x - offsetX) * ASPECT;
    return { x: (x * cos - point.y * sin) / ASPECT, y: x * sin + point.y * cos };
  });
  let fit = 1;
  for (const point of rotated) {
    if (point.x < 0) fit = Math.min(fit, centerX / -point.x);
    if (point.x > 0) fit = Math.min(fit, (1 - centerX) / point.x);
    if (point.y < 0) fit = Math.min(fit, centerY / -point.y);
    if (point.y > 0) fit = Math.min(fit, (1 - centerY) / point.y);
  }
  const quad = rotated.map(point => ({
    x: clamp(centerX + point.x * fit, 0, 1),
    y: clamp(centerY + point.y * fit, 0, 1),
  })) as FramePose['quad'];
  return { quad, depth, roll };
}

function trackedPair(hands: Hand[], allowJoinedTips: boolean, aspect: number): Hand[] | null {
  const distance = metric(aspect);
  if (hands.length !== 2 || !hands.every(hand => hand && Number.isFinite(hand.score) && hand.score >= 0.5 &&
    Array.isArray(hand.landmarks) && hand.landmarks.length === 21 && Array.from(hand.landmarks).every(point =>
      point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 &&
      point.y >= 0 && point.y <= 1 && (point.z === undefined || Number.isFinite(point.z))) &&
    distance(hand.landmarks[0], hand.landmarks[9]) >= 0.035)) return null;
  const pair = [...hands].sort((a, b) => b.landmarks[0].x - a.landmarks[0].x);
  const [left, right] = pair;
  const leftTips = (left.landmarks[4].x + left.landmarks[8].x) / 2;
  const rightTips = (right.landmarks[4].x + right.landmarks[8].x) / 2;
  return left.landmarks[0].x - right.landmarks[0].x >= 0.07 && (allowJoinedTips || leftTips - rightTips >= 0.08) ? pair : null;
}

function palmScale(hand: Hand, aspect: number): number {
  const distance = metric(aspect);
  const points = hand.landmarks;
  // Palm-only spans keep finger articulation out of the distance estimate.
  const spans = [[0, 5], [0, 9], [0, 17], [5, 17]];
  return Math.sqrt(spans.reduce((sum, [a, b]) => sum + distance(points[a], points[b]) ** 2, 0) / spans.length);
}

function follow(current: number, target: number, jitter: number, direct: number): number {
  const blend = 0.22 + 0.78 * clamp((Math.abs(target - current) - jitter) / (direct - jitter), 0, 1);
  return current + (target - current) * blend;
}

/**
 * Relative palm apparent size controls depth. Palm orientation and unequal hand
 * anatomy can affect it; recenter establishes a new neutral pose. Landmark z is
 * deliberately unused because its origin is local to each detected hand.
 */
export class PerspectiveTracker {
  private aspect = ASPECT;
  private baseline: { ratio: number; roll: number } | null = null;
  private lastTimestamp: number | null = null;
  private pose: FramePose | null = null;
  private joinedTips = false;

  reset(): void {
    this.baseline = null;
    this.lastTimestamp = null;
    this.pose = null;
    this.joinedTips = false;
  }

  recenter(): void { this.reset(); }

  update(hands: Hand[], rect: FrameRect | null, timestamp: number, allowJoinedTips = false, aspect = ASPECT): FramePose | null {
    if (!Number.isFinite(aspect) || aspect <= 0) { this.reset(); return null; }
    if (Math.abs(aspect - this.aspect) > .001) this.reset();
    this.aspect = aspect;
    if (this.lastTimestamp !== null && this.joinedTips !== allowJoinedTips) this.reset();
    const pair = trackedPair(hands, allowJoinedTips, aspect);
    if (!pair || !rect || !validRect(rect) || !Number.isFinite(timestamp) || timestamp < 0) {
      this.reset();
      return null;
    }
    if (this.lastTimestamp !== null) {
      if (timestamp < this.lastTimestamp || timestamp - this.lastTimestamp > MAX_GAP_MS) {
        this.reset();
        return null;
      }
      if (timestamp === this.lastTimestamp) return this.pose;
    }
    const [left, right] = pair;
    const ratio = Math.log(palmScale(left, aspect) / palmScale(right, aspect));
    // Joined fingertips have almost coincident centers. Separated wrists provide
    // a stable roll reference for automatic contours instead of that tiny line.
    const tip = (hand: Hand) => allowJoinedTips ? { x: 1 - hand.landmarks[0].x, y: hand.landmarks[0].y } :
      { x: 1 - (hand.landmarks[4].x + hand.landmarks[8].x) / 2, y: (hand.landmarks[4].y + hand.landmarks[8].y) / 2 };
    const leftTip = tip(left), rightTip = tip(right);
    const tipRoll = Math.atan2(rightTip.y - leftTip.y, (rightTip.x - leftTip.x) * ASPECT);
    this.lastTimestamp = timestamp;
    this.joinedTips = allowJoinedTips;
    if (!this.baseline) {
      this.baseline = { ratio, roll: tipRoll };
      this.pose = projectFrame(rect, 0, 0);
      return this.pose;
    }
    const depth = clamp((ratio - this.baseline.ratio) * 2, -1, 1);
    const roll = clamp(tipRoll - this.baseline.roll, -MAX_ROLL, MAX_ROLL);
    this.pose = projectFrame(rect,
      follow(this.pose?.depth ?? 0, depth, 0.012, 0.12),
      follow(this.pose?.roll ?? 0, roll, 0.004, 0.05));
    return this.pose;
  }
}
