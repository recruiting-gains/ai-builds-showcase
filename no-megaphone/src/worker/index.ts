import { API_LIMITS, type ApiErrorResponse, type ScoreResponse } from "../shared/contracts";
import { scoreConversation } from "../shared/scoring";
import { parseScoreInput, ValidationError } from "../shared/validation";

export interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

const DOCUMENT_SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

const DEEP_LINKS: Readonly<Record<string, string>> = {
  "/read-the-room": "/#read-the-room",
  "/rules-first": "/#rules-first",
  "/privacy": "/#privacy-title",
};

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
  const body: ApiErrorResponse = { error: { code, message, requestId } };
  return jsonResponse(body, requestId, status, extraHeaders);
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > API_LIMITS.maxBodyBytes) {
    throw new HttpError(413, "BODY_TOO_LARGE", "The checklist request is too large.");
  }

  if (!request.body) {
    throw new HttpError(400, "EMPTY_BODY", "Send the completed checklist as JSON.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > API_LIMITS.maxBodyBytes) {
      await reader.cancel("Request exceeded the allowed size.");
      throw new HttpError(413, "BODY_TOO_LARGE", "The checklist request is too large.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "The checklist request is not valid JSON.");
  }
}

function validateSameOrigin(request: Request): void {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");

  if ((origin && origin !== url.origin) || fetchSite === "cross-site") {
    throw new HttpError(403, "CROSS_ORIGIN_REQUEST", "Use the checklist on this website.");
  }
}

async function handleScore(request: Request, requestId: string): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(requestId, 405, "METHOD_NOT_ALLOWED", "Use POST to score a checklist.", {
      Allow: "POST",
    });
  }

  validateSameOrigin(request);
  const contentType = request.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the checklist as JSON.");
  }

  const input = parseScoreInput(await readBoundedJson(request));
  const body: ScoreResponse = {
    result: scoreConversation(input),
    meta: { requestId, notStored: true, deterministic: true },
  };
  return jsonResponse(body, requestId);
}

function handleHealth(request: Request, requestId: string): Response {
  if (request.method !== "GET") {
    return errorResponse(requestId, 405, "METHOD_NOT_ALLOWED", "Use GET to check service health.", {
      Allow: "GET",
    });
  }

  return jsonResponse(
    {
      status: "ok",
      service: "no-megaphone",
      scoringModel: "1.0",
      persistence: "none",
    },
    requestId,
  );
}

function withDocumentHeaders(response: Response, pathname: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(DOCUMENT_SECURITY_HEADERS)) headers.set(key, value);

  headers.set(
    "Cache-Control",
    pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache, no-store, must-revalidate",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);

  try {
    if (url.pathname === "/api/health") return handleHealth(request, requestId);
    if (url.pathname === "/api/score") return await handleScore(request, requestId);
    if (url.pathname.startsWith("/api/")) {
      return errorResponse(requestId, 404, "NOT_FOUND", "That API endpoint does not exist.");
    }

    const deepLink = DEEP_LINKS[url.pathname];
    if ((request.method === "GET" || request.method === "HEAD") && deepLink) {
      const destination = new URL(deepLink, url.origin);
      return withDocumentHeaders(
        new Response(null, { status: 302, headers: { Location: destination.toString() } }),
        url.pathname,
      );
    }

    return withDocumentHeaders(await env.ASSETS.fetch(request), url.pathname);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof HttpError) {
      return errorResponse(requestId, error.status, error.code, error.message);
    }

    console.error(
      JSON.stringify({
        event: "request_failed",
        requestId,
        method: request.method,
        path: url.pathname,
        errorClass: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The service could not complete this check.",
    );
  }
}

export default {
  fetch: handleRequest,
};
