import type { Hand } from '../src/contracts';

export type PoseOptions = { scale?: number; rotation?: number; tilt?: number; x?: number; y?: number; label?: string; score?: number };
/** Original forward-kinematic finger fixture: three bones per finger bend toward the palm in 3D. */
export function palmPose(closure: number, options: PoseOptions = {}): Hand {
  const { scale = 1, rotation = 0, tilt = 0, x = 0.5, y = 0.55, label = 'Right', score = 0.98 } = options;
  const wrist = { x: 0, y: 0.16, z: 0 };
  const points = Array.from({ length: 21 }, () => ({ ...wrist }));
  points[0] = wrist;
  points[1] = { x: -0.055, y: 0.115, z: 0 };
  points[2] = { x: -0.105, y: 0.075, z: 0 };
  points[3] = { x: -0.14, y: 0.04, z: 0 };
  points[4] = { x: -0.17, y: 0.005, z: 0 };
  for (const [base, bx, by, sizes] of [
    [5, -0.08, 0, [0.085, 0.055, 0.04]], [9, -0.025, -0.02, [0.10, 0.065, 0.045]],
    [13, 0.03, -0.012, [0.095, 0.06, 0.04]], [17, 0.078, 0.012, [0.07, 0.045, 0.035]],
  ] as const) {
    points[base] = { x: bx, y: by, z: 0 };
    const length = Math.hypot(bx, by - wrist.y), fx = bx / length, fy = (by - wrist.y) / length;
    const angles = [65, 170, 235];
    for (let bone = 0; bone < 3; bone++) {
      const angle = angles[bone] * closure * Math.PI / 180, previous = points[base + bone];
      points[base + bone + 1] = { x: previous.x + fx * Math.cos(angle) * sizes[bone],
        y: previous.y + fy * Math.cos(angle) * sizes[bone], z: previous.z - Math.sin(angle) * sizes[bone] };
    }
  }
  return { handedness: label, score, landmarks: points.map(point => {
    const tiltX = point.x * Math.cos(tilt) + point.z * Math.sin(tilt);
    const tiltZ = -point.x * Math.sin(tilt) + point.z * Math.cos(tilt);
    const rotatedX = tiltX * Math.cos(rotation) - point.y * Math.sin(rotation);
    const rotatedY = tiltX * Math.sin(rotation) + point.y * Math.cos(rotation);
    return { x: x + rotatedX * scale / (16 / 9), y: y + rotatedY * scale, z: tiltZ * scale / (16 / 9) };
  }) };
}

