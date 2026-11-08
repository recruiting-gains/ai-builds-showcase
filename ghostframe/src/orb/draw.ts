import type { Hand, Point } from '../contracts';
import type { OrbPose } from './controller';

/** MediaPipe hand graph. Green links, red joints: a guide drawn on top of the camera. */
export const HAND_LINKS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

export function drawOrb(ctx: CanvasRenderingContext2D, pose: OrbPose, width: number, height: number, now: number, reducedMotion: boolean): void {
  if (pose.opacity <= 0.01) return;
  const short = Math.min(width, height);
  const cx = pose.x * width;
  const cy = pose.y * height;
  const radius = (pose.size * short) / 2;
  ctx.save();
  ctx.globalAlpha = pose.opacity;
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.35);
  glow.addColorStop(0, 'rgba(186, 232, 255, 0.28)');
  glow.addColorStop(0.55, 'rgba(120, 186, 255, 0.12)');
  glow.addColorStop(1, 'rgba(120, 186, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createRadialGradient(cx - radius * 0.28, cy - radius * 0.32, radius * 0.08, cx, cy, radius);
  body.addColorStop(0, 'rgba(255, 252, 246, 0.92)');
  body.addColorStop(0.28, 'rgba(186, 228, 255, 0.55)');
  body.addColorStop(0.62, 'rgba(92, 142, 196, 0.28)');
  body.addColorStop(1, 'rgba(40, 64, 96, 0.05)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(230, 246, 255, 0.75)';
  ctx.lineWidth = Math.max(2, radius * 0.035);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.96, 0, Math.PI * 2);
  ctx.stroke();

  const spin = reducedMotion ? 0.4 : now / 1400;
  ctx.strokeStyle = 'rgba(255, 214, 170, 0.45)';
  ctx.lineWidth = Math.max(1.5, radius * 0.02);
  for (let arc = 0; arc < 3; arc++) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (0.42 + arc * 0.16), spin + arc, spin + arc + 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawHandSkeleton(ctx: CanvasRenderingContext2D, hands: readonly Hand[], width: number, height: number, mirrored: boolean): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const hand of hands) {
    if (hand.landmarks.length !== 21) continue;
    const at = (point: Point) => ({
      x: (mirrored ? 1 - point.x : point.x) * width,
      y: point.y * height,
    });
    ctx.beginPath();
    for (const [start, end] of HAND_LINKS) {
      const a = at(hand.landmarks[start]);
      const b = at(hand.landmarks[end]);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.lineWidth = Math.max(5, Math.min(width, height) * 0.016);
    ctx.stroke();
    ctx.strokeStyle = '#3dff86';
    ctx.lineWidth = Math.max(2.5, Math.min(width, height) * 0.008);
    ctx.stroke();
    const dot = Math.max(4, Math.min(width, height) * 0.013);
    for (let index = 0; index < hand.landmarks.length; index++) {
      const point = at(hand.landmarks[index]);
      ctx.fillStyle = '#ff3b4e';
      ctx.beginPath();
      ctx.arc(point.x, point.y, index === 0 ? dot * 1.35 : dot, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }
  ctx.restore();
}
