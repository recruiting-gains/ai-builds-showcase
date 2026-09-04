export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const COOKIE_NAME = "__Host-looplab-session";
export const LOCAL_COOKIE_NAME = "looplab-session";
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 14_000;

export function protect(
  response: Response,
  requestId: string,
  api: boolean,
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
  headers.set("X-Request-Id", requestId);
  if (api) headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function requireSameOrigin(request: Request): void {
  const url = new URL(request.url);
  if (request.headers.get("Origin") !== url.origin)
    throw new HttpError(
      403,
      "Open LoopLab in its own browser tab to run an experiment.",
    );
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin" && site !== "none")
    throw new HttpError(403, "Cross-site requests are not allowed.");
}

export async function readObject(
  request: Request,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    throw new HttpError(415, "Send the experiment as JSON.");
  }
  const declaredLength = request.headers.get("Content-Length");
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)
  ) {
    throw new HttpError(413, "The experiment request is too large.");
  }
  if (!request.body)
    throw new HttpError(400, "The experiment request is empty.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let raw = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "The experiment request is too large.");
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) throw new Error("not an object");
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "The experiment request contains invalid JSON.");
  } finally {
    reader.releaseLock();
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function session(
  request: Request,
  create = false,
): Promise<{ hash: string; cookie: string | null }> {
  const secure = new URL(request.url).protocol === "https:";
  const name = secure ? COOKIE_NAME : LOCAL_COOKIE_NAME;
  const tokens = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((part) => part.trim());
  const matches = tokens.filter((part) => part.startsWith(`${name}=`));
  const supplied =
    matches.length === 1 ? matches[0].slice(name.length + 1) : "";
  if (/^[0-9a-f]{64}$/.test(supplied))
    return { hash: await sha256(supplied), cookie: null };
  if (!create)
    throw new HttpError(
      401,
      "Your session is missing. Reload the page to start a new experiment.",
    );
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return {
    hash: await sha256(token),
    cookie: `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure ? "; Secure" : ""}`,
  };
}
