import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { CASES, CORPUS_HASH, CORPUS_VERSION } from "../src/shared/corpus";
import {
  DEFAULT_PROMPT_A,
  DEFAULT_PROMPT_B,
  MODEL,
  type ExperimentRun,
} from "../src/shared/contracts";
import { gradeOutput } from "../src/shared/grading";
import { EXPERIMENT_FINGERPRINT } from "../src/shared/experiment";

const origin = process.env.LOOPLAB_TEST_URL ?? "http://localhost:8787";
const folder = "test-results/browser";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.LOOPLAB_BROWSER_CHANNEL || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#run-button")).toBeEnabled();
  await expect(page.locator(".case-card")).toHaveCount(10);
  await expect(page.locator("#lab-scene canvas")).toBeVisible();
  await page.locator("#motion-button").click();
  await page.screenshot({ path: `${folder}/desktop.png`, fullPage: true });
  await page.locator('[data-case="missing-date"]').click();
  await expect(page.locator("#case-dialog")).toBeVisible();
  await expect(page.locator("#case-detail")).toContainText(
    "Not provided (null)",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#case-dialog")).not.toBeVisible();
  const initialAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  console.log(
    "Initial accessibility violations:",
    JSON.stringify(
      initialAxe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );

  // Only this browser test intercepts inference. Production has no mock mode.
  let run: ExperimentRun | null = null,
    createCalls = 0,
    stepCalls = 0,
    simulateNewDeployment = false;
  await page.route("**/api/runs**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path === "/api/runs") {
      createCalls++;
      const input = req.postDataJSON();
      run = {
        id: "11111111-1111-4111-8111-111111111111",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        promptA: input.promptA,
        promptB: input.promptB,
        model: MODEL,
        corpusHash: CORPUS_HASH,
        corpusVersion: CORPUS_VERSION,
        experimentVersion: simulateNewDeployment
          ? "new-deployment-fingerprint"
          : EXPERIMENT_FINGERPRINT,
        status: "ready",
        completed: 0,
        total: 10,
        results: [],
      };
    } else if (path.endsWith("/step") && run) {
      stepCalls++;
      await new Promise((r) => setTimeout(r, 120));
      const testCase = CASES[run.completed];
      if (testCase) {
        for (const lane of ["A", "B"] as const) {
          const parsed =
            lane === "A" && testCase.id === "missing-date"
              ? { ...testCase.expected, date: "Invented day" }
              : testCase.expected;
          const raw = JSON.stringify(parsed);
          run.results.push({
            caseId: testCase.id,
            lane,
            raw,
            parsed,
            grade: gradeOutput(raw, testCase),
            latencyMs: 150,
            inputTokens: 100,
            outputTokens: 30,
            error: null,
          });
        }
        run.completed++;
        run.status = run.completed === 10 ? "complete" : "running";
      }
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(run),
    });
  });
  await page.locator("#run-button").click();
  await expect(page.locator("#run-status")).toContainText(
    "Experiment complete",
    { timeout: 20000 },
  );
  await expect(page.locator("#scoreboard")).toContainText(
    "Prompt B passed 1 more case.",
  );
  await expect(page.locator('[role="progressbar"]')).toHaveAttribute(
    "aria-valuenow",
    "20",
  );
  expect(createCalls).toBe(1);
  expect(stepCalls).toBe(10);
  await page.locator('[data-filter="failures"]').click();
  await expect(page.locator(".case-card")).toHaveCount(1);
  await page.locator(".case-card").click();
  await expect(page.locator("#case-dialog")).toContainText("Invented day");
  await page.screenshot({ path: `${folder}/failure-inspector.png` });
  const dialogAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  console.log(
    "Dialog accessibility violations:",
    JSON.stringify(
      dialogAxe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );
  await page.keyboard.press("Escape");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^looplab-.*\.json$/);
  await page.locator("[data-promote]").click();
  await expect(page.locator("#prompt-a")).toHaveValue(DEFAULT_PROMPT_B);
  await expect(page.locator("#prompt-b")).toHaveValue(DEFAULT_PROMPT_B);

  await page.locator("#reset-prompts").click();
  await page.locator("#run-button").click();
  await expect(page.locator("#pause-run")).toBeVisible();
  await page.locator("#pause-run").click();
  await expect(page.locator("#resume-run")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#prompt-a")).toBeDisabled();
  await page.locator("#new-run").click();
  await expect(page.locator("#prompt-a")).toBeEnabled();
  await expect(page.locator("#run-button")).toBeEnabled();
  await expect(page.locator("#scoreboard")).not.toBeVisible();
  await expect(page.locator("#arena-a")).toContainText("—");

  const priorSteps = stepCalls;
  simulateNewDeployment = true;
  await page.locator("#run-button").click();
  await expect(page.locator("#error-message")).toContainText(
    "setup changed while this tab was open",
  );
  await expect(page.locator("#run-button")).toBeEnabled();
  expect(stepCalls).toBe(priorSteps); // A stale tab must not start inference or mislabel new answers.
  simulateNewDeployment = false;

  for (const width of [390, 320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, `horizontal overflow at ${width}`).toBe(false);
    if (width === 390)
      await page.screenshot({ path: `${folder}/mobile.png`, fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#motion-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.route("**/assets/three-*.js", (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#motion-button")).toBeDisabled();
  await expect(page.locator("#run-button")).toBeEnabled();
  await expect(page.locator(".case-card")).toHaveCount(10);
  await expect(page.locator("#scene-fallback")).toBeVisible();
  expect(errors).toEqual([]);
  expect(initialAxe.violations).toHaveLength(0);
  expect(dialogAxe.violations).toHaveLength(0);
  console.log(
    JSON.stringify({
      browser: "chromium",
      checks:
        "initial UI, 3D canvas, fixed cases, modal keyboard, 20-response experiment, failure filter, report download, promotion, pause/start fresh, stale-deployment rejection, mobile overflow, reduced motion, illustrated fallback",
      createCalls,
      stepCalls,
      pageErrors: errors.length,
      accessibilityViolations: 0,
      screenshots: folder,
    }),
  );
} finally {
  await browser.close();
}
