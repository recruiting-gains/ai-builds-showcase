// Real production worker, MediaPipe models and WASM; generated camera pixels.
// Does not open a physical camera, load private images or call an AI endpoint.
import { chromium, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:8812';
const output = new URL('../test-results/vision-aspect/', import.meta.url);
await mkdir(output, { recursive: true });
const engine = process.env.VISION_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const report = { base, engine, at: new Date().toISOString(), cases: [],
  evidence: `Headless ${engine}, actual shipped vision-worker.js and local models/WASM. Synthetic animated canvas camera only. No physical phone, camera, private assets or AI requests.` };
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) :
  await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const deadline = setTimeout(() => void browser.close(), 90000);
try {
  for (const [name, width, height] of [['portrait', 720, 1280], ['landscape', 1280, 720]]) {
    const result = { name, width, height, aspectRatio: width / height, assets: [], errors: [], checks: [] };
    report.cases.push(result);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    context.setDefaultTimeout(5000);
    await context.addInitScript(({ width, height }) => {
      const state = window.__visionAspect = { frames: [], streams: [], workers: [], stops: 0, errors: [] };
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          const observation = { url: String(args[0]), terminated: false };
          state.workers.push(observation);
          const terminate = this.terminate.bind(this);
          this.terminate = () => { observation.terminated = true; terminate(); };
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'error') state.errors.push(data.message);
            if (data.type === 'frame') {
              state.frames.push({ aspectRatio: data.aspectRatio, inferenceMs: data.inferenceMs,
                ageMs: performance.now() - data.timestamp, backend: data.handBackend,
                handCount: Array.isArray(data.hands) ? data.hands.length : -1,
                validHands: Array.isArray(data.hands) && data.hands.every(hand => Number.isFinite(hand.score) &&
                  Array.isArray(hand.landmarks) && hand.landmarks.length === 21 && hand.landmarks.every(point =>
                    Number.isFinite(point.x) && Number.isFinite(point.y) && (point.z === undefined || Number.isFinite(point.z)))) });
              if (state.frames.length > 20) state.frames.shift();
            }
          });
        }
      };
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        const paint = () => {
          ctx.fillStyle = '#123244'; ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = '#7bcacc'; ctx.fillRect((performance.now() / 8) % width, height * .4, width * .08, height * .15);
        };
        paint(); const timer = setInterval(paint, 33), stream = canvas.captureStream(30);
        const track = stream.getVideoTracks()[0], stop = track.stop.bind(track), settings = track.getSettings.bind(track);
        track.getSettings = () => ({ ...settings(), facingMode: 'user' });
        track.stop = () => { clearInterval(timer); state.stops++; stop(); };
        state.streams.push(stream); return stream;
      };
    }, { width, height });
    await context.route('**/api/config', route => route.fulfill({ contentType: 'application/json', body: '{"aiEnabled":false}' }));
    await context.route('**/api/render', route => route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('response', response => {
      if (/\/(vision-worker\.js|vision_bundle\.js|models\/|wasm\/)/.test(response.url()))
        result.assets.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
    try {
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.locator('[data-mode="handframe"]').click();
      const started = Date.now();
      await page.locator('#start-camera').click();
      await page.waitForFunction(() => window.__visionAspect.frames.filter(frame => frame.ageMs >= 0 && frame.ageMs <= 1000).length >= 3 || window.__visionAspect.errors.length > 0,
        null, { timeout: 40000 });
      result.startupAndFramesMs = Date.now() - started;
      const state = await page.evaluate(() => ({ frames: window.__visionAspect.frames, errors: window.__visionAspect.errors,
        activeStreams: window.__visionAspect.streams.filter(stream => stream.getTracks().some(track => track.readyState === 'live')).length,
        status: document.querySelector('#status').textContent }));
      result.observed = state;
      assert.deepEqual(state.errors, []);
      assert.ok(state.frames.length >= 3);
      assert.ok(state.frames.every(frame => Math.abs(frame.aspectRatio - width / height) < 1e-12));
      assert.ok(state.frames.every(frame => frame.validHands && Number.isFinite(frame.inferenceMs) && frame.inferenceMs >= 0));
      assert.equal(state.activeStreams, 1); assert.match(state.status, /Camera on/);
      assert.ok(result.assets.some(asset => asset.path === '/vision-worker.js' && asset.status === 200));
      assert.ok(result.assets.some(asset => asset.path === '/models/hands.task' && asset.status === 200));
      assert.ok(result.assets.some(asset => asset.path.endsWith('.wasm') && asset.status === 200));
      result.checks.push('Actual worker and model/WASM assets loaded', 'Three fresh real inference frames preserve native aspect', 'Finite inference output and camera active');
      await page.locator('#stop-camera').click();
      result.cleanup = await page.evaluate(() => ({ stops: window.__visionAspect.stops,
        liveTracks: window.__visionAspect.streams.flatMap(stream => stream.getTracks()).filter(track => track.readyState === 'live').length,
        workersTerminated: window.__visionAspect.workers.every(worker => worker.terminated) }));
      assert.equal(result.cleanup.liveTracks, 0); assert.equal(result.cleanup.workersTerminated, true); assert.ok(result.cleanup.stops >= 1);
      assert.deepEqual(result.errors, []); result.checks.push('Stop releases stream and worker'); result.ok = true;
    } catch (error) {
      result.ok = false; result.failure = String(error.stack || error);
      if (!result.observed) result.observed = await page.evaluate(() => ({
        frames: window.__visionAspect?.frames, errors: window.__visionAspect?.errors,
        status: document.querySelector('#status')?.textContent,
        activeStreams: window.__visionAspect?.streams.filter(stream => stream.getTracks().some(track => track.readyState === 'live')).length,
        workers: window.__visionAspect?.workers,
      })).catch(() => ({ unavailable: 'Page closed before failure diagnostics could be read.' }));
      throw error;
    }
    finally { await context.close(); }
  }
  report.ok = true;
} catch (error) { report.ok = false; report.failure = String(error.stack || error); process.exitCode = 1; }
finally { clearTimeout(deadline); await browser.close(); await writeFile(new URL(engine === 'webkit' ? 'webkit-report.json' : 'report.json', output), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
