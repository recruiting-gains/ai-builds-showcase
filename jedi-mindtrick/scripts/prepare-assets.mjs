import { mkdir, cp, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const models = {
  'hands.task': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'selfie.tflite': 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/1/selfie_segmenter_landscape.tflite'
};
const expected = {
 'hands.task': { bytes: 7819105, sha256: 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1' },
 'selfie.tflite': { bytes: 250177, sha256: '490e9ea734313e0de10fa0cd9e3c6133e36ea4db2b7a49bde9ef019f72796b8e' }
};
await mkdir('public/models', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/wasm', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/vision_bundle.js', 'public/vision_bundle.js');
const manifest = {};
for (const [name, url] of Object.entries(models)) {
  const path = `public/models/${name}`;
  if (!(await stat(path).catch(() => null))) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 10000) throw new Error(`Invalid model: ${name}`);
    await writeFile(path, bytes);
  }
  const data = await readFile(path);
  const sha256=createHash('sha256').update(data).digest('hex');
  if(data.length!==expected[name].bytes||sha256!==expected[name].sha256)throw new Error(`Integrity check failed for ${name}; restore the reviewed version before continuing.`);
  manifest[name] = { url, bytes: data.length, sha256 };
}
await writeFile('public/models/manifest.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
