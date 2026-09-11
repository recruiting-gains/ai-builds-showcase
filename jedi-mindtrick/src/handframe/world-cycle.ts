import type { Hand, Point } from '../contracts';

const ASPECT = 16 / 9;
const MAX_GAP_MS = 1000;
const CLOSE_ENTER = 1.45, CLOSE_HOLD = 1.65, CLOSE_DWELL_MS = 140;
const OPEN_ENTER = 2.3, OPEN_HOLD = 2.1, OPEN_DWELL_MS = 100;
const distance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);
type TrackedHand = { wrist: Point; center: Point; palm: number; label: string | null };
type Phase = 'waiting-open' | 'open' | 'closed';

function measure(hand: Hand): TrackedHand | null {
  if (!hand || !Number.isFinite(hand.score) || hand.score < 0.6 ||
    !Array.isArray(hand.landmarks) || hand.landmarks.length !== 21) return null;
  for (const point of hand.landmarks) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 ||
      (point.z !== undefined && !Number.isFinite(point.z))) return null;
  }
  const points = hand.landmarks, palm = distance(points[0], points[9]);
  if (palm < 0.035 || palm > 0.5) return null;
  const width = distance(points[5], points[17]);
  if (width < palm * 0.2 || width > palm * 2.5) return null;
  // Inspect the entire input for disconnected landmarks, while permitting
  // normal curled/foreshortened finger segments. Finger tips do not set close.
  if (points.some(point => distance(points[0], point) > palm * 3.5)) return null;
  for (const chain of [[0, 1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
    for (let index = 1; index < chain.length; index++) {
      if (distance(points[chain[index - 1]], points[chain[index]]) > palm * 2.2) return null;
    }
  }
  const center = [0, 5, 9, 17].reduce((sum, index) => ({
    x: sum.x + points[index].x / 4, y: sum.y + points[index].y / 4,
  }), { x: 0, y: 0 });
  return { wrist: { x: points[0].x, y: points[0].y }, center, palm,
    label: /^(left|right)$/i.test(hand.handedness) ? hand.handedness.toLowerCase() : null };
}

/**
 * Changes a world only after an armed pair comes together, then opens again.
 * Separation is measured from palms and wrists, never fingertip contact. Source
 * coordinates are unmirrored: descending wrist x gives display-left first.
 * This geometric identity check cannot identify people or indistinguishable
 * replacement hands. The caller resets on camera/mode/manual-control changes.
 */
export class WorldCycle {
  private phase: Phase = 'waiting-open';
  private candidateSince: number | null = null;
  private lastTimestamp: number | null = null;
  private previous: [TrackedHand, TrackedHand] | null = null;
  private openSpan = 0;
  private closedSpan = 0;

  reset(): void {
    this.phase = 'waiting-open'; this.candidateSince = null;
    this.lastTimestamp = null; this.previous = null;
    this.openSpan = 0; this.closedSpan = 0;
  }

  update(hands: Hand[], timestamp: number): boolean {
    if (!Number.isFinite(timestamp) || timestamp < 0 || !Array.isArray(hands) || hands.length !== 2) {
      this.reset(); return false;
    }
    const measured = hands.map(measure);
    if (measured.some(hand => !hand)) { this.reset(); return false; }
    const pair = (measured as TrackedHand[]).sort((a, b) => b.wrist.x - a.wrist.x) as [TrackedHand, TrackedHand];
    const [left, right] = pair, palm = (left.palm + right.palm) / 2;
    // Coincident/crossing wrists or reversed palm centers are not a close.
    if ((left.wrist.x - right.wrist.x) * ASPECT < palm * 0.15 || left.center.x <= right.center.x ||
      Math.max(left.palm, right.palm) / Math.min(left.palm, right.palm) > 2.5) {
      this.reset(); return false;
    }
    if (this.lastTimestamp !== null) {
      if (timestamp < this.lastTimestamp || timestamp - this.lastTimestamp > MAX_GAP_MS) {
        this.reset(); return false;
      }
      if (timestamp === this.lastTimestamp) return false;
    }
    if (this.previous && pair.some((hand, index) => {
      const before = this.previous![index];
      return (hand.label && before.label && hand.label !== before.label) ||
        distance(hand.wrist, before.wrist) > Math.max(0.12, (hand.palm + before.palm));
    })) { this.reset(); return false; }
    // Keep the last known label through a transient unknown detector label.
    pair.forEach((hand, index) => { hand.label ??= this.previous?.[index].label ?? null; });
    this.previous = pair; this.lastTimestamp = timestamp;
    const palmSeparation = distance(left.center, right.center) / palm;
    const wristSpan = distance(left.wrist, right.wrist);
    const wristSeparation = wristSpan / palm;
    const close = Math.max(palmSeparation, wristSeparation);
    const open = Math.min(palmSeparation, wristSeparation);

    if (this.phase === 'open') {
      if (open >= OPEN_ENTER) this.openSpan = wristSpan;
      // Palm growth alone (depth motion) must not count as bringing hands
      // together. Observe contraction from the most recent clearly open span.
      if (close > CLOSE_HOLD || wristSpan > this.openSpan * 0.78) this.candidateSince = null;
      else if (this.candidateSince === null && close <= CLOSE_ENTER) this.candidateSince = timestamp;
      if (this.candidateSince !== null && timestamp - this.candidateSince >= CLOSE_DWELL_MS) {
        this.phase = 'closed'; this.closedSpan = wristSpan; this.candidateSince = null;
      }
      return false;
    }
    const expanded = this.phase !== 'closed' || wristSpan >= this.closedSpan * 1.25;
    if (open < OPEN_HOLD || !expanded) this.candidateSince = null;
    else if (this.candidateSince === null && open >= OPEN_ENTER) this.candidateSince = timestamp;
    if (this.candidateSince !== null && timestamp - this.candidateSince >= OPEN_DWELL_MS) {
      const completedCycle = this.phase === 'closed';
      this.phase = 'open'; this.openSpan = wristSpan; this.candidateSince = null;
      return completedCycle;
    }
    return false;
  }
}
