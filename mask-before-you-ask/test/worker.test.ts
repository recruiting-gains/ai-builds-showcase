import { describe, expect, it, vi } from "vitest";

import { handleRequest, type Env } from "../src/worker/index";

function mockEnv(response?: Response): Env {
  return {
    ASSETS: {
      fetch: vi.fn(
        async () =>
          response ??
          new Response("<h1>Mask Before You Ask</h1>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
      ),
    },
  };
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

describe("read-only metadata API", () => {
  it("returns a privacy-explicit health contract with defensive headers", async () => {
    const response = await handleRequest(new Request("https://example.com/api/health"), mockEnv());

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "ok",
      service: "mask-before-you-ask",
      processing: "browser-only",
      persistence: "none",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("publishes a policy that promises no server-side text or name handling", async () => {
    const response = await handleRequest(new Request("https://example.com/api/policy"), mockEnv());

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      version: "1.0",
      execution: "browser_only",
      maxInputCodeUnits: 50_000,
      maxNamesToHide: 50,
      findingKinds: [
        "email",
        "phone",
        "ipv4",
        "ipv6",
        "date",
        "private_url",
        "account_reference",
        "payment_card",
        "custom_name",
      ],
      humanReviewRequired: true,
      serverReceivesText: false,
      storesText: false,
      guarantee: "possible_matches_only",
    });
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "rejects the %s method without reading or reflecting its body",
    async (method) => {
      const privateMarker = "Never Reflect This Person or private@example.com";
      const response = await handleRequest(
        new Request("https://example.com/api/policy", { method, body: privateMarker }),
        mockEnv(),
      );
      const responseText = await response.text();

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
      expect(responseText).toContain("METHOD_NOT_ALLOWED");
      expect(responseText).not.toContain(privateMarker);
    },
  );

  it("rejects query data without reflecting it", async () => {
    const privateMarker = "private-person@example.com";
    const response = await handleRequest(
      new Request(`https://example.com/api/policy?text=${encodeURIComponent(privateMarker)}`),
      mockEnv(),
    );
    const responseText = await response.text();

    expect(response.status).toBe(400);
    expect(responseText).toContain("QUERY_NOT_ALLOWED");
    expect(responseText).not.toContain(privateMarker);
  });

  it("rejects a declared GET body without attempting to consume it", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/policy", {
        headers: { "Content-Length": "64" },
      }),
      mockEnv(),
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: { code: "BODY_NOT_ALLOWED" } });
  });

  it("returns a structured 404 for unknown API paths", async () => {
    const response = await handleRequest(new Request("https://example.com/api/missing"), mockEnv());

    expect(response.status).toBe(404);
    expect(await json(response)).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

describe("static asset boundary", () => {
  it("forwards safe asset requests and adds document security headers", async () => {
    const env = mockEnv();
    const response = await handleRequest(new Request("https://example.com/"), env);

    expect(response.status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("allows immutable caching only for Vite's fingerprinted asset directory", async () => {
    const response = await handleRequest(
      new Request("https://example.com/assets/main-ABC123.js"),
      mockEnv(new Response("export {}", { headers: { "Content-Type": "text/javascript" } })),
    );

    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("rejects mutations before the asset binding is called", async () => {
    const env = mockEnv();
    const response = await handleRequest(
      new Request("https://example.com/", { method: "POST", body: "private text" }),
      env,
    );

    expect(response.status).toBe(405);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("sanitizes asset failures and does not log a request path or query", async () => {
    const privateMarker = "Private-Name-That-Must-Not-Be-Logged";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const env: Env = {
      ASSETS: {
        fetch: vi.fn(async () => {
          throw new Error("internal storage detail");
        }),
      },
    };

    const response = await handleRequest(
      new Request(
        `https://example.com/${encodeURIComponent(privateMarker)}?text=${encodeURIComponent(privateMarker)}`,
      ),
      env,
    );
    const responseText = await response.text();
    const logged = errorSpy.mock.calls.flat().join(" ");
    errorSpy.mockRestore();

    expect(response.status).toBe(500);
    expect(responseText).not.toContain("internal storage detail");
    expect(responseText).not.toContain(privateMarker);
    expect(logged).not.toContain(privateMarker);
    expect(logged).not.toContain("internal storage detail");
  });
});
