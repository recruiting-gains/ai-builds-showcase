import { HttpError } from "./protocol";

export const SESSION_SECONDS = 30 * 60;
const COOKIE = "retrace_viewer";
const encoder = new TextEncoder();
export interface ViewerSession {
  id: string;
  expires: number;
}
const toBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) =>
    char.charCodeAt(0),
  );
async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function sameSecret(
  provided: string,
  expected: string,
): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}
export async function fingerprint(
  value: string,
  secret: string,
): Promise<string> {
  return toBase64(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await key(secret),
        encoder.encode(value),
      ),
    ),
  );
}
export function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new HttpError(403, "Same-origin request required.");
}
export async function issueSession(
  secret: string,
): Promise<{ cookie: string; session: ViewerSession }> {
  const session = {
    id: crypto.randomUUID(),
    expires: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const payload = toBase64(encoder.encode(JSON.stringify(session)));
  const signature = await fingerprint(payload, secret);
  return {
    session,
    cookie: `${COOKIE}=${payload}.${signature}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`,
  };
}
export function clearCookie() {
  return `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
export async function readSession(
  request: Request,
  secret: string,
): Promise<ViewerSession | null> {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!value || value.length > 1024) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  try {
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await key(secret),
        fromBase64(signature),
        encoder.encode(payload),
      ))
    )
      return null;
    const session = JSON.parse(
      new TextDecoder().decode(fromBase64(payload)),
    ) as ViewerSession;
    if (
      typeof session.id !== "string" ||
      !/^[0-9a-f-]{36}$/.test(session.id) ||
      !Number.isInteger(session.expires) ||
      session.expires <= Date.now() / 1000 ||
      session.expires > Date.now() / 1000 + SESSION_SECONDS + 1
    )
      return null;
    return session;
  } catch {
    return null;
  }
}
