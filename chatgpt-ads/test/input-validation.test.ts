import { describe, expect, it } from "vitest";

import {
  isSupportedPlatform,
  MAX_CAMPAIGN_ROWS,
  MAX_METRIC_VALUE,
  readLimitedText,
  RequestTooLargeError,
  validateRawRows,
} from "../lib/input-validation";

describe("campaign request validation", () => {
  it("accepts supported platforms and rejects invented ones", () => {
    expect(isSupportedPlatform("Meta Ads")).toBe(true);
    expect(isSupportedPlatform("Unknown Ads")).toBe(false);
  });

  it("accepts a small primitive campaign table", () => {
    expect(validateRawRows([{ campaign: "Launch", spend: 250, active: true, note: null }])).toEqual({
      ok: true,
      rows: [{ campaign: "Launch", spend: 250, active: true, note: null }],
    });
  });

  it("rejects excessive rows, nested values, and dangerous keys", () => {
    expect(validateRawRows(Array.from({ length: MAX_CAMPAIGN_ROWS + 1 }, () => ({ campaign: "Test" })))).toMatchObject({
      ok: false,
    });
    expect(validateRawRows([{ campaign: { nested: true } }])).toMatchObject({ ok: false });
    expect(validateRawRows([JSON.parse('{"__proto__":"unsafe"}')])).toMatchObject({ ok: false });
  });

  it("rejects finite numeric values above the safe campaign limit", () => {
    expect(validateRawRows([{ campaign: "Extreme", spend: MAX_METRIC_VALUE + 1 }])).toEqual({
      ok: false,
      error: "A campaign number is too large to process.",
    });
  });
});

describe("bounded request reading", () => {
  it("reads a request that stays below the byte limit", async () => {
    const request = new Request("https://example.com/api", { method: "POST", body: "small body" });
    await expect(readLimitedText(request, 32)).resolves.toBe("small body");
  });

  it("stops a streaming request that crosses the byte limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("12345"));
        controller.enqueue(new TextEncoder().encode("67890"));
        controller.close();
      },
    });
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: stream,
      // Node's Request implementation requires this option for streaming uploads.
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readLimitedText(request, 8)).rejects.toBeInstanceOf(RequestTooLargeError);
  });
});
