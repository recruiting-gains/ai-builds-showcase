// Orb preview, synthetic landmarks, camera denial, install manifest and phone layout.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:8806';
const output = new URL('../test-results/orb/', import.meta.url);
await mkdir(output, { recursive: true });
const hand = (x, y, handedness) => {
  const landmarks = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  landmarks[0] = { x, y: y + 0.06, z: 0 };
  landmarks[9] = { x, y: y - 0.06, z: 0 };
  return { landmarks, handedness, score: 0.99 };
};
const open = [hand(0.28, 0.46, 'Left'), hand(0.72, 0.5, 'Right')];
const wide = [hand(0.16, 0.48, 'Left'), hand(0.84, 0.48, 'Right')];
const worker = `let hands=${JSON.stringify(open)};self.onmessage=({data})=>{if(data.type==='fixture'){hands=data.hands;return;}if(data.type==='init'){self.postMessage({type:'ready'});return;}if(data.type==='frame'){const aspectRatio=data.bitmap.width/Math.max(1,data.bitmap.height);data.bitmap.close();self.postMessage({type:'frame',id:data.id,timestamp:data.timestamp,hands,inferenceMs:4,aspectRatio,handBackend:'CPU'});}};`;
const report = { base, at: new Date().toISOString(), checks: [], errors: [], posts: [], evidence: 'Synthetic landmarks and a generated camera. Not a physical phone and not the reference reel.' };
const pass = name => report.checks.push(name);
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const deadline = setTimeout(() => void browser.close(), 90000);
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  context.setDefaultTimeout(8000);
  await context.addInitScript(() => {
    const state = window.__orb = { worker: null, deny: false };
    const Original = window.Worker;
    window.Worker = class extends Original { constructor(...args) { super(...args); state.worker = this; } };
    navigator.mediaDevices.getUserMedia = async () => {
      if (state.deny) throw new DOMException('Denied', 'NotAllowedError');
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
      const ctx = canvas.getContext('2d');
      const paint = () => { ctx.fillStyle = '#6d7780'; ctx.fillRect(0, 0, 960, 540); };
      paint();
      const timer = setInterval(paint, 40);
      const stream = canvas.captureStream(20);
      const track = stream.getVideoTracks()[0];
      const stop = track.stop.bind(track);
      track.getSettings = () => ({ facingMode: 'user' });
      track.stop = () => { clearInterval(timer); stop(); };
      return stream;
    };
  });
  await context.route('**/vision-worker.js', route => route.fulfill({ contentType: 'text/javascript', body: worker }));
  await context.route('**/api/**', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') report.posts.push(request.url()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-mode=orb]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#scene').getAttribute('aria-label'), /Simulated orb/);
  assert.match(await page.locator('#orb-status').textContent(), /Simulated preview/);
  assert.equal(await page.locator('#orb-status').getAttribute('role'), 'status');
  pass('phone opens on a labelled simulated orb');
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]');
    if (!link) return null;
    const response = await fetch(link.href);
    return { ok: response.ok, body: await response.json() };
  });
  assert.equal(manifest.ok, true);
  assert.equal(manifest.body.display, 'standalone');
  assert.equal(manifest.body.orientation, 'any');
  for (const icon of manifest.body.icons) {
    const response = await page.request.get(new URL(icon.src, base).href);
    assert.equal(response.status(), 200, icon.src);
  }
  const serviceWorker = await page.evaluate(async () => (await fetch('/sw.js')).text());
  assert.match(serviceWorker, /\/api\//);
  assert.doesNotMatch(serviceWorker, /https?:\/\//);
  pass('install manifest, icons and same-origin service worker are present');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#scene');
    const ctx = canvas.getContext('2d');
    const cx = Math.floor(canvas.width * 0.5), cy = Math.floor(canvas.height * 0.42), radius = 48;
    const data = ctx.getImageData(cx - radius, cy - radius, radius * 2, radius * 2).data;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230) return true;
    return false;
  });
  const marks = await page.locator('#scene').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0, green = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 220 && data[i + 1] < 90 && data[i + 2] < 120) red++;
      if (data[i + 1] > 220 && data[i] < 120 && data[i + 2] < 180) green++;
    }
    return { red, green };
  });
  assert.ok(marks.red > 30 && marks.green > 30, JSON.stringify(marks));
  await page.screenshot({ path: new URL('portrait-simulated.png', output).pathname, fullPage: true });
  pass('simulated hands draw a bright orb, red landmarks and green links');
  const before = await page.locator('#scene').evaluate(canvas => canvas.toDataURL());
  await page.locator('#orb-follow').uncheck();
  await page.locator('#orb-x').evaluate(input => { input.value = '12'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#orb-size').evaluate(input => { input.value = '18'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(previous => document.querySelector('#scene').toDataURL() !== previous, before);
  assert.match(await page.locator('#orb-status').textContent(), /Sliders/);
  await page.locator('#scene').screenshot({ path: new URL('manual-orb.png', output).pathname });
  pass('turning off follow-hands lets the sliders move the orb');
  await page.locator('#orb-follow').check();
  await page.locator('#start-camera').click();
  await page.waitForFunction(() => document.querySelector('#orb-state').textContent === 'TRACKING', null, { timeout: 8000 });
  assert.match(await page.locator('#orb-status').textContent(), /Between both hands/);
  assert.equal(report.posts.length, 0);
  const tracked = await page.locator('#scene').screenshot({ path: new URL('tracked-orb.png', output).pathname });
  assert.ok(tracked.length > 1000);
  pass('synthetic camera hands place the orb and upload nothing');
  await page.evaluate(hands => window.__orb.worker.postMessage({ type: 'fixture', hands }), wide);
  await page.waitForTimeout(180);
  const grown = await page.locator('#scene').evaluate(canvas => canvas.toDataURL());
  await page.evaluate(() => window.__orb.worker.postMessage({ type: 'fixture', hands: [] }));
  await page.waitForFunction(() => document.querySelector('#orb-state').textContent === 'HOLDING');
  await page.waitForFunction(() => document.querySelector('#orb-state').textContent === 'SEARCHING', null, { timeout: 4000 });
  assert.match(await page.locator('#orb-status').textContent(), /both hands/i);
  pass('a wider pair changes the picture, then loss holds and clears');
  assert.notEqual(grown, before);
  await page.locator('#stop-camera').click();
  await page.evaluate(() => { window.__orb.deny = true; });
  await page.locator('#start-camera').click();
  await page.waitForFunction(() => /declined/i.test(document.querySelector('#status').textContent));
  assert.equal(await page.locator('#start-camera').isEnabled(), true);
  pass('declined camera permission is explained and the start control returns');
  await page.setViewportSize({ width: 844, height: 390 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: new URL('landscape.png', output).pathname, fullPage: true });
  pass('landscape phone width does not overflow');
  await page.setViewportSize({ width: 390, height: 844 });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  assert.deepEqual(axe.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), []);
  pass('orb phone screen has no automated WCAG A/AA violations');
  await page.locator('#install-app').click();
  await page.waitForFunction(() => !document.querySelector('#install-help').hidden && /Home Screen|Install app/i.test(document.querySelector('#install-help').textContent));
  pass('install help is available when the browser does not offer a prompt');
  assert.deepEqual(report.errors, []);
  assert.equal(report.posts.length, 0);
  report.ok = true;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.ok = false;
  report.failure = String(error.stack || error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  await browser.close();
}
