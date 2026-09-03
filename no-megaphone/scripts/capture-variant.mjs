import { gzipSync } from "node:zlib";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";

const variant = process.argv[2];
if (!variant || !/^[a-z0-9-]+$/.test(variant)) {
  throw new Error("Pass a safe variant name, for example: variant-a");
}

const outputDirectory = path.resolve("docs/evaluation", variant);
await mkdir(outputDirectory, { recursive: true });

const server = spawn(process.execPath, ["scripts/serve-e2e.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:8787/api/health");
      if (response.ok) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The local production server did not start in time.");
}

await waitForServer();

const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch(
  executablePath
    ? {
        executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-domain-reliability",
          "--disable-sync",
          "--metrics-recording-only",
          "--no-first-run",
        ],
      }
    : {},
);
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
const consoleErrors = [];
const externalRequests = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
});

const startedAt = performance.now();
await page.goto("http://127.0.0.1:8787/", { waitUntil: "networkidle" });
const navigationMs = Math.round(performance.now() - startedAt);
const firstLoadMetrics = await page.evaluate(() => {
  const resources = performance.getEntriesByType("resource");
  return {
    resourceCount: resources.length,
    transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
    encodedBodyBytes: resources.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0),
    decodedBodyBytes: resources.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
  };
});
await page.screenshot({ path: path.join(outputDirectory, "desktop-landing.png") });

await page.getByRole("button", { name: "Try the fictional example" }).click();
await page.getByRole("button", { name: "Evaluate the conversation" }).click();
await page.locator("#result-panel").waitFor({ state: "visible" });
await page
  .locator("#result-panel")
  .screenshot({ path: path.join(outputDirectory, "desktop-result.png") });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://127.0.0.1:8787/", { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(outputDirectory, "mobile-landing.png") });
await page.getByRole("button", { name: "Try the fictional example" }).click();
await page.getByRole("button", { name: "Evaluate the conversation" }).click();
await page.locator("#result-panel").waitFor({ state: "visible" });
await page
  .locator("#result-panel")
  .screenshot({ path: path.join(outputDirectory, "mobile-result.png") });

const browserMetrics = await page.evaluate(() => {
  const horizontalOverflow =
    document.documentElement.scrollWidth - document.documentElement.clientWidth;
  return {
    domNodes: document.querySelectorAll("*").length,
    horizontalOverflow,
    overflowingElements:
      horizontalOverflow > 0
        ? [...document.body.querySelectorAll("*")]
            .map((element) => {
              const bounds = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                id: element.id || null,
                classes: [...element.classList],
                left: Math.round(bounds.left),
                right: Math.round(bounds.right),
              };
            })
            .filter(
              (bounds) =>
                bounds.left < -1 || bounds.right > document.documentElement.clientWidth + 1,
            )
            .slice(0, 12)
        : [],
  };
});

async function distributionMetrics() {
  const files = [];
  const queue = [path.resolve("dist")];
  while (queue.length > 0) {
    const directory = queue.pop();
    if (!directory) continue;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) queue.push(absolutePath);
      if (entry.isFile()) {
        const bytes = await readFile(absolutePath);
        const details = await stat(absolutePath);
        files.push({
          path: path.relative(path.resolve("dist"), absolutePath),
          bytes: details.size,
          gzipBytes: gzipSync(bytes).byteLength,
        });
      }
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

const metrics = {
  capturedAt: new Date().toISOString(),
  note: "Local production build measured in Chromium; timings are diagnostic, not public-network benchmarks.",
  navigationMs,
  firstLoad: firstLoadMetrics,
  ...browserMetrics,
  distributionFiles: await distributionMetrics(),
  consoleErrors,
  externalRequests,
};
await writeFile(
  path.join(outputDirectory, "metrics.json"),
  `${JSON.stringify(metrics, null, 2)}\n`,
);
await browser.close();
server.kill("SIGTERM");
