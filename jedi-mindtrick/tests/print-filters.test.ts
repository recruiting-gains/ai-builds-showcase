import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { applyPrintFilter, type PrintStyle } from '../src/handframe/print-filters';

const styles: PrintStyle[] = ['risograph', 'cyanotype', 'stippling'];
function gray(width: number, height: number, level: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let at = 0; at < pixels.length; at += 4) pixels.set([level, level, level, (at / 4) % 256], at);
  return pixels;
}
function meanLight(data: Uint8ClampedArray): number {
  let sum = 0;
  for (let at = 0; at < data.length; at += 4) sum += 0.2126 * data[at] + 0.7152 * data[at + 1] + 0.0722 * data[at + 2];
  return sum / (data.length / 4);
}
function rgbDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let at = 0; at < a.length; at++) if (at % 4 !== 3) sum += Math.abs(a[at] - b[at]);
  return sum / (a.length / 4 * 3);
}

test('print filters validate dimensions and style before mutating the input', () => {
  const data = gray(4, 3, 128), original = data.slice();
  for (const [width, height] of [[0, 3], [4, 0], [-4, -3], [1.5, 8], [4, Number.NaN],
    [Infinity, 3], [4, 4], [Number.MAX_SAFE_INTEGER, 2]]) {
    assert.throws(() => applyPrintFilter(data, width, height, 'risograph'), RangeError);
    assert.deepEqual(data, original);
  }
  assert.throws(() => applyPrintFilter(data, 4, 3, 'unknown' as PrintStyle), RangeError);
  assert.deepEqual(data, original);
  for (const style of styles) assert.equal(applyPrintFilter(gray(1, 1, 128), 1, 1, style).length, 4);
});

test('print filters mutate RGB, preserve every alpha level, and exactly repeat from the same source', () => {
  for (const style of styles) {
    const original = gray(32, 32, 128), output = original.slice();
    assert.equal(applyPrintFilter(output, 32, 32, style), output);
    assert.notDeepEqual(output, original);
    assert.deepEqual(applyPrintFilter(original.slice(), 32, 32, style), output);
    for (let at = 0; at < output.length; at++) {
      if (at % 4 === 3) assert.equal(output[at], original[at]);
      else assert.ok(Number.isInteger(output[at]) && output[at] >= 0 && output[at] <= 255);
    }
    // Processing other content and dimensions must not affect later results.
    applyPrintFilter(gray(7, 9, 40), 7, 9, style);
    assert.deepEqual(applyPrintFilter(original.slice(), 32, 32, style), output);
  }
});

test('uniform gray contains actual spatial ink and paper texture in all three effects', () => {
  const outputs = styles.map(style => applyPrintFilter(gray(64, 64, 128), 64, 64, style));
  for (let i = 0; i < styles.length; i++) {
    const data = outputs[i], colors = new Set<string>();
    let lowest = Infinity, highest = -Infinity;
    for (let at = 0; at < data.length; at += 4) {
      colors.add(`${data[at]},${data[at + 1]},${data[at + 2]}`);
      const brightness = (data[at] + data[at + 1] + data[at + 2]) / 3;
      lowest = Math.min(lowest, brightness); highest = Math.max(highest, brightness);
    }
    assert.ok(colors.size > 30, `${styles[i]} needs fractional print coverage, not a flat palette`);
    assert.ok(highest - lowest > 70, `${styles[i]} needs visible spatial ink/paper variation`);
  }
  for (let a = 0; a < outputs.length; a++) for (let b = a + 1; b < outputs.length; b++) {
    assert.ok(rgbDifference(outputs[a], outputs[b]) > 25, 'print effects must remain visually distinct');
  }
});

test('tonal readability and intended ink colors survive the print texture', () => {
  for (const style of styles) {
    const levels = [0, 64, 128, 192, 255].map(level =>
      meanLight(applyPrintFilter(gray(64, 64, level), 64, 64, style)));
    for (let level = 1; level < levels.length; level++) {
      assert.ok(levels[level] > levels[level - 1] + 5, `${style}: shadows through highlights must remain ordered`);
    }
    assert.ok(levels[4] > 235, `${style}: white input should retain bright paper`);
  }
  const blue = applyPrintFilter(gray(1, 1, 0), 1, 1, 'cyanotype');
  assert.ok(blue[2] > blue[1] && blue[1] > blue[0], 'cyanotype shadows should be Prussian blue');
  const red = applyPrintFilter(gray(1, 1, 0), 1, 1, 'stippling');
  assert.ok(red[0] > red[1] * 3 && red[0] > red[2] * 3, 'stippling should use red ink');
  const green = applyPrintFilter(gray(1, 1, 0), 1, 1, 'risograph');
  assert.ok(green[1] > green[0] * 3 && green[1] > green[2] * 2, 'overlapping risograph shadow inks should make green');
});

test('small brightness changes preserve the pattern and only modify a local source region', () => {
  for (const style of styles) {
    const first = applyPrintFilter(gray(64, 64, 128), 64, 64, style);
    const brighter = applyPrintFilter(gray(64, 64, 130), 64, 64, style);
    const difference = rgbDifference(first, brighter);
    assert.ok(difference > 0 && difference < 3, `${style}: small brightness changes should produce a small coherent difference`);
    const source = gray(64, 64, 128);
    for (let y = 24; y < 40; y++) for (let x = 24; x < 40; x++) {
      const at = (y * 64 + x) * 4;
      source[at] = source[at + 1] = source[at + 2] = 130;
    }
    const local = applyPrintFilter(source, 64, 64, style);
    let changed = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const at = (y * 64 + x) * 4;
      const different = first[at] !== local[at] || first[at + 1] !== local[at + 1] || first[at + 2] !== local[at + 2];
      if (different) {
        changed++;
        assert.ok(x >= 23 && x <= 39 && y >= 24 && y <= 40,
          `${style}: changing a small patch must not reseed texture elsewhere`);
      }
    }
    assert.ok(changed > 20, 'the local brightness change must remain visible');
  }
});

test('risograph has offset color plates at an edge and stippling has separate red dots', () => {
  const source = gray(32, 16, 255);
  for (let y = 0; y < 16; y++) for (let x = 16; x < 32; x++) {
    const at = (y * 32 + x) * 4;
    source[at] = source[at + 1] = source[at + 2] = 0;
  }
  const riso = applyPrintFilter(source, 32, 16, 'risograph');
  const goldEdge = (4 * 32 + 15) * 4, greenBody = goldEdge + 4;
  assert.ok(riso[goldEdge] > riso[goldEdge + 2] * 3, 'the shifted plate should leave a gold edge');
  assert.ok(riso[greenBody + 1] > riso[greenBody] * 3, 'overlapping plates should produce a green body');
  const dots = applyPrintFilter(gray(32, 32, 160), 32, 32, 'stippling');
  let ink = 0, paper = 0, fractional = 0;
  for (let at = 0; at < dots.length; at += 4) {
    if (dots[at + 1] < 70) ink++;
    else if (dots[at + 1] > 225) paper++;
    else fractional++;
  }
  assert.ok(ink > 30 && paper > 100 && fractional > 100, 'dots need ink centers, paper gaps, and antialiased edges');
});

test('384×256 print-filter CPU benchmark reports warm median and high sample cost', t => {
  const width = 384, height = 256, source = gray(width, height, 128);
  for (let at = 0; at < source.length; at += 4) {
    const x = (at / 4) % width, y = Math.floor(at / 4 / width);
    source[at] = x % 256; source[at + 1] = y; source[at + 2] = (x + y) % 256;
  }
  for (const style of styles) {
    const output = source.slice();
    for (let warmup = 0; warmup < 5; warmup++) { output.set(source); applyPrintFilter(output, width, height, style); }
    const samples: number[] = [];
    for (let sample = 0; sample < 20; sample++) {
      output.set(source);
      const start = performance.now();
      applyPrintFilter(output, width, height, style);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    t.diagnostic(`${style}: ${samples[10].toFixed(3)} ms median; ${samples[18].toFixed(3)} ms p95; 20 warm CPU samples, buffer reset excluded`);
  }
});
