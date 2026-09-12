export type Point = { x: number; y: number; z?: number };
export type Hand = { landmarks: Point[]; score: number; handedness: string };
export type FrameRect = { x: number; y: number; width: number; height: number };
export type Mode = 'invisible' | 'handframe';
export type LocalStyle = 'thermal' | 'ink' | 'neon' | 'dream' | 'aurora' | 'ocean' | 'sunset' | 'cosmic' | 'risograph' | 'cyanotype' | 'stippling';
export type VisionFrame = {
  type: 'frame'; id: number; timestamp: number; hands: Hand[];
  /** Inference image width / height; absent only in legacy/test frames. */
  aspectRatio?: number;
  mask?: Float32Array; maskWidth?: number; maskHeight?: number; inferenceMs: number; handBackend?: 'CPU' | 'GPU';
};
export type VisionMessage = VisionFrame | { type: 'ready' } | { type: 'error'; message: string };
