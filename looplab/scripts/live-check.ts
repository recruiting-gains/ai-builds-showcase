import { chromium, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { CASES } from "../src/shared/corpus";
import {
  EXPERIMENT_FINGERPRINT,
  getProvenance,
} from "../src/shared/experiment";
import { gradeOutput } from "../src/shared/grading";
import { summarize, verdict } from "../src/client/summary";
import type { ExperimentRun } from "../src/shared/contracts";

// Deliberately opt-in: this makes twenty real AI requests, consuming allowance.
if (!process.argv.includes("--live"))
  throw new Error("Add --live to authorize one real 20-response experiment.");
const origin =
  process.env.LOOPLAB_TEST_URL ??
  "https://looplab.recruiting-gains.workers.dev";
const folder = "test-results/live";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.LOOPLAB_BROWSER_CHANNEL || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  const health = await context.request.get(`${origin}/api/health`);
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    status: "ok",
    database: "ready",
    experimentVersion: EXPERIMENT_FINGERPRINT,
  });
  const navigation = await page.goto(origin, { waitUntil: "domcontentloaded" });
  expect(navigation?.status()).toBe(200);
  expect(navigation?.headers()["x-frame-options"]).toBe("DENY");
  await expect(page.locator("#run-button")).toBeEnabled({ timeout: 15000 });
  await expect(page.locator("#lab-scene canvas")).toBeVisible();
  await page.screenshot({ path: `${folder}/homepage.png`, fullPage: true });
  let createCalls = 0,
    stepCalls = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      if (path === "/api/runs") createCalls++;
      if (path.endsWith("/step")) stepCalls++;
    }
  });
  await page.locator("#run-button").click();
  // Bounded actual inference: ten sequential cases, two calls per case.
  await expect(page.locator("#run-status")).toContainText(
    "Experiment complete",
    { timeout: 300000 },
  );
  expect(createCalls).toBe(1);
  expect(stepCalls).toBe(10);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await downloadPromise;
  await download.saveAs(`${folder}/experiment.json`);
  const report = JSON.parse(
    await readFile(`${folder}/experiment.json`, "utf8"),
  ) as ExperimentRun & { provenance: unknown; answerKey: unknown };
  expect(report.status).toBe("complete");
  expect(report.completed).toBe(10);
  expect(report.results).toHaveLength(20);
  expect(report.experimentVersion).toBe(EXPERIMENT_FINGERPRINT);
  expect(report.provenance).toEqual(getProvenance());
  expect(report.answerKey).toEqual(CASES);
  const pairs = new Set(
    report.results.map((result) => `${result.caseId}:${result.lane}`),
  );
  expect(pairs.size).toBe(20);
  for (const result of report.results) {
    const testCase = CASES.find((item) => item.id === result.caseId);
    expect(testCase).toBeTruthy();
    expect(result.error).toBeNull();
    expect(result.grade).toEqual(gradeOutput(result.raw, testCase!));
  }
  await page
    .locator("#scoreboard")
    .screenshot({ path: `${folder}/scoreboard.png` });
  await page.locator('[data-case="missing-date"]').click();
  await expect(page.locator("#case-dialog")).toBeVisible();
  await page.screenshot({ path: `${folder}/evidence.png` });
  await page.keyboard.press("Escape");
  console.log(
    "Twenty actual responses collected and independently regraded. Checking recovery and isolation.",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#run-status")).toContainText(
    "Your last experiment is restored",
  );
  const cookies = await context.cookies(origin);
  const owner = cookies.find(
    (cookie) => cookie.name === "__Host-looplab-session",
  );
  if (new URL(origin).protocol === "https:") {
    expect(owner?.httpOnly).toBe(true);
    expect(owner?.secure).toBe(true);
    expect(owner?.sameSite).toBe("Strict");
  }
  const outsider = await browser.newContext();
  expect(
    (await outsider.request.get(`${origin}/api/runs/${report.id}`)).status(),
  ).toBe(401);
  await outsider.request.get(`${origin}/api/config`);
  expect(
    (await outsider.request.get(`${origin}/api/runs/${report.id}`)).status(),
  ).toBe(404);
  await outsider.close();
  const crossSite = await context.request.post(
    `${origin}/api/runs/${report.id}/step`,
    { headers: { Origin: "https://example.com" }, data: {} },
  );
  expect(crossSite.status()).toBe(403);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${folder}/mobile.png`, fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      verifiedAt: new Date().toISOString(),
      origin,
      model: report.model,
      experimentVersion: report.experimentVersion,
      createCalls,
      stepCalls,
      responses: report.results.length,
      A: summarize(report, "A"),
      B: summarize(report, "B"),
      verdict: verdict(report),
      rawAnswersRegraded: true,
      refreshRecovery: true,
      outsiderDenied: true,
      crossSiteDenied: true,
      pageErrors: errors.length,
      artifacts: folder,
    }),
  );
} finally {
  await browser.close();
}
