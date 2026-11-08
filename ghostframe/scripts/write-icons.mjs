import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), 8 + data.length);
  return out;
}
function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x / (size - 1), y / (size - 1));
      const i = row + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function orb(size) {
  return png(size, (u, v) => {
    const x = u - 0.5, y = v - 0.5;
    const d = Math.hypot(x, y);
    if (d < 0.16) return [244, 250, 255, 255];
    if (d < 0.28) return [150, 206, 255, 255];
    const hand = (cx, cy) => Math.hypot(u - cx, v - cy);
    if (hand(0.28, 0.62) < 0.035 || hand(0.72, 0.62) < 0.035) return [255, 59, 78, 255];
    if (Math.abs(v - 0.62) < 0.012 && u > 0.28 && u < 0.72) return [61, 255, 134, 255];
    const margin = Math.min(u, v, 1 - u, 1 - v);
    return margin < 0.04 ? [8, 10, 18, 255] : [12, 14, 25, 255];
  });
}
await mkdir('public/icons', { recursive: true });
await writeFile('public/icons/icon-192.png', orb(192));
await writeFile('public/icons/icon-512.png', orb(512));
await writeFile('public/icons/apple-touch-icon.png', orb(180));
console.log('icons written');
