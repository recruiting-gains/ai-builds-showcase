import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium, expect, type Page } from '@playwright/test';

const baseURL = process.env.AIRFRAME_BASE_URL ?? 'http://127.0.0.1:8791';
const outputDirectory = process.env.AIRFRAME_QA_DIR ?? await mkdtemp(join(tmpdir(), 'airframe-browser-'));
const browser = await chromium.launch({ headless: true });
const checks: string[] = [];
const browserErrors: string[] = [];
const unexpectedRequests: string[] = [];
let cameraRequests = 0;

async function preparePage(width: number, reducedMotion = false): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 1050 },
    hasTouch: width < 600,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== new URL(baseURL).origin) {
      unexpectedRequests.push(request.url());
    }
  });
  await context.exposeBinding('reportAirframeTestCameraRequest', () => { cameraRequests += 1; });
  // Test-runner instrumentation only: every camera request is denied. This
  // runner never opens a physical camera and the shipped app has no test hook.
  // A raw script avoids the TS runner's function-name helper leaking into the
  // isolated browser realm when Playwright serializes nested functions.
  await page.addInitScript(`
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
      configurable: true,
      value: async function () {
        await window.reportAirframeTestCameraRequest();
        throw new DOMException('Camera denied by the automated privacy test.', 'NotAllowedError');
      }
    });
  `);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  return page;
}

async function noHorizontalOverflow(page: Page, label: string): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert(dimensions.document <= dimensions.viewport + 1,
    `${label}: horizontal overflow (${dimensions.document} > ${dimensions.viewport})`);
  checks.push(`${label}: no horizontal document overflow`);
}

async function noSevereAccessibilityViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter((violation) =>
    violation.impact === 'critical' || violation.impact === 'serious');
  assert.deepEqual(severe.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target),
  })), [], `${label}: serious or critical accessibility violations`);
  checks.push(`${label}: no serious or critical axe violations`);
}

async function positions(page: Page): Promise<Record<string, { left: number; top: number }>> {
  return page.locator('.floating-card').evaluateAll((nodes) => Object.fromEntries(nodes.map((node) => {
    const card = node as HTMLElement;
    return [card.dataset.cardId!, { left: parseFloat(card.style.left), top: parseFloat(card.style.top) }];
  })));
}

async function workspaceInteractions(page: Page): Promise<void> {
  await expect(page.locator('.floating-card')).toHaveCount(3);
  const original = await positions(page);
  const handle = page.locator('.card-handle').first();
  await handle.focus();
  await handle.press('Enter');
  await expect(page.locator('.floating-card.selected')).toHaveCount(1);
  await handle.press('ArrowRight');
  await handle.press('Shift+ArrowDown');
  assert.notDeepEqual(await positions(page), original, 'Arrow keys must move the focused card');
  checks.push('Keyboard: Enter selects, arrow keys and Shift+arrow move a card');
  await page.getByRole('button', { name: 'Reset workspace', exact: true }).click();
  assert.deepEqual(await positions(page), original, 'Reset must restore the selected preset');

  const box = await handle.boundingBox();
  assert(box, 'The card handle must have a visible hit area');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 65, { steps: 8 });
  assert.notDeepEqual(await positions(page), original, 'A mouse drag must move the card');
  await expect(page.locator('#workspace')).toHaveClass(/is-dragging/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#workspace')).not.toHaveClass(/is-dragging/);
  await expect(page.locator('.floating-card.grabbing')).toHaveCount(0);
  const released = await positions(page);
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 90);
  assert.deepEqual(await positions(page), released, 'Escape must release the card even while the mouse remains down');
  await page.mouse.up();
  checks.push('Mouse: drag changes position; Escape releases immediately without a stuck grab');

  const preset = page.getByLabel('Workspace preset', { exact: true });
  const options = await preset.locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
  assert(options.length >= 2, 'At least two usable presets are expected');
  await preset.selectOption(options[1]);
  assert.notDeepEqual(Object.keys(await positions(page)), Object.keys(original), 'Changing presets must change the workspace cards');
  const alternateInitial = await positions(page);
  await page.locator('.card-handle').first().press('ArrowRight');
  const savedPositions = await positions(page);
  assert.notDeepEqual(savedPositions, alternateInitial);
  const response = page.waitForResponse((item) => item.url().endsWith('/api/layout/validate') && item.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  assert.equal((await response).status(), 200, 'The saved layout must pass server validation');
  await expect(page.locator('#toast')).toContainText('Layout saved');
  const raw = await page.evaluate(() => localStorage.getItem('airframe.layout.v1'));
  assert(raw, 'A validated layout must be stored in this browser');
  const saved = JSON.parse(raw) as { version: number; presetId: string; cards: { id: string; x: number; y: number }[] };
  assert.deepEqual(Object.keys(saved).sort(), ['cards', 'presetId', 'version']);
  assert.equal(saved.version, 1);
  assert.equal(saved.presetId, options[1]);
  assert.equal(saved.cards.length, 3);
  assert.equal(new Set(saved.cards.map((card) => card.id)).size, 3);
  for (const card of saved.cards) {
    assert.deepEqual(Object.keys(card).sort(), ['id', 'x', 'y']);
    assert(Number.isFinite(card.x) && card.x >= 0 && card.x <= 1);
    assert(Number.isFinite(card.y) && card.y >= 0 && card.y <= 1);
  }
  await page.reload({ waitUntil: 'networkidle' });
  await expect(preset).toHaveValue(options[1]);
  assert.deepEqual(await positions(page), savedPositions, 'A new visit must restore the saved card positions');
  checks.push('Presets and saved layout: strict coordinate-only data validated and restored on reload');

  await page.evaluate((bad) => localStorage.setItem('airframe.layout.v1', JSON.stringify(bad)), {
    ...saved, cards: saved.cards.map(() => ({ id: saved.cards[0].id, x: -20, y: 300 })),
  });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(preset).toHaveValue(options[0]);
  assert.deepEqual(await positions(page), original, 'A damaged persisted layout must not replace the default valid layout');
  checks.push('Damaged saved layout: duplicate IDs and out-of-range positions rejected safely');

  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await noSevereAccessibilityViolations(page, 'Guide dialog');
  await page.getByRole('button', { name: 'Close guide', exact: true }).click();
  await expect(page.getByRole('button', { name: 'How it works', exact: true })).toBeFocused();
  checks.push('Guide: accessible dialog opens, closes, and restores focus');
}

async function cancelCameraSetup(action: 'Stop' | 'Escape'): Promise<void> {
  const page = await preparePage(1440);
  let releaseModel!: () => void;
  const modelGate = new Promise<void>((resolve) => { releaseModel = resolve; });
  // Delaying a real same-origin model download makes the startup cancellation
  // test deterministic. This is not fake hand tracking and never opens a camera.
  await page.context().route('**/models/hand_landmarker.task', async (route) => {
    await modelGate;
    await route.continue().catch(() => { /* The cancelled worker may already be gone. */ });
  });
  const before = cameraRequests;
  try {
    await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
    await expect(page.locator('#tracking-state')).toHaveText('Loading model');
    await expect(page.locator('#stop-camera')).toBeVisible();
    await expect(page.locator('#stop-camera')).toBeEnabled();
    await expect(page.locator('#enable-camera')).toBeDisabled();
    await expect(page.locator('#camera-badge')).not.toContainText('CAMERA ON');
    assert.equal(cameraRequests, before, 'Permission must not be requested before the local model is ready');
    if (action === 'Stop') await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
    else await page.keyboard.press('Escape');
    await expect(page.locator('#tracking-state')).toHaveText('Not started');
    await expect(page.locator('#stop-camera')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Enable camera', exact: true })).toBeEnabled();
    await expect(page.locator('#camera-badge')).toHaveText('CAMERA OFF');
    releaseModel();
    await page.waitForTimeout(150);
    assert.equal(cameraRequests, before, 'Cancelled setup must not later request camera access');
    checks.push(`Camera startup ${action}: busy state truthful, cancellation immediate, no late permission request`);
  } finally {
    releaseModel();
    await page.context().close();
  }
}

async function touchMove(page: Page): Promise<void> {
  const handle = page.locator('.card-handle').first();
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  assert(box, 'Mobile card handle must be visible');
  const before = await positions(page);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 5; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: x + step * 6, y: y + step * 9 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.notDeepEqual(await positions(page), before, 'Touch dragging must move a card, not just scroll the page');
  await expect(page.locator('#workspace')).not.toHaveClass(/is-dragging/);
  await expect(page.locator('.floating-card.grabbing')).toHaveCount(0);
  await cdp.detach();
  checks.push('Mobile touch: actual browser touch events move and release a panel');
  await page.getByRole('button', { name: 'Reset workspace', exact: true }).click();
}

async function capturePage(page: Page, filename: string): Promise<void> {
  await expect(page.locator('#toast')).toBeHidden({ timeout: 6000 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: join(outputDirectory, filename), fullPage: true });
}

try {
  const desktop = await preparePage(1440);
  await expect(desktop.getByRole('button', { name: 'Enable camera', exact: true })).toBeVisible();
  assert.equal(cameraRequests, 0, 'A fresh page must not request camera access');
  checks.push('Fresh page: no camera request before an explicit action');
  await noHorizontalOverflow(desktop, 'Desktop');
  await noSevereAccessibilityViolations(desktop, 'Desktop initial state');
  await desktop.getByRole('button', { name: 'Explore with mouse', exact: true }).click();
  await expect(desktop.getByLabel('Gesture workspace', { exact: true })).toBeVisible();
  assert.equal(cameraRequests, 0, 'Mouse exploration must not request camera access');
  checks.push('Mouse exploration: workspace visible, no camera access');
  await workspaceInteractions(desktop);
  await noSevereAccessibilityViolations(desktop, 'Desktop mouse workspace');
  await capturePage(desktop, 'desktop-workspace.png');
  await desktop.context().close();
  await cancelCameraSetup('Stop');
  await cancelCameraSetup('Escape');

  const denied = await preparePage(1440);
  const beforeDenied = cameraRequests;
  await denied.getByRole('button', { name: 'Enable camera', exact: true }).click();
  // The app deliberately prepares its local model before requesting permission.
  await expect(denied.locator('#tracking-state')).toHaveText('Unavailable', { timeout: 60_000 });
  assert.equal(cameraRequests, beforeDenied + 1,
    `Camera should be requested after real model initialization; status: ${await denied.locator('#tracking-message').innerText()}`);
  // Match human-readable recovery copy, not the mocked browser exception text.
  await expect(denied.getByText(/camera (access |permission )?(was )?(denied|blocked)|camera permission/i).first())
    .toBeVisible({ timeout: 20_000 });
  await denied.getByRole('button', { name: 'Explore with mouse', exact: true }).click();
  await expect(denied.getByLabel('Gesture workspace', { exact: true })).toBeVisible();
  checks.push('Explicit camera denial: informative recovery and usable mouse workspace');
  await denied.context().close();

  const mobile = await preparePage(380);
  await mobile.getByRole('button', { name: 'Explore with mouse', exact: true }).click();
  await touchMove(mobile);
  await noHorizontalOverflow(mobile, 'Mobile 380 px');
  await noSevereAccessibilityViolations(mobile, 'Mobile mouse workspace');
  await capturePage(mobile, 'mobile-workspace.png');
  await mobile.context().close();

  const reduced = await preparePage(1440, true);
  assert.equal(await reduced.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  await reduced.getByRole('button', { name: 'Explore with mouse', exact: true }).click();
  await expect(reduced.getByLabel('Gesture workspace', { exact: true })).toBeVisible();
  const reducedFirst = await reduced.locator('#scene').screenshot();
  await reduced.waitForTimeout(250);
  const reducedSecond = await reduced.locator('#scene').screenshot();
  assert.deepEqual(reducedSecond, reducedFirst, 'The decorative scene must remain still at rest under reduced motion');
  checks.push('Reduced-motion preference: scene still at rest, mouse workspace remains usable');
  await reduced.context().close();

  assert.deepEqual(browserErrors, [], 'Unexpected browser errors');
  assert.deepEqual(unexpectedRequests, [], 'Unexpected third-party requests');
  checks.push('No browser exceptions or third-party network requests in tested states');
  const report = { status: 'passed', checkedAt: new Date().toISOString(), baseURL, checks, cameraRequests,
    cameraTest: 'Explicit denial mock; physical camera was not accessed', outputDirectory };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', baseURL, passedChecks: checks, cameraRequests,
    browserErrors, unexpectedRequests, outputDirectory }, null, 2));
  throw error;
} finally {
  await browser.close();
}
