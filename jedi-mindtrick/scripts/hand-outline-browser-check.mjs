// Run with: node --import tsx scripts/hand-outline-browser-check.mjs [base URL]
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { handOutlineFixture } from '../tests/hand-outline-fixtures.ts';

const base = process.argv[2] || 'http://127.0.0.1:8798';
const fixtures = Object.fromEntries(['rectangle', 'triangle', 'rounded', 'heart'].map(name => [name, handOutlineFixture(name)]));
// Independent orientation transforms preserve each measured finger chain.
for (const [name, side] of [['rightLdown', 1], ['leftLdown', 0]]) {
  fixtures[name] = handOutlineFixture('rectangle');
  fixtures[name][side].landmarks.forEach(point => { point.y = .90 - point.y; });
}
fixtures.reorderedLdown = structuredClone(fixtures.rightLdown).reverse().map(hand => ({ ...hand, handedness: 'unknown' }));
fixtures.slopedLdown = structuredClone(fixtures.leftLdown);
for (const hand of fixtures.slopedLdown) for (const point of hand.landmarks) point.y += .08 * ((1 - point.x) - .5);
fixtures.none = [];
fixtures.weak = handOutlineFixture('heart'); fixtures.weak[0].score = .1;
fixtures.missing = handOutlineFixture('heart'); fixtures.missing[0].landmarks[9] = null;
fixtures.crossed = handOutlineFixture('heart');
[fixtures.crossed[0].landmarks[3], fixtures.crossed[0].landmarks[7]] = [fixtures.crossed[0].landmarks[7], fixtures.crossed[0].landmarks[3]];
fixtures.closed = handOutlineFixture('heart');
for (const hand of fixtures.closed) hand.landmarks[8] = { ...hand.landmarks[4] };
fixtures.moved = handOutlineFixture('triangle', { dx: .10, dy: -.06 });
for (const [name, side] of [['leftNear', 0], ['rightNear', 1]]) {
  fixtures[name] = handOutlineFixture('heart');
  // Change palm apparent size without changing the aperture's finger joints.
  const hand = fixtures[name][side], wrist = hand.landmarks[0];
  for (const index of [9, 17]) {
    const point = hand.landmarks[index];
    point.x = wrist.x + (point.x - wrist.x) * 1.7;
    point.y = wrist.y + (point.y - wrist.y) * 1.7;
  }
}
const worker = `const fixtures=${JSON.stringify(fixtures)};let name='none';self.onmessage=({data})=>{
  if(data.type==='fixture'){name=data.name;return;}
  if(data.type==='init'){self.postMessage({type:'ready'});return;}
  if(data.type!=='frame')return;data.bitmap.close();
  if(name==='stale')return;
  self.postMessage({type:'frame',id:data.id,timestamp:data.timestamp,hands:fixtures[name],inferenceMs:1,fixture:name});
};`;
const report = { base, observedAt: new Date().toISOString(), checks: [], pageErrors: [], submissions: 0,
  camera: 'Uniform generated canvas stream and deterministic hand landmarks; no physical camera',
  ai: 'Mocked returned image; no provider call' };
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const deadline = setTimeout(() => { void browser.close(); }, 120000);
const pass = name => report.checks.push(name);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(6000);
  await context.addInitScript(() => {
    window.__outlineProbe = { worker: null, counts: {} };
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args) {
        super(...args); window.__outlineProbe.worker = this;
        this.addEventListener('message', ({ data }) => {
          if (data.fixture) window.__outlineProbe.counts[data.fixture] = (window.__outlineProbe.counts[data.fixture] || 0) + 1;
        });
      }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
      const ctx = canvas.getContext('2d'); const paint = () => { ctx.fillStyle = '#78828c'; ctx.fillRect(0, 0, 960, 540); };
      paint(); const timer = setInterval(paint, 33), stream = canvas.captureStream(30), track = stream.getVideoTracks()[0];
      const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); }; return stream;
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') report.submissions++; });
  await page.route('**/vision-worker.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: worker }));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-mode="handframe"]').click();
  assert.equal(await page.locator('#follow-hands').isChecked(), true);
  assert.equal(await page.locator('#manual-shapes').getAttribute('open'), null);
  await page.locator('[data-style="cyanotype"]').click();
  await page.locator('#layout').selectOption('outline');
  await page.locator('#start-camera').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Camera on'));
  await page.waitForFunction(() => (window.__outlineProbe.counts.none || 0) > 3);
  const pixel = (x, y) => page.locator('#scene').evaluate((c, [x, y]) =>
    Array.from(c.getContext('2d').getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data), [x, y]);
  const raw = await pixel(.5, .5);
  const setFixture = async name => {
    const count = await page.evaluate(name => {
      const probe = window.__outlineProbe, before = probe.counts[name] || 0;
      probe.worker.postMessage({ type: 'fixture', name }); return before;
    }, name);
    await page.waitForFunction(({ name, count }) => (window.__outlineProbe.counts[name] || 0) >= count + 8, { name, count });
    await page.waitForTimeout(90);
  };
  const following = () => page.waitForFunction(() => document.querySelector('#hand-shape-state').textContent === 'Following your hand-shaped outline.');
  const frames = [];
  for (const name of ['rectangle', 'triangle', 'rounded', 'heart']) {
    await setFixture(name); await following();
    assert.notDeepEqual(await pixel(.5, .5), raw);
    frames.push(await page.locator('#scene').evaluate(c => c.toDataURL()));
  }
  assert.equal(new Set(frames).size, 4);
  assert.equal(await page.locator('#follow-hands').isChecked(), true);
  pass('four directly formed outlines render without choosing any saved shape');
  assert.deepEqual(await pixel(.5, .30), raw, 'heart notch must remain unfiltered');
  assert.notDeepEqual(await pixel(.35, .33), raw, 'heart lobe must retain the filter');
  await page.locator('.viewport').screenshot({ path: 'test-results/automatic-heart.png' });
  await setFixture('triangle');
  assert.deepEqual(await pixel(.25, .30), raw);
  assert.notDeepEqual(await pixel(.5, .5), raw);
  pass('triangle corners and the concave heart notch stay outside the filtered picture');
  await setFixture('moved');
  assert.notDeepEqual(await pixel(.60, .45), raw);
  assert.deepEqual(await pixel(.26, .61), raw);
  pass('moving the hands moves the rendered opening');
  for (const name of ['rightLdown', 'leftLdown', 'reorderedLdown', 'slopedLdown', 'rectangle', 'rightLdown']) {
    await setFixture(name); await following();
    assert.notDeepEqual(await pixel(.5, .45), raw, `${name} must fill the opening`);
    assert.deepEqual(await pixel(.1, .1), raw, `${name} must keep outside camera pixels`);
    assert.equal(await page.locator('[data-style="cyanotype"]').getAttribute('aria-pressed'), 'true');
  }
  pass('either inverted L, detector reorder, tilt and upright transitions render without changing worlds');
  await page.locator('.viewport').screenshot({ path: 'test-results/opposed-l-hands.png' });
  await page.setViewportSize({width:390,height:844});
  await page.locator('#full-screen').click(); await setFixture('leftLdown'); await following();
  assert.notDeepEqual(await pixel(.5,.45),raw);
  await page.locator('#camera-only').click(); await page.waitForTimeout(80);assert.deepEqual(await pixel(.5,.45),raw);
  await page.locator('#camera-only').click(); await page.waitForTimeout(80);assert.notDeepEqual(await pixel(.5,.45),raw);
  await page.screenshot({path:'test-results/opposed-l-phone.png'});
  await page.locator('#exit-screen').click(); await page.setViewportSize({width:1440,height:1050});
  pass('opposed L opening stays connected in phone fullscreen and camera-only returns cleanly');

  for (const name of ['none', 'weak', 'missing', 'crossed']) {
    await setFixture(name);
    assert.deepEqual(await pixel(.5, .5), raw, `${name} must hide the aperture`);
    await setFixture('heart'); await following();
    assert.notDeepEqual(await pixel(.5, .5), raw);
    await page.waitForFunction(() => document.querySelector('#depth-state').textContent === 'CENTERED');
  }
  pass('lost, weak, missing-palm and crossed tracking hide safely and recover fresh');
  await setFixture('closed'); await page.waitForTimeout(800); await setFixture('heart');
  assert.equal(await page.locator('[data-style="cyanotype"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#still-panel').isVisible(), false);
  assert.equal(report.submissions, 0);
  pass('holding and releasing a closed opening never switches worlds or prepares/uploads a still');
  await setFixture('leftNear');
  await page.waitForFunction(() => document.querySelector('#depth-state').textContent === 'LEFT SIDE CLOSER');
  const depthLeft = await page.locator('#scene').evaluate(c => c.toDataURL());
  await setFixture('rightNear');
  await page.waitForFunction(() => document.querySelector('#depth-state').textContent === 'RIGHT SIDE CLOSER');
  assert.notEqual(await page.locator('#scene').evaluate(c => c.toDataURL()), depthLeft);
  await setFixture('heart'); await page.locator('#center-depth').click(); await setFixture('heart');
  pass('automatic outlines retain both directions of the existing depth stretch');
  for (const layout of ['postcard', 'cinema', 'outline']) {
    await page.locator('#layout').selectOption(layout); await page.waitForTimeout(80);
    assert.deepEqual(await pixel(.5, .30), raw);
    assert.notDeepEqual(await pixel(.5, .5), raw);
  }
  pass('all layouts clip the effect and border to the actual concave opening');
  await page.locator('#capture-still').click();
  assert.equal(report.submissions, 0);
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d'); x.fillStyle = '#aa77ff'; x.fillRect(0, 0, 8, 8); return c.toDataURL().split(',')[1]; });
  await page.route('**/api/render', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(png, 'base64') }));
  await page.locator('#send-still').click();
  await page.waitForFunction(() => document.querySelector('#still-status').textContent.includes('AI still returned'));
  await page.waitForTimeout(100);
  assert.deepEqual(await pixel(.5, .5), [170, 119, 255, 255]);
  assert.deepEqual(await pixel(.5, .30), raw);
  await setFixture('triangle');
  assert.deepEqual(await pixel(.25, .30), raw);
  assert.deepEqual(await pixel(.5, .5), [170, 119, 255, 255]);
  assert.equal(report.submissions, 1);
  pass('one explicitly submitted mock still follows changing outlines without another upload');
  await page.locator('#clear-still').click();
  await page.locator('#manual-shapes summary').click();
  await page.locator('[data-shape="star"]').click();
  assert.equal(await page.locator('#follow-hands').isChecked(), false);
  await page.locator('#follow-hands').check(); await setFixture('heart'); await following();
  assert.deepEqual(await pixel(.5, .30), raw);
  await page.locator('[data-mode="invisible"]').click();
  await page.locator('[data-mode="handframe"]').click(); await setFixture('heart'); await following();
  await page.waitForFunction(() => document.querySelector('#depth-state').textContent === 'CENTERED');
  pass('saved-shape override and mode switches restore automatic geometry at neutral');
  await page.locator('#stop-camera').click();
  assert.equal(await page.locator('#follow-hands').isChecked(), true);
  await page.locator('#start-camera').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Camera on'));
  await setFixture('heart'); await following();
  await page.waitForFunction(() => document.querySelector('#depth-state').textContent === 'CENTERED');
  await page.locator('#stop-camera').click();
  assert.deepEqual(report.pageErrors, []);
  pass('camera restart restores following without stale depth or uncaught errors');
} catch (error) {
  report.failure = String(error); throw error;
} finally {
  clearTimeout(deadline);
  await writeFile('test-results/hand-outline-browser-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ passed: report.checks.length, checks: report.checks }, null, 2));
