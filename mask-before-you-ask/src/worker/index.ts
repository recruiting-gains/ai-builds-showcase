import { MASKING_POLICY } from "../shared/contracts";

export interface Env {
  ASSETS: Pick<Fetcher, "fetch">;
}

type ErrorCode =
  | "BODY_NOT_ALLOWED"
  | "INTERNAL_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "NOT_FOUND"
  | "QUERY_NOT_ALLOWED";

interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
  };
}

const API_SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

const DOCUMENT_SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "manifest-src 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "worker-src 'self'",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

const HEALTH_RESPONSE = {
  status: "ok",
  service: "mask-before-you-ask",
  processing: "browser-only",
  persistence: "none",
} as const;

function apiHeaders(requestId: string): Headers {
  return new Headers({
    ...API_SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "X-Request-ID": requestId,
  });
}

function jsonResponse(value: unknown, requestId: string, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: apiHeaders(requestId),
  });
}

function errorResponse(
  requestId: string,
  status: number,
  code: ErrorCode,
  message: string,
  allow?: string,
): Response {
  const payload: ApiErrorResponse = {
    error: { code, message, requestId },
  };
  const response = jsonResponse(payload, requestId, status);
  if (allow) response.headers.set("Allow", allow);
  return response;
}

function safeMethod(method: string): string {
  return ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"].includes(method)
    ? method
    : "OTHER";
}

function validateMetadataRequest(request: Request, url: URL, requestId: string): Response | null {
  if (request.method !== "GET") {
    return errorResponse(
      requestId,
      405,
      "METHOD_NOT_ALLOWED",
      "This read-only endpoint accepts GET requests only.",
      "GET",
    );
  }

  if (url.search.length > 0) {
    return errorResponse(
      requestId,
      400,
      "QUERY_NOT_ALLOWED",
      "This endpoint does not accept query information.",
    );
  }

  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (request.body !== null || (Number.isFinite(declaredLength) && declaredLength > 0)) {
    return errorResponse(
      requestId,
      400,
      "BODY_NOT_ALLOWED",
      "This endpoint does not accept request content.",
    );
  }

  return null;
}

function handleApi(request: Request, url: URL, requestId: string): Response {
  const validationError = validateMetadataRequest(request, url, requestId);
  if (validationError) return validationError;

  if (url.pathname === "/api/health") return jsonResponse(HEALTH_RESPONSE, requestId);
  if (url.pathname === "/api/policy") return jsonResponse(MASKING_POLICY, requestId);
  return errorResponse(requestId, 404, "NOT_FOUND", "That API endpoint does not exist.");
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
    if (url.pathname.startsWith("/api/")) return handleApi(request, url, requestId);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return errorResponse(
        requestId,
        405,
        "METHOD_NOT_ALLOWED",
        "Static pages accept GET and HEAD requests only.",
        "GET, HEAD",
      );
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withDocumentHeaders(assetResponse, url.pathname);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "request_failed",
        requestId,
        method: safeMethod(request.method),
        scope: url.pathname.startsWith("/api/") ? "api" : "asset",
        errorClass: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The service could not complete this request.",
    );
  }
}

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>;
