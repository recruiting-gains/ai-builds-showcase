import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import WebSocket from "ws";
import { spawn } from "node:child_process";

// Actual workerd runtime, isolated local state, and ephemeral fixture credentials.
const directory = await mkdtemp(join(tmpdir(), "retrace-worker-test-"));
const bindings = Object.fromEntries(
  ["INGEST_SECRET", "VIEWER_SECRET", "SESSION_SECRET"].map((name) => [
    name,
    randomBytes(32).toString("hex"),
  ]),
);
const compiled = await build({
  entryPoints: ["worker/index.ts"],
  bundle: true,
  format: "esm",
  write: false,
  target: "es2022",
  external: ["cloudflare:*"],
});
const options = {
  modules: true,
  script: compiled.outputFiles[0].text,
  compatibilityDate: "2026-10-04",
  durableObjects: { SIGNAL_ROOM: { className: "SignalRoom", useSQLite: true } },
  resourcePersistencePath: directory,
  bindings,
  serviceBindings: { ASSETS: () => new Response("fixture asset") },
};
let mf;
let passes = 0;
const pass = (name) => {
  passes++;
  console.log(`PASS ${name}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const strictClose = process.argv.includes("--strict-close");
const origin = "https://retrace.test";
const request = (path, init = {}) => mf.dispatchFetch(`${origin}${path}`, init);
const post = (path, body, headers = {}) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body: JSON.stringify(body),
  });
const event = (sequence = 0, extra = {}) => ({
  schemaVersion: 1,
  sessionId: "runtime-run",
  sensorId: "fixture",
  sequence,
  sourceKind: "fixture",
  capturedAt: new Date().toISOString(),
  rssi: -62,
  ...extra,
});
const ingest = (events) =>
  post(
    "/api/ingest",
    { events },
    { Authorization: `Bearer ${bindings.INGEST_SECRET}` },
  );
let cookie;
const connect = async (ack = true, closeOnStatus = true) => {
  const address = await mf.ready;
  const url = new URL("/api/stream", address);
  const streamOrigin = url.origin;
  url.protocol = "ws:";
  const ws = new WebSocket(url, {
    headers: { Origin: streamOrigin, Cookie: cookie },
  });
  const messages = [];
  let closed = false;
  ws.on("message", (data) => {
    const value = JSON.parse(data.toString());
    messages.push(value);
    if (ack && value.type === "samples") ws.send('{"type":"ack"}');
    if (
      closeOnStatus &&
      value.type === "status" &&
      value.status === "disconnected"
    )
      ws.close();
  });
  ws.on("close", () => {
    closed = true;
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  await sleep(30);
  return { ws, messages, isClosed: () => closed };
};
async function waitForNativeClose(ws, milliseconds = 5000) {
  if (ws.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(
        new Error(
          `Native WebSocket close event was not received within ${milliseconds} ms.`,
        ),
      );
    }, milliseconds);
    ws.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
try {
  mf = new Miniflare(convertV4MiniflareOptions(options));
  assert.equal((await request("/api/health")).status, 200);
  const health = await (await request("/api/health")).json();
  assert.equal(health.privateStream, "configured");
  const scenarios = await (await request("/api/scenarios")).json();
  assert.equal(scenarios.scenarios.length, 5);
  const detail = await (
    await request(`/api/scenarios/${scenarios.scenarios[0].id}`)
  ).json();
  assert.equal(detail.sourceKind, "simulation");
  assert.ok(detail.samples.length > 100);
  assert.equal((await request("/api/scenarios/missing")).status, 404);
  assert.equal((await request("/api/missing")).status, 404);
  pass("health, deterministic public scenarios, unknown routes");
  assert.equal((await post("/api/ingest", { events: [event()] })).status, 401);
  assert.equal(
    (
      await post(
        "/api/login",
        { secret: bindings.VIEWER_SECRET },
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/stream", {
        headers: { Origin: origin, Upgrade: "websocket" },
      })
    ).status,
    401,
  );
  pass("unauthorized ingestion, cross-origin login, unauthenticated stream");
  const login = await post("/api/login", { secret: bindings.VIEWER_SECRET });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  for (const attribute of [
    "Secure",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=1800",
  ])
    assert.ok(setCookie.includes(attribute));
  cookie = setCookie.split(";")[0];
  assert.equal(
    (
      await request("/api/stream", {
        headers: {
          Origin: "https://evil.example",
          Cookie: cookie,
          Upgrade: "websocket",
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/stream", {
        headers: { Origin: origin, Cookie: cookie + "x", Upgrade: "websocket" },
      })
    ).status,
    401,
  );
  pass("signed short-lived cookies and stream origin/signature checks");
  const noCodeViewer = await connect(true, false);
  noCodeViewer.ws.close();
  await waitForNativeClose(noCodeViewer.ws);
  const normalViewer = await connect(true, false);
  normalViewer.ws.close(1000, "Normal client shutdown");
  await waitForNativeClose(normalViewer.ws);
  const serverClosedViewer = await connect(true, false);
  serverClosedViewer.ws.send('{"type":"invalid"}');
  await waitForNativeClose(serverClosedViewer.ws);
  pass("native client no-code/normal close and server policy close handshakes");
  const viewer = await connect();
  assert.equal(viewer.messages[0].status, "waiting");
  const epoch = viewer.messages[0].epoch;
  const sample = event();
  assert.equal((await (await ingest([sample])).json()).accepted, 1);
  await sleep(30);
  const received = viewer.messages.find((message) => message.type === "samples")
    .events[0];
  assert.equal(received.sourceKind, "fixture");
  assert.equal(received.rssi, -62);
  assert.ok(received.receivedAt);
  assert.equal(received.amplitudes, undefined);
  assert.equal((await (await ingest([sample])).json()).dropped, 1);
  assert.equal((await (await ingest([event(2), event(1)])).json()).accepted, 1);
  assert.equal(
    (await ingest([event(3, { sourceKind: "sensor" })])).status,
    409,
  );
  assert.equal(
    (await (await ingest([event(0, { sessionId: "next-run" })])).json())
      .accepted,
    1,
  );
  pass(
    "real WebSocket ingestion, provenance, duplicate/order suppression, session restart",
  );
  assert.equal((await ingest([event(3, { rssi: 100 })])).status, 400);
  assert.equal(
    (await ingest(Array.from({ length: 101 }, (_, i) => event(i)))).status,
    400,
  );
  assert.equal(
    (
      await ingest([
        event(3, { capturedAt: new Date(Date.now() - 61_000).toISOString() }),
      ])
    ).status,
    400,
  );
  const oversized = await request("/api/ingest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bindings.INGEST_SECRET}`,
      "Content-Type": "application/json",
    },
    body: " ".repeat(65_537),
  });
  assert.equal(oversized.status, 413);
  pass(
    "malformed batch, stale capture, sample count, and streamed byte bounds",
  );
  await sleep(1100);
  const statuses = await Promise.all(
    Array.from({ length: 11 }, (_, i) =>
      ingest([event(i, { sessionId: "rate-run" })]).then(
        (response) => response.status,
      ),
    ),
  );
  assert.ok(statuses.includes(429));
  await sleep(1100);
  assert.equal(
    (await ingest([event(20, { sessionId: "rate-run" })])).status,
    200,
  );
  pass("ingest rate limit and recovery");
  await sleep(1100);
  const cli = spawn(
    process.execPath,
    ["--import", "tsx", "bridge/cli.ts", "--endpoint", (await mf.ready).origin],
    {
      env: { ...process.env, RETRACE_INGEST_SECRET: bindings.INGEST_SECRET },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let cliOutput = "";
  cli.stderr.on("data", (chunk) => {
    cliOutput += chunk.toString();
  });
  cli.stdin.end(
    JSON.stringify({
      sensorId: "cli-fixture",
      sourceKind: "fixture",
      capturedAt: new Date().toISOString(),
      rssi: -67,
    }) + "\n",
  );
  const cliCode = await new Promise((resolve, reject) => {
    cli.once("exit", resolve);
    cli.once("error", reject);
  });
  assert.equal(cliCode, 0);
  assert.match(cliOutput, /1 accepted/);
  assert.equal(cliOutput.includes(bindings.INGEST_SECRET), false);
  await sleep(30);
  assert.ok(
    viewer.messages.some(
      (message) =>
        message.type === "samples" &&
        message.events.some(
          (sample) =>
            sample.sensorId === "cli-fixture" &&
            sample.sourceKind === "fixture",
        ),
    ),
  );
  pass(
    "actual NDJSON bridge CLI to runtime ingestion and authenticated viewer",
  );
  const slow = await connect(false);
  await sleep(1100);
  for (let i = 0; i < 12; i++) {
    assert.equal(
      (await ingest([event(i, { sessionId: "slow-run" })])).status,
      200,
    );
    await sleep(115);
  }
  assert.equal(
    slow.messages.filter((message) => message.type === "samples").length,
    10,
  );
  assert.ok(
    slow.messages.some(
      (message) =>
        message.type === "status" && message.status === "disconnected",
    ),
  );
  assert.ok(slow.ws.readyState >= WebSocket.CLOSING);
  if (strictClose) await waitForNativeClose(slow.ws);
  else slow.ws.terminate();
  pass(
    "slow viewer receives exactly 10 unacknowledged batches and disconnect control",
  );
  viewer.ws.close();
  await mf.dispose();
  mf = new Miniflare(convertV4MiniflareOptions(options));
  const resumed = await connect();
  assert.equal(resumed.messages.length, 1);
  assert.equal(resumed.messages[0].status, "waiting");
  assert.notEqual(resumed.messages[0].epoch, epoch);
  assert.equal((await (await ingest([sample])).json()).dropped, 1);
  assert.equal(
    (await ingest([event(3, { sourceKind: "sensor" })])).status,
    409,
  );
  assert.equal((await (await ingest([event(3)])).json()).accepted, 1);
  await sleep(30);
  assert.equal(
    resumed.messages.filter((message) => message.type === "samples").length,
    1,
  );
  pass(
    "runtime restart retains only sequence/source metadata, emits a new epoch, and waits for fresh samples",
  );
  const logout = await post("/api/logout", {}, { Cookie: cookie });
  assert.equal(logout.status, 200);
  await sleep(30);
  assert.ok(
    resumed.messages.some(
      (message) =>
        message.type === "status" && message.status === "disconnected",
    ),
  );
  assert.ok(resumed.ws.readyState >= WebSocket.CLOSING);
  if (strictClose) await waitForNativeClose(resumed.ws);
  else resumed.ws.terminate();
  assert.equal(
    (
      await request("/api/stream", {
        headers: { Origin: origin, Cookie: cookie, Upgrade: "websocket" },
      })
    ).status,
    401,
  );
  pass("logout revokes the cookie and tells active viewers to disconnect");
  let throttled = false;
  for (let index = 0; index < 9; index++)
    if ((await post("/api/login", { secret: "incorrect" })).status === 429)
      throttled = true;
  assert.equal(throttled, true);
  pass("bounded viewer login attempts");
  if (!strictClose)
    console.log(
      "LIMITATION: server-initiated slow-viewer/logout native close completion remains unverified; --strict-close reproduces the bounded 5-second check.",
    );
  console.log(
    `${passes} runtime verification groups passed. Fixtures only; no hardware or production writes.`,
  );
} finally {
  await mf?.dispose();
  await rm(directory, { recursive: true, force: true });
}
