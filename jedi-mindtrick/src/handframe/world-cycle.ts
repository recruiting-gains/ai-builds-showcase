import type { Hand, Point } from '../contracts';

const ASPECT = 16 / 9;
const MAX_GAP_MS = 1000;
const OPEN_GRACE_MS = 300;
const CONTACT_GRACE_MS = 700;
const CONTACT_INFER = 0.7;
const CLOSE_ENTER = 1.45, CLOSE_HOLD = 1.65, CLOSE_DWELL_MS = 140;
const OPEN_ENTER = 2.3, OPEN_HOLD = 2.1, OPEN_DWELL_MS = 100;
const distance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);
type TrackedHand = { wrist: Point; center: Point; palm: number };
type Phase = 'waiting-open' | 'open' | 'closed';
export type WorldCycleStatus = Phase | 'closing' | 'occluded' | 'reacquiring';

function measure(hand: Hand): TrackedHand | null {
  // The worker supplies MediaPipe's left/right label score here, not presence
  // confidence. A nearly 50/50 label is expected when the palms turn sideways.
  if (!hand || !Number.isFinite(hand.score) || hand.score < 0.5 || hand.score > 1 ||
    !Array.isArray(hand.landmarks) || hand.landmarks.length !== 21) return null;
  for (const point of hand.landmarks) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 ||
      (point.z !== undefined && !Number.isFinite(point.z))) return null;
  }
  const points = hand.landmarks, palm = distance(points[0], points[9]);
  if (palm < 0.035 || palm > 0.5) return null;
  // A prayer pose turns both palms edge-on. Their projected width can vanish
  // even while the depth landmarks still describe a plausible palm.
  const width = Math.hypot(distance(points[5], points[17]),
    ((points[5].z ?? 0) - (points[17].z ?? 0)) * ASPECT);
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
  return { wrist: { x: points[0].x, y: points[0].y }, center, palm };
}

/**
 * Changes a world only after an armed pair comes together, then opens again.
 * Separation is measured from palms and wrists, never fingertip contact.
 * Overlapping wrists and unstable handedness labels are normal at palm contact.
 * A brief one-hand occlusion can finish a close only after observed contraction
 * into near-overlapping contact. Brief one-hand loss before contact may retain
 * an already armed session, but cannot contribute any close dwell.
 * Geometry cannot identify people or indistinguishable replacement hands. The
 * caller resets on camera/mode/manual-control changes.
 */
export class WorldCycle {
  private phase: Phase = 'waiting-open';
  private candidateSince: number | null = null;
  private lastTimestamp: number | null = null;
  private lastPairTimestamp: number | null = null;
  private previous: [TrackedHand, TrackedHand] | null = null;
  private openSpan = 0;
  private closedSpan = 0;
  private missing: 'open' | 'contact' | null = null;

  get status(): WorldCycleStatus {
    // Do not invite reopening until the close dwell has actually completed.
    if (this.missing === 'open') return 'reacquiring';
    if (this.missing === 'contact' && this.phase === 'closed') return 'occluded';
    if (this.phase === 'open' && this.candidateSince !== null) return 'closing';
    return this.phase;
  }

  reset(): void {
    this.phase = 'waiting-open'; this.candidateSince = null;
    this.lastTimestamp = null; this.lastPairTimestamp = null; this.previous = null;
    this.openSpan = 0; this.closedSpan = 0;
    this.missing = null;
  }

  update(hands: Hand[], timestamp: number): boolean {
    if (!Number.isFinite(timestamp) || timestamp < 0 || !Array.isArray(hands) ||
      hands.length < 1 || hands.length > 2) {
      this.reset(); return false;
    }
    const measured = hands.map(measure);
    if (measured.some(hand => !hand)) { this.reset(); return false; }
    if (this.lastTimestamp !== null) {
      if (timestamp < this.lastTimestamp || timestamp - this.lastTimestamp > MAX_GAP_MS) {
        this.reset(); return false;
      }
      if (timestamp === this.lastTimestamp) return false;
    }
    if (this.missing && this.lastPairTimestamp !== null &&
      timestamp - this.lastPairTimestamp > (this.missing === 'open' ? OPEN_GRACE_MS : CONTACT_GRACE_MS)) {
      this.reset(); return false;
    }
    if (measured.length === 1) {
      if (!this.bridgeContact(measured[0]!, timestamp) && !this.retainOpen(measured[0]!, timestamp)) this.reset();
      return false;
    }
    // Two copies of one detection are not evidence of a pair. Keep this narrow
    // so actual overlapping palms with different finger/depth geometry work.
    if (hands[0].landmarks.every((point, index) => {
      const other = hands[1].landmarks[index];
      return distance(point, other) < 0.00001 && Math.abs((point.z ?? 0) - (other.z ?? 0)) < 0.00001;
    })) { this.reset(); return false; }
    const pair = measured as [TrackedHand, TrackedHand];
    if (this.previous) {
      // Match by continuity, not handedness or x ordering: both may flip while
      // side-on palms meet. The displacement guard below still rejects jumps.
      const direct = distance(pair[0].wrist, this.previous[0].wrist) + distance(pair[1].wrist, this.previous[1].wrist);
      const swapped = distance(pair[1].wrist, this.previous[0].wrist) + distance(pair[0].wrist, this.previous[1].wrist);
      if (swapped < direct) pair.reverse();
    }
    const [left, right] = pair, palm = (left.palm + right.palm) / 2;
    if (Math.max(left.palm, right.palm) / Math.min(left.palm, right.palm) > 2.5) {
      this.reset(); return false;
    }
    if (this.previous && pair.some((hand, index) => {
      const before = this.previous![index];
      return distance(hand.wrist, before.wrist) > Math.max(0.12, (hand.palm + before.palm));
    })) { this.reset(); return false; }
    this.previous = pair; this.lastTimestamp = this.lastPairTimestamp = timestamp; this.missing = null;
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

  private retainOpen(hand: TrackedHand, timestamp: number): boolean {
    if (this.phase !== 'open' || !this.previous || this.lastPairTimestamp === null ||
      timestamp - this.lastPairTimestamp > OPEN_GRACE_MS) return false;
    const continuous = this.previous.some(before =>
      hand.palm >= before.palm * 0.6 && hand.palm <= before.palm * 1.8 &&
      distance(hand.wrist, before.wrist) <= before.palm * 0.8 &&
      distance(hand.center, before.center) <= before.palm * 0.8);
    if (!continuous) return false;
    // Preserve only the armed opening. The missing interval supplies no close
    // evidence; reacquiring two hands must start a fresh close dwell. Neither
    // repeated singletons nor their motion update the deadline or pair anchor.
    this.candidateSince = null; this.missing = 'open'; this.lastTimestamp = timestamp;
    return true;
  }

  private bridgeContact(hand: TrackedHand, timestamp: number): boolean {
    if (!this.previous || this.lastPairTimestamp === null ||
      timestamp - this.lastPairTimestamp > CONTACT_GRACE_MS ||
      (this.phase !== 'closed' && (this.phase !== 'open' || this.candidateSince === null))) return false;
    const [left, right] = this.previous, palm = (left.palm + right.palm) / 2;
    const wristSpan = distance(left.wrist, right.wrist);
    const close = Math.max(wristSpan, distance(left.center, right.center)) / palm;
    const center = { x: (left.center.x + right.center.x) / 2, y: (left.center.y + right.center.y) / 2 };
    // Inference needs stronger evidence than the normal proximity threshold:
    // a quick near-close followed by losing a hand must not invent a cycle.
    if (close > (this.phase === 'closed' ? CLOSE_HOLD : CONTACT_INFER) ||
      wristSpan > this.openSpan * 0.78 || hand.palm < palm * 0.6 || hand.palm > palm * 1.8 ||
      distance(hand.center, center) > palm * 1.2 ||
      Math.min(distance(hand.wrist, left.wrist), distance(hand.wrist, right.wrist)) > palm * 0.8) return false;
    // The last observed close anchors both the radius and the deadline. An
    // ongoing one-hand detection cannot extend its own grace period or drift.
    this.missing = 'contact'; this.lastTimestamp = timestamp;
    if (this.phase === 'open' && timestamp - this.candidateSince! >= CLOSE_DWELL_MS) {
      this.phase = 'closed'; this.closedSpan = wristSpan; this.candidateSince = null;
    }
    return true;
  }
}
