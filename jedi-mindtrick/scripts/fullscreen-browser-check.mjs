import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:8798';
const output = fileURLToPath(new URL('../test-results/', import.meta.url));
await mkdir(output, { recursive: true });
const report = {
  base, observedAt: new Date().toISOString(), checks: [], errors: [], pageErrors: [], screenshots: [], network: [],
  limits: { wholeRunMs: 120000, actionMs: 5000, navigationMs: 15000 },
  evidence: {
    browser: 'Headless Chrome, channel chrome',
    camera: 'Generated canvas MediaStream only; no physical camera or microphone requested.',
    tracking: 'Local stub vision worker; this suite does not verify MediaPipe accuracy.',
    ai: 'No AI request. /api/render is blocked defensively.',
    delayedCases: 'Fullscreen getter/request/exit APIs are mocked only in explicitly labelled cases.',
  },
};
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: [
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
] });
let budgetExpired = false;
const budget = setTimeout(() => {
  budgetExpired = true;
  report.errors.push({ case: 'run budget', message: 'Fullscreen suite exceeded 120 seconds.' });
  void browser.close();
}, report.limits.wholeRunMs);

const worker = `self.onmessage=({data})=>{
  if(data.type==='init'){self.postMessage({type:'ready'});return;}
  if(data.type==='frame'){data.bitmap.close();self.postMessage({type:'frame',id:data.id,timestamp:data.timestamp,hands:[],inferenceMs:1});}
};`;

async function createPage(mode, caseName) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await context.addInitScript(({ mode }) => {
    const probe = window.__fullscreenProbe = { videos: [], streams: [], requests: 0, nativeRequests: [], exitCalls: 0, current: null };
    const create = document.createElement.bind(document);
    document.createElement = function (name, options) {
      const element = create(name, options);
      if (String(name).toLowerCase() === 'video') probe.videos.push(element);
      return element;
    };
    navigator.mediaDevices.getUserMedia = async () => {
      probe.requests++;
      const source = create('canvas'); source.width = 768; source.height = 432;
      const ctx = source.getContext('2d');
      const paint = () => {
        ctx.fillStyle = '#15344c'; ctx.fillRect(0, 0, 768, 432);
        ctx.fillStyle = '#c1eadb'; ctx.fillRect(200, 100, 260, 230);
        ctx.fillStyle = '#edaa50'; ctx.fillRect(300, 170, 80, 70);
      };
      paint();
      const stream = source.captureStream(20), timer = setInterval(paint, 50);
      const track = stream.getVideoTracks()[0], stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); stop(); };
      probe.streams.push(stream); probe.stream = stream;
      return stream;
    };
    if (mode === 'native') return;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => probe.current });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: async () => {
      probe.exitCalls++; probe.current = null; document.dispatchEvent(new Event('fullscreenchange'));
    } });
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value:
      mode === 'absent' ? undefined : mode === 'rejected' ? function () {
        return Promise.reject(new Error('Controlled fullscreen rejection.'));
      } : function () {
        return new Promise((resolve, reject) => probe.nativeRequests.push({ target: this, resolve, reject }));
      },
    });
    probe.resolve = index => {
      const request = probe.nativeRequests[index];
      if (!request || request.done) throw new Error('Unknown or already resolved fullscreen request.');
      request.done = true; probe.current = request.target;
      document.dispatchEvent(new Event('fullscreenchange')); request.resolve();
    };
  }, { mode });
  await context.route('**/vision-worker.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: worker }));
  await context.route('**/api/render', route => route.abort('blockedbyclient'));
  const page = await context.newPage();
  page.setDefaultTimeout(report.limits.actionMs);
  page.setDefaultNavigationTimeout(report.limits.navigationMs);
  page.on('pageerror', error => report.pageErrors.push({ case: caseName, message: error.message }));
  page.on('request', request => {
    if (/^https?:/.test(request.url())) report.network.push({ case: caseName, method: request.method(), url: request.url() });
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#full-screen').waitFor();
  await page.evaluate(() => {
    const probe = window.__fullscreenProbe;
    probe.scene = document.querySelector('#scene');
    // A preexisting inert region must stay inert after leaving fullscreen.
    document.querySelector('.notes').inert = true;
    probe.before = {
      overflow: getComputedStyle(document.body).overflow,
      inlineOverflow: document.body.style.overflow,
      inert: ['.topbar', '.intro', '.studio-bar', '.studio-footer', '.controls', '.notes', 'footer']
        .map(selector => ({ selector, value: document.querySelector(selector).inert })),
    };
  });
  return { context, page };
}

async function paint(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function enter(page, settle = true) {
  await page.locator('#full-screen').focus();
  await page.locator('#full-screen').click();
  await page.waitForFunction(() => document.querySelector('#camera-view').classList.contains('focus-view'));
  if (settle) await page.waitForFunction(() => document.fullscreenElement === document.querySelector('#camera-view') ||
    document.querySelector('#screen-notice').textContent.includes('Expanded camera view'));
  await paint(page);
}
async function restored(page) {
  await page.waitForFunction(() => !document.querySelector('#camera-view').classList.contains('focus-view'));
  const state = await page.evaluate(() => {
    const probe = window.__fullscreenProbe;
    return {
      current: {
        overflow: getComputedStyle(document.body).overflow, inlineOverflow: document.body.style.overflow,
        inert: probe.before.inert.map(({ selector }) => ({ selector, value: document.querySelector(selector).inert })),
      }, before: probe.before, focus: document.activeElement?.id,
      canvasSame: document.querySelector('#scene') === probe.scene,
      count: document.querySelectorAll('#scene').length,
      bodyClass: document.body.classList.contains('camera-focus'),
      fill: document.querySelector('#fill-screen').getAttribute('aria-pressed'),
      expanded: document.querySelector('#full-screen').getAttribute('aria-expanded'),
    };
  });
  assert.deepEqual(state.current, state.before, 'overflow and each original inert value must restore');
  assert.equal(state.focus, 'full-screen'); assert.ok(state.canvasSame); assert.equal(state.count, 1);
  assert.equal(state.bodyClass, false); assert.equal(state.fill, 'false'); assert.equal(state.expanded, 'false');
}
async function dimensions(page, fill) {
  const result = await page.evaluate(() => {
    const viewport = document.querySelector('#camera-view'), canvas = document.querySelector('#scene');
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return { viewport: rect(viewport), canvas: rect(canvas), width: innerWidth, height: innerHeight,
      top: getComputedStyle(document.querySelector('.viewport-top')).display,
      bottom: getComputedStyle(document.querySelector('.viewport-bottom')).display,
      background: getComputedStyle(viewport).backgroundColor, overflow: getComputedStyle(document.body).overflow,
      controlsInert: document.querySelector('.controls').inert };
  });
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1.5, `${a} must match ${b}`);
  close(result.viewport.x, 0); close(result.viewport.y, 0);
  close(result.viewport.width, result.width); close(result.viewport.height, result.height);
  assert.ok(Math.abs(result.canvas.width / result.canvas.height - 16 / 9) < 0.005);
  close(result.canvas.x + result.canvas.width / 2, result.width / 2);
  close(result.canvas.y + result.canvas.height / 2, result.height / 2);
  const expectedWidth = fill ? Math.max(result.width, result.height * 16 / 9) : Math.min(result.width, result.height * 16 / 9);
  close(result.canvas.width, expectedWidth);
  assert.equal(result.top, 'none'); assert.equal(result.bottom, 'none');
  assert.equal(result.background, 'rgb(0, 0, 0)'); assert.equal(result.overflow, 'hidden'); assert.ok(result.controlsInert);
  return result;
}
async function alignment(page, u, v) {
  await page.locator('#camera-only').click();
  await paint(page);
  await page.evaluate(() => {
    const canvas = document.querySelector('#scene');
    window.__fullscreenProbe.raw = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  });
  await page.locator('#camera-only').click();
  const bounds = await page.locator('#scene').boundingBox();
  const x = bounds.x + bounds.width * u, y = bounds.y + bounds.height * v;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down(); await page.mouse.move(x, y, { steps: 3 }); await page.mouse.up();
  await paint(page);
  const measured = await page.evaluate(() => {
    const canvas = document.querySelector('#scene'), before = window.__fullscreenProbe.raw;
    const after = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, right = -1, top = canvas.height, bottom = -1, count = 0;
    for (let at = 0; at < after.length; at += 4) {
      if (Math.abs(after[at] - before[at]) + Math.abs(after[at + 1] - before[at + 1]) + Math.abs(after[at + 2] - before[at + 2]) > 12) {
        const x = (at / 4) % canvas.width, y = Math.floor(at / 4 / canvas.width);
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
      }
    }
    delete window.__fullscreenProbe.raw;
    return { u: (left + right + 1) / (2 * canvas.width), v: (top + bottom + 1) / (2 * canvas.height), count };
  });
  assert.ok(measured.count > 500, 'the dragged effect must actually change canvas pixels');
  assert.ok(Math.abs(measured.u - u) < 0.01 && Math.abs(measured.v - v) < 0.01,
    `frame center ${JSON.stringify(measured)} must follow pointer ${u},${v}`);
  return measured;
}

async function runCase(name, mode, operation) {
  if (budgetExpired) return;
  let context, page;
  const started = performance.now();
  const item = { name, mode: mode === 'native' ? 'Native API with generated camera available' : `Mock fullscreen API: ${mode}`, status: 'running' };
  report.checks.push(item);
  try {
    ({ context, page } = await createPage(mode, name));
    const shot = async filename => {
      const destination = path.join(output, filename);
      await page.screenshot({ path: destination });
      report.screenshots.push({ case: name, path: destination });
    };
    await operation(page, shot, item);
    assert.deepEqual(report.pageErrors.filter(error => error.case === name), []);
    assert.equal(report.network.some(request => request.case === name && request.method === 'POST'), false, 'fullscreen interactions must never submit images');
    item.status = 'passed';
  } catch (error) {
    item.status = 'failed'; item.error = error.message;
    report.errors.push({ case: name, message: error.message, stack: error.stack });
    if (page && !page.isClosed()) {
      const destination = path.join(output, `fullscreen-failure-${report.checks.length}.png`);
      try { await page.screenshot({ path: destination, timeout: 2000 }); report.screenshots.push({ case: name, path: destination }); } catch { /* Preserve the original failure. */ }
    }
  } finally {
    item.durationMs = Math.round(performance.now() - started);
    await context?.close().catch(() => {});
  }
}

try {
  await runCase('native fullscreen entry, clean viewport, Escape and focus restoration', 'native', async (page, shot, item) => {
    await enter(page);
    item.nativeAccepted = await page.evaluate(() => document.fullscreenElement === document.querySelector('#camera-view'));
    item.observation = item.nativeAccepted ? 'Chrome entered native fullscreen.' : 'Chrome rejected native fullscreen; expanded fallback verified. Native success is not claimed.';
    await dimensions(page, false);
    await shot('fullscreen-native-or-fallback.png');
    await page.keyboard.press('Escape'); await restored(page);
  });

  await runCase('landscape and portrait fit/fill dimensions and real canvas drag alignment', 'absent', async (page, shot, item) => {
    await page.locator('[data-mode="handframe"]').click();
    await page.locator('[data-style="thermal"]').click();
    await page.locator('#frame-size').evaluate(input => { input.value = '22'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await enter(page); item.positions = [];
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport); await paint(page);
      for (const fill of [false, true]) {
        if (await page.locator('#fill-screen').getAttribute('aria-pressed') !== String(fill)) await page.locator('#fill-screen').click();
        await paint(page); const bounds = await dimensions(page, fill);
        const measured = await alignment(page, 0.55, 0.60);
        item.positions.push({ viewport, fill, bounds, measured });
        await shot(`fullscreen-${viewport.width}-${fill ? 'fill' : 'fit'}.png`);
      }
    }
    await page.keyboard.press('Escape'); await restored(page);
  });

  await runCase('controls fade, return on keyboard focus, and trap Tab/Shift-Tab', 'rejected', async (page, shot) => {
    await enter(page);
    await page.locator('#scene').focus(); await page.mouse.move(1, 799);
    await page.waitForFunction(() => document.querySelector('#camera-view').classList.contains('screen-quiet') &&
      Number(getComputedStyle(document.querySelector('.screen-actions')).opacity) < 0.05, null, { timeout: 5000 });
    await shot('fullscreen-controls-faded.png');
    const expected = ['camera-only', 'fill-screen', 'exit-screen', 'scene'];
    for (const id of expected) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.id), id); }
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement?.id), 'exit-screen');
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.screen-actions')).opacity) > 0.95);
    await shot('fullscreen-controls-keyboard.png');
    await page.keyboard.press('Enter'); await restored(page);
  });

  for (const mode of ['absent', 'rejected']) await runCase(`${mode} native API keeps a usable fallback and exits with Escape`, mode, async page => {
    await enter(page);
    assert.match(await page.locator('#screen-notice').textContent(), /Expanded camera view/);
    assert.equal(await page.evaluate(() => document.fullscreenElement), null);
    await page.locator('#fill-screen').click(); await dimensions(page, true);
    await page.keyboard.press('Escape'); await restored(page);
  });

  await runCase('same generated stream/canvas across entry, fill, effects toggle, disconnect and stop', 'absent', async (page, shot, item) => {
    const start = async () => {
      await page.locator('#start-camera').click();
      await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Camera on'), null, { timeout: 10000 });
      await page.evaluate(() => { window.__fullscreenProbe.initialStream = window.__fullscreenProbe.stream; });
    };
    await start(); await enter(page);
    await page.locator('#fill-screen').click(); await page.locator('#camera-only').click();
    const identity = await page.evaluate(() => {
      const probe = window.__fullscreenProbe;
      return { canvas: document.querySelector('#scene') === probe.scene, count: document.querySelectorAll('#scene').length,
        requests: probe.requests, sameStream: probe.stream === probe.initialStream,
        attached: probe.videos.some(video => video.srcObject === probe.initialStream),
        live: probe.stream.getVideoTracks().every(track => track.readyState === 'live') };
    });
    assert.deepEqual(identity, { canvas: true, count: 1, requests: 1, sameStream: true, attached: true, live: true });
    item.identity = identity;
    await page.waitForFunction(() => document.querySelector('#screen-camera-state').hidden);
    await shot('fullscreen-generated-camera.png');
    await page.evaluate(() => window.__fullscreenProbe.stream.getVideoTracks()[0].dispatchEvent(new Event('ended')));
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Camera disconnected'));
    await restored(page);
    assert.equal(await page.evaluate(() => window.__fullscreenProbe.stream.getVideoTracks()[0].readyState), 'ended');
    await start(); await enter(page);
    // Stop lives outside the fullscreen overlay; invoke its normal handler to exercise lifecycle cleanup.
    await page.locator('#stop-camera').evaluate(button => button.click()); await restored(page);
    assert.equal(await page.evaluate(() => window.__fullscreenProbe.stream.getVideoTracks()[0].readyState), 'ended');
    item.lifecycle = 'Synthetic ended event and programmatic normal Stop-camera handler both exited fullscreen and released the generated track.';
  });

  await runCase('late native entry after exit is cleaned up', 'delayed', async page => {
    await enter(page, false); await page.keyboard.press('Escape'); await restored(page);
    await page.evaluate(() => window.__fullscreenProbe.resolve(0));
    await page.waitForFunction(() => window.__fullscreenProbe.exitCalls === 1 && document.fullscreenElement === null);
    await restored(page);
  });

  for (const secondResolvesFirst of [false, true]) await runCase(`late entry A preserves newer entry B (${secondResolvesFirst ? 'B resolved' : 'B pending'})`, 'delayed', async page => {
    await enter(page, false); await page.keyboard.press('Escape'); await restored(page);
    await enter(page, false);
    if (secondResolvesFirst) await page.evaluate(() => window.__fullscreenProbe.resolve(1));
    await page.evaluate(() => window.__fullscreenProbe.resolve(0)); await paint(page);
    assert.equal(await page.evaluate(() => window.__fullscreenProbe.exitCalls), 0, 'late A must not exit active B');
    assert.equal(await page.evaluate(() => document.fullscreenElement === document.querySelector('#camera-view')), true);
    assert.equal(await page.locator('#full-screen').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => document.querySelector('#camera-view').classList.contains('focus-view')), true);
    if (!secondResolvesFirst) await page.evaluate(() => window.__fullscreenProbe.resolve(1));
    await page.keyboard.press('Escape'); await restored(page);
    assert.equal(await page.evaluate(() => window.__fullscreenProbe.exitCalls), 1);
  });
} finally {
  clearTimeout(budget);
  await browser.close().catch(() => {});
  report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.checks.filter(check => check.status === 'passed').length,
    failed: report.checks.filter(check => check.status === 'failed').length, budgetExpired };
  await writeFile(path.join(output, 'fullscreen-report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ ...report.summary, report: path.join(output, 'fullscreen-report.json'), checks: report.checks }, null, 2));
if (report.errors.length) process.exitCode = 1;
