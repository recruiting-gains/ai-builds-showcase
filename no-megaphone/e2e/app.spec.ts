import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { ScoreInput } from "../src/shared/contracts";

const IDEAL_VALUES: ScoreInput = {
  businessRelevance: "direct",
  helpfulnessGap: "clear",
  ruleFit: "allowed",
  freshness: "today",
  momentum: "early",
  trustOpportunity: "firsthand",
  geographicFit: "exact",
  topicSensitivity: "ordinary",
  primaryIntent: "help",
  selfContainedHelp: "yes",
  informationCompleteness: "sufficient",
};

async function completeContext(page: Page): Promise<void> {
  await page.getByLabel("Kind of work").selectOption("professional_service");
  await page.getByLabel("Hands-on experience").selectOption("6_to_10");
  await page.getByLabel("Where that experience applies").selectOption("local");
  await page.getByRole("button", { name: "Continue" }).click();
}

async function fillChecklist(page: Page, overrides: Partial<ScoreInput> = {}): Promise<void> {
  const values = { ...IDEAL_VALUES, ...overrides };
  for (const [name, value] of Object.entries(values)) {
    await page.locator(`input[name="${name}"][value="${value}"]`).check();
  }
}

test("completes the fictional primary journey through the real scoring endpoint", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Should you comment?" })).toBeVisible();
  await expect(page.locator("#result-panel")).toBeHidden();
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByText("A bakery owner", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "See my result" }).click();

  await expect(page.locator("#result-label")).toHaveText("Helpful opening");
  await expect(page.locator("#result-score")).toHaveText("87");
  await expect(page.locator("#factor-rows tr")).toHaveCount(7);
  await expect(page.locator("#answer-count")).toHaveText("11 / 11 observations recorded");
  await expect(page.getByText("Verified by the no-storage scoring endpoint.")).toBeVisible();
  await expect(page.locator("#result-title")).toBeFocused();
  expect(consoleErrors).toEqual([]);
});

test("treats prohibited participation as a successful Stay quiet exclusion", async ({ page }) => {
  await page.goto("/");
  await completeContext(page);
  await fillChecklist(page, { ruleFit: "prohibited" });
  await page.getByRole("button", { name: "See my result" }).click();

  await expect(page.locator("#result-label")).toHaveText("Stay quiet");
  await expect(page.locator("#result-score")).toHaveText("0");
  await expect(page.getByText("Decision override applied")).toBeVisible();
  await expect(page.getByText("The rules say no")).toBeVisible();
  await expect(page.getByText("Quiet is a valid completion.")).toBeVisible();
});

test("shows a useful empty-form error and focuses the first unanswered group", async ({ page }) => {
  await page.goto("/");
  await completeContext(page);
  await page.getByRole("button", { name: "See my result" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Answer every checklist question before calculating the score.",
  );
  await expect(page.locator('input[name="businessRelevance"]').first()).toBeFocused();
  await expect(page.locator("#result-panel")).toBeHidden();
});

test("restores broad context after refresh and deletes it on request", async ({ page }) => {
  await page.goto("/");
  await completeContext(page);
  await page.reload();
  await expect(page.getByLabel("Kind of work")).toHaveValue("professional_service");
  await expect(page.getByLabel("Hands-on experience")).toHaveValue("6_to_10");
  await expect(page.getByLabel("Where that experience applies")).toHaveValue("local");

  await page.getByRole("button", { name: "Delete local data" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Delete it" }).click();
  await page.reload();
  await expect(page.getByLabel("Kind of work")).toHaveValue("");
  await expect(page.locator("#checklist-panel")).toBeHidden();
});

test("uses the identical local formula when the scoring network is unavailable", async ({
  page,
}) => {
  await page.route("**/api/score", (route) => route.abort("failed"));
  await page.goto("/");
  await page.getByRole("button", { name: "Try an example" }).click();
  await page.getByRole("button", { name: "See my result" }).click();
  await expect(page.locator("#result-score")).toHaveText("87");
  await expect(page.getByText("The endpoint was unavailable", { exact: false })).toBeVisible();
});

test("communicates progress on a slow scoring request", async ({ page }) => {
  let releaseRequest: (() => void) | undefined;
  await page.route("**/api/score", async (route) => {
    await new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await route.continue().catch(() => undefined);
  });

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Try an example" }).click();
    const evaluate = page.getByRole("button", { name: "See my result" });
    await evaluate.click();
    await expect(page.getByRole("button", { name: "Checking the math…" })).toBeDisabled();
    await expect(page.locator("#checklist-form")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator('input[name="momentum"][value="active"]')).toBeDisabled();
    await expect(page.getByLabel("Kind of work")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Try an example" })).toBeDisabled();
    await expect(page.locator("#reset-check")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Delete local data" })).toBeDisabled();
    await expect.poll(() => Boolean(releaseRequest)).toBe(true);
    releaseRequest?.();
    await expect(page.locator("#result-label")).toHaveText("Helpful opening");
    await expect(page.locator("#result-score")).toHaveText("87");
    await expect(page.locator('input[name="momentum"][value="active"]')).toBeChecked();
    await expect(page.getByText("Verified by the no-storage scoring endpoint.")).toBeVisible();
    await expect(page.getByLabel("Kind of work")).toBeEnabled();
    await expect(page.locator("#checklist-form")).toHaveAttribute("aria-busy", "false");
  } finally {
    releaseRequest?.();
  }
});

test("falls back locally when the scoring endpoint does not respond", async ({ page }) => {
  let releaseRequest: (() => void) | undefined;
  await page.route("**/api/score", async (route) => {
    await new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await route.continue().catch(() => undefined);
  });

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Try an example" }).click();
    await page.getByRole("button", { name: "See my result" }).click();
    await expect(page.getByRole("button", { name: "Checking the math…" })).toBeDisabled();
    await expect(page.locator("#result-score")).toHaveText("87", { timeout: 6_000 });
    await expect(page.getByText("The endpoint was unavailable", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "See my result" })).toBeEnabled();
  } finally {
    releaseRequest?.();
  }
});

test("supports direct section links", async ({ page }) => {
  await page.goto("/rules-first");
  await expect(page).toHaveURL(/\/#rules-first$/);
  await expect(page.getByRole("heading", { name: "Five ground rules." })).toBeVisible();
});

test("has screen-reader landmarks, names, and no automated accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
  await page.getByRole("button", { name: "Try an example" }).click();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("supports skip navigation and keyboard operation of setup and checklist choices", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const businessType = page.getByLabel("Kind of work");
  await businessType.focus();
  await page.keyboard.type("P");
  await expect(businessType).toHaveValue("professional_service");

  const experienceLevel = page.getByLabel("Hands-on experience");
  await experienceLevel.focus();
  await page.keyboard.type("6");
  await expect(experienceLevel).toHaveValue("6_to_10");

  const serviceArea = page.getByLabel("Where that experience applies");
  await serviceArea.focus();
  await page.keyboard.type("L");
  await expect(serviceArea).toHaveValue("location_free");

  await page.getByRole("button", { name: "Continue" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#checklist-panel")).toBeVisible();

  const firstChoice = page.locator('input[name="businessRelevance"]').first();
  await firstChoice.focus();
  await page.keyboard.press("Space");
  await expect(firstChoice).toBeChecked();
});

test("removes meaningful motion when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const motion = await page.locator(".orbit-one").evaluate((element) => {
    const style = getComputedStyle(element);
    return { duration: style.animationDuration, iterations: style.animationIterationCount };
  });
  expect(Number.parseFloat(motion.duration)).toBeLessThanOrEqual(0.00001);
  expect(motion.iterations).toBe("1");
});

for (const viewport of [
  { name: "small mobile", width: 320, height: 720 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 960 },
]) {
  test(`has no horizontal overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await expect(page.getByRole("heading", { name: "Should you comment?" })).toBeVisible();
    await page.getByRole("button", { name: "Try an example" }).click();
    await page.getByRole("button", { name: "See my result" }).click();
    const resultDimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: [...document.body.querySelectorAll<HTMLElement>("*")]
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.classList.length > 0 ? `.${[...element.classList].join(".")}` : ""}`,
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            width: Math.round(bounds.width),
          };
        })
        .filter(
          (bounds) => bounds.left < -1 || bounds.right > document.documentElement.clientWidth + 1,
        )
        .slice(0, 12),
    }));
    expect(
      resultDimensions.scrollWidth,
      `Overflowing elements: ${JSON.stringify(resultDimensions.offenders)}`,
    ).toBeLessThanOrEqual(resultDimensions.clientWidth);
  });
}

test("keeps mobile width stable throughout the decorative animation cycle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Try an example" }).click();
  await page.getByRole("button", { name: "See my result" }).click();

  for (let sample = 0; sample < 8; sample += 1) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await page.waitForTimeout(500);
  }
});

test("loads without scripts as a polished readable guide", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("#context-form")).toBeHidden();
  expect(new URL(page.url()).search).toBe("");
  await expect(page.getByText("JavaScript is off.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Should you comment?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Five ground rules." })).toBeAttached();
  await context.close();
});

test("stays within a lean first-load budget and makes no external requests", async ({ page }) => {
  const externalUrls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalUrls.push(request.url());
  });
  await page.goto("/", { waitUntil: "networkidle" });
  const metrics = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    return {
      resourceCount: resources.length,
      transferBytes: resources.reduce((sum, resource) => sum + resource.transferSize, 0),
      domNodes: document.querySelectorAll("*").length,
    };
  });
  expect(externalUrls).toEqual([]);
  expect(metrics.resourceCount).toBeLessThanOrEqual(8);
  expect(metrics.transferBytes).toBeLessThan(350_000);
  expect(metrics.domNodes).toBeLessThan(1_200);
});
