import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import worker from "../src/worker/index";
import { createRun, getRun, stepRun } from "../src/worker/store";
import { COOKIE_NAME, sha256 } from "../src/worker/http";
import { CASES, CORPUS_HASH, CORPUS_VERSION } from "../src/shared/corpus";
import {
  MODEL,
  type ExperimentConfig,
  type ExperimentRun,
} from "../src/shared/contracts";
import { AI_TIMEOUT_MS, infer } from "../src/worker/inference";
import {
  EXPERIMENT_FINGERPRINT,
  EXPERIMENT_VERSION,
  getProvenance,
  GRADER_VERSION,
  MODEL_SETTINGS,
  SYSTEM_PROMPT,
} from "../src/shared/experiment";

const ORIGIN = "https://looplab.example";
const TOKEN = "a".repeat(64);
const COOKIE = `${COOKIE_NAME}=${TOKEN}`;
const schema = readFileSync(
  new URL("../migrations/0001_looplab.sql", import.meta.url),
  "utf8",
);
const provenanceMigration = readFileSync(
  new URL("../migrations/0002_experiment_provenance.sql", import.meta.url),
  "utf8",
);
let mf: Miniflare;
let db: D1Database;
let env: Env;
let owner: string;
const modelRun = vi.fn();
const allow = vi.fn(async () => ({ success: true }));

beforeAll(async () => {
  mf = new Miniflare({
    telemetry: { enabled: false },
    workers: [
      {
        config: {
          name: "looplab-tests",
          type: "worker",
          compatibilityDate: "2026-09-04",
          manifest: {
            mainModule: "index.js",
            modules: {
              "index.js": {
                type: "esm",
                contents:
                  'export default { fetch() { return new Response("test"); } }',
              },
            },
          },
          env: { DB: { type: "d1", id: "looplab-test-db" } },
        },
      },
    ],
  });
  db = await mf.getD1Database("DB");
  // D1 exec uses statement-per-line. Batch the complete migration through the
  // SQLite-backed Miniflare binding; trigger bodies remain single statements.
  const statements = schema.match(
    /CREATE TRIGGER[\s\S]*?\nEND;|CREATE (?:TABLE|INDEX)[\s\S]*?;/g,
  )!;
  for (const sql of statements) await db.prepare(sql).run();
  await db.prepare(provenanceMigration).run();
  owner = await sha256(TOKEN);
  // Only AI, assets, and edge rate limiting are substituted. D1 and all SQL
  // constraints, triggers, leases, ownership checks, and API code are real.
  env = {
    DB: db,
    AI: {
      run: modelRun,
      aiGatewayLogId: null,
      gateway: vi.fn(),
      aiSearch: vi.fn(),
      autorag: vi.fn(),
      models: vi.fn(),
      toMarkdown: vi.fn(),
    },
    ASSETS: {
      fetch: vi.fn(async () => new Response("asset")),
      connect: vi.fn(),
    },
    CREATE_LIMITER: { limit: allow },
    STEP_LIMITER: { limit: allow },
  };
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM steps"),
    db.prepare("DELETE FROM runs"),
    db.prepare("DELETE FROM daily_attempts"),
  ]);
  modelRun.mockReset();
  modelRun.mockResolvedValue({
    response: JSON.stringify(CASES[0].expected),
    usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
  });
  allow.mockReset().mockResolvedValue({ success: true });
});

function input() {
  return {
    promptA: "Extract the event.",
    promptB: "Use only stated details.",
    idempotencyKey: crypto.randomUUID(),
  };
}
function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = COOKIE,
): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      "Sec-Fetch-Site": "same-origin",
      Cookie: cookie,
      "Content-Type": "application/json",
      "CF-Connecting-IP": "192.0.2.1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function send(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = COOKIE,
) {
  return worker.fetch(request(path, method, body, cookie), env);
}

describe("session and request boundary", () => {
  it("issues an HTTP-only secure session and exact public config without caching", async () => {
    const response = await send("/api/config", "GET", undefined, "");
    const config = (await response.json()) as ExperimentConfig;
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(
      /^__Host-looplab-session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=86400; Secure$/,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(config).toMatchObject({
      model: MODEL,
      corpusHash: CORPUS_HASH,
      corpusVersion: CORPUS_VERSION,
      experimentVersion: EXPERIMENT_FINGERPRINT,
      provenance: getProvenance(),
    });
    expect(config.cases).toHaveLength(10);
    expect(modelRun).not.toHaveBeenCalled();
  });

  it("requires the config session before creating a run", async () => {
    expect((await send("/api/runs", "POST", input(), "")).status).toBe(401);
    expect(
      (
        await db
          .prepare("SELECT COUNT(*) AS n FROM runs")
          .first<{ n: number }>()
      )?.n,
    ).toBe(0);
  });

  it("rejects cross-origin, cross-site and unsupported methods before inference", async () => {
    for (const headers of [
      { Origin: "https://other.example" },
      { "Sec-Fetch-Site": "cross-site" },
    ]) {
      const req = request("/api/runs", "POST", input());
      for (const [key, value] of Object.entries(headers))
        req.headers.set(key, value);
      expect((await worker.fetch(req, env)).status).toBe(403);
    }
    expect((await send("/api/runs")).status).toBe(405);
    expect((await send("/api/unknown")).status).toBe(404);
    expect(modelRun).not.toHaveBeenCalled();
  });

  it("validates strict body keys, prompt limits, UUIDs, and streamed size", async () => {
    for (const body of [
      [],
      { ...input(), extra: true },
      { ...input(), promptA: " " },
      { ...input(), promptB: "a".repeat(1601) },
      { ...input(), idempotencyKey: "wrong" },
    ]) {
      expect((await send("/api/runs", "POST", body)).status).toBe(400);
    }
    const huge = request("/api/runs", "POST", {
      ...input(),
      promptA: "a".repeat(20_000),
    });
    expect((await worker.fetch(huge, env)).status).toBe(413);
    const wrongType = request("/api/runs", "POST", input());
    wrongType.headers.set("Content-Type", "text/plain");
    expect((await worker.fetch(wrongType, env)).status).toBe(415);
    expect(modelRun).not.toHaveBeenCalled();
  });

  it("returns honest health and protects both API and asset responses", async () => {
    const health = await send("/api/health");
    expect(await health.json()).toMatchObject({
      status: "ok",
      database: "ready",
    });
    const asset = await send("/");
    expect(asset.headers.get("x-frame-options")).toBe("DENY");
    expect(asset.headers.get("content-security-policy")).toContain(
      "script-src 'self'",
    );
    allow.mockResolvedValue({ success: false });
    const limited = await send("/api/runs", "POST", input());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("no-store");
  });
});

describe("durable run contracts and budgets", () => {
  it("pins a reviewed fingerprint for the whole experiment setup", async () => {
    const canonical = JSON.stringify([
      MODEL,
      CORPUS_HASH,
      GRADER_VERSION,
      MODEL_SETTINGS,
      SYSTEM_PROMPT,
    ]);
    expect(await sha256(canonical)).toBe(EXPERIMENT_FINGERPRINT);
    expect(EXPERIMENT_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
    expect(EXPERIMENT_VERSION).toBe("looplab-experiment-v1");
    expect(GRADER_VERSION).toBe("exact-fields-v1");
    expect(Object.isFrozen(MODEL_SETTINGS)).toBe(true);
    const run = await createRun(db, owner, input());
    expect(run.experimentVersion).toBe(EXPERIMENT_FINGERPRINT);
    expect((await getRun(db, owner, run.id)).experimentVersion).toBe(
      EXPERIMENT_FINGERPRINT,
    );
  });

  it("rejects an old setup on read, step, and idempotent reuse without calls or deletion", async () => {
    const body = input();
    const run = await createRun(db, owner, body);
    await db
      .prepare("UPDATE runs SET experiment_version = ? WHERE id = ?")
      .bind("old-settings-fingerprint", run.id)
      .run();
    await expect(getRun(db, owner, run.id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(stepRun(env, owner, run.id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(createRun(db, owner, body)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (
        await db
          .prepare("SELECT COUNT(*) AS n FROM runs")
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
    expect(modelRun).not.toHaveBeenCalled();
  });

  it("reuses a creation key, conflicts on changed prompts, and restricts ownership", async () => {
    const body = input();
    const first = await createRun(db, owner, body);
    const duplicate = await createRun(db, owner, body);
    expect(duplicate.id).toBe(first.id);
    await expect(
      createRun(db, owner, { ...body, promptA: "different" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(getRun(db, "other-owner", first.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(stepRun(env, "other-owner", first.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(modelRun).not.toHaveBeenCalled();
  });

  it("reserves only four runs per session per day, while permitting an idempotent replay at the limit", async () => {
    const body = input();
    const first = await createRun(db, owner, body);
    await Promise.all([
      createRun(db, owner, input()),
      createRun(db, owner, input()),
      createRun(db, owner, input()),
    ]);
    await expect(createRun(db, owner, input())).rejects.toMatchObject({
      status: 429,
    });
    expect((await createRun(db, owner, body)).id).toBe(first.id);
    expect(
      (
        await db
          .prepare("SELECT COUNT(*) AS n FROM runs")
          .first<{ n: number }>()
      )?.n,
    ).toBe(4);
  });

  it("enforces the global 100-run reservation cap across different owners", async () => {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    await db.batch(
      Array.from({ length: 99 }, (_, i) =>
        db
          .prepare(
            `INSERT INTO runs
      (id, session_hash, idempotency_key, created_at, expires_at, quota_day, prompt_a, prompt_b, model, corpus_version, corpus_hash, experiment_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            `seed-owner-${i}`,
            crypto.randomUUID(),
            now,
            now + 86_400_000,
            day,
            "A",
            "B",
            MODEL,
            CORPUS_VERSION,
            CORPUS_HASH,
            EXPERIMENT_FINGERPRINT,
          ),
      ),
    );
    // Two real concurrent creators compete for the final slot.
    const attempts = await Promise.allSettled([
      createRun(db, "new-owner-a", input()),
      createRun(db, "new-owner-b", input()),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
      status: 429,
    });
    expect(
      (
        await db
          .prepare("SELECT COUNT(*) AS n FROM runs")
          .first<{ n: number }>()
      )?.n,
    ).toBe(100);
  });

  it("expires access without deleting stored history", async () => {
    const run = await createRun(db, owner, input());
    await db
      .prepare("UPDATE runs SET expires_at = ? WHERE id = ?")
      .bind(Date.now() - 1, run.id)
      .run();
    await expect(getRun(db, owner, run.id)).rejects.toMatchObject({
      status: 410,
    });
    await expect(stepRun(env, owner, run.id)).rejects.toMatchObject({
      status: 410,
    });
    expect(
      (
        await db
          .prepare("SELECT COUNT(*) AS n FROM runs")
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
  });

  it("prevents calls when the actual daily attempt reservation budget is exhausted", async () => {
    const run = await createRun(db, owner, input());
    const day = new Date().toISOString().slice(0, 10);
    await db
      .prepare("INSERT INTO daily_attempts(quota_day, calls) VALUES (?, 2000)")
      .bind(day)
      .run();
    await expect(stepRun(env, owner, run.id)).rejects.toMatchObject({
      status: 429,
    });
    expect(modelRun).not.toHaveBeenCalled();
    expect(
      (
        await db
          .prepare("SELECT COUNT(*) AS n FROM steps")
          .first<{ n: number }>()
      )?.n,
    ).toBe(0);
  });
});

describe("paired real inference path with a deterministic test provider", () => {
  it("reads current fast-model message content verbatim and retains real token usage", async () => {
    const raw = JSON.stringify(CASES[0].expected);
    modelRun.mockResolvedValue({
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: raw },
          finish_reason: "stop",
        },
      ],
      response: CASES[0].expected,
      model: "@cf/meta/llama-3.1-8b-fast-v2",
      usage: { prompt_tokens: 58, completion_tokens: 16, total_tokens: 74 },
    });
    const result = await infer(env, CASES[0], "A", "Extract.");
    expect(result).toMatchObject({
      raw,
      parsed: CASES[0].expected,
      error: null,
      inputTokens: 58,
      outputTokens: 16,
      providerModel: "@cf/meta/llama-3.1-8b-fast-v2",
      grade: { passed: true },
    });
    expect(modelRun).toHaveBeenCalledTimes(1);
  });

  it("does not let a provider-parsed object conceal invalid raw output", async () => {
    const raw = `\`\`\`json\n${JSON.stringify(CASES[0].expected)}\n\`\`\``;
    modelRun.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: raw } }],
      response: CASES[0].expected,
    });
    const result = await infer(env, CASES[0], "A", "Extract.");
    expect(result).toMatchObject({
      raw,
      parsed: null,
      error: null,
      grade: { valid: false, passed: false },
    });
    modelRun.mockResolvedValue({ response: CASES[0].expected });
    const withoutRaw = await infer(env, CASES[0], "A", "Extract.");
    expect(withoutRaw).toMatchObject({
      raw: "",
      parsed: null,
      error: expect.stringContaining("unreadable"),
    });
  });

  it("rejects malformed or ambiguous choices rather than substituting a parsed or legacy answer", async () => {
    for (const choices of [
      [],
      [{ message: { content: null } }],
      [{ message: { content: "{}" } }, { message: { content: "{}" } }],
    ]) {
      modelRun.mockResolvedValue({
        choices,
        response: JSON.stringify(CASES[0].expected),
      });
      const result = await infer(env, CASES[0], "A", "Extract.");
      expect(result).toMatchObject({
        raw: "",
        parsed: null,
        providerModel: null,
        error: expect.stringContaining("unreadable"),
      });
    }
    modelRun.mockResolvedValue({
      response: JSON.stringify(CASES[0].expected),
      model: "a".repeat(201),
    });
    const legacy = await infer(env, CASES[0], "A", "Extract.");
    expect(legacy).toMatchObject({
      raw: JSON.stringify(CASES[0].expected),
      error: null,
      providerModel: null,
      grade: { passed: true },
    });
  });

  it("sends both prompts the same settings and only the source text, then persists untouched output", async () => {
    const run = await createRun(db, owner, input());
    const response = await send(`/api/runs/${run.id}/step`, "POST", {});
    expect(response.status).toBe(200);
    const after = (await response.json()) as ExperimentRun;
    expect(modelRun).toHaveBeenCalledTimes(2);
    expect(after.completed).toBe(1);
    expect(after.results).toHaveLength(2);
    expect(after.results[0]).toMatchObject({
      raw: JSON.stringify(CASES[0].expected),
      inputTokens: 50,
      outputTokens: 20,
      error: null,
    });
    for (const [model, payload] of modelRun.mock.calls) {
      expect(model).toBe(MODEL);
      expect(payload).toMatchObject(MODEL_SETTINGS);
      expect(payload.messages[0]).toEqual({
        role: "system",
        content: SYSTEM_PROMPT,
      });
      expect(payload.messages[1].content).toContain(
        JSON.stringify(CASES[0].text),
      );
      expect(payload.messages[1].content).not.toContain(
        JSON.stringify(CASES[0].expected),
      );
    }
    const saved = await getRun(db, owner, run.id);
    expect(saved.results).toEqual(after.results);
    expect(
      (
        await db
          .prepare("SELECT calls FROM daily_attempts")
          .first<{ calls: number }>()
      )?.calls,
    ).toBe(2);
  });

  it("charges a case once even when concurrent requests arrive during inference", async () => {
    const run = await createRun(db, owner, input());
    let resolve!: (value: { response: string }) => void;
    const provider = new Promise<{ response: string }>((done) => {
      resolve = done;
    });
    modelRun.mockReturnValue(provider);
    const first = stepRun(env, owner, run.id);
    await vi.waitFor(() => expect(modelRun).toHaveBeenCalledTimes(2));
    const pending = await stepRun(env, owner, run.id);
    expect(pending.completed).toBe(0);
    expect(pending.status).toBe("running");
    expect(modelRun).toHaveBeenCalledTimes(2);
    resolve({ response: JSON.stringify(CASES[0].expected) });
    expect((await first).completed).toBe(1);
    expect(
      (
        await db
          .prepare("SELECT calls FROM daily_attempts")
          .first<{ calls: number }>()
      )?.calls,
    ).toBe(2);
  });

  it("records model failure without retry, fabricated output, or a scored success", async () => {
    const run = await createRun(db, owner, input());
    modelRun.mockRejectedValueOnce(new Error("provider unavailable"));
    modelRun.mockResolvedValueOnce({ response: "not json" });
    const after = await stepRun(env, owner, run.id);
    expect(modelRun).toHaveBeenCalledTimes(2);
    expect(after.results[0]).toMatchObject({
      raw: "",
      parsed: null,
      inputTokens: null,
      error: expect.any(String),
    });
    expect(after.results[1]).toMatchObject({
      raw: "not json",
      error: null,
      grade: { valid: false, passed: false },
    });
  });

  it("settles a stale pending case as interrupted without rerunning or releasing its reservation", async () => {
    const run = await createRun(db, owner, input());
    await db
      .prepare(
        `INSERT INTO steps(run_id, case_index, status, lease_token, started_at, quota_day) VALUES (?, 0, 'pending', ?, ?, ?)`,
      )
      .bind(
        run.id,
        crypto.randomUUID(),
        Date.now() - 61_000,
        new Date().toISOString().slice(0, 10),
      )
      .run();
    const after = await stepRun(env, owner, run.id);
    expect(after.completed).toBe(1);
    expect(
      after.results.every((result) => result.error?.includes("interrupted")),
    ).toBe(true);
    expect(modelRun).not.toHaveBeenCalled();
    expect(
      (
        await db
          .prepare("SELECT calls FROM daily_attempts")
          .first<{ calls: number }>()
      )?.calls,
    ).toBe(2);
  });

  it("completes ten cases and never makes an eleventh pair of calls", async () => {
    const run = await createRun(db, owner, input());
    let last = run;
    for (let i = 0; i < 12; i++) last = await stepRun(env, owner, run.id);
    expect(last.status).toBe("complete");
    expect(last.completed).toBe(10);
    expect(last.results).toHaveLength(20);
    expect(modelRun).toHaveBeenCalledTimes(20);
  });

  it("bounds an unresponsive model and aborts without automatic retries", async () => {
    vi.useFakeTimers();
    try {
      modelRun.mockImplementation(() => new Promise(() => {}));
      const pending = infer(env, CASES[0], "A", "Extract.");
      await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS + 1);
      const result = await pending;
      expect(result.error).toContain("too long");
      expect(modelRun).toHaveBeenCalledTimes(1);
      expect(modelRun.mock.calls[0][2].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
