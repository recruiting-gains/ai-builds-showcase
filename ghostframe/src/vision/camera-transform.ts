import type { Hand } from '../contracts';

/** Existing hand algorithms mirror camera x into display space. For an
 * unmirrored rear preview, pre-reflect x so that their reflection cancels out.
 * Camera depth and anatomical handedness do not change with display mirroring.
 * Segmentation remains in native camera coordinates: use the same `mirrored`
 * flag in scaleMask, and when drawing the video. Do not crop either path.
 */
export function handsForCameraDisplay(hands: Hand[], mirrored: boolean): Hand[] {
  if (mirrored) return hands;
  return hands.map(hand => ({ ...hand, landmarks: hand.landmarks.map(point => ({ ...point, x: 1 - point.x })) }));
}
