import type { FrameRect } from '../contracts';

/** Source/background are RGBA. Mask contains person confidence, same pixel count. */
export function blendInvisible(source: Uint8ClampedArray, background: Uint8ClampedArray, mask: Float32Array, fade: number): Uint8ClampedArray {
  if (source.length !== background.length || source.length !== mask.length * 4 || !Number.isFinite(fade)) throw new Error('Invalid compositor dimensions or fade');
  const out = source.slice();
  for (let p = 0; p < mask.length; p++) {
    const confidence = Number.isFinite(mask[p]) ? Math.min(1, Math.max(0, mask[p])) : 0;
    const edge = Math.min(1, Math.max(0, (confidence - .2) / .6));
    const a = edge * edge * (3 - 2 * edge) * Math.min(1, Math.max(0, fade));
    for (let c = 0; c < 3; c++) out[p * 4 + c] = source[p * 4 + c] * (1 - a) + background[p * 4 + c] * a;
  }
  return out;
}

/** Portal operates in mirrored display coordinates, as does the rendered canvas. */
export function portalMask(width: number, height: number, rect: FrameRect): Float32Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !Object.values(rect).every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) throw new Error('Invalid portal');
  const mask = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if ((x + .5) / width >= rect.x && (x + .5) / width < rect.x + rect.width && (y + .5) / height >= rect.y && (y + .5) / height < rect.y + rect.height) mask[y * width + x] = 1;
  }
  return mask;
}

export function scaleMask(mask: Float32Array, mw: number, mh: number, width: number, height: number, mirror = true): Float32Array {
  if (mask.length !== mw * mh || mw < 1 || mh < 1) throw new Error('Invalid mask');
  const result = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(mw - 1, Math.floor((mirror ? width - x - 1 : x) / width * mw));
    result[y * width + x] = mask[Math.min(mh - 1, Math.floor(y / height * mh)) * mw + sx];
  }
  return result;
}
