import { scenarios, sampleScenario } from "../shared/scenarios";
import {
  clearCookie,
  fingerprint,
  issueSession,
  readSession,
  requireOrigin,
  sameSecret,
} from "./auth";
import { HttpError, readJson, validateBatch } from "./protocol";
export { SignalRoom } from "./room";

const securityHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};
function json(
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(value, {
    status,
    headers: { ...securityHeaders, ...extra },
  });
}
function privateReady(env: Env) {
  return Boolean(
    env.INGEST_SECRET &&
    env.VIEWER_SECRET &&
    env.SESSION_SECRET &&
    env.INGEST_SECRET.length >= 32 &&
    env.VIEWER_SECRET.length >= 32 &&
    env.SESSION_SECRET.length >= 32 &&
    new Set([env.INGEST_SECRET, env.VIEWER_SECRET, env.SESSION_SECRET]).size ===
      3,
  );
}
function method(request: Request, expected: string) {
  if (request.method !== expected) throw new HttpError(405, `Use ${expected}.`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
      if (url.pathname === "/api/health") {
        method(request, "GET");
        return json({
          status: "ok",
          service: "ReTrace",
          version: "1.0.0",
          demo: "simulation",
          privateStream: privateReady(env) ? "configured" : "unconfigured",
        });
      }
      if (url.pathname === "/api/scenarios") {
        method(request, "GET");
        return json({ scenarios });
      }
      if (url.pathname.startsWith("/api/scenarios/")) {
        method(request, "GET");
        const scenario = scenarios.find(
          (item) => item.id === url.pathname.slice("/api/scenarios/".length),
        );
        if (!scenario) throw new HttpError(404, "Scenario not found.");
        return json({
          scenario,
          sourceKind: "simulation",
          samples: Array.from(
            { length: Math.round(scenario.duration * 10) + 1 },
            (_, index) => sampleScenario(scenario.id, index / 10),
          ),
        });
      }
      if (
        !["/api/login", "/api/logout", "/api/ingest", "/api/stream"].includes(
          url.pathname,
        )
      )
        throw new HttpError(404, "Endpoint not found.");
      if (!privateReady(env))
        throw new HttpError(
          503,
          "The private sensor interface has not been configured.",
        );
      const room = env.SIGNAL_ROOM.getByName("private-room-v1");
      if (url.pathname === "/api/ingest") {
        method(request, "POST");
        const authorization = request.headers.get("authorization") ?? "";
        if (
          authorization.length > 1024 ||
          !authorization.startsWith("Bearer ") ||
          !(await sameSecret(authorization.slice(7), env.INGEST_SECRET!))
        )
          throw new HttpError(401, "Invalid ingest credentials.");
        const result = await room.ingest(
          validateBatch(await readJson(request)),
        );
        if (result.error)
          throw new HttpError(
            result.status ?? 400,
            result.error,
            result.retryAfter,
          );
        return json(result);
      }
      requireOrigin(request);
      if (url.pathname === "/api/login") {
        method(request, "POST");
        const rate = await room.loginAttempt(
          await fingerprint(
            request.headers.get("CF-Connecting-IP") ?? "local",
            env.SESSION_SECRET!,
          ),
        );
        if (!rate.allowed)
          throw new HttpError(429, "Too many login attempts.", rate.retryAfter);
        const body = await readJson(request, 2048);
        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Object.keys(body).some((key) => key !== "secret") ||
          typeof (body as { secret?: unknown }).secret !== "string"
        )
          throw new HttpError(400, "A viewer secret is required.");
        if (
          !(await sameSecret(
            (body as { secret: string }).secret,
            env.VIEWER_SECRET!,
          ))
        )
          throw new HttpError(401, "Invalid viewer credentials.");
        const { session, cookie } = await issueSession(env.SESSION_SECRET!);
        return json(
          { expiresAt: new Date(session.expires * 1000).toISOString() },
          200,
          { "Set-Cookie": cookie },
        );
      }
      if (url.pathname === "/api/logout") {
        method(request, "POST");
        const session = await readSession(request, env.SESSION_SECRET!);
        if (session) await room.revoke(session);
        return json({ signedOut: true }, 200, { "Set-Cookie": clearCookie() });
      }
      method(request, "GET");
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
        throw new HttpError(426, "WebSocket upgrade required.");
      const session = await readSession(request, env.SESSION_SECRET!);
      if (!session || (await room.isRevoked(session.id)))
        throw new HttpError(401, "Viewer login required.");
      return await room.fetch(
        new Request("https://retrace.internal/stream", {
          headers: {
            Upgrade: "websocket",
            "X-Retrace-Session": JSON.stringify(session),
          },
        }),
      );
    } catch (error) {
      if (error instanceof HttpError)
        return json(
          { error: error.message },
          error.status,
          error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {},
        );
      console.error(
        JSON.stringify({
          event: "request_failed",
          route: url.pathname.startsWith("/api/") ? "api" : "asset",
        }),
      );
      return json({ error: "The service is temporarily unavailable." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
