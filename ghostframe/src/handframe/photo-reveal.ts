import type { Hand, Point } from '../contracts';
import { PalmVisibility } from '../vision/palm-visibility';

const ASPECT = 16 / 9;
const CLOSED = 1.25, OPEN = 2.8, MAX_GAP_MS = 1000;
const DETECTION_GRACE_MS = 150;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const distance = (a: Point, b: Point, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
const spatialLength = (a: Point, b: Point, aspect: number) => Math.hypot(distance(a, b, aspect), ((a.z ?? 0) - (b.z ?? 0)) * aspect);
type Palm = { wrist: Point; center: Point; size: number };

function measure(hand: Hand, aspect: number): Palm | null {
  const length = (a: Point, b: Point) => spatialLength(a, b, aspect);
  // MediaPipe supplies handedness certainty here. Sideways palms commonly
  // approach 0.5 even with usable tracking, including the hands-together pose.
  if (!hand || !Number.isFinite(hand.score) || hand.score < 0.5 || hand.score > 1 ||
    !Array.isArray(hand.landmarks) || hand.landmarks.length !== 21) return null;
  for (const point of hand.landmarks) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 ||
      (point.z !== undefined && !Number.isFinite(point.z))) return null;
  }
  const p = hand.landmarks, size = length(p[0], p[9]), width = length(p[5], p[17]);
  if (size < 0.035 || size > 0.5 || width < size * 0.2 || width > size * 2.5 ||
    p.some(point => length(p[0], point) > size * 4)) return null;
  // Only the thumb and index need to describe an opening. Other fingers may
  // curl naturally; no convex quadrilateral or screen-up direction is required.
  for (const chain of [[1, 2, 3, 4], [5, 6, 7, 8]]) {
    for (let i = 1; i < chain.length; i++) {
      const bone = length(p[chain[i - 1]], p[chain[i]]);
      if (bone < size * 0.015 || bone > size * 2.2) return null;
    }
  }
  const indexReach = length(p[5], p[8]), indexBase = length(p[0], p[5]);
  const forward = ((p[8].x - p[5].x) * (p[5].x - p[0].x) +
    ((p[8].z ?? 0) - (p[5].z ?? 0)) * ((p[5].z ?? 0) - (p[0].z ?? 0))) * aspect * aspect +
    (p[8].y - p[5].y) * (p[5].y - p[0].y);
  if (indexBase < size * 0.2 || indexReach < size * 0.35 ||
    forward < indexReach * indexBase * 0.15 ||
    length(p[1], p[4]) < size * 0.25 || length(p[4], p[8]) < size * 0.3) return null;
  const center = [0, 5, 9, 17].reduce((sum, index) => ({
    x: sum.x + p[index].x / 4, y: sum.y + p[index].y / 4,
  }), { x: 0, y: 0 });
  return { wrist: p[0], center, size };
}

/**
 * Photo visibility, from 0 (hidden) to 1 (fully open). Null means hide because
 * the current tracking is unusable. One hand must open before it can control
 * closure; a valid pair controls its current separation immediately. Distances
 * use canonical camera coordinates and compare depth only within each hand.
 */
export class PhotoReveal {
  private readonly palm = new PalmVisibility();
  private mode: 'one' | 'two' | null = null;
  private lastTimestamp: number | null = null;
  private lastMeasuredAt: number | null = null;
  private amount: number | null = null;
  private aspect: number | null = null;

  reset(): void {
    this.palm.reset(); this.mode = null; this.lastTimestamp = null; this.lastMeasuredAt = null; this.amount = null; this.aspect = null;
  }

  update(hands: Hand[], timestamp: number, mode: 'one' | 'two', aspect = ASPECT): number | null {
    if (!Number.isFinite(timestamp) || timestamp < 0 || !Array.isArray(hands) ||
      !Number.isFinite(aspect) || aspect <= 0 ||
      (mode !== 'one' && mode !== 'two')) { this.reset(); return null; }
    if (mode !== this.mode || aspect !== this.aspect) { this.reset(); this.mode = mode; this.aspect = aspect; }
    if (this.lastTimestamp !== null) {
      if (timestamp < this.lastTimestamp || timestamp - this.lastTimestamp > MAX_GAP_MS) {
        this.reset(); return null;
      }
      if (timestamp === this.lastTimestamp) return null;
    }
    if (mode === 'one') {
      const closure = this.palm.update(hands, timestamp, aspect);
      if (closure === null) { this.reset(); return null; }
      this.lastTimestamp = timestamp;
      return 1 - closure;
    }
    if (hands.length !== 2) {
      // A detector can omit a hand for one frame when fingers overlap. Keep
      // only the last measured display amount for this short interval. A
      // missing frame never supplies a new gesture or extends the deadline.
      if (hands.length < 2 && hands.every(hand => measure(hand, aspect) !== null) &&
        this.amount !== null && this.lastMeasuredAt !== null &&
        timestamp - this.lastMeasuredAt <= DETECTION_GRACE_MS) {
        this.lastTimestamp = timestamp;
        return this.amount;
      }
      this.reset(); return null;
    }
    const left = measure(hands[0], aspect), right = measure(hands[1], aspect);
    if (!left || !right || Math.max(left.size, right.size) / Math.min(left.size, right.size) > 2.5 ||
      hands[0].landmarks.every((point, index) => spatialLength(point, hands[1].landmarks[index], aspect) < 0.00001)) {
      this.reset(); return null;
    }
    const palm = (left.size + right.size) / 2;
    const separation = Math.min(distance(left.wrist, right.wrist, aspect), distance(left.center, right.center, aspect)) / palm;
    const fraction = clamp((separation - CLOSED) / (OPEN - CLOSED));
    const target = fraction * fraction * (3 - 2 * fraction);
    if (this.amount === null || target === 0 || target === 1) this.amount = target;
    else {
      // Small tremors are damped; a large deliberate expansion follows in
      // the same frame. Endpoints never wait for an asymptotic animation.
      const blend = 0.18 + 0.82 * clamp((Math.abs(target - this.amount) - 0.015) / 0.23);
      this.amount += (target - this.amount) * blend;
    }
    this.lastTimestamp = timestamp; this.lastMeasuredAt = timestamp;
    return this.amount;
  }
}
