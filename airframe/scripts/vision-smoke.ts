import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { GestureProcessor, type DetectedHand } from '../src/tracking/gestures';

// Development-only test. It never calls getUserMedia or opens a real camera.
// Start Vite first: npm run dev -- --port 5174
// Then: npx tsx scripts/vision-smoke.ts
const base = new URL(process.env.AIRFRAME_VISION_TEST_URL ?? 'http://127.0.0.1:5174');
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('This test requires a local server; do not inject test code into a public deployment.');
const rootResponse = await fetch(base, { signal: AbortSignal.timeout(10_000) });
if (!rootResponse.ok) throw new Error('Local application is not available.');
const rootHtml = await rootResponse.text();
const built = /src="\/assets\//.test(rootHtml);
const workerPath = built
  ? `/assets/${(await readdir('dist/assets')).find(name => /^vision\.worker-.*\.js$/.test(name)) ?? 'missing-worker.js'}`
  : '/src/tracking/vision.worker.ts';
const rootCsp = rootResponse.headers.get('content-security-policy');
const imageUrl = 'https://storage.googleapis.com/mediapipe-assets/pointing_up.jpg';
const source = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
if (!source.ok) throw new Error('Official public test image could not be downloaded.');
const picture = Buffer.from(await source.arrayBuffer());
if (picture.length > 500_000) throw new Error('Unexpected image size.');
type Result = { type: string; message?: string; hands: DetectedHand[]; delegate: string; width: number; height: number; time: number; latencyMs: number };
const browser = await chromium.launch({ headless: true });
const reports: unknown[] = [];
try {
  for (const forceCpu of [false, true]) {
    const context = await browser.newContext();
    let cameraCalls = 0;
    const externalRequests = new Set<string>();
    context.on('request', request => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== base.origin) externalRequests.add(url.origin);
    });
    await context.exposeBinding('reportForbiddenCamera', () => { cameraCalls++; });
    await context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        await (window as unknown as { reportForbiddenCamera: () => Promise<void> }).reportForbiddenCamera();
        throw new Error('No camera access is permitted in this test.');
      };
    });
    // Preserve real application security headers in this minimal test document.
    await context.route('**/qa-shell', route => route.fulfill({
      headers: { ...Object.fromEntries(rootResponse.headers), 'content-type': 'text/html' },
      body: '<!doctype html><title>Static hand-image model smoke test</title>',
    }));
    await context.route('**/qa-public-hand.jpg', route => route.fulfill({ contentType: 'image/jpeg', body: picture }));
    if (forceCpu) {
      await context.route(`**${workerPath}*`, async route => {
        const response = await route.fetch(); const original = await response.text();
        // Simulate the first GPU context setup failing; subsequent CPU fallback
        // uses the original browser APIs. No model outputs are mocked.
        const modified = `const originalContext = OffscreenCanvas.prototype.getContext;
          let injectedGpuFailure = false;
          OffscreenCanvas.prototype.getContext = function(kind, ...args) {
            if (!injectedGpuFailure && (kind === 'webgl' || kind === 'webgl2')) {
              injectedGpuFailure = true; throw new Error('Test-only GPU initialization failure');
            }
            return originalContext.call(this, kind, ...args);
          };\n` + original;
        await route.fulfill({ response, body: modified });
      });
    }
    const page = await context.newPage();
    await page.goto(new URL('/qa-shell', base).href);
    const result = await page.evaluate(async (workerPath) => {
      const bitmap = await createImageBitmap(await (await fetch('/qa-public-hand.jpg')).blob());
      return new Promise<Result>((resolve, reject) => {
        const worker = new Worker(workerPath, { type: 'module' });
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('Model smoke test timed out.')); }, 45_000);
        worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
        worker.onmessage = ({ data }: MessageEvent<Result>) => {
          if (data.type === 'ready') worker.postMessage({ type: 'frame', bitmap, time: 1000 }, [bitmap]);
          if (data.type === 'result' || data.type === 'error') { clearTimeout(timer); worker.terminate(); resolve(data); }
        };
        worker.postMessage({ type: 'init', origin: location.origin });
      });
    }, workerPath);
    if (result.type !== 'result' || result.hands.length < 1 || result.hands[0].landmarks.length !== 21) throw new Error(`Real model inference failed: ${JSON.stringify(result)}`);
    if (forceCpu && result.delegate !== 'CPU') throw new Error('The CPU fallback path was not used.');
    if (cameraCalls !== 0) throw new Error('Unexpected camera permission request.');
    if (externalRequests.size) throw new Error(`Unexpected external browser request: ${[...externalRequests].join(', ')}`);
    const pointer = new GestureProcessor().process(result);
    if (!pointer || pointer.pinching || pointer.phase !== 'move') throw new Error('Static hand landmarks did not produce an ungrabbed pointer.');
    reports.push({
      test: forceCpu ? 'GPU initialization failure injected in test browser; real CPU inference' : 'Unmodified worker; real inference',
      delegate: result.delegate, hands: result.hands.length, landmarksPerHand: result.hands.map(hand => hand.landmarks.length),
      handedness: result.hands.map(hand => hand.handedness), handednessScores: result.hands.map(hand => hand.confidence),
      latencyMs: result.latencyMs, imageWidth: result.width, imageHeight: result.height, cameraCalls,
      externalBrowserRequests: [...externalRequests],
      pointer: { x: pointer.x, y: pointer.y, phase: pointer.phase },
    });
    await context.close();
  }
} finally { await browser.close(); }
const report = {
  checkedAt: new Date().toISOString(), sourceImage: imageUrl,
  servingMode: built ? 'Built Worker assets' : 'Vite development', workerPath, contentSecurityPolicy: rootCsp,
  sourceSha256: createHash('sha256').update(picture).digest('hex'),
  sourceLicense: 'MediaPipe official testdata BUILD identifies Apache 2.0; the image is fetched for the test and is not committed or deployed.',
  sourceBuild: 'https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/testdata/vision/BUILD',
  evidenceBoundary: 'Actual model/WASM inference on one public static hand photograph. Not live webcam recognition, accuracy, or ergonomic acceptance.',
  reports,
};
await mkdir('test-results', { recursive: true });
await writeFile('test-results/vision-smoke.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
