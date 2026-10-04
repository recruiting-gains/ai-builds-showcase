import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.env.RETRACE_URL || "http://127.0.0.1:8787";
const out = resolve(process.env.RETRACE_CAPTURE_DIR || "artifacts/captures");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const captures = [];
try {
  for (const [name, width, height, vw, vh] of [
    ["landscape", 1440, 810, 1920, 1080],
    ["portrait", 432, 768, 1080, 1920],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      recordVideo: { dir: out, size: { width: vw, height: vh } },
    });
    const page = await context.newPage();
    const start = Date.now();
    const beats = {};
    await page.goto(base);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${name}-overview.png` });
    await page
      .getByRole("button", { name: "Play replay", exact: true })
      .click();
    await page.evaluate(() => scrollTo(0, 0));
    beats.play = (Date.now() - start) / 1000;
    await page.waitForTimeout(7000);
    await page
      .getByRole("button", { name: "Pause replay", exact: true })
      .click();
    beats.scrub = (Date.now() - start) / 1000;
    await page.locator("#timeline").focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(60);
    }
    await page
      .getByRole("button", { name: "Notice the change", exact: false })
      .click();
    await page.screenshot({ path: `${out}/${name}-replay.png` });
    await page.waitForTimeout(2000);
    await page
      .getByRole("button", { name: "About the room illustration" })
      .click();
    beats.source = (Date.now() - start) / 1000;
    await page.screenshot({ path: `${out}/${name}-source.png` });
    await page.waitForTimeout(4000);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Connect a sensor", exact: false })
      .click();
    await page.evaluate(() => scrollTo(0, 0));
    beats.sensor = (Date.now() - start) / 1000;
    await page.screenshot({ path: `${out}/${name}-sensor.png` });
    await page.waitForTimeout(4000);
    const video = page.video();
    await context.close();
    captures.push({
      name,
      viewport: { width, height },
      videoSize: { width: vw, height: vh },
      video: await video.path(),
      beats,
      source: "actual browser recording; simulated data visibly labelled",
      screenshots: ["overview", "replay", "source", "sensor"].map(
        (s) => `${out}/${name}-${s}.png`,
      ),
    });
  }
  await writeFile(`${out}/manifest.json`, JSON.stringify(captures, null, 2));
  console.log(JSON.stringify(captures, null, 2));
} finally {
  await browser.close();
}
