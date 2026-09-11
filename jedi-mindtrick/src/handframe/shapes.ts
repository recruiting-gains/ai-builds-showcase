import type { Point } from '../contracts';

export type FrameShape = 'rectangle' | 'triangle' | 'ellipse' | 'diamond' | 'hexagon' | 'star' | 'custom';

const EPSILON = 1e-9;
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const area = (points: readonly Point[]) => points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2;

function onSegment(a: Point, b: Point, point: Point): boolean {
  return Math.abs(cross(a, b, point)) <= EPSILON &&
    point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON;
}

function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const abc = cross(a, b, c), abd = cross(a, b, d), cda = cross(c, d, a), cdb = cross(c, d, b);
  if (((abc > EPSILON && abd < -EPSILON) || (abc < -EPSILON && abd > EPSILON)) &&
    ((cda > EPSILON && cdb < -EPSILON) || (cda < -EPSILON && cdb > EPSILON))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

/** Shared bounded-outline validation; presets may use up to 64 ellipse segments. */
export function validateOutline(points: readonly Point[], maximumVertices = 64): string | null {
  if (!Array.isArray(points) || points.length < 3 || points.length > maximumVertices) {
    return `Use between 3 and ${maximumVertices} vertices.`;
  }
  if (!points.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)) {
    return 'Keep every vertex inside the image with finite coordinates.';
  }
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < 1e-6) {
        return 'Give each vertex a distinct position.';
      }
    }
  }
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      // Adjacent edges share their intended endpoint, including the closing edge.
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) {
        return 'Edges cannot cross, overlap, or touch another edge.';
      }
    }
  }
  if (Math.abs(area(points)) < 1e-4) return 'Give the shape a visible area instead of a line or a tiny sliver.';
  return null;
}

/** Either winding is accepted. Concave shapes are valid when their edges are simple. */
export function validateCustomShape(points: readonly Point[]): string | null {
  return validateOutline(points, 12);
}

/** Fresh normalized texture-space points; custom outlines retain their vertex order. */
export function shapePoints(shape: FrameShape, custom?: readonly Point[]): Point[] {
  switch (shape) {
    case 'rectangle': return [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    case 'triangle': return [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    case 'diamond': return [{ x: 0.5, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 0.5 }];
    case 'hexagon': return [{ x: 0.25, y: 0 }, { x: 0.75, y: 0 }, { x: 1, y: 0.5 },
      { x: 0.75, y: 1 }, { x: 0.25, y: 1 }, { x: 0, y: 0.5 }];
    case 'ellipse': return Array.from({ length: 64 }, (_, index) => {
      const angle = index * Math.PI / 32 - Math.PI / 2;
      return { x: 0.5 + Math.cos(angle) * 0.5, y: 0.5 + Math.sin(angle) * 0.5 };
    });
    case 'star': return Array.from({ length: 10 }, (_, index) => {
      const angle = index * Math.PI / 5 - Math.PI / 2, radius = index % 2 ? 0.22 : 0.5;
      return { x: 0.5 + Math.cos(angle) * radius, y: 0.5 + Math.sin(angle) * radius };
    });
    case 'custom': {
      const points = custom ?? [];
      const error = validateCustomShape(points);
      if (error) throw new RangeError(error);
      return points.map(({ x, y }) => ({ x, y }));
    }
    default: throw new RangeError('Unknown frame shape.');
  }
}
