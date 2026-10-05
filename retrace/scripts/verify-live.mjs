import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.RETRACE_URL;
if (!base?.startsWith("https://"))
  throw new Error("RETRACE_URL must be an explicit HTTPS deployment.");
const secrets = JSON.parse(
  await readFile(process.env.RETRACE_SECRETS_FILE, "utf8"),
);
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
const session = crypto.randomUUID();
try {
  const page = await browser.newPage();
  const closes = [];
  page.on("websocket", (ws) => ws.on("close", () => closes.push(true)));
  await page.goto(base);
  await page
    .getByRole("button", { name: "Connect a sensor", exact: false })
    .click();
  await page
    .getByLabel("Viewer key", { exact: true })
    .fill(secrets.VIEWER_SECRET);
  await page
    .getByRole("button", { name: "Connect stream", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "waiting" }).waitFor();
  const event = {
    schemaVersion: 1,
    sessionId: session,
    sensorId: "release-fixture",
    sequence: 0,
    capturedAt: new Date().toISOString(),
    sourceKind: "fixture",
    rssi: -96,
    amplitudes: [0.15, 0.3, 0.6, 0.8, 0.4],
    amplitudeUnit: "relative",
  };
  const ingest = await fetch(`${base}/api/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secrets.INGEST_SECRET}`,
    },
    body: JSON.stringify({ events: [event] }),
  });
  assert.equal(ingest.status, 200);
  assert.equal((await ingest.json()).accepted, 1);
  await page.getByRole("heading", { name: "-96.0 dBm" }).waitFor();
  await page
    .getByText("Protocol test fixture — not hardware evidence.")
    .waitFor();
  await page.getByRole("button", { name: "Disconnect and clear" }).click();
  await page.getByText("0 / 600", { exact: true }).waitFor();
  for (let i = 0; i < 20 && !closes.length; i++) await page.waitForTimeout(250);
  assert.equal(closes.length, 1);
  const unauthorized = await fetch(`${base}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(unauthorized.status, 401);
  const proof = {
    checkedAt: new Date().toISOString(),
    url: base,
    tests: [
      "public app load",
      "real viewer login",
      "authenticated fixture ingestion",
      "browser fixture label and exact RSSI",
      "disconnect clears samples",
      "native WebSocket close observed",
      "unauthorized ingest rejected",
    ],
    passed: true,
    hardwareTested: false,
  };
  await writeFile(
    "artifacts/live-results.json",
    JSON.stringify(proof, null, 2),
  );
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await browser.close();
}
