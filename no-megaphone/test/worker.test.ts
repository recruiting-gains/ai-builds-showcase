import { describe, expect, it, vi } from "vitest";

import { API_LIMITS } from "../src/shared/contracts";
import { scoreConversation } from "../src/shared/scoring";
import { handleRequest, type Env } from "../src/worker/index";
import { IDEAL_INPUT } from "./fixtures";

function mockEnv(response?: Response): Env {
  return {
    ASSETS: {
      fetch: vi.fn(
        async () =>
          response ??
          new Response("<h1>NO MEGAPHONE</h1>", {
            headers: { "Content-Type": "text/html" },
          }),
      ),
    },
  };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("health endpoint", () => {
  it("returns a no-persistence health contract with defensive headers", async () => {
    const response = await handleRequest(new Request("https://example.com/api/health"), mockEnv());
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "ok",
      service: "no-megaphone",
      scoringModel: "1.0",
      persistence: "none",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects non-GET methods consistently", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/health", { method: "POST" }),
      mockEnv(),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await json(response)).toMatchObject({ error: { code: "METHOD_NOT_ALLOWED" } });
  });
});

describe("scoring endpoint", () => {
  it("returns the same deterministic result as the shared engine", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://example.com" },
        body: JSON.stringify(IDEAL_INPUT),
      }),
      mockEnv(),
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      result: scoreConversation(IDEAL_INPUT),
      meta: { notStored: true, deterministic: true },
    });
  });

  it.each([
    [new Request("https://example.com/api/score"), 405, "METHOD_NOT_ALLOWED"],
    [
      new Request("https://example.com/api/score", { method: "POST", body: "{}" }),
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    ],
    [
      new Request("https://example.com/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/jsonp" },
        body: JSON.stringify(IDEAL_INPUT),
      }),
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    ],
    [
      new Request("https://example.com/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{broken",
      }),
      400,
      "INVALID_JSON",
    ],
    [
      new Request("https://example.com/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
        body: JSON.stringify(IDEAL_INPUT),
      }),
      403,
      "CROSS_ORIGIN_REQUEST",
    ],
    [
      new Request("https://example.com/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
        body: JSON.stringify(IDEAL_INPUT),
      }),
      403,
      "CROSS_ORIGIN_REQUEST",
    ],
  ] as const)(
    "returns a structured error for invalid request %#",
    async (request, status, code) => {
      const response = await handleRequest(request, mockEnv());
      expect(response.status).toBe(status);
      expect(await json(response)).toMatchObject({ error: { code } });
      expect(response.headers.get("content-type")).toContain("application/json");
    },
  );

  it("rejects declared and streamed bodies beyond the byte cap", async () => {
    const declared = await handleRequest(
      new Request("https://example.com/api/score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(API_LIMITS.maxBodyBytes + 1),
        },
        body: "{}",
      }),
      mockEnv(),
    );
    expect(declared.status).toBe(413);

    const streamed = await handleRequest(
      new Request("https://example.com/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oversized: "x".repeat(API_LIMITS.maxBodyBytes) }),
      }),
      mockEnv(),
    );
    expect(streamed.status).toBe(413);
    expect(await json(streamed)).toMatchObject({ error: { code: "BODY_TOO_LARGE" } });
  });

  it("rejects fields the product is forbidden to collect", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...IDEAL_INPUT, username: "person123" }),
      }),
      mockEnv(),
    );
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: { code: "INVALID_FIELDS" } });
  });
});

describe("routing and assets", () => {
  it("returns JSON for unknown API paths", async () => {
    const response = await handleRequest(new Request("https://example.com/api/missing"), mockEnv());
    expect(response.status).toBe(404);
    expect(await json(response)).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it.each([
    ["/read-the-room", "/#read-the-room"],
    ["/rules-first", "/#rules-first"],
    ["/privacy", "/#privacy-title"],
  ])("redirects the %s deep link", async (path, destination) => {
    const response = await handleRequest(new Request(`https://example.com${path}`), mockEnv());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://example.com${destination}`);
  });

  it("adds document security headers and safe cache behavior to assets", async () => {
    const response = await handleRequest(new Request("https://example.com/"), mockEnv());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("gives fingerprinted assets immutable caching", async () => {
    const response = await handleRequest(
      new Request("https://example.com/assets/main-ABC123.js"),
      mockEnv(new Response("export {}", { headers: { "Content-Type": "text/javascript" } })),
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("does not expose internal asset errors", async () => {
    const env: Env = {
      ASSETS: {
        fetch: vi.fn(async () => {
          throw new Error("secret internal detail");
        }),
      },
    };
    const response = await handleRequest(new Request("https://example.com/"), env);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await json(response))).not.toContain("secret internal detail");
  });
});
