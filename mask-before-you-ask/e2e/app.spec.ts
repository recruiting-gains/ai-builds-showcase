import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Request } from "@playwright/test";

interface NetworkRecord {
  method: string;
  postData: string | null;
  url: string;
}

function recordRequests(requests: NetworkRecord[], request: Request): void {
  requests.push({
    method: request.method(),
    postData: request.postData(),
    url: request.url(),
  });
}

async function controlText(locator: Locator): Promise<string> {
  const tagName = await locator.evaluate((element) => element.tagName);
  if (tagName === "INPUT" || tagName === "TEXTAREA") return locator.inputValue();
  return (await locator.textContent()) ?? "";
}

test("masks selected private details entirely inside the browser", async ({ page }) => {
  const requests: NetworkRecord[] = [];
  page.on("request", (request) => recordRequests(requests, request));

  await page.goto("/");

  const sourceText =
    "Please email Maya Rivera at private.person@example.com or call (312) 555-0148 tomorrow.";
  const customName = "Maya Rivera";

  await page.locator("#source-text").fill(sourceText);
  await page.locator("#names-to-hide").fill(customName);
  await page
    .locator("#scan-form")
    .getByRole("button", { name: /find private details/i })
    .click();

  const findings = page.locator("#findings-list");
  await expect(findings).toBeVisible();
  await expect(findings).toContainText("Possible email address");
  await expect(findings).toContainText("Possible U.S. phone number");
  await expect(findings).toContainText("Name you asked us to hide");

  await page.locator("#mask-button").click();

  const cleanedText = page.locator("#cleaned-text");
  await expect(cleanedText).toBeVisible();
  await expect(cleanedText).toHaveValue(/\[EMAIL 1\]/u);
  await expect(cleanedText).toHaveValue(/\[PHONE 1\]/u);
  await expect(cleanedText).toHaveValue(/\[NAME 1\]/u);
  expect(await cleanedText.inputValue()).not.toContain("private.person@example.com");
  expect(await cleanedText.inputValue()).not.toContain("312) 555-0148");
  expect(await cleanedText.inputValue()).not.toContain(customName);
  await expect(page.locator("#copy-button")).toBeEnabled();

  const serializedRequests = JSON.stringify(requests);
  expect(serializedRequests).not.toContain("private.person@example.com");
  expect(serializedRequests).not.toContain("312%29%20555-0148");
  expect(serializedRequests).not.toContain("312) 555-0148");
  expect(serializedRequests).not.toContain(customName);
  expect(requests.every(({ method }) => method === "GET" || method === "HEAD")).toBe(true);

  const browserStorage = await page.evaluate(async () => {
    const cachedRequestUrls: string[] = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const cachedRequest of await cache.keys()) cachedRequestUrls.push(cachedRequest.url);
    }

    return {
      cachedRequestUrls,
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
    };
  });
  expect(browserStorage.localStorageKeys).toEqual([]);
  expect(browserStorage.sessionStorageKeys).toEqual([]);
  expect(JSON.stringify(browserStorage)).not.toContain("private.person@example.com");
  expect(JSON.stringify(browserStorage)).not.toContain(customName);
});

test("offers a safe example and clears the working copy", async ({ page }) => {
  await page.goto("/");
  await page.locator("#load-example").click();

  await expect(page.locator("#source-text")).not.toHaveValue("");
  await page.locator("#scan-button").click();
  await expect(page.locator("#findings-list")).toBeVisible();

  await page.locator("#back-to-paste").click();
  await page.locator("#clear-input").click();

  await expect(page.locator("#source-text")).toHaveValue("");
  await expect(page.locator("#names-to-hide")).toHaveValue("");
});

test("has an accessible primary workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Keep your private details");
  await expect(page.locator("#source-text")).toBeVisible();

  const accessibilityScan = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScan.violations).toEqual([]);
});

test("stays within the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.locator("#scan-button")).toBeVisible();

  const cleanedText = page.locator("#cleaned-text");
  expect(await controlText(cleanedText)).toBe("");
});
