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
const MAX_REQUEST_BYTES = 30_000;

type ApiPayload = Record<string, unknown> | unknown[] | string | number | boolean | null;

function describePayloadShape(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { result: Array.isArray(value) ? "array:" + value.length : typeof value };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => {
      if (Array.isArray(field)) {
        return [key, "array:" + field.length];
      }
      if (typeof field === "string") {
        return [key, "string:" + field.length];
      }
      return [key, typeof field];
    })
  );
}

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
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new RequestError("Content-Type must be application/json.", 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestError("Request is too large.", 413);
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    throw new RequestError("Request is too large.", 413);
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RequestError("Request body must be valid JSON.");
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
        shape: describePayloadShape(parsed)
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
        shape: describePayloadShape(parsed)
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
        error: error instanceof Error ? error.message : "Unknown error"
      })
    );
    return jsonResponse({ error: message }, status, requestId);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
