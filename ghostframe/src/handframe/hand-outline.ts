import type { FrameRect, Hand, Point } from '../contracts';
import { validateOutline } from './shapes';

export type HandOutline = { rect: FrameRect; outline: Point[] };
const LEFT_CHAIN = [4, 3, 2, 5, 6, 7, 8];
const RIGHT_CHAIN = [...LEFT_CHAIN].reverse();
type Connection = 'like-tips' | 'opposing-tips';
const ASPECT = 16 / 9;
const metric = (aspect: number) => (a: Point, b: Point) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function validHand(hand: Hand, aspect: number): boolean {
  const distance = metric(aspect);
  if (!hand || !Number.isFinite(hand.score) || hand.score < 0.5 || !Array.isArray(hand.landmarks) || hand.landmarks.length !== 21) return false;
  for (const point of hand.landmarks) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 ||
      (point.z !== undefined && !Number.isFinite(point.z))) return false;
  }
  const points = hand.landmarks, palm = distance(points[0], points[9]);
  if (palm < 0.035) return false;
  // Reject collapsed or implausibly disconnected finger chains before drawing.
  for (const chain of [[2, 3, 4], [5, 6, 7, 8]]) {
    let length = 0;
    for (let index = 1; index < chain.length; index++) {
      const span = distance(points[chain[index - 1]], points[chain[index]]);
      if (span > palm * 2.5) return false;
      length += span;
    }
    if (length < palm * 0.25 || length > palm * 4) return false;
  }
  return distance(points[2], points[5]) <= palm * 2.5;
}

/** An alternate endpoint join must never repair a crossed measured finger chain. */
function crossedChain(points: readonly Point[]): boolean {
  const epsilon = 1e-9;
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const onSegment = (a: Point, b: Point, p: Point) => Math.abs(cross(a, b, p)) <= epsilon &&
    p.x >= Math.min(a.x, b.x) - epsilon && p.x <= Math.max(a.x, b.x) + epsilon &&
    p.y >= Math.min(a.y, b.y) - epsilon && p.y <= Math.max(a.y, b.y) + epsilon;
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 2; j < points.length - 1; j++) {
      const a = points[i], b = points[i + 1], c = points[j], d = points[j + 1];
      const abc = cross(a, b, c), abd = cross(a, b, d), cda = cross(c, d, a), cdb = cross(c, d, b);
      if ((((abc > epsilon && abd < -epsilon) || (abc < -epsilon && abd > epsilon)) &&
        ((cda > epsilon && cdb < -epsilon) || (cda < -epsilon && cdb > epsilon))) ||
        onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) return true;
    }
  }
  return false;
}

function mergeAdjacent(points: readonly Point[], threshold: number, aspect: number): Point[] {
  const distance = metric(aspect);
  const groups: { x: number; y: number; count: number }[] = [];
  for (const point of points) {
    const last = groups.at(-1);
    if (last && distance(last, point) <= threshold) {
      last.x = (last.x * last.count + point.x) / (last.count + 1);
      last.y = (last.y * last.count + point.y) / (last.count + 1);
      last.count++;
    } else groups.push({ ...point, count: 1 });
  }
  if (groups.length > 1 && distance(groups[0], groups.at(-1)!) <= threshold) {
    const first = groups[0], last = groups.pop()!, count = first.count + last.count;
    first.x = (first.x * first.count + last.x * last.count) / count;
    first.y = (first.y * first.count + last.y * last.count) / count;
  }
  return groups.map(({ x, y }) => ({ x, y }));
}

function fit(points: readonly Point[]): HandOutline | null {
  if (validateOutline(points, 14)) return null;
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const width = Math.max(...xs) - x, height = Math.max(...ys) - y;
  const area = Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
  if (width < 0.08 || height < 0.06 || area < 0.0025 || area / (width * height) < 0.08) return null;
  const outline = points.map(point => ({ x: clamp((point.x - x) / width, 0, 1), y: clamp((point.y - y) / height, 0, 1) }));
  if (validateOutline(outline, 14)) return null;
  return { rect: { x, y, width, height }, outline };
}

const copy = (value: HandOutline): HandOutline => ({ rect: { ...value.rect }, outline: value.outline.map(point => ({ ...point })) });

/**
 * Follows the actual two thumb/index chains, including their inward bends.
 * No hull or preset classification. Source landmarks are unmirrored; output is
 * in mirrored display coordinates. Null cancels the aperture until reacquired.
 */
export class HandOutlineTracker {
  private aspect = ASPECT;
  private previous: Point[] | null = null;
  private result: HandOutline | null = null;
  private lastTimestamp: number | null = null;
  private connection: Connection | null = null;

  reset(): void { this.previous = null; this.result = null; this.lastTimestamp = null; this.connection = null; }

  update(hands: Hand[], timestamp: number, aspect = ASPECT): HandOutline | null {
    if (!Number.isFinite(aspect) || aspect <= 0) { this.reset(); return null; }
    if (Math.abs(aspect - this.aspect) > .001) this.reset();
    this.aspect = aspect;
    const distance = metric(aspect);
    if (hands.length !== 2 || !hands.every(hand => validHand(hand, aspect)) || !Number.isFinite(timestamp) || timestamp < 0) {
      this.reset(); return null;
    }
    const [left, right] = [...hands].sort((a, b) => b.landmarks[0].x - a.landmarks[0].x);
    if (left.landmarks[0].x - right.landmarks[0].x < 0.07) { this.reset(); return null; }
    const leftChain = LEFT_CHAIN.map(index => left.landmarks[index]);
    const rightChain = RIGHT_CHAIN.map(index => right.landmarks[index]);
    if (crossedChain(leftChain) || crossedChain(rightChain)) { this.reset(); return null; }
    const palm = (distance(left.landmarks[0], left.landmarks[9]) + distance(right.landmarks[0], right.landmarks[9])) / 2;
    const join = clamp(palm * 0.1, 0.006, 0.025);
    // There are exactly two endpoint pairings for the same two measured chains.
    // Reversing one chain connects index to thumb when one L points downward.
    const candidates = ([['like-tips', rightChain], ['opposing-tips', [...rightChain].reverse()]] as const)
      .map(([connection, chain]) => {
        const raw = [...leftChain, ...chain].map(point => ({ x: 1 - point.x, y: point.y }));
        return { connection, raw, target: fit(mergeAdjacent(raw, join, aspect)),
          bridgeLength: distance(leftChain.at(-1)!, chain[0]) + distance(chain.at(-1)!, leftChain[0]) };
      }).filter(candidate => candidate.target !== null)
      .sort((a, b) => a.bridgeLength - b.bridgeLength);
    if (!candidates.length) { this.reset(); return null; }
    // Prefer shorter physical gaps, retaining a still-valid pairing across small noise.
    const best = candidates[0], previous = candidates.find(candidate => candidate.connection === this.connection);
    const chosen = previous && previous.bridgeLength <= best.bridgeLength + palm * 0.1 ? previous : best;
    const { raw, connection } = chosen, target = chosen.target!;
    if (this.lastTimestamp !== null) {
      if (timestamp < this.lastTimestamp || timestamp - this.lastTimestamp > 1000) { this.reset(); return null; }
      if (timestamp === this.lastTimestamp) return this.result ? copy(this.result) : null;
    }
    if (this.result) {
      const before = this.result.rect, after = target.rect;
      if (Math.hypot(after.x + after.width / 2 - before.x - before.width / 2,
        after.y + after.height / 2 - before.y - before.height / 2) > 0.4) { this.reset(); return null; }
    }
    // Smooth anatomical indices before merging, but never interpolate vertices
    // across a changed endpoint pairing: their contour positions have changed.
    const points = raw.map((point, index) => {
      if (!this.previous || this.connection !== connection) return point;
      const before = this.previous[index], motion = Math.hypot(point.x - before.x, point.y - before.y);
      const blend = 0.60 + 0.40 * clamp((motion - 0.0015) / 0.0045, 0, 1);
      return { x: before.x + (point.x - before.x) * blend, y: before.y + (point.y - before.y) * blend };
    });
    const result = fit(mergeAdjacent(points, join, aspect));
    // Even valid endpoints can make an invalid interpolated polygon. Hide it.
    if (!result) { this.reset(); return null; }
    this.previous = points; this.result = result; this.lastTimestamp = timestamp; this.connection = connection;
    return copy(result);
  }
}
