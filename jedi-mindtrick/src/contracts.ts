export type Point = { x: number; y: number; z?: number };
export type Hand = { landmarks: Point[]; score: number; handedness: string };
export type FrameRect = { x: number; y: number; width: number; height: number };
export type Mode = 'invisible' | 'handframe';
export type LocalStyle = 'thermal' | 'ink' | 'neon' | 'dream' | 'aurora' | 'ocean' | 'sunset' | 'cosmic';
export type VisionFrame = {
  type: 'frame'; id: number; timestamp: number; hands: Hand[];
  mask?: Float32Array; maskWidth?: number; maskHeight?: number; inferenceMs: number;
};
export type VisionMessage = VisionFrame | { type: 'ready' } | { type: 'error'; message: string };
