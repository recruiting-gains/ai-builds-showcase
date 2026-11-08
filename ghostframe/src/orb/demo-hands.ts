import type { Hand, Point } from '../contracts';

/** Illustrated open hands for the camera-off preview. Not a recording or a model output. */
export function demoHands(now: number): Hand[] {
  const phase = now === 0 ? 0 : Math.sin(now / 900);
  const half = 0.18 + phase * 0.07;
  const y = 0.42 + (now === 0 ? 0 : Math.sin(now / 1300) * 0.02);
  return [openHand(0.5 - half, y, 'Left'), openHand(0.5 + half, y, 'Right')];
}

function openHand(cx: number, cy: number, handedness: 'Left' | 'Right'): Hand {
  const side = handedness === 'Left' ? -1 : 1;
  const landmarks: Point[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  landmarks[0] = { x: cx, y: cy + 0.055, z: 0 };
  const bases = [5, 9, 13, 17];
  bases.forEach((index, finger) => {
    const x = cx + side * 0.02 * (finger - 1.5);
    const y = cy - 0.012;
    landmarks[index] = { x, y, z: 0 };
    landmarks[index + 1] = { x, y: y - 0.04, z: 0 };
    landmarks[index + 2] = { x, y: y - 0.072, z: 0 };
    landmarks[index + 3] = { x, y: y - 0.1, z: 0 };
  });
  landmarks[1] = { x: cx - side * 0.02, y: cy + 0.02, z: 0 };
  landmarks[2] = { x: cx - side * 0.045, y: cy - 0.005, z: 0 };
  landmarks[3] = { x: cx - side * 0.062, y: cy - 0.03, z: 0 };
  landmarks[4] = { x: cx - side * 0.072, y: cy - 0.055, z: 0 };
  return { landmarks, handedness, score: 1 };
}
