import type { CubePose } from './controller';

export interface EnergyState { strength: number; spread: number; phase: number }
const clamp = (value: number, low = 0, high = 1): number => Math.min(high, Math.max(low, value));

/** Decorative only: never changes tracking, carry position, size, or gestures. */
export class EnergyResponse {
  private previous: (CubePose & { now: number; aspect: number }) | null = null;
  private strength = 0;
  private phase = 0;
  private spread = 0;
  private target = 0;
  private paintAt: number | null = null;

  reset(): void { this.previous = null; this.strength = 0; this.phase = 0; this.target = 0; this.spread = 0; this.paintAt = null; }

  update(pose: CubePose | null, now: number, aspect = 1, reducedMotion = false): EnergyState {
    this.sample(pose, now, aspect);
    return this.advance(now, reducedMotion);
  }

  /** Call only for a newly accepted tracking measurement, never a held paint pose. */
  sample(pose: CubePose | null, now: number, aspect = 1): void {
    if (!pose || ![pose.x, pose.y, pose.size, now, aspect].every(Number.isFinite) || aspect <= 0) {
      this.reset(); return;
    }
    this.spread = clamp((pose.size - 0.15) / 0.5);
    const previous = this.previous;
    const dt = previous ? (now - previous.now) / 1000 : 0;
    const distance = previous ? Math.hypot(
      (pose.x - previous.x) * Math.max(1, aspect),
      (pose.y - previous.y) * Math.max(1, 1 / aspect)) : 0;
    const resize = previous ? Math.abs(pose.size - previous.size) : 0;
    // Acquisition, lifecycle gaps, geometry changes and discontinuities are not energy.
    if (!previous || dt <= 0 || dt > 0.15
      || previous.aspect !== aspect || previous.interaction !== pose.interaction
      || distance > 0.28 || resize > 0.18) {
      this.strength = 0; this.phase = 0; this.target = 0; this.paintAt = now;
    } else {
      const speed = (distance + resize * 0.65) / dt;
      this.target = clamp((speed - 0.06) / 1.2);
    }
    this.previous = { ...pose, now, aspect };
  }

  /** Paint has its own clock. A slow detector does not inflate the measured speed. */
  advance(now: number, reducedMotion = false): EnergyState {
    const dt = this.paintAt === null ? 0 : (now - this.paintAt) / 1000;
    if (!Number.isFinite(now) || dt < 0 || dt > 0.15 || reducedMotion) {
      this.strength = 0; this.phase = 0; this.target = 0;
    } else if (this.previous) {
      if (now - this.previous.now > 150) this.target = 0;
      const tau = this.target > this.strength ? 0.065 : 0.19;
      this.strength += (this.target - this.strength) * (1 - Math.exp(-dt / tau));
      this.phase = (this.phase + dt * (0.34 + this.strength * 1.25)) % (Math.PI * 2);
    }
    this.paintAt = Number.isFinite(now) ? now : null;
    return { strength: this.strength, spread: this.spread, phase: this.phase };
  }
}
