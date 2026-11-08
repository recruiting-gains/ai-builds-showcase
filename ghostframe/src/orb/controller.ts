import type { Hand, Point } from '../contracts';

/** Display-space orb. `size` is a diameter relative to the shorter canvas side. */
export interface OrbPose {
  x: number;
  y: number;
  size: number;
  opacity: number;
  state: 'tracking' | 'holding' | 'fading';
}

export const ORB_HOLD_MS = 420;
export const ORB_FADE_MS = 280;
export const ORB_SIZE_GAIN = 0.9;
export const ORB_MIN_SIZE = 0.18;
export const ORB_MAX_SIZE = 0.72;
const SMOOTH_MS = 55;
const PALM_INDICES = [0, 5, 9, 13, 17] as const;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

type Sample = { id: string; center: Point };

/**
 * Two-hand orb. Input landmarks stay in camera space; `mirrored` maps them
 * into the same display the compositor already drew. One hand never retargets
 * the orb. A brief loss holds the last pose, then fades it.
 */
export class OrbController {
  private pose: OrbPose | null = null;
  private validAt = -Infinity;
  private lastTimestamp = -Infinity;
  private paintTimestamp = -Infinity;
  private aspect: number | null = null;
  private mirrored: boolean | null = null;
  private previous: Sample[] | null = null;
  private live = false;

  reset(): void {
    this.pose = null;
    this.validAt = -Infinity;
    this.lastTimestamp = -Infinity;
    this.paintTimestamp = -Infinity;
    this.aspect = null;
    this.mirrored = null;
    this.previous = null;
    this.live = false;
  }

  update(hands: readonly Hand[], timestamp: number, aspect: number, mirrored: boolean): { accepted: boolean } {
    const rejected = { accepted: false };
    if (!Number.isFinite(timestamp) || timestamp <= this.lastTimestamp) {
      this.reset();
      return rejected;
    }
    const gap = this.lastTimestamp === -Infinity ? 0 : timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    if (!Number.isFinite(aspect) || aspect < 0.2 || aspect > 5 || timestamp < this.paintTimestamp - ORB_HOLD_MS) {
      this.reset();
      return rejected;
    }
    const systemChanged = this.aspect !== null && (Math.abs(this.aspect - aspect) > 0.001 || this.mirrored !== mirrored);
    if (systemChanged || gap > ORB_HOLD_MS) {
      this.pose = null;
      this.previous = null;
      this.live = false;
      this.validAt = -Infinity;
    }
    this.aspect = aspect;
    this.mirrored = mirrored;

    const samples = this.readPair(hands, aspect);
    if (!samples || this.discontinuous(samples, aspect)) {
      this.live = false;
      this.previous = null;
      return rejected;
    }

    const shortSide = Math.min(1, aspect);
    const display = (point: Point) => ({ x: mirrored ? 1 - point.x : point.x, y: point.y });
    const a = display(samples[0].center);
    const b = display(samples[1].center);
    const separation = Math.hypot(aspect * (samples[0].center.x - samples[1].center.x), samples[0].center.y - samples[1].center.y) / shortSide;
    const target = {
      x: clamp((a.x + b.x) / 2, 0, 1),
      y: clamp((a.y + b.y) / 2, 0, 1),
      size: clamp(separation * ORB_SIZE_GAIN, ORB_MIN_SIZE, ORB_MAX_SIZE),
    };
    const blend = this.pose ? 1 - Math.exp(-Math.max(1, timestamp - this.validAt) / SMOOTH_MS) : 1;
    this.pose = {
      x: this.pose ? this.pose.x + (target.x - this.pose.x) * blend : target.x,
      y: this.pose ? this.pose.y + (target.y - this.pose.y) * blend : target.y,
      size: this.pose ? this.pose.size + (target.size - this.pose.size) * blend : target.size,
      opacity: 1,
      state: 'tracking',
    };
    this.validAt = timestamp;
    this.live = true;
    this.previous = samples;
    return { accepted: true };
  }

  poseAt(now: number): OrbPose | null {
    if (!Number.isFinite(now) || now < this.paintTimestamp) {
      this.reset();
      return null;
    }
    this.paintTimestamp = now;
    if (!this.pose) return null;
    const age = now - this.validAt;
    if (age <= ORB_HOLD_MS) return { ...this.pose, opacity: 1, state: this.live ? 'tracking' : 'holding' };
    if (age <= ORB_HOLD_MS + ORB_FADE_MS) {
      const opacity = 1 - (age - ORB_HOLD_MS) / ORB_FADE_MS;
      return { ...this.pose, opacity, state: 'fading' };
    }
    this.pose = null;
    this.previous = null;
    this.live = false;
    this.validAt = -Infinity;
    return null;
  }

  private discontinuous(samples: Sample[], aspect: number): boolean {
    if (!this.previous) return false;
    const shortSide = Math.min(1, aspect);
    return samples.some(hand => {
      const previous = this.previous!.find(old => old.id === hand.id);
      if (!previous) return true;
      const distance = Math.hypot(aspect * (hand.center.x - previous.center.x), hand.center.y - previous.center.y) / shortSide;
      return distance > 0.30;
    });
  }

  private readPair(hands: readonly Hand[], aspect: number): Sample[] | null {
    if (hands.length !== 2) return null;
    const result: Sample[] = [];
    for (const hand of hands) {
      if (hand.landmarks.length !== 21 || !hand.landmarks.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)
        && point.x >= -0.25 && point.x <= 1.25 && point.y >= -0.25 && point.y <= 1.25)) return null;
      if (typeof hand.handedness !== 'string') return null;
      const id = hand.handedness.toLowerCase();
      if (id !== 'left' && id !== 'right') return null;
      const center = { x: 0, y: 0 };
      for (const index of PALM_INDICES) {
        center.x += hand.landmarks[index].x / PALM_INDICES.length;
        center.y += hand.landmarks[index].y / PALM_INDICES.length;
      }
      const palm = Math.hypot(aspect * (hand.landmarks[0].x - hand.landmarks[9].x), hand.landmarks[0].y - hand.landmarks[9].y);
      if (palm / Math.min(1, aspect) < 0.025 || center.x < 0 || center.x > 1 || center.y < 0 || center.y > 1) return null;
      result.push({ id, center });
    }
    if (result[0].id === result[1].id) return null;
    result.sort((a, b) => a.id.localeCompare(b.id));
    return result;
  }
}
