import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.RETRACE_URL || "http://127.0.0.1:8787";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
const results = [];
try {
  for (const [name, width, height] of [
    ["desktop", 1440, 1080],
    ["phone", 390, 844],
    ["narrow", 320, 740],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.waitForTimeout(700);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${name} overflow`,
    );
    await page
      .getByRole("button", { name: "Play replay", exact: true })
      .click();
    await page.waitForTimeout(500);
    await page
      .getByRole("button", { name: "Pause replay", exact: true })
      .click();
    assert.ok(+(await page.locator("#timeline").inputValue()) > 17.4);
    await page.locator("#scenario").selectOption("empty");
    assert.equal(await page.locator("#timeline").inputValue(), "0");
    await page.locator("#timeline").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#timeline").inputValue(), "0.1");
    await page
      .getByRole("button", { name: "Restart replay", exact: true })
      .click();
    assert.equal(await page.locator("#timeline").inputValue(), "0");
    await page.locator("#scenario").selectOption("stillness");
    await page
      .getByRole("button", { name: "Trace it back", exact: false })
      .click();
    assert.equal(await page.locator("#timeline").inputValue(), "36");
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save this snapshot", exact: false })
      .click();
    assert.match((await download).suggestedFilename(), /^retrace-stillness/);
    await page
      .getByRole("button", { name: "About the room illustration" })
      .click();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.locator("#scenario").selectOption("movement");
    await page
      .getByRole("button", { name: "Notice the change", exact: false })
      .click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    const violations = axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes
        .map((n) => ({ target: n.target, summary: n.failureSummary }))
        .slice(0, 30),
    }));
    await writeFile(
      `artifacts/axe-${name}.json`,
      JSON.stringify(violations, null, 2),
    );
    results.push({
      name,
      interactions: "passed",
      pageErrors: errors,
      accessibilityViolations: violations,
    });
    assert.deepEqual(errors, []);
    assert.equal(violations.length, 0, `${name}: accessibility violations`);
    await context.close();
  }
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(`${base}/?fallback=1`);
  await p.getByRole("img", { name: "Illustrative 2D room plan" }).waitFor();
  await p.screenshot({ path: "artifacts/fallback.png" });
  results.push({ name: "renderer-fallback", result: "passed" });
  await p.close();
  const p2 = await browser.newPage();
  await p2.route("**/api/health", (route) => route.abort());
  await p2.goto(base);
  await p2.getByText("Local demo · API unavailable").waitFor();
  results.push({ name: "offline-api", result: "passed" });
  await p2.close();
  const sensor = await browser.newPage();
  await sensor.clock.install({ time: new Date() });
  let streamSocket,
    connections = 0;
  await sensor.route("**/api/login", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await sensor.routeWebSocket("**/api/stream", (ws) => {
    connections++;
    streamSocket = ws;
    ws.send(
      JSON.stringify({
        type: "status",
        status: "waiting",
        epoch: "test-epoch",
      }),
    );
  });
  await sensor.goto(base);
  await sensor
    .getByRole("button", { name: "Connect a sensor", exact: false })
    .click();
  await sensor
    .getByLabel("Viewer key", { exact: true })
    .fill("fixture-viewer-key");
  await sensor
    .getByRole("button", { name: "Connect stream", exact: true })
    .click();
  await sensor.getByRole("status").filter({ hasText: "waiting" }).waitFor();
  const time = Date.now();
  const fixture = {
    schemaVersion: 1,
    sessionId: "fixture-session",
    sensorId: "test-sensor",
    sequence: 1,
    capturedAt: new Date(time).toISOString(),
    receivedAt: new Date(time).toISOString(),
    sourceKind: "fixture",
    amplitudes: Array(128).fill(0.4),
    amplitudeUnit: "relative",
  };
  streamSocket.send(JSON.stringify({ type: "samples", events: [fixture] }));
  await sensor.getByRole("heading", { name: "RSSI unavailable" }).waitFor();
  assert.equal(
    await sensor.locator("[data-signal-path]").getAttribute("d"),
    "",
  );
  assert.ok(
    +(await sensor
      .locator(".sensor-readings .plot rect")
      .first()
      .getAttribute("width")) > 0,
  );
  await sensor.clock.fastForward(6000);
  await sensor.getByRole("status").filter({ hasText: "stale" }).waitFor();
  await sensor.clock.fastForward(55_000);
  await sensor.getByText("0 / 600", { exact: true }).waitFor();
  results.push({
    name: "sensor-ui-fixture-missing-rssi-128-bins-expiry",
    result: "passed",
  });
  await sensor.close();
  const cancel = await browser.newPage();
  let release,
    opened = 0;
  await cancel.route("**/api/login", async (route) => {
    await new Promise((r) => (release = r));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  await cancel.routeWebSocket("**/api/stream", () => opened++);
  await cancel.goto(base);
  await cancel
    .getByRole("button", { name: "Connect a sensor", exact: false })
    .click();
  await cancel
    .getByLabel("Viewer key", { exact: true })
    .fill("fixture-viewer-key");
  await cancel
    .getByRole("button", { name: "Connect stream", exact: true })
    .click();
  await cancel.getByRole("button", { name: "Disconnect and clear" }).click();
  release();
  await cancel.waitForTimeout(500);
  assert.equal(opened, 0);
  results.push({ name: "cancel-pending-login", result: "passed" });
  await cancel.close();
  await writeFile(
    "artifacts/browser-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify(
      results.map((r) => ({
        ...r,
        accessibilityViolations: r.accessibilityViolations?.map((v) => ({
          id: v.id,
          nodes: v.nodes.length,
        })),
      })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
