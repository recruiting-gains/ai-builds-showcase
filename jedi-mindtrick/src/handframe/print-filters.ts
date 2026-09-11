export type PrintStyle = 'risograph' | 'cyanotype' | 'stippling';

const TILE_SIZE = 64;
const TILE_MASK = TILE_SIZE - 1;
const grain = new Float32Array(TILE_SIZE * TILE_SIZE);
const dotDistance = new Float32Array(TILE_SIZE * TILE_SIZE);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const luminance = (data: Uint8ClampedArray, at: number) =>
  (0.2126 * data[at] + 0.7152 * data[at + 1] + 0.0722 * data[at + 2]) / 255;

// The only retained state is a small source-independent texture tile. Its grain
// and dot centers stay fixed in texture coordinates across every camera frame.
function hash(x: number, y: number): number {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
for (let y = 0; y < TILE_SIZE; y++) {
  for (let x = 0; x < TILE_SIZE; x++) {
    const at = y * TILE_SIZE + x;
    grain[at] = hash(x, y);
    const cellX = x >> 2, cellY = y >> 2;
    const centerX = 2 + (hash(cellX + 91, cellY + 43) - 0.5) * 0.55;
    const centerY = 2 + (hash(cellX + 17, cellY + 79) - 0.5) * 0.55;
    dotDistance[at] = Math.hypot((x & 3) + 0.5 - centerX, (y & 3) + 0.5 - centerY);
  }
}

// A fractional edge gives pigment a fixed place to grow as brightness changes,
// rather than reseeding noise or switching whole pixels at a hard threshold.
function pigment(density: number, noise: number): number {
  return clamp((density - (0.15 + noise * 0.7)) / 0.32 + 0.5);
}

/**
 * Original print effects, anchored to the supplied image's pixel coordinates.
 * Mutates RGB and returns the same RGBA buffer; alpha is never written.
 * Risograph uses one ephemeral luminance plane for its offset ink plate. No
 * source pixels are retained by this module between calls.
 */
export function applyPrintFilter(
  data: Uint8ClampedArray, width: number, height: number, style: PrintStyle,
): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
    !Number.isSafeInteger(width * height) || width * height * 4 !== data.length) {
    throw new RangeError('Print filters require positive integer dimensions matching the RGBA buffer.');
  }
  if (style !== 'risograph' && style !== 'cyanotype' && style !== 'stippling') {
    throw new RangeError('Unknown print filter.');
  }

  if (style === 'risograph') {
    const light = new Float32Array(width * height);
    for (let pixel = 0; pixel < light.length; pixel++) light[pixel] = luminance(data, pixel * 4);
    for (let y = 0; y < height; y++) {
      const row = y * width, offsetRow = Math.max(0, y - 1) * width;
      for (let x = 0; x < width; x++) {
        const pixel = row + x, at = pixel * 4, tile = (y & TILE_MASK) * TILE_SIZE + (x & TILE_MASK);
        const secondTile = ((y + 19) & TILE_MASK) * TILE_SIZE + ((x + 11) & TILE_MASK);
        const cyan = pigment(clamp((0.76 - light[pixel]) / 0.60), grain[tile]);
        // A one-pixel registration difference is visible at contrasting edges.
        const yellow = pigment(clamp((1 - light[offsetRow + Math.min(width - 1, x + 1)]) / 0.60), grain[secondTile]);
        const paper = (grain[tile] - 0.5) * 3;
        data[at] = (249 - cyan * 242) * (1 - yellow * (1 - 245 / 249)) + paper;
        data[at + 1] = (242 - cyan * 97) * (1 - yellow * (1 - 194 / 242)) + paper;
        data[at + 2] = (220 - cyan * 64) * (1 - yellow * (1 - 31 / 220)) + paper;
      }
    }
    return data;
  }

  if (style === 'cyanotype') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4, tile = (y & TILE_MASK) * TILE_SIZE + (x & TILE_MASK);
        const density = clamp((1 - luminance(data, at) - 0.025) / 0.95);
        const coverage = pigment(density, grain[tile]);
        const paper = (grain[tile] - 0.5) * 5;
        data[at] = 245 - coverage * 237 + paper;
        data[at + 1] = 244 - coverage * 191 + paper;
        data[at + 2] = 230 - coverage * 138 + paper;
      }
    }
    return data;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4, tile = (y & TILE_MASK) * TILE_SIZE + (x & TILE_MASK);
      const darkness = 1 - luminance(data, at);
      const radius = Math.sqrt(darkness) * 2.7;
      const edge = clamp(radius - dotDistance[tile] + 0.5);
      const coverage = edge * edge * (3 - 2 * edge) * clamp(darkness * 8);
      const paper = (grain[tile] - 0.5) * 2;
      data[at] = 251 - coverage * 51 + paper;
      data[at + 1] = 246 - coverage * 207 + paper;
      data[at + 2] = 232 - coverage * 188 + paper;
    }
  }
  return data;
}
