import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ ...process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" }, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const results = [];
const output = process.env.RETRACE_EVIDENCE_DIR || "artifacts/experience";
const base = process.env.RETRACE_URL || "http://127.0.0.1:5179";
await mkdir(output, { recursive: true });
async function check(name, fn) {
  try {
    const data = await fn();
    results.push({ name, status: "passed", ...data });
  } catch (e) {
    results.push({ name, status: "failed", error: e.stack });
    console.error(e.stack);
  }
  console.log(name, results.at(-1).status);
  await writeFile(`${output}/qa-results.json`, JSON.stringify(results, null, 2));
}
async function open(width, height, query = "?reduced") {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/${query}`, { waitUntil: "networkidle" });
  await expect(page.locator(".rt-loading")).toHaveCount(0, { timeout: 3e4 });
  return { page, context, errors };
}
async function chapter(page, index) {
  await page.getByRole("navigation", { name: "Story chapters" }).locator("button").nth(index).click();
  await expect(page.locator(".rt-experience")).toHaveAttribute("data-stage", String(index));
  await page.waitForTimeout(300);
}
async function settled(page) {
  await page.waitForFunction(() => {
    const q = Number(document.querySelector(".rt-renderer")?.dataset.renderProgress);
    const s = Number(document.querySelector(".rt-experience")?.dataset.stage);
    return s === 1 ? Math.abs(q - 0.32) < 1e-3 : s === 2 ? Math.abs(q - 0.63) < 1e-3 : true;
  }, {}, { timeout: 3e4 });
}
async function frameCount(page) {
  return Number(await page.locator(".rt-renderer").getAttribute("data-frame-count"));
}
try {
  for (const [name, width, height] of [["desktop", 1440, 1e3], ["phone", 390, 844]]) await check(`${name}-scene-interactions`, async () => {
    const { page, context, errors } = await open(width, height, "");
    try {
      await expect(page.locator(".rt-fallback")).toHaveCount(0);
      await expect(page.locator(".rt-renderer")).toHaveAttribute("data-model-ready", "true");
      const canvas = page.locator(".rt-renderer canvas");
      await expect(canvas).toHaveCSS("touch-action", "pan-y");
      await chapter(page, 1);
      await settled(page);
      const explore = page.getByRole("button", { name: "Explore in 3D", exact: true });
      await explore.click();
      await expect(page.getByRole("button", { name: "Return to the story" })).toHaveAttribute("aria-pressed", "true");
      await expect(canvas).toBeFocused();
      const first = await frameCount(page);
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => frameCount(page), { timeout: 1e4 }).toBeGreaterThan(first);
      await page.keyboard.press("Escape");
      await expect(explore).toBeFocused();
      await expect(canvas).toHaveCSS("touch-action", "pan-y");
      await chapter(page, 2);
      await settled(page);
      await expect(page.locator(".rt-router-callout")).toHaveCSS("opacity", "1");
      assert.equal(await page.locator(".rt-renderer").getAttribute("data-router-origin"), "3.22,1.27,2.5");
      const count = await frameCount(page);
      await expect.poll(() => frameCount(page), { timeout: 15e3 }).toBeGreaterThan(count);
      await page.getByRole("button", { name: "Pause pulses", exact: true }).click();
      await expect(page.locator(".rt-renderer")).toHaveAttribute("data-motion-paused", "true", { timeout: 15e3 });
      await expect(page.locator(".rt-renderer")).toHaveAttribute("data-scene-settled", "true", { timeout: 15e3 });
      const paused = await frameCount(page);
      await page.waitForTimeout(1e3);
      assert.equal(await frameCount(page), paused, "Paused scene kept rendering");
      await page.getByRole("button", { name: "Resume pulses", exact: true }).click();
      await expect(page.locator(".rt-renderer")).toHaveAttribute("data-motion-paused", "false", { timeout: 15e3 });
      await expect.poll(() => frameCount(page), { timeout: 15e3 }).toBeGreaterThan(paused);
      await chapter(page, 3);
      const slider = page.getByRole("slider", { name: "Simulation time in seconds" });
      await page.getByRole("button", { name: "Play simulated replay", exact: true }).click();
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Pause simulated replay", exact: true }).click();
      assert.ok(Number(await slider.inputValue()) > 17.4);
      await page.getByRole("combobox", { name: "Simulated scenario" }).selectOption("empty");
      assert.equal(await slider.inputValue(), "0");
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await slider.inputValue(), "0.1");
      await page.getByRole("button", { name: "Restart simulated replay", exact: true }).click();
      assert.equal(await slider.inputValue(), "0");
      for (const id of ["movement", "entry", "stillness", "exit"]) {
        await page.getByRole("combobox", { name: "Simulated scenario" }).selectOption(id);
        assert.equal(await slider.inputValue(), "0");
      }
      await page.getByRole("link", { name: "Open the full observatory", exact: true }).click({ trial: true });
      for (const i of [2, 1, 0]) await chapter(page, i);
      assert.deepEqual(errors, []);
      return { pageErrors: errors, keyboardOrbit: true, pulsesPauseResume: true, replayScenarios: 5 };
    } finally {
      await context.close();
    }
  });
  await check("keyboard-explore-with-scene-frame-pending", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      const request = requestAnimationFrame.bind(window), cancel = cancelAnimationFrame.bind(window);
      const held = new Map();
      let sceneDraw = null, paused = false;
      // Identify the scene callback by its rendered-frame counter, without depending on minified names.
      // Hold only that callback: React, Playwright, and other browser work can continue normally.
      window.requestAnimationFrame = callback => {
        const id = request(now => {
          if (paused && callback === sceneDraw) { held.set(id, callback); return; }
          const before = document.querySelector(".rt-renderer")?.dataset.frameCount;
          callback(now);
          if (document.querySelector(".rt-renderer")?.dataset.frameCount !== before) sceneDraw = callback;
        });
        return id;
      };
      window.cancelAnimationFrame = id => { held.delete(id); cancel(id); };
      window.__retraceSceneFrameGate = {
        pause() {
          if (!sceneDraw) throw new Error("Scene draw callback was not identified");
          paused = true;
        },
        pendingCount: () => held.size,
        resume() {
          paused = false;
          for (const callback of held.values()) request(callback);
          held.clear();
        },
      };
    });
    try {
      await page.goto(`${base}/?reduced`, { waitUntil: "networkidle" });
      const renderer = page.locator(".rt-renderer"), canvas = renderer.locator("canvas");
      await expect(renderer).toHaveAttribute("data-model-ready", "true", { timeout: 30000 });
      await chapter(page, 1);
      await expect(renderer).toHaveAttribute("data-render-progress", "0.3800", { timeout: 30000 });
      await expect(renderer).toHaveAttribute("data-scene-settled", "true");
      const explore = page.getByRole("button", { name: "Explore in 3D", exact: true });
      await explore.focus();
      await page.evaluate(() => window.__retraceSceneFrameGate.pause());
      const frames = await frameCount(page);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: "Return to the story", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => page.evaluate(() => window.__retraceSceneFrameGate.pendingCount())).toBeGreaterThan(0);
      await expect(canvas).toBeFocused();
      await expect(canvas).toHaveAttribute("tabindex", "0");
      await expect(canvas).toHaveCSS("touch-action", "none");
      assert.equal(await frameCount(page), frames, "Scene rendered while its callback was held");
      await page.keyboard.press("Escape");
      await expect(explore).toBeFocused();
      await expect(explore).toHaveAttribute("aria-pressed", "false");
      await expect(canvas).toHaveAttribute("tabindex", "-1");
      await expect(canvas).toHaveCSS("touch-action", "pan-y");
      assert.equal(await frameCount(page), frames, "Escape required a scene render");
      await page.evaluate(() => window.__retraceSceneFrameGate.resume());
      // Entering again creates a visual state change; returning to the original idle mode
      // while frames were held may correctly leave no work for the renderer to draw.
      await page.keyboard.press("Enter");
      await expect(canvas).toBeFocused();
      await expect.poll(() => frameCount(page), { timeout: 15000 }).toBeGreaterThan(frames);
      await page.keyboard.press("Escape");
      await expect(explore).toBeFocused();
      await expect(canvas).toHaveCSS("touch-action", "pan-y");
      assert.deepEqual(errors, []);
      return { focusIndependentOfSceneRender: true, escapeIndependentOfSceneRender: true, resumedRendering: true, pageErrors: errors };
    } finally {
      await page.evaluate(() => window.__retraceSceneFrameGate?.resume()).catch(() => {});
      await context.close();
    }
  });
  for (const [name, width, height] of [["narrow", 320, 568], ["short-portrait", 320, 480], ["landscape-small", 667, 375], ["landscape", 844, 390]]) await check(`${name}-accessible-replay`, async () => {
    const { page, context, errors } = await open(width, height, "?fallback&reduced");
    try {
      await chapter(page, 3);
      const link = page.getByRole("link", { name: "Open the full observatory", exact: true });
      await link.click({ trial: true });
      const geometry = await page.evaluate(() => {
        const e = document.querySelector(".rt-editorial").getBoundingClientRect(), r = document.querySelector(".rt-replay").getBoundingClientRect();
        return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, editorial: e.toJSON(), replay: r.toJSON() };
      });
      assert.equal(geometry.overflow, false);
      if (width < 560) assert.ok(geometry.editorial.bottom <= geometry.replay.top, "Stacked panel overlaps text");
      await link.click();
      await expect(page).toHaveURL(/observatory/);
      await expect(page.getByRole("button", { name: "Play replay", exact: true })).toBeVisible();
      assert.deepEqual(errors, []);
      return { geometry, pageErrors: errors, observatoryNavigation: true };
    } finally {
      await context.close();
    }
  });
  await check("reduced-motion-and-router-projection", async () => {
    const { page, context, errors } = await open(390, 844);
    try {
      await chapter(page, 2);
      await expect(page.locator(".rt-router-callout")).toHaveCSS("opacity", "1");
      const box = await page.locator(".rt-router-callout").boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y > 350 && box.y + box.height < 750);
      await page.waitForTimeout(300);
      const frames = await frameCount(page);
      await page.waitForTimeout(500);
      assert.equal(await frameCount(page), frames);
      await page.goto(`${base}/`);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.locator(".rt-experience")).toHaveAttribute("data-reduced", "true");
      assert.deepEqual(errors, []);
      return { calloutBox: box, idleRender: true, pageErrors: errors };
    } finally {
      await context.close();
    }
  });
  for (const [width, height] of [[1440, 1e3], [390, 844], [320, 568]]) await check(`axe-${width}`, async () => {
    const { page, context } = await open(width, height, "?fallback&reduced");
    try {
      const violations = [];
      for (const stage of [0, 2, 3]) {
        await chapter(page, stage);
        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        violations.push(...axe.violations.map((v) => ({ stage, id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })));
      }
      await writeFile(`${output}/axe-${width}.json`, JSON.stringify(violations, null, 2));
      assert.equal(violations.length, 0, JSON.stringify(violations));
      return { violations: [] };
    } finally {
      await context.close();
    }
  });
  await check("failed-model-and-fallback", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      await page.route("**/models/retrace-home.glb", (r) => r.fulfill({ status: 404, body: "test" }));
      await page.goto(`${base}/?reduced`);
      await expect(page.locator(".rt-fallback")).toBeVisible();
      await chapter(page, 3);
      await page.getByRole("button", { name: "Play simulated replay", exact: true }).click();
      await page.waitForTimeout(300);
      assert.ok(Number(await page.getByRole("slider", { name: "Simulation time in seconds" }).inputValue()) > 17.4);
      return { replayUsable: true };
    } finally {
      await context.close();
    }
  });
} finally {
  await browser.close();
}
if (results.some((r) => r.status === "failed")) process.exitCode = 1;
