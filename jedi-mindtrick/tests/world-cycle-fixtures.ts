import type { Hand } from '../src/contracts';
import { palmPose } from './palm-visibility-fixtures';
import { handOutlineFixture, type OutlineFixture } from './hand-outline-fixtures';

/** Joined-tip contours with a palm span proportional to their long fingers. */
export function worldCycleOutline(shape: OutlineFixture = 'triangle'): Hand[] {
  return handOutlineFixture(shape).map(hand => {
    hand.landmarks[9] = { ...hand.landmarks[9], y: hand.landmarks[0].y - 0.25 };
    return hand;
  });
}

/** Original articulated palms. Separation is wrist distance / wrist-to-middle MCP length. */
export function worldCyclePair(separation = 3.2, options: {
  scale?: number; x?: number; y?: number; labels?: boolean;
} = {}): Hand[] {
  const { scale = 0.75, x = 0.5, y = 0.5, labels = true } = options;
  const palm = Math.hypot(0.025, 0.18) * scale;
  const halfGap = separation * palm / (16 / 9) / 2;
  return [1, -1].map((side, index) => {
    const wristX = x + side * halfGap;
    const hand = palmPose(0, { scale, x: wristX, y, label: labels ? index === 0 ? 'Left' : 'Right' : 'unknown' });
    if (index === 1) hand.landmarks = hand.landmarks.map(point => ({ ...point, x: 2 * wristX - point.x }));
    return hand;
  });
}

/** Both palms rotated almost edge-on, as in a hands-together prayer gesture. */
export function worldCyclePrayer(separation = 0.04, scale = 0.75): Hand[] {
  return worldCyclePair(separation, { scale }).map((hand, index) => {
    const wrist = hand.landmarks[0], angle = (index === 0 ? 1 : -1) * 86 * Math.PI / 180;
    return { ...hand, score: 0.51, landmarks: hand.landmarks.map(point => ({
      ...point, x: wrist.x + (point.x - wrist.x) * Math.cos(angle),
      z: (point.x - wrist.x) * Math.sin(angle),
    })) };
  });
}
