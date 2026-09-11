import type { Hand, Point } from '../contracts';

type Vector = { x: number; y: number; z: number };
type Observation = { wrist: Point; palm: number; label: string; fade: number; open: boolean; score: number };
const ASPECT = 16 / 9;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const vector = (from: Point, to: Point): Vector => ({
  x: (to.x - from.x) * ASPECT, y: to.y - from.y, z: ((to.z ?? 0) - (from.z ?? 0)) * ASPECT,
});
const length = (v: Vector) => Math.hypot(v.x, v.y, v.z);
const dot = (a: Vector, b: Vector) => a.x * b.x + a.y * b.y + a.z * b.z;
const wristDistance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);

function observe(hand: Hand): Observation | null {
  if (!hand || !Number.isFinite(hand.score) || hand.score < 0.6 || !Array.isArray(hand.landmarks) || hand.landmarks.length !== 21) return null;
  for (const point of hand.landmarks) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 ||
      point.y < 0 || point.y > 1 || (point.z !== undefined && !Number.isFinite(point.z))) return null;
  }
  const p = hand.landmarks, along = vector(p[0], p[9]), across = vector(p[5], p[17]);
  const palm = length(along), width = length(across);
  if (palm < 0.035 || width < palm * 0.3 || width > palm * 2) return null;
  const normal = { x: along.y * across.z - along.z * across.y,
    y: along.z * across.x - along.x * across.z, z: along.x * across.y - along.y * across.x };
  const normalLength = length(normal);
  // Foreshortened or almost collinear palm landmarks do not provide stable curl.
  if (normalLength < palm * width * 0.3 || Math.abs(normal.z) / normalLength < 0.35 ||
    Math.hypot(across.x, across.y) < palm * 0.3) return null;

  const curls: number[] = [];
  for (const base of [5, 9, 13, 17]) {
    const bones = [vector(p[base], p[base + 1]), vector(p[base + 1], p[base + 2]), vector(p[base + 2], p[base + 3])];
    const sizes = bones.map(length), total = sizes[0] + sizes[1] + sizes[2];
    if (sizes.some(size => size < palm * 0.025 || size > palm * 1.4) || total < palm * 0.4 || total > palm * 2.5) return null;
    const cosineA = Math.max(-1, Math.min(1, dot(bones[0], bones[1]) / (sizes[0] * sizes[1])));
    const cosineB = Math.max(-1, Math.min(1, dot(bones[1], bones[2]) / (sizes[1] * sizes[2])));
    const bend = clamp((2 - cosineA - cosineB) / 2);
    const forward = vector(p[0], p[base]), forwardLength = length(forward);
    if (forwardLength < palm * 0.3) return null;
    const reach = dot(vector(p[base], p[base + 3]), forward) / (total * forwardLength);
    const fold = clamp((1 - reach) / 1.2);
    curls.push(0.55 * bend + 0.45 * fold);
  }
  const curl = curls.reduce((sum, value) => sum + value, 0) / curls.length;
  const amount = clamp((curl - 0.035) / 0.815);
  const open = curls.every(value => value <= 0.045);
  return { wrist: { x: p[0].x, y: p[0].y }, palm,
    label: hand.handedness === 'Left' || hand.handedness === 'Right' ? hand.handedness : '',
    fade: open ? 0 : amount * amount * (3 - 2 * amount), open, score: hand.score };
}

/**
 * Continuous palm visibility: 0 is fully visible; 1 is fully hidden.
 * A clearly open hand arms control. Null leaves the caller's target unchanged.
 * Loss/invalid tracking disarms rather than transferring control to another fist.
 * Relative finger angles and reach use only that hand's local geometry, never
 * a cross-hand z comparison. Endpoints are exact; partial closure is smoothed.
 */
export class PalmVisibility {
  private control: Observation | null = null;
  private lastTimestamp: number | null = null;
  private fade = 0;

  reset(): void { this.control = null; this.lastTimestamp = null; this.fade = 0; }

  update(hands: Hand[], timestamp: number): number | null {
    if (!Array.isArray(hands) || hands.length < 1 || hands.length > 2 || !Number.isFinite(timestamp) || timestamp < 0) {
      this.reset(); return null;
    }
    const observations = hands.map(observe).filter((hand): hand is Observation => hand !== null);
    if (!observations.length) { this.reset(); return null; }
    if (this.lastTimestamp !== null) {
      if (timestamp < this.lastTimestamp || timestamp - this.lastTimestamp > 1000) { this.reset(); return null; }
      if (timestamp === this.lastTimestamp) return null;
    }
    if (!this.control) {
      const open = observations.filter(hand => hand.open).sort((a, b) => b.score - a.score || a.wrist.x - b.wrist.x)[0];
      if (!open) return null;
      this.control = open; this.lastTimestamp = timestamp; this.fade = 0;
      return 0;
    }
    const previous = this.control;
    const candidates = observations.filter(hand => !previous.label || hand.label === previous.label)
      .sort((a, b) => wristDistance(a.wrist, previous.wrist) - wristDistance(b.wrist, previous.wrist));
    const hand = candidates[0];
    const reach = Math.min(0.25, Math.max(0.08, previous.palm * 1.25));
    if (!hand || wristDistance(hand.wrist, previous.wrist) > reach ||
      (candidates[1] && wristDistance(candidates[1].wrist, previous.wrist) - wristDistance(hand.wrist, previous.wrist) < 0.035)) {
      this.reset(); return null;
    }
    this.control = hand; this.lastTimestamp = timestamp;
    if (hand.fade === 0 || hand.fade === 1) this.fade = hand.fade;
    else {
      const blend = 0.25 + 0.75 * clamp(Math.abs(hand.fade - this.fade) / 0.18);
      this.fade += (hand.fade - this.fade) * blend;
    }
    return this.fade;
  }
}
