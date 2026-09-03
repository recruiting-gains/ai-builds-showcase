import {
  INPUT_LIMITS,
  type ApiErrorResponse,
  type GenerateResponse,
  type VisualPlan,
} from "../shared/contracts";
import {
  parseGenerateRequest,
  parseVisualPlan,
  ValidationError,
} from "../shared/validation";
import { buildMessages, VISUAL_PLAN_SCHEMA } from "./prompt";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as const;

const DOCUMENT_SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy":
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

class HttpError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function apiHeaders(requestId: string): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Content-Type": "application/json; charset=utf-8",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": requestId,
  });
}

function jsonResponse(
  value: unknown,
  requestId: string,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  const headers = apiHeaders(requestId);
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((headerValue, key) => {
      headers.set(key, headerValue);
    });
  }

  return new Response(JSON.stringify(value), { status, headers });
}

function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  extraHeaders?: HeadersInit,
): Response {
  const body: ApiErrorResponse = {
    error: { code, message, requestId },
  };
  return jsonResponse(body, requestId, status, extraHeaders);
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > INPUT_LIMITS.maxBodyBytes
  ) {
    throw new HttpError(
      413,
      "BODY_TOO_LARGE",
      "That request is too large. Shorten the explanation and try again.",
    );
  }

  if (!request.body) {
    throw new HttpError(400, "EMPTY_BODY", "Add some text and try again.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > INPUT_LIMITS.maxBodyBytes) {
      await reader.cancel("Request body exceeded the allowed size.");
      throw new HttpError(
        413,
        "BODY_TOO_LARGE",
        "That request is too large. Shorten the explanation and try again.",
      );
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new HttpError(
      400,
      "INVALID_JSON",
      "The request could not be read. Refresh the page and try again.",
    );
  }
}

function parseModelValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function generateWithModel(
  env: Env,
  request: ReturnType<typeof parseGenerateRequest>,
): Promise<VisualPlan | null> {
  const modelInput = {
    messages: buildMessages(request),
    max_tokens: 1_200,
    stream: false,
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: VISUAL_PLAN_SCHEMA,
    },
  } as const;

  const output = await env.AI.run(MODEL, modelInput);

  const responseValue: unknown =
    typeof output === "string"
      ? output
      : output && typeof output === "object" && "response" in output
        ? output.response
        : null;
  return parseVisualPlan(parseModelValue(responseValue), request.format);
}

async function generatePlan(
  env: Env,
  request: ReturnType<typeof parseGenerateRequest>,
  requestId: string,
): Promise<VisualPlan> {
  try {
    const primaryPlan = await generateWithModel(env, request);
    if (primaryPlan) return primaryPlan;

    console.log(
      JSON.stringify({
        event: "ai_output_invalid",
        requestId,
        model: MODEL,
      }),
    );
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "ai_primary_failed",
        requestId,
        model: MODEL,
        errorClass: error instanceof Error ? error.name : "UnknownError",
      }),
    );
  }

  try {
    const retryPlan = await generateWithModel(env, request);
    if (retryPlan) return retryPlan;
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "ai_retry_failed",
        requestId,
        model: MODEL,
        errorClass: error instanceof Error ? error.name : "UnknownError",
      }),
    );
  }

  throw new HttpError(
    502,
    "INVALID_AI_RESULT",
    "The first draft was incomplete. Your text is still here—please try again.",
  );
}

async function handleGenerate(
  request: Request,
  env: Env,
  requestId: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(
      requestId,
      405,
      "METHOD_NOT_ALLOWED",
      "Use the form on this page to create a visual.",
      { Allow: "POST" },
    );
  }

  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) {
    throw new HttpError(
      403,
      "CROSS_ORIGIN_REQUEST",
      "Use the form on this website to create a visual.",
    );
  }

  const contentType = request.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "The request must be sent as JSON.",
    );
  }

  const rateLimitKey = request.headers.get("CF-Connecting-IP") ?? "unknown-client";
  const rateLimit = await env.GENERATE_RATE_LIMITER.limit({ key: rateLimitKey });
  if (!rateLimit.success) {
    return errorResponse(
      requestId,
      429,
      "RATE_LIMITED",
      "Too many drafts were requested at once. Wait one minute and try again.",
      { "Retry-After": "60" },
    );
  }

  const body = await readBoundedJson(request);
  const input = parseGenerateRequest(body);
  const startedAt = Date.now();
  const plan = await generatePlan(env, input, requestId);

  console.log(
    JSON.stringify({
      event: "visual_generated",
      requestId,
      layout: plan.layout,
      inputCharacters: input.text.length,
      durationMs: Date.now() - startedAt,
    }),
  );

  const response: GenerateResponse = {
    plan,
    meta: {
      generatedAt: new Date().toISOString(),
      notStored: true,
      requestId,
    },
  };
  return jsonResponse(response, requestId);
}

function secureDocumentResponse(response: Response): Response {
  const secured = new Response(response.body, response);
  Object.entries(DOCUMENT_SECURITY_HEADERS).forEach(([key, value]) => {
    secured.headers.set(key, value);
  });
  return secured;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return errorResponse(
            requestId,
            405,
            "METHOD_NOT_ALLOWED",
            "This check only accepts GET requests.",
            { Allow: "GET, HEAD" },
          );
        }

        const response = jsonResponse(
          {
            ok: true,
          },
          requestId,
        );
        if (request.method === "HEAD") {
          return new Response(null, {
            status: response.status,
            headers: response.headers,
          });
        }
        return response;
      }

      if (url.pathname === "/api/generate") {
        return await handleGenerate(request, env, requestId);
      }

      if (url.pathname.startsWith("/api/")) {
        return errorResponse(
          requestId,
          404,
          "NOT_FOUND",
          "That API route does not exist.",
        );
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        return errorResponse(
          requestId,
          405,
          "METHOD_NOT_ALLOWED",
          "That action is not available.",
        );
      }

      const assetResponse = await env.ASSETS.fetch(request);
      return secureDocumentResponse(assetResponse);
    } catch (error) {
      if (error instanceof ValidationError || error instanceof HttpError) {
        return errorResponse(
          requestId,
          error.status,
          error.code,
          error.message,
        );
      }

      console.error(
        JSON.stringify({
          event: "unhandled_error",
          requestId,
          path: url.pathname,
          errorClass: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      return errorResponse(
        requestId,
        500,
        "INTERNAL_ERROR",
        "We could not create the visual this time. Your text is still here—please try again.",
      );
    }
  },
} satisfies ExportedHandler<Env>;
