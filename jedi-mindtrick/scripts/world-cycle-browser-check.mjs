// Run with: node --import tsx scripts/world-cycle-browser-check.mjs [base URL]
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { worldCyclePair, worldCycleOutline } from '../tests/world-cycle-fixtures.ts';

const base = process.argv[2] || 'http://127.0.0.1:8798';
const output = fileURLToPath(new URL('../test-results/', import.meta.url));
const fixtures = {
  none: [], open: worldCyclePair(3.2), closed: worldCyclePair(1.1),
  triangle: worldCycleOutline('triangle'), heart: worldCycleOutline('heart'), contact: worldCycleOutline('rounded'),
  reversed: worldCyclePair(3.2).reverse(),
};
fixtures.weak = worldCyclePair(3.2); fixtures.weak[0].score = .1;
fixtures.missing = worldCyclePair(3.2); fixtures.missing[0].landmarks[9] = null;
const worker = `const fixtures=${JSON.stringify(fixtures)};let name='none',revision=0;self.onmessage=({data})=>{
  if(data.type==='fixture'){name=data.name;revision=data.revision;return;}
  if(data.type==='init'){self.postMessage({type:'ready'});return;}
  if(data.type!=='frame')return;data.bitmap.close();
  self.postMessage({type:'frame',id:data.id,timestamp:data.timestamp,hands:fixtures[name],inferenceMs:1,fixture:name,revision});
};`;
const report = {
  base, observedAt: new Date().toISOString(), checks: [], pageErrors: [], posts: [], screenshots: [], measurements: {},
  limits: { wholeRunMs: 120000, actionMs: 8000, navigationMs: 15000 },
  evidence: {
    camera: 'Generated canvas MediaStream and original synthetic landmark fixtures only; no physical camera or reference media.',
    tracking: 'Stub worker exercises the real app/controller/render path. Detector accuracy and physical-hand latency are not established.',
    fullscreen: 'Native and prefixed fullscreen requests disabled to exercise expanded-tab Fit behavior.',
    ai: 'No still preparation or submission. Render endpoint blocked defensively.',
  },
};
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
let page, expired = false;
const deadline = setTimeout(() => { expired = true; void browser.close(); }, report.limits.wholeRunMs);
const pass = name => report.checks.push(name);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(report.limits.actionMs);
  context.setDefaultNavigationTimeout(report.limits.navigationMs);
  await context.addInitScript(() => {
    const probe = window.__cycleProbe = { worker: null, revision: 0, observations: {}, streams: [], requests: 0, changes: [] };
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args) {
        super(...args); probe.worker = this;
        this.addEventListener('message', ({ data }) => {
          if (data.type !== 'frame') return;
          const entry = probe.observations[data.revision] ??= { count: 0, first: data.timestamp, last: data.timestamp };
          entry.count++; entry.last = data.timestamp;
        });
      }
    };
    for (const name of ['requestFullscreen', 'webkitRequestFullscreen']) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: undefined });
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: undefined });
    }
    navigator.mediaDevices.getUserMedia = async () => {
      probe.requests++;
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
      const ctx = canvas.getContext('2d');
      const paint = () => {
        ctx.fillStyle = '#78828c'; ctx.fillRect(0, 0, 960, 540);
        ctx.fillStyle = '#d62941'; ctx.fillRect(0, 0, 48, 540);
        ctx.fillStyle = '#2cb772'; ctx.fillRect(912, 0, 48, 540);
        ctx.fillStyle = '#194ba8'; ctx.fillRect(48, 0, 864, 20);
        ctx.fillStyle = '#ecc541'; ctx.fillRect(48, 520, 864, 20);
      };
      paint(); const timer = setInterval(paint, 33), stream = canvas.captureStream(30);
      const track = stream.getVideoTracks()[0], stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); stop(); };
      probe.streams.push(stream); probe.stream = stream;
      return stream;
    };
  });
  await context.route('**/vision-worker.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: worker }));
  await context.route('**/api/config', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"aiEnabled":false}' }));
  await context.route('**/api/render', route => route.abort('blockedbyclient'));
  page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') report.posts.push(request.url()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#scene').waitFor();
  await page.evaluate(() => {
    const probe = window.__cycleProbe;
    probe.scene = document.querySelector('#scene'); probe.actions = document.querySelector('.camera-actions'); probe.status = document.querySelector('#status');
    probe.activeStyle = document.querySelector('[data-style][aria-pressed="true"]').dataset.style;
    new MutationObserver(() => {
      const style = document.querySelector('[data-style][aria-pressed="true"]')?.dataset.style;
      if (style && style !== probe.activeStyle) { probe.changes.push(style); probe.activeStyle = style; }
    }).observe(document.querySelector('.styles'), { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  });
  const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const sceneBounds = () => page.locator('#scene').boundingBox();
  const pixel = (x = .5, y = .45) => page.locator('#scene').evaluate((canvas, [x, y]) =>
    Array.from(canvas.getContext('2d').getImageData(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1).data), [x, y]);
  const style = () => page.locator('[data-style][aria-pressed="true"]').getAttribute('data-style');
  const changeCount = () => page.evaluate(() => window.__cycleProbe.changes.length);
  async function setFixture(name, span = 300) {
    assert.ok(name in fixtures, `known fixture ${name}`);
    const revision = await page.evaluate(name => {
      const probe = window.__cycleProbe, revision = ++probe.revision;
      probe.worker.postMessage({ type: 'fixture', name, revision }); return revision;
    }, name);
    await page.waitForFunction(({ revision, span }) => {
      const entry = window.__cycleProbe.observations[revision];
      return entry && entry.count >= 3 && entry.last - entry.first >= span;
    }, { revision, span });
    await paint();
  }
  async function expectStyle(id) {
    await page.waitForFunction(id => document.querySelector('[data-style][aria-pressed="true"]')?.dataset.style === id, id);
    const name = (await page.locator(`[data-style="${id}"]`).innerText()).trim();
    assert.ok((await page.locator('#effect-caption').textContent()).includes(name), 'the displayed world name follows its selected button');
  }
  async function start() {
    await page.locator('#start-camera').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Camera on'));
    await setFixture('none');
  }
  async function fresh() {
    await page.locator('#reset').click(); await setFixture('none');
    await expectStyle('dream');
  }
  async function closedAfterOpening() { await setFixture('open'); await setFixture('closed'); }
  async function noCapture() {
    assert.equal(await page.locator('#still-panel').isVisible(), false);
    assert.deepEqual(report.posts, []);
  }
  async function screenshot(name) {
    const file = path.join(output, name); await page.screenshot({ path: file }); report.screenshots.push(file);
  }

  const invisibleWidth = (await sceneBounds()).width;
  await page.locator('[data-mode="handframe"]').click(); await paint();
  const wide = await sceneBounds();
  assert.ok(wide.width > invisibleWidth * 1.25, 'desktop HandFrame preview must materially widen at the same viewport size');
  report.measurements.desktop = { viewport: '1440x1050', invisibleWidth, handframe: wide };
  async function layoutCheck() {
    const layout = await page.evaluate(() => {
      const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
      return { scene: rect(document.querySelector('#scene')), controls: rect(document.querySelector('.controls')),
        camera: rect(document.querySelector('.camera-actions')), status: rect(document.querySelector('#status')),
        actionsDock: document.querySelector('.camera-actions').parentElement.id, statusDock: document.querySelector('#status').parentElement.id,
        pageWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth, pageHeight: innerHeight };
    });
    assert.ok(Math.abs(layout.scene.width / layout.scene.height - 16 / 9) < .005);
    assert.ok(layout.controls.y >= layout.scene.bottom, 'effect controls belong below the preview');
    assert.equal(layout.actionsDock, 'studio-actions'); assert.equal(layout.statusDock, 'studio-status');
    assert.ok(layout.camera.y < layout.scene.y && layout.camera.bottom <= layout.pageHeight, 'camera actions are available above the preview');
    assert.ok(layout.scrollWidth <= layout.pageWidth + 1, 'the wide layout must not overflow horizontally');
    return layout;
  }
  await layoutCheck();
  assert.equal(await page.locator('#follow-hands').isChecked(), true);
  await start();
  const raw = await pixel();
  const edges = { left: await pixel(.01, .5), right: await pixel(.99, .5), top: await pixel(.5, .01), bottom: await pixel(.5, .99) };
  const expectedEdges = { left: [44, 183, 114, 255], right: [214, 41, 65, 255], top: [25, 75, 168, 255], bottom: [236, 197, 65, 255] };
  for (const key of Object.keys(edges)) assert.ok(edges[key].every((value, index) => Math.abs(value - expectedEdges[key][index]) <= 4), `complete mirrored source ${key} edge remains visible`);
  report.measurements.cameraEdges = edges;
  pass('wider desktop preview keeps full mirrored source edges and moves existing camera actions/status above the scene');

  await setFixture('closed'); await setFixture('open', 900); await expectStyle('dream');
  assert.equal(await changeCount(), 0, 'the first opening does not advance the selected design');
  const dreamPixel = await pixel(); assert.notDeepEqual(dreamPixel, raw, 'first opening visibly renders the current design');
  await noCapture();
  pass('first close/open shows the selected world without advancing, and holding open does not repeat');

  const cyclePixels = [dreamPixel];
  for (const [index, expected] of ['thermal', 'ink'].entries()) {
    await setFixture('closed', 850); assert.equal(await changeCount(), index, 'holding closed cannot advance');
    await setFixture('open', 850); await expectStyle(expected);
    assert.equal(await changeCount(), index + 1, 'one closed-to-open cycle advances exactly once');
    cyclePixels.push(await pixel()); await noCapture();
  }
  assert.equal(new Set(cyclePixels.map(value => JSON.stringify(value))).size, 3, 'two advances must change actual rendered pixels');
  report.measurements.cyclePixels = cyclePixels;
  pass('two complete cycles each advance one world in button, visible name and real canvas pixels without still preparation');

  const beforeOrdinary = await changeCount();
  for (const name of ['triangle', 'heart', 'contact', 'reversed', 'open']) await setFixture(name, 450);
  await expectStyle('ink'); assert.equal(await changeCount(), beforeOrdinary); await noCapture();
  pass('ordinary triangle, concave heart, joined fingertip contact and detector reordering do not change worlds');

  for (const invalid of ['none', 'weak', 'missing']) {
    await fresh(); await closedAfterOpening(); await setFixture(invalid); await setFixture('open', 450);
    await expectStyle('dream'); await noCapture();
  }
  pass('lost, weak and missing-landmark tracking cancel a closed pending cycle before reacquisition');

  await fresh(); await closedAfterOpening();
  await page.locator('[data-style="ocean"]').click();
  const explicitCount = await changeCount();
  await setFixture('open', 500); await expectStyle('ocean'); assert.equal(await changeCount(), explicitCount);
  await noCapture();
  pass('explicit world-button selection cancels the pending gesture instead of immediately advancing again');

  for (const control of ['manual', 'follow', 'mode', 'reset']) {
    await fresh(); await closedAfterOpening();
    if (control === 'manual') { await page.locator('#manual').check(); await page.locator('#manual').uncheck(); }
    if (control === 'follow') { await page.locator('#follow-hands').uncheck(); await page.locator('#follow-hands').check(); }
    if (control === 'mode') { await page.locator('[data-mode="invisible"]').click(); await page.locator('[data-mode="handframe"]').click(); }
    if (control === 'reset') await page.locator('#reset').click();
    const count = await changeCount(); await setFixture('open', 450);
    await expectStyle('dream'); assert.equal(await changeCount(), count, `${control} must cancel rather than complete the pending cycle`); await noCapture();
  }
  pass('manual, Follow my hands, effect-mode and Reset transitions cancel pending world cycles');

  await fresh(); await closedAfterOpening();
  await page.locator('#full-screen').click();
  await page.waitForFunction(() => document.querySelector('#camera-view').classList.contains('focus-view'));
  assert.equal(await page.locator('#fill-screen').getAttribute('aria-pressed'), 'false');
  const fit = await sceneBounds();
  assert.ok(fit.x >= -1 && fit.y >= -1 && fit.x + fit.width <= 1441 && fit.y + fit.height <= 1051, 'default fullscreen Fit contains the complete camera');
  await page.locator('#camera-only').click(); await setFixture('open'); await setFixture('closed'); await setFixture('open');
  await expectStyle('dream');
  await page.locator('#camera-only').click(); await setFixture('open', 450); await expectStyle('dream');
  await page.locator('#exit-screen').click();
  await page.waitForFunction(() => !document.querySelector('#camera-view').classList.contains('focus-view'));
  await page.waitForFunction(() => document.activeElement?.id === 'full-screen');
  await noCapture();
  pass('camera-only viewing suppresses and resets world cycles; fullscreen defaults to whole-camera Fit and exits cleanly');

  await fresh(); await closedAfterOpening();
  const requestsBeforeRestart = await page.evaluate(() => window.__cycleProbe.requests);
  await page.locator('#stop-camera').click();
  assert.equal(await page.evaluate(() => window.__cycleProbe.stream.getVideoTracks()[0].readyState), 'ended');
  await start(); await setFixture('open', 450); await expectStyle('dream');
  assert.equal(await page.evaluate(() => window.__cycleProbe.requests), requestsBeforeRestart + 1);
  await noCapture();
  pass('camera stop releases its generated track and restart begins with a first opening rather than a stale advance');

  await fresh(); await setFixture('none');
  await page.locator('#manual').check();
  await page.locator('[data-style="thermal"]').click();
  await page.locator('#frame-size').evaluate(input => { input.value = '22'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#scene').scrollIntoViewIfNeeded(); await paint();
  const bounds = await sceneBounds(), u = .62, v = .55;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * u, bounds.y + bounds.height * v, { steps: 4 }); await page.mouse.up(); await paint();
  const dragged = await page.locator('#scene').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, right = -1, top = canvas.height, bottom = -1, count = 0;
    // Ignore the procedural camera's outer edge markers; the interior is uniform.
    for (let y = Math.ceil(canvas.height * .08); y < canvas.height * .92; y++) for (let x = Math.ceil(canvas.width * .08); x < canvas.width * .92; x++) {
      const at = (y * canvas.width + x) * 4;
      if (Math.abs(data[at] - 120) + Math.abs(data[at + 1] - 130) + Math.abs(data[at + 2] - 140) > 30) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
      }
    }
    return { u: (left + right + 1) / (2 * canvas.width), v: (top + bottom + 1) / (2 * canvas.height), count };
  });
  assert.ok(dragged.count > 500 && Math.abs(dragged.u - u) < .015 && Math.abs(dragged.v - v) < .015, `wide canvas pointer alignment: ${JSON.stringify(dragged)}`);
  report.measurements.drag = dragged;
  pass('manual pointer movement remains aligned with the widened 16:9 canvas');

  await page.locator('#manual').uncheck(); await setFixture('open');
  await page.evaluate(() => window.scrollTo(0, 0)); await paint();
  await screenshot('world-cycle-wide-desktop.png');
  report.measurements.responsive = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 760, height: 1000 }, { width: 1440, height: 1050 }]) {
    await page.setViewportSize(viewport); await page.evaluate(() => window.scrollTo(0, 0)); await paint();
    report.measurements.responsive.push({ viewport, layout: await layoutCheck() });
    if (viewport.width === 390) await screenshot('world-cycle-wide-mobile.png');
  }
  const identity = await page.evaluate(() => {
    const probe = window.__cycleProbe;
    return { canvas: document.querySelector('#scene') === probe.scene, actions: document.querySelector('.camera-actions') === probe.actions,
      status: document.querySelector('#status') === probe.status, count: document.querySelectorAll('#scene').length,
      stream: probe.stream.getVideoTracks()[0].readyState, requests: probe.requests };
  });
  assert.ok(identity.canvas && identity.actions && identity.status && identity.count === 1 && identity.stream === 'live');
  report.measurements.identity = identity;
  pass('390px, 760px and 1440px layouts keep controls below, camera actions above and the same live canvas without horizontal overflow');

  await page.locator('[data-mode="invisible"]').click(); await paint();
  assert.equal(await page.locator('.camera-actions').evaluate(element => element.parentElement.id), 'camera-dock');
  assert.equal(await page.locator('#status').evaluate(element => element.parentElement.id), 'status-dock');
  assert.ok(Math.abs((await sceneBounds()).width - invisibleWidth) < 2);
  await page.locator('#stop-camera').click(); await noCapture();
  assert.deepEqual(report.pageErrors, []);
  pass('switching to Invisible restores original preview width and camera/status docks without cloning controls');
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  if (page && !page.isClosed()) {
    try { const file = path.join(output, 'world-cycle-failure.png'); await page.screenshot({ path: file, timeout: 2000 }); report.screenshots.push(file); } catch { /* Keep the original error. */ }
  }
  process.exitCode = 1;
} finally {
  clearTimeout(deadline); await browser.close().catch(() => {});
  report.finishedAt = new Date().toISOString(); report.budgetExpired = expired;
  if (expired) { report.failure ??= 'The 120-second run budget expired.'; process.exitCode = 1; }
  await writeFile(path.join(output, 'world-cycle-browser-report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ passed: report.checks.length, failure: report.failure, report: path.join(output, 'world-cycle-browser-report.json'), checks: report.checks }, null, 2));
