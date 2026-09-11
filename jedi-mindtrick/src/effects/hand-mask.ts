import type { Hand, Point } from '../contracts';

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function valid(hand: Hand): boolean {
  return !!hand && Number.isFinite(hand.score) && hand.score >= .5 &&
    Array.isArray(hand.landmarks) && hand.landmarks.length === 21 &&
    Array.from(hand.landmarks).every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
      p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && (p.z === undefined || Number.isFinite(p.z)));
}

/** Supplement person segmentation with measured fingers/palm and a short wrist extension.
 * Input landmarks are camera coordinates; the mask is mirrored display coordinates.
 * This is a bounded geometric approximation, not exact skin segmentation.
 */
export function addTrackedHands(person: Float32Array, width: number, height: number, hands: Hand[]): Float32Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || person.length !== width * height) throw new RangeError('Invalid hand mask dimensions');
  const out = person.slice();
  function capsule(a: Point, b: Point, radius: number) {
    const feather = Math.max(1.5, radius * .25), reach = radius + feather;
    const minX = clamp(Math.floor(Math.min(a.x, b.x) - reach), 0, width - 1), maxX = clamp(Math.ceil(Math.max(a.x, b.x) + reach), 0, width - 1);
    const minY = clamp(Math.floor(Math.min(a.y, b.y) - reach), 0, height - 1), maxY = clamp(Math.ceil(Math.max(a.y, b.y) + reach), 0, height - 1);
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const t = length ? clamp(((x + .5 - a.x) * dx + (y + .5 - a.y) * dy) / length, 0, 1) : 0;
      const d = Math.hypot(x + .5 - a.x - t * dx, y + .5 - a.y - t * dy);
      const coverage = clamp((reach - d) / feather, 0, 1), index = y * width + x;
      if (coverage > out[index]) out[index] = coverage;
    }
  }
  for (const hand of hands.slice(0, 2)) {
    if (!valid(hand)) continue;
    const p = hand.landmarks.map(point => ({ x: (1 - point.x) * width, y: point.y * height }));
    const palmWidth = distance(p[5], p[17]), palmLength = distance(p[0], p[9]);
    if (palmWidth < height * .015 || palmLength < height * .035 || palmWidth > height * .65 || palmLength > height * .6) continue;
    const chains = [[0, 1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
    if (chains.some(chain => chain.slice(1).some((index, i) => distance(p[chain[i]], p[index]) > palmLength * 1.4))) continue;
    const radius = clamp(palmWidth * .13, 2, height * .045);
    // Thick measured bone chains cover fingers while preserving their gaps.
    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) capsule(p[chain[i - 1]], p[chain[i]], radius);
    }
    // Fill the palm by scan conversion of its anatomical boundary.
    const polygon = [0, 1, 2, 5, 9, 13, 17].map(i => p[i]);
    const minY = clamp(Math.floor(Math.min(...polygon.map(v => v.y))), 0, height - 1), maxY = clamp(Math.ceil(Math.max(...polygon.map(v => v.y))), 0, height - 1);
    for (let y = minY; y <= maxY; y++) {
      const intersections: number[] = [];
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if ((a.y > y + .5) !== (b.y > y + .5)) intersections.push(a.x + (y + .5 - a.y) * (b.x - a.x) / (b.y - a.y));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const start = clamp(Math.ceil(intersections[i] - .5), 0, width - 1), end = clamp(Math.floor(intersections[i + 1] - .5), 0, width - 1);
        for (let x = start; x <= end; x++) out[y * width + x] = 1;
      }
    }
    for (let i = 0; i < polygon.length; i++) capsule(polygon[i], polygon[(i + 1) % polygon.length], radius * .8);
    const center = { x: (p[5].x + p[9].x + p[13].x + p[17].x) / 4, y: (p[5].y + p[9].y + p[13].y + p[17].y) / 4 };
    const dx = p[0].x - center.x, dy = p[0].y - center.y, length = Math.hypot(dx, dy);
    if (length > 0) {
      const extension = Math.min(palmLength * 1.8, height * .22);
      capsule(p[0], { x: p[0].x + dx / length * extension, y: p[0].y + dy / length * extension }, palmWidth * .32);
    }
  }
  return out;
}
