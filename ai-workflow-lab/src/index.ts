import {
  CONTENT_SCHEMA,
  MEETING_SCHEMA,
  type ContentResult,
  type MeetingExtraction,
  type MeetingResult
} from "./contracts";
import { buildFollowUpEmail } from "./formatters";
import { buildContentMessages, buildMeetingMessages } from "./prompts";
import {
  isContentResult,
  isMeetingExtraction,
  normalizePlainText,
  parseContentInput,
  parseMeetingInput,
  parseModelPayload,
  RequestError
} from "./validation";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as const;
export const MAX_REQUEST_BYTES = 30_000;

type ApiPayload = Record<string, unknown> | unknown[] | string | number | boolean | null;

function jsonResponse(
  payload: ApiPayload,
  status: number,
  requestId: string
): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Request-ID": requestId
    }
  });
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new RequestError("Content-Type must be application/json.", 415);
  }

  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null && (!/^\d+$/.test(lengthHeader) || !Number.isSafeInteger(Number(lengthHeader)))) {
    throw new RequestError("Request length is invalid.");
  }
  if (lengthHeader !== null && Number(lengthHeader) > MAX_REQUEST_BYTES) {
    throw new RequestError("Request is too large.", 413);
  }
  if (!request.body) throw new RequestError("Request body must be valid JSON.");
  // A declared length is only an early rejection. Stop consuming actual bytes
  // before buffering an unbounded or chunked request into Worker memory.
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        throw new RequestError("Request is too large.", 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof RequestError) throw error;
    throw new RequestError("Request body must be valid JSON.");
  } finally {
    reader.releaseLock();
  }
}

function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  const site = request.headers.get("Sec-Fetch-Site");
  if ((origin && origin !== new URL(request.url).origin) ||
      (site && !["same-origin", "none"].includes(site))) {
    throw new RequestError("Use the controls on this website to run a workflow.", 403);
  }
}

async function requireWorkflowAllowance(request: Request, env: Env): Promise<void> {
  // Both workflows share a limit. Cloudflare supplies this header at the edge;
  // browser-controlled IDs would let anonymous clients choose fresh quotas.
  const address = request.headers.get("CF-Connecting-IP") ?? "local-development";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  const key = "workflow:" + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let allowed = false;
  try {
    allowed = (await env.WORKFLOW_RATE_LIMITER.limit({ key })).success === true;
  } catch {
    // A missing or unavailable limiter must never silently expose paid inference.
    throw new RequestError("The workflow safety limit is temporarily unavailable. Please try again later.", 503);
  }
  if (!allowed) {
    throw new RequestError("Too many workflows were requested. Wait one minute and try again.", 429);
  }
}

async function runMeeting(request: Request, env: Env): Promise<MeetingResult> {
  const input = parseMeetingInput(await readJson(request));
  const modelResult = await env.AI.run(
    MODEL,
    {
      messages: buildMeetingMessages(input),
      max_tokens: 900,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: MEETING_SCHEMA
      }
    },
    {
      signal: AbortSignal.timeout(45_000),
      tags: ["ai-workflow-lab", "meeting-plan"]
    }
  );

  const parsed = parseModelPayload(
    (modelResult as unknown as { response?: unknown }).response
  );
  if (!isMeetingExtraction(parsed)) {
    console.warn(
      JSON.stringify({
        event: "schema_mismatch",
        workflow: "meeting-plan",
        // Never record provider-controlled property names: they can echo input.
        resultType: Array.isArray(parsed) ? "array" : typeof parsed
      })
    );
    throw new Error("The AI response did not match the meeting schema.");
  }
  const extraction: MeetingExtraction = {
    title: normalizePlainText(parsed.title),
    summary: normalizePlainText(parsed.summary),
    decisions: parsed.decisions.map(normalizePlainText),
    actionItems: parsed.actionItems.map((item) => ({
      task: normalizePlainText(item.task),
      owner: normalizePlainText(item.owner),
      dueDate: normalizePlainText(item.dueDate)
    }))
  };
  return {
    ...extraction,
    followUpEmail: buildFollowUpEmail(extraction)
  };
}

async function runRepurposer(request: Request, env: Env): Promise<ContentResult> {
  const input = parseContentInput(await readJson(request));
  const modelResult = await env.AI.run(
    MODEL,
    {
      messages: buildContentMessages(input),
      max_tokens: 1800,
      temperature: 0.45,
      response_format: {
        type: "json_schema",
        json_schema: CONTENT_SCHEMA
      }
    },
    {
      signal: AbortSignal.timeout(45_000),
      tags: ["ai-workflow-lab", "content-repurposer"]
    }
  );

  const parsed = parseModelPayload(
    (modelResult as unknown as { response?: unknown }).response
  );
  if (!isContentResult(parsed)) {
    console.warn(
      JSON.stringify({
        event: "schema_mismatch",
        workflow: "content-repurposer",
        resultType: Array.isArray(parsed) ? "array" : typeof parsed
      })
    );
    throw new Error("The AI response did not match the content schema.");
  }
  return {
    ...parsed,
    coreMessage: normalizePlainText(parsed.coreMessage),
    linkedinPost: normalizePlainText(parsed.linkedinPost),
    shortThread: parsed.shortThread.map(normalizePlainText),
    newsletterBlurb: normalizePlainText(parsed.newsletterBlurb),
    titleIdeas: parsed.titleIdeas.map(normalizePlainText)
  };
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const startedAt = Date.now();

  if (request.method === "GET" && url.pathname === "/api/health") {
    return jsonResponse(
      {
        ok: true,
        service: "AI Workflow Lab",
        workflows: ["meeting-plan", "content-repurposer"]
      },
      200,
      requestId
    );
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, requestId);
  }

  try {
    requireSameOrigin(request);
    if (url.pathname !== "/api/meeting-plan" && url.pathname !== "/api/repurpose") {
      return jsonResponse({ error: "API route not found." }, 404, requestId);
    }
    await requireWorkflowAllowance(request, env);
    let result: MeetingResult | ContentResult;
    let workflow: string;

    if (url.pathname === "/api/meeting-plan") {
      workflow = "meeting-plan";
      result = await runMeeting(request, env);
    } else if (url.pathname === "/api/repurpose") {
      workflow = "content-repurposer";
      result = await runRepurposer(request, env);
    } else {
      return jsonResponse({ error: "API route not found." }, 404, requestId);
    }

    console.log(
      JSON.stringify({
        event: "workflow_completed",
        workflow,
        requestId,
        durationMs: Date.now() - startedAt
      })
    );
    return jsonResponse({ data: result }, 200, requestId);
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 502;
    const message =
      error instanceof RequestError
        ? error.message
        : "The AI workflow could not finish. Please try again.";

    console.error(
      JSON.stringify({
        event: "workflow_failed",
        requestId,
        route: url.pathname,
        status,
        durationMs: Date.now() - startedAt,
        // Provider messages may echo submitted content. Log classification only.
        error: error instanceof RequestError ? "request_rejected" : "upstream_or_internal_failure"
      })
    );
    const response = jsonResponse({ error: message }, status, requestId);
    if (status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
