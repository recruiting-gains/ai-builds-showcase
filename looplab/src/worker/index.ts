import {
  DEFAULT_PROMPT_A,
  DEFAULT_PROMPT_B,
  MAX_PROMPT_LENGTH,
  MODEL,
  type ExperimentConfig,
} from "../shared/contracts";
import { CASES, CORPUS_HASH, CORPUS_VERSION } from "../shared/corpus";
import { EXPERIMENT_FINGERPRINT, getProvenance } from "../shared/experiment";
import { createRun, getRun, stepRun, type CreateInput } from "./store";
import {
  HttpError,
  protect,
  readObject,
  requireSameOrigin,
  session,
  sha256,
  UUID_PATTERN,
} from "./http";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const path = new URL(request.url).pathname;
    const api = path === "/api" || path.startsWith("/api/");
    try {
      const response = api
        ? await handleApi(request, env, path)
        : await serveAsset(request, env);
      return protect(response, requestId, api);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      const message =
        error instanceof HttpError
          ? error.message
          : "LoopLab could not complete that request. An attempt may still be in progress; resume shortly to retrieve saved results.";
      if (!(error instanceof HttpError))
        console.error(
          JSON.stringify({ event: "request_failed", requestId, path, status }),
        );
      const headers: Record<string, string> = {};
      if (status === 429) headers["Retry-After"] = "60";
      return protect(
        Response.json({ error: message, requestId }, { status, headers }),
        requestId,
        true,
      );
    }
  },
} satisfies ExportedHandler<Env>;

async function serveAsset(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  return env.ASSETS.fetch(request);
}

async function handleApi(
  request: Request,
  env: Env,
  path: string,
): Promise<Response> {
  if (path === "/api/health") {
    allowMethod(request, "GET");
    const result = await env.DB.prepare(
      "SELECT COUNT(*) AS ready FROM sqlite_master WHERE type = ? AND name IN (?, ?, ?)",
    )
      .bind("table", "runs", "steps", "daily_attempts")
      .first<{ ready: number }>();
    if (result?.ready !== 3)
      throw new HttpError(503, "The experiment database is not ready.");
    await env.DB.prepare("SELECT experiment_version FROM runs LIMIT 0").all();
    return Response.json({
      status: "ok",
      database: "ready",
      model: MODEL,
      corpusVersion: CORPUS_VERSION,
      corpusHash: CORPUS_HASH,
      experimentVersion: EXPERIMENT_FINGERPRINT,
    });
  }
  if (path === "/api/config") {
    allowMethod(request, "GET");
    const owner = await session(request, true);
    const config: ExperimentConfig = {
      cases: CASES,
      promptA: DEFAULT_PROMPT_A,
      promptB: DEFAULT_PROMPT_B,
      model: MODEL,
      corpusVersion: CORPUS_VERSION,
      corpusHash: CORPUS_HASH,
      maxPromptLength: MAX_PROMPT_LENGTH,
      experimentVersion: EXPERIMENT_FINGERPRINT,
      provenance: getProvenance(),
    };
    return Response.json(config, {
      headers: owner.cookie ? { "Set-Cookie": owner.cookie } : undefined,
    });
  }
  if (path === "/api/runs") {
    allowMethod(request, "POST");
    requireSameOrigin(request);
    await rateLimit(request, env.CREATE_LIMITER, "create");
    const body = validateCreate(await readObject(request));
    const owner = await session(request);
    const run = await createRun(env.DB, owner.hash, body);
    return Response.json(run, { status: 201 });
  }
  const match = path.match(/^\/api\/runs\/([0-9a-f-]+)(\/step)?$/i);
  if (match && UUID_PATTERN.test(match[1])) {
    if (match[2]) {
      allowMethod(request, "POST");
      requireSameOrigin(request);
      await rateLimit(request, env.STEP_LIMITER, "step");
      const body = await readObject(request);
      if (Object.keys(body).length !== 0)
        throw new HttpError(
          400,
          "The next case is selected by the experiment, not the request.",
        );
      const owner = await session(request);
      return Response.json(await stepRun(env, owner.hash, match[1]));
    }
    allowMethod(request, "GET");
    const owner = await session(request);
    return Response.json(await getRun(env.DB, owner.hash, match[1]));
  }
  throw new HttpError(404, "That LoopLab endpoint does not exist.");
}

function allowMethod(request: Request, method: string): void {
  if (request.method !== method)
    throw new HttpError(405, `Use ${method} for this endpoint.`);
}

function validateCreate(body: Record<string, unknown>): CreateInput {
  const keys = Object.keys(body).sort();
  if (keys.join(",") !== "idempotencyKey,promptA,promptB")
    throw new HttpError(
      400,
      "Supply only promptA, promptB, and idempotencyKey.",
    );
  const { promptA, promptB, idempotencyKey } = body;
  if (
    typeof promptA !== "string" ||
    typeof promptB !== "string" ||
    !promptA.trim() ||
    !promptB.trim() ||
    promptA.length > MAX_PROMPT_LENGTH ||
    promptB.length > MAX_PROMPT_LENGTH ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(promptA + promptB)
  ) {
    throw new HttpError(
      400,
      `Each prompt must contain 1–${MAX_PROMPT_LENGTH} characters of readable text.`,
    );
  }
  if (typeof idempotencyKey !== "string" || !UUID_PATTERN.test(idempotencyKey))
    throw new HttpError(400, "Use a fresh UUID for this experiment request.");
  return { promptA: promptA.trim(), promptB: promptB.trim(), idempotencyKey };
}

async function rateLimit(
  request: Request,
  limiter: RateLimit,
  scope: string,
): Promise<void> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local-development";
  // Cloudflare supplies the IP in production. Only its digest reaches the
  // limiter; we never store raw IP addresses in experiment rows or logs.
  const result = await limiter.limit({ key: `${scope}:${await sha256(ip)}` });
  if (!result.success)
    throw new HttpError(
      429,
      "A few too many requests arrived together. Wait a minute, then resume.",
    );
}
