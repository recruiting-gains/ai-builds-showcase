import type { Hand, Point } from '../contracts';

/** Position is normalized display space; size is relative to the shorter canvas side. */
export interface CubePose { x: number; y: number; size: number }

const HOLD_MS = 150;
const PINCH_MS = 120;
const CLOSE_RATIO = 0.30;
const OPEN_RATIO = 0.55;
const PALM_INDICES = [0, 5, 9, 13, 17] as const;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
type Sample = { id: string; center: Point; ratio: number };

/** Cube-only controller. It has no photo, capture, network or renderer dependencies.
 * All timestamps (including poseAt) use the camera's performance.now() clock.
 */
export class CubeController {
  private pose: CubePose | null = null;
  private validAt = -Infinity;
  private lastTimestamp = -Infinity;
  private paintTimestamp = -Infinity;
  private aspect: number | null = null;
  private mirrored: boolean | null = null;
  private previous: [Sample, Sample] | null = null;
  private armed = false;
  private pinching: { id: string; since: number } | null = null;

  reset(): void {
    this.clearTracking();
    this.lastTimestamp = -Infinity;
    this.paintTimestamp = -Infinity;
    this.aspect = null;
    this.mirrored = null;
  }

  update(hands: readonly Hand[], timestamp: number, aspect: number, mirrored: boolean): { changed: boolean } {
    const unchanged = { changed: false };
    if (!Number.isFinite(timestamp) || timestamp <= this.lastTimestamp) {
      this.clearTracking();
      return unchanged;
    }
    const gap = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    if (!Number.isFinite(aspect) || aspect < 0.2 || aspect > 5 || timestamp < this.paintTimestamp - HOLD_MS) {
      this.clearTracking();
      return unchanged;
    }
    // A new camera/aspect cannot finish a gesture begun in the previous coordinate system.
    if (this.aspect !== null && (Math.abs(this.aspect - aspect) > 0.001 || this.mirrored !== mirrored)) {
      this.clearTracking();
    }
    this.aspect = aspect;
    this.mirrored = mirrored;
    if (gap > HOLD_MS) this.clearTracking();

    const pair = this.readPair(hands, aspect);
    if (!pair) {
      this.cancelGesture();
      this.previous = null;
      if (timestamp - this.validAt > HOLD_MS) this.pose = null;
      return unchanged;
    }
    const [a, b] = pair;
    const shortSide = Math.min(1, aspect);
    const distance = (p: Point, q: Point) => Math.hypot(aspect * (p.x - q.x), p.y - q.y) / shortSide;
    const separation = distance(a.center, b.center);
    if (separation < 0.10 || this.discontinuous(pair, distance)) {
      this.clearTracking();
      return unchanged;
    }

    const midpoint = (a.center.x + b.center.x) / 2;
    const target: CubePose = {
      x: clamp(mirrored ? 1 - midpoint : midpoint, 0, 1),
      y: clamp((a.center.y + b.center.y) / 2, 0, 1),
      size: clamp(separation * 0.75, 0.15, 0.65),
    };
    // Time-based smoothing avoids a frame-rate-dependent lag or overshoot.
    const blend = this.pose ? 1 - Math.exp(-Math.max(1, timestamp - this.validAt) / 45) : 1;
    this.pose = this.pose ? {
      x: this.pose.x + (target.x - this.pose.x) * blend,
      y: this.pose.y + (target.y - this.pose.y) * blend,
      size: this.pose.size + (target.size - this.pose.size) * blend,
    } : target;
    this.validAt = timestamp;
    this.previous = pair;

    const bothOpen = pair.every(hand => hand.ratio >= OPEN_RATIO);
    if (this.pinching) {
      const active = pair.find(hand => hand.id === this.pinching!.id)!;
      // Overlapping pinches are ambiguous, including a handoff observed only on the release frame.
      if (pair.some(hand => hand.id !== active.id && hand.ratio <= CLOSE_RATIO)) {
        this.cancelGesture();
        return unchanged;
      }
      if (active.ratio >= OPEN_RATIO) {
        const changed = timestamp - this.pinching.since >= PINCH_MS;
        this.pinching = null;
        this.armed = bothOpen;
        return { changed };
      }
      return unchanged;
    }
    if (!this.armed) {
      this.armed = bothOpen;
      return unchanged;
    }
    const closed = pair.filter(hand => hand.ratio <= CLOSE_RATIO);
    if (closed.length === 1) {
      this.pinching = { id: closed[0].id, since: timestamp };
      this.armed = false;
    } else if (closed.length > 1) {
      this.cancelGesture();
    }
    return unchanged;
  }

  poseAt(now: number): CubePose | null {
    if (!Number.isFinite(now) || now < this.paintTimestamp) {
      this.clearTracking();
      return null;
    }
    this.paintTimestamp = now;
    if (now - this.validAt > HOLD_MS) this.clearTracking();
    return this.pose ? { ...this.pose } : null;
  }

  private cancelGesture(): void {
    this.armed = false;
    this.pinching = null;
  }

  private clearTracking(): void {
    this.pose = null;
    this.validAt = -Infinity;
    this.previous = null;
    this.cancelGesture();
  }

  private readPair(hands: readonly Hand[], aspect: number): [Sample, Sample] | null {
    if (hands.length !== 2) return null;
    const result: Sample[] = [];
    for (const hand of hands) {
      // MediaPipe's score is handedness confidence, not positional accuracy.
      // Reject malformed geometry and ambiguous identity rather than treating it as tracking certainty.
      if (hand.landmarks.length !== 21 || !hand.landmarks.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)
        && p.x >= -0.25 && p.x <= 1.25 && p.y >= -0.25 && p.y <= 1.25)) return null;
      if (typeof hand.handedness !== 'string') return null;
      const id = hand.handedness.toLowerCase();
      if (id !== 'left' && id !== 'right') return null;
      const center = { x: 0, y: 0 };
      for (const index of PALM_INDICES) {
        center.x += hand.landmarks[index].x / PALM_INDICES.length;
        center.y += hand.landmarks[index].y / PALM_INDICES.length;
      }
      const distance = (a: Point, b: Point) => Math.hypot(aspect * (a.x - b.x), a.y - b.y);
      const palm = distance(hand.landmarks[0], hand.landmarks[9]);
      if (palm / Math.min(1, aspect) < 0.025 || center.x < 0 || center.x > 1 || center.y < 0 || center.y > 1) return null;
      result.push({ id, center, ratio: distance(hand.landmarks[4], hand.landmarks[8]) / palm });
    }
    if (result[0].id === result[1].id) return null;
    result.sort((a, b) => a.id.localeCompare(b.id));
    return result as [Sample, Sample];
  }

  private discontinuous(pair: [Sample, Sample], distance: (a: Point, b: Point) => number): boolean {
    if (!this.previous) return false;
    const [a, b] = pair, [oldA, oldB] = this.previous;
    if (a.id !== oldA.id || b.id !== oldB.id) return true;
    if (distance(a.center, oldA.center) > 0.30 || distance(b.center, oldB.center) > 0.30) return true;
    // An order reversal could be crossed hands or a handedness-label swap. Neither may release a pinch.
    const oldDx = oldA.center.x - oldB.center.x, dx = a.center.x - b.center.x;
    return oldDx * dx < 0 && Math.abs(oldDx) > 0.02 && Math.abs(dx) > 0.02;
  }
}
