import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
// Observed directly from Google's version-1 HTTPS download on 2026-09-05.
// This pins reproducibility; it is not an independently signed publisher checksum.
const modelSha256 = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
const modelBytes = 7_819_105;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const visionDir = join(root, 'public/vision');
const modelDir = join(root, 'public/models');
await Promise.all([mkdir(visionDir, { recursive: true }), mkdir(modelDir, { recursive: true })]);

const packageRoot = join(root, 'node_modules/@mediapipe/tasks-vision');
const packageInfo = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { version: string };
if (packageInfo.version !== '1.0.1') throw new Error('Expected pinned @mediapipe/tasks-vision 1.0.1. Review assets before changing the dependency.');
const wasmFiles = (await readdir(join(packageRoot, 'wasm'))).filter(name => /^vision_wasm(?:_module|_nosimd)?_internal\.(js|wasm)$/.test(name));
if (wasmFiles.length !== 6) throw new Error('The expected six MediaPipe WASM assets were not found.');
for (const file of wasmFiles) await copyFile(join(packageRoot, 'wasm', file), join(visionDir, file));

const target = join(modelDir, 'hand_landmarker.task');
let cached: Buffer | undefined;
try { cached = await readFile(target); } catch { /* First build has no model. */ }
if (!cached || cached.length !== modelBytes || digest(cached) !== modelSha256) {
  const response = await fetch(modelUrl, { redirect: 'error', signal: AbortSignal.timeout(45_000) });
  if (!response.ok || !response.body) throw new Error(`Official model download failed (${response.status}).`);
  const declared = Number(response.headers.get('content-length'));
  if (declared && declared !== modelBytes) throw new Error(`Unexpected model size: ${declared}.`);
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > modelBytes) throw new Error('Model exceeded the pinned size limit.');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== modelBytes || digest(bytes) !== modelSha256) throw new Error('Model integrity mismatch. Nothing has been installed; review the upstream asset.');
  await writeFile(target, bytes);
}
console.log(`Prepared MediaPipe 1.0.1 WASM and verified hand_landmarker v1 (${modelBytes} bytes). Runtime uses same-origin assets only.`);
