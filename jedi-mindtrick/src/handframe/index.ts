import type { FrameRect, Hand, LocalStyle, Point } from '../contracts';
export { PerspectiveTracker, projectFrame } from './perspective';
export type { FramePose } from './perspective';

export type PinchAction = 'next-style' | 'capture';
export const PINCH_HOLD_MS = 600;
const CLOSE_RATIO = 0.30;
const RELEASE_RATIO = 0.48;
const MIN_PINCH_MS = 60;
const MAX_FRAME_GAP_MS = 1000;
const MIN_SCORE = 0.5;
const THERMAL_RAMP = [[7, 12, 47], [75, 18, 144], [215, 30, 90], [255, 152, 36], [255, 250, 208]];
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pastel = (channel: number, tint: number) => Math.round(channel / 32) * 23 + tint;

function validHand(hand: Hand): boolean {
  return Number.isFinite(hand.score) && hand.score >= MIN_SCORE && hand.landmarks.length === 21 &&
    hand.landmarks.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 &&
      (point.z === undefined || Number.isFinite(point.z))) &&
    distance(hand.landmarks[0], hand.landmarks[9]) >= 0.035;
}

/** Source coordinates in, mirrored display coordinates out. No global tracking state. */
function trackedPair(hands: Hand[]): Hand[] | null {
  if (hands.length !== 2 || !hands.every(validHand)) return null;
  const pair = [...hands].sort((a, b) => b.landmarks[0].x - a.landmarks[0].x);
  const [left, right] = pair;
  if (left.landmarks[0].x - right.landmarks[0].x < 0.07) return null;
  // Crossing/overlapping wrist-to-tip rays must not produce an inverted frame.
  const leftTips = (left.landmarks[4].x + left.landmarks[8].x) / 2;
  const rightTips = (right.landmarks[4].x + right.landmarks[8].x) / 2;
  if (leftTips - rightTips < 0.08) return null;
  return pair;
}

function validRect(rect: FrameRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0 &&
    rect.x + rect.width <= 1 && rect.y + rect.height <= 1;
}

function boundedRect(rect: FrameRect): FrameRect {
  const width = clamp(rect.width, 0.16, 0.90);
  const height = clamp(rect.height, 0.12, 0.86);
  const centerX = clamp(rect.x + rect.width / 2, 0.025 + width / 2, 0.975 - width / 2);
  const centerY = clamp(rect.y + rect.height / 2, 0.025 + height / 2, 0.975 - height / 2);
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

function followBlend(displacement: number): number {
  // Small changes are usually landmark jitter. Larger movement should catch up
  // promptly instead of carrying the fixed blend's lag through every sample.
  // Distances are normalized image fractions; no prediction or extra state.
  return 0.24 + 0.76 * clamp((displacement - 0.003) / 0.009, 0, 1);
}

/**
 * Fit a frame to the two index/thumb L poses. The parent must clear `previous`
 * after a null result; this function intentionally never holds stale tracking.
 * Smoothing is spatial per sample, not a measured latency or tracking guarantee.
 */
export function deriveFrame(hands: Hand[], previous?: FrameRect | null): FrameRect | null {
  const pair = trackedPair(hands);
  if (!pair) return null;
  const tips = pair.flatMap(hand => [hand.landmarks[4], hand.landmarks[8]]);
  const xs = tips.map(point => 1 - point.x);
  const ys = tips.map(point => point.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const rawWidth = Math.max(...xs) - x, rawHeight = Math.max(...ys) - y;
  if (rawWidth < 0.10 || rawHeight < 0.045) return null;
  const target = boundedRect({ x, y, width: rawWidth, height: rawHeight });
  if (!previous || !validRect(previous)) return target;
  const centerDX = target.x + target.width / 2 - previous.x - previous.width / 2;
  const centerDY = target.y + target.height / 2 - previous.y - previous.height / 2;
  const centerShift = Math.hypot(centerDX, centerDY);
  // A sudden tracking teleport cancels instead of animating through the screen.
  if (centerShift > 0.40) return null;
  const movementBlend = followBlend(centerShift);
  const resizeBlend = followBlend(Math.max(Math.abs(target.width - previous.width), Math.abs(target.height - previous.height)));
  // Follow position and dimensions separately so moving a steady-size frame
  // does not also amplify size jitter, and resizing does not drag its center.
  const width = previous.width + (target.width - previous.width) * resizeBlend;
  const height = previous.height + (target.height - previous.height) * resizeBlend;
  return boundedRect({
    x: previous.x + previous.width / 2 + centerDX * movementBlend - width / 2,
    y: previous.y + previous.height / 2 + centerDY * movementBlend - height / 2,
    width,
    height,
  });
}

const pinchRatio = (hand: Hand) => distance(hand.landmarks[4], hand.landmarks[8]) /
  distance(hand.landmarks[0], hand.landmarks[9]);

/** Two tracked hands, one deliberate pinching hand, one action per gesture. */
export class PinchController {
  private armed = false;
  private startedAt: number | null = null;
  private captured = false;
  private active: { wrist: Point; handedness: string } | null = null;
  private lastTimestamp: number | null = null;

  reset(): void {
    this.armed = false;
    this.startedAt = null;
    this.captured = false;
    this.active = null;
    this.lastTimestamp = null;
  }

  update(hands: Hand[], timestamp: number): PinchAction | null {
    const pair = trackedPair(hands);
    if (!pair || !Number.isFinite(timestamp) || timestamp < 0) { this.reset(); return null; }
    if (this.lastTimestamp !== null) {
      if (timestamp === this.lastTimestamp) return null;
      if (timestamp < this.lastTimestamp || timestamp - this.lastTimestamp > MAX_FRAME_GAP_MS) {
        this.reset();
        return null;
      }
    }
    this.lastTimestamp = timestamp;
    const bothOpen = pair.every(hand => pinchRatio(hand) >= RELEASE_RATIO);
    if (!this.armed) {
      if (bothOpen) this.armed = true;
      return null;
    }

    if (this.startedAt === null) {
      const hand = pair.find(candidate => pinchRatio(candidate) <= CLOSE_RATIO);
      if (hand) {
        this.startedAt = timestamp;
        this.active = { wrist: { ...hand.landmarks[0] }, handedness: hand.handedness };
      }
      return null;
    }

    // Match the continuing wrist, not detector array order. Distinct handedness
    // prevents accidentally handing the gesture to the other physical hand.
    const candidates = pair.filter(hand => hand.handedness === this.active!.handedness);
    const hand = candidates.sort((a, b) => distance(a.landmarks[0], this.active!.wrist) -
      distance(b.landmarks[0], this.active!.wrist))[0];
    if (!hand || distance(hand.landmarks[0], this.active!.wrist) > 0.22) {
      this.reset();
      return null;
    }
    this.active!.wrist = { ...hand.landmarks[0] };
    const duration = timestamp - this.startedAt;
    if (pinchRatio(hand) >= RELEASE_RATIO) {
      const action = this.captured || duration < MIN_PINCH_MS ? null :
        duration >= PINCH_HOLD_MS ? 'capture' : 'next-style';
      this.startedAt = null;
      this.active = null;
      this.captured = false;
      // If the other hand is held closed, it cannot silently start a second action.
      this.armed = bothOpen;
      return action;
    }
    if (!this.captured && duration >= PINCH_HOLD_MS) {
      this.captured = true;
      return 'capture';
    }
    return null;
  }
}

/** Original local color filters. They do not invoke or imitate an AI provider. */
export function stylePixels(data: Uint8ClampedArray, style: LocalStyle): Uint8ClampedArray {
  if (data.length % 4 !== 0) throw new RangeError('RGBA pixels must contain complete four-channel pixels.');
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    switch (style) {
      case 'thermal': {
        // Navy → violet → red → amber → white, driven by brightness, not temperature.
        const at = light * 4, low = Math.min(3, Math.floor(at)), mix = at - low;
        for (let c = 0; c < 3; c++) data[i + c] = THERMAL_RAMP[low][c] * (1 - mix) + THERMAL_RAMP[low + 1][c] * mix;
        break;
      }
      case 'ink': {
        const tone = light < 0.22 ? 18 : light < 0.46 ? 77 : light < 0.70 ? 174 : 240;
        data[i] = tone; data[i + 1] = tone * 0.98; data[i + 2] = tone * 0.91;
        break;
      }
      case 'neon': {
        const intensity = Math.pow(light, 0.75);
        data[i] = 14 + intensity * 200 + (r - g) * 0.5;
        data[i + 1] = 8 + intensity * 85 + (g - r) * 0.55;
        data[i + 2] = 36 + intensity * 215;
        break;
      }
      case 'dream': {
        data[i] = pastel(r, 64); data[i + 1] = pastel(g, 58); data[i + 2] = pastel(b, 79);
        break;
      }
    }
  }
  return data;
}
