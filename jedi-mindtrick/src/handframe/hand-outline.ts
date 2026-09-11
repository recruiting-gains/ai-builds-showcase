import type { FrameRect, Hand, Point } from '../contracts';
import { validateOutline } from './shapes';

export type HandOutline = { rect: FrameRect; outline: Point[] };
const LEFT_CHAIN = [4, 3, 2, 5, 6, 7, 8];
const RIGHT_CHAIN = [8, 7, 6, 5, 2, 3, 4];
const ASPECT = 16 / 9;
const distance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function validHand(hand: Hand): boolean {
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

function mergeAdjacent(points: readonly Point[], threshold: number): Point[] {
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
  private previous: Point[] | null = null;
  private result: HandOutline | null = null;
  private lastTimestamp: number | null = null;

  reset(): void { this.previous = null; this.result = null; this.lastTimestamp = null; }

  update(hands: Hand[], timestamp: number): HandOutline | null {
    if (hands.length !== 2 || !hands.every(validHand) || !Number.isFinite(timestamp) || timestamp < 0) {
      this.reset(); return null;
    }
    const [left, right] = [...hands].sort((a, b) => b.landmarks[0].x - a.landmarks[0].x);
    if (left.landmarks[0].x - right.landmarks[0].x < 0.07) { this.reset(); return null; }
    const raw = [LEFT_CHAIN.map(index => left.landmarks[index]), RIGHT_CHAIN.map(index => right.landmarks[index])]
      .flat().map(point => ({ x: 1 - point.x, y: point.y }));
    const palm = (distance(left.landmarks[0], left.landmarks[9]) + distance(right.landmarks[0], right.landmarks[9])) / 2;
    const join = clamp(palm * 0.1, 0.006, 0.025);
    const target = fit(mergeAdjacent(raw, join));
    if (!target) { this.reset(); return null; }
    if (this.lastTimestamp !== null) {
      if (timestamp < this.lastTimestamp || timestamp - this.lastTimestamp > 1000) { this.reset(); return null; }
      if (timestamp === this.lastTimestamp) return this.result ? copy(this.result) : null;
    }
    if (this.result) {
      const before = this.result.rect, after = target.rect;
      if (Math.hypot(after.x + after.width / 2 - before.x - before.width / 2,
        after.y + after.height / 2 - before.y - before.height / 2) > 0.4) { this.reset(); return null; }
    }
    // Always smooth the same 14 anatomical indices BEFORE merging. Joining or
    // separating fingertips therefore cannot change smoothing correspondence.
    const points = raw.map((point, index) => {
      if (!this.previous) return point;
      const before = this.previous[index], motion = Math.hypot(point.x - before.x, point.y - before.y);
      const blend = 0.60 + 0.40 * clamp((motion - 0.0015) / 0.0045, 0, 1);
      return { x: before.x + (point.x - before.x) * blend, y: before.y + (point.y - before.y) * blend };
    });
    const result = fit(mergeAdjacent(points, join));
    // Even valid endpoints can make an invalid interpolated polygon. Hide it.
    if (!result) { this.reset(); return null; }
    this.previous = points; this.result = result; this.lastTimestamp = timestamp;
    return copy(result);
  }
}
