export type Landmark = { x: number; y: number; z?: number };
export type DetectedHand = { landmarks: Landmark[]; handedness: string; confidence: number };
export type TrackingSample = {
  x: number; y: number; pinching: boolean; phase: 'move' | 'down' | 'up' | 'cancel';
  landmarks: Landmark[]; latencyMs: number; confidence: number;
};
export type GestureFrame = { hands: DetectedHand[]; width: number; height: number; time: number; latencyMs?: number };

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const distance = (a: Landmark, b: Landmark, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

export function validLandmarks(points: Landmark[]): boolean {
  return points.length === 21 && points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)
    && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && (p.z === undefined || Number.isFinite(p.z)));
}

/** Pixel-aspect-correct tip gap divided by wrist-to-middle-MCP palm length. */
export function pinchRatio(points: Landmark[], width: number, height: number): number {
  if (!validLandmarks(points) || !(width > 0) || !(height > 0)) return Infinity;
  const aspect = width / height;
  const palm = distance(points[0], points[9], aspect);
  return palm > 0.025 ? distance(points[4], points[8], aspect) / palm : Infinity;
}

/** Pure, deterministic pointer/drag state machine. No camera or DOM access. */
export class GestureProcessor {
  private sensitivity = 1;
  private pinching = false;
  private armed = false;
  private candidateSince: number | null = null;
  private releaseSince: number | null = null;
  private last: TrackingSample | null = null;
  private lastTime = -Infinity;
  private lastSeen = -Infinity;
  private locked: { handedness: string; wrist: Landmark } | null = null;
  private lost = false;

  setSensitivity(value: number): void {
    this.sensitivity = Number.isFinite(value) ? Math.max(0.7, Math.min(1.4, value)) : 1;
    this.candidateSince = this.releaseSince = null;
  }

  reset(): TrackingSample | null {
    const cancelled = this.last && !this.lost ? { ...this.last, pinching: false, phase: 'cancel' as const, landmarks: [] } : null;
    this.pinching = false; this.armed = false; this.candidateSince = this.releaseSince = null;
    this.last = null; this.locked = null; this.lost = false;
    this.lastTime = this.lastSeen = -Infinity;
    return cancelled;
  }

  private lose(time: number): TrackingSample | null {
    const cancelled = this.last && !this.lost ? { ...this.last, pinching: false, phase: 'cancel' as const, landmarks: [] } : null;
    this.pinching = false; this.armed = false; this.candidateSince = this.releaseSince = null;
    this.lost = true;
    if (time - this.lastSeen > 500) this.locked = null;
    return cancelled;
  }

  process(frame: GestureFrame): TrackingSample | null {
    if (!Number.isFinite(frame.time) || frame.time <= this.lastTime) return null;
    const dt = Math.min(100, frame.time - this.lastTime);
    this.lastTime = frame.time;
    if (!Number.isFinite(frame.width) || !Number.isFinite(frame.height) || frame.width <= 0 || frame.height <= 0) return this.lose(frame.time);
    const hands = frame.hands.filter(hand => validLandmarks(hand.landmarks) && Number.isFinite(hand.confidence) && hand.confidence >= 0.55);
    let hand: DetectedHand | undefined;
    if (this.locked) {
      const lock = this.locked;
      hand = hands.filter(candidate => candidate.handedness === lock.handedness)
        .sort((a, b) => distance(a.landmarks[0], lock.wrist, 1) - distance(b.landmarks[0], lock.wrist, 1))[0];
      // Never teleport an active pointer to a newly detected hand.
      if (hand && distance(hand.landmarks[0], lock.wrist, 1) > 0.28) hand = undefined;
    } else {
      hand = [...hands].sort((a, b) => b.confidence - a.confidence)[0];
    }
    if (!hand) return this.lose(frame.time);
    const ratio = pinchRatio(hand.landmarks, frame.width, frame.height);
    if (!Number.isFinite(ratio)) return this.lose(frame.time);
    this.locked = { handedness: hand.handedness, wrist: { ...hand.landmarks[0] } };
    this.lastSeen = frame.time;

    // Opening before the first pinch prevents grabbing on camera start/reacquisition.
    const closeAt = 0.30 * this.sensitivity;
    const openAt = 0.46 * this.sensitivity;
    let phase: TrackingSample['phase'] = 'move';
    if (!this.pinching) {
      if (ratio >= openAt) this.armed = true;
      if (this.armed && ratio <= closeAt) {
        this.candidateSince ??= frame.time;
        if (frame.time - this.candidateSince >= 80) {
          this.pinching = true; phase = 'down'; this.candidateSince = null;
        }
      } else this.candidateSince = null;
    } else {
      if (ratio >= openAt) {
        this.releaseSince ??= frame.time;
        if (frame.time - this.releaseSince >= 65) {
          this.pinching = false; phase = 'up'; this.releaseSince = null;
        }
      } else this.releaseSince = null;
    }
    const target = { x: clamp(1 - hand.landmarks[8].x), y: clamp(hand.landmarks[8].y) };
    // Time-based low-pass filtering. On reacquisition, reset at the observed point,
    // never interpolate a dragging object across a period with no hand evidence.
    const alpha = 1 - Math.exp(-dt / 45);
    const x = this.last && !this.lost ? this.last.x + (target.x - this.last.x) * alpha : target.x;
    const y = this.last && !this.lost ? this.last.y + (target.y - this.last.y) * alpha : target.y;
    this.lost = false;
    this.last = {
      x, y, pinching: this.pinching, phase,
      landmarks: hand.landmarks.map(p => ({ ...p, x: 1 - p.x })),
      latencyMs: Math.max(0, Number.isFinite(frame.latencyMs) ? frame.latencyMs! : 0),
      // This is the model's handedness classification score, not calibrated
      // tracking accuracy. Detection/presence thresholds are configured separately.
      confidence: hand.confidence,
    };
    return this.last;
  }
}
