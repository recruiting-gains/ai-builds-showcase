import type { Hand, Point } from '../src/contracts';

export type OutlineFixture = 'rectangle' | 'triangle' | 'rounded' | 'heart';
const CHAIN = [4, 3, 2, 5, 6, 7, 8];
const LEFT: Record<OutlineFixture, readonly Point[]> = {
  rectangle: [{ x: 0.45, y: 0.65 }, { x: 0.34, y: 0.65 }, { x: 0.20, y: 0.65 },
    { x: 0.20, y: 0.50 }, { x: 0.20, y: 0.40 }, { x: 0.20, y: 0.32 }, { x: 0.20, y: 0.25 }],
  triangle: [{ x: 0.50, y: 0.65 }, { x: 0.35, y: 0.65 }, { x: 0.20, y: 0.65 },
    { x: 0.26, y: 0.57 }, { x: 0.34, y: 0.4633333333 }, { x: 0.42, y: 0.3566666667 }, { x: 0.50, y: 0.25 }],
  rounded: [{ x: 0.50, y: 0.70 }, { x: 0.35, y: 0.68 }, { x: 0.25, y: 0.58 },
    { x: 0.22, y: 0.46 }, { x: 0.27, y: 0.35 }, { x: 0.38, y: 0.27 }, { x: 0.50, y: 0.25 }],
  heart: [{ x: 0.50, y: 0.72 }, { x: 0.37, y: 0.62 }, { x: 0.23, y: 0.48 },
    { x: 0.22, y: 0.34 }, { x: 0.30, y: 0.25 }, { x: 0.41, y: 0.27 }, { x: 0.50, y: 0.40 }],
};

/** Original synthetic joint fixtures; display-left then display-right, source coordinates. */
export function handOutlineFixture(shape: OutlineFixture = 'rectangle', options: {
  dx?: number; dy?: number; scale?: number; tipGap?: number;
} = {}): Hand[] {
  const { dx = 0, dy = 0, scale = 1, tipGap = 0 } = options;
  return [false, true].map(right => {
    const wristX = right ? 0.82 : 0.18;
    const landmarks: Point[] = Array.from({ length: 21 }, () => ({ x: wristX, y: 0.65, z: 0 }));
    landmarks[0] = { x: wristX, y: 0.78, z: 0 };
    landmarks[9] = { x: wristX, y: 0.60, z: 0 };
    landmarks[17] = { x: right ? 0.88 : 0.12, y: 0.66, z: 0 };
    LEFT[shape].forEach((point, index) => {
      const x = right ? 1 - point.x : point.x;
      landmarks[CHAIN[index]] = { x: x + ([4, 8].includes(CHAIN[index]) ? (right ? 1 : -1) * tipGap / 2 : 0), y: point.y, z: 0 };
    });
    return { score: 0.98, handedness: right ? 'Right' : 'Left', landmarks: landmarks.map(point => ({
      x: 1 - (0.5 + (point.x - 0.5) * scale + dx), y: 0.5 + (point.y - 0.5) * scale + dy, z: 0,
    })) };
  });
}
