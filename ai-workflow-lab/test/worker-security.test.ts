import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { MAX_REQUEST_BYTES } from "../src/index";

const origin = "https://workflow.example";
const notes = { text: "The team agreed to publish the demo Friday. Jordan will test it Thursday." };
const meeting = {
  title: "Demo planning",
  summary: "The team planned the demo.",
  decisions: ["Publish Friday"],
  actionItems: [{ task: "Test the demo", owner: "Jordan", dueDate: "Thursday" }],
};

function fixture() {
  const run = vi.fn(async (): Promise<{ response: unknown }> => ({ response: meeting }));
  const limit = vi.fn(async (_input: { key: string }) => ({ success: true }));
  const env = {
    AI: { run },
    WORKFLOW_RATE_LIMITER: { limit },
    ASSETS: { fetch: vi.fn(async () => new Response("asset")) },
  } as unknown as Env;
  return { env, run, limit };
}

function post(body: BodyInit = JSON.stringify(notes), headers: HeadersInit = {}) {
  return new Request(`${origin}/api/meeting-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body,
    // Node's Request requires this for a stream; Workers ignores the extra init.
    ...{ duplex: "half" },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("public workflow request security", () => {
  it("keeps legitimate same-origin workflows working", async () => {
    const { env, run } = fixture();
    const response = await worker.fetch(post(), env);
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ data: { title: meeting.title } });
  });

  it("rejects a foreign origin before paid inference", async () => {
    const { env, run } = fixture();
    const response = await worker.fetch(post(JSON.stringify(notes), { Origin: "https://other.example" }), env);
    expect(response.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a cross-site fetch even if Origin is absent", async () => {
    const { env, run } = fixture();
    const request = post(JSON.stringify(notes), { "Sec-Fetch-Site": "cross-site" });
    request.headers.delete("Origin");
    expect((await worker.fetch(request, env)).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not mistake a safelisted text/plain media type for JSON", async () => {
    const { env, run } = fixture();
    expect((await worker.fetch(post(JSON.stringify(notes), {
      "Content-Type": "text/plain; application/json",
    }), env)).status).toBe(415);
    expect(run).not.toHaveBeenCalled();
  });

  it.each([undefined, "0"])("stops an oversized stream with declared length %s", async (declaredLength) => {
    const { env, run } = fixture();
    const cancel = vi.fn();
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
      controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES + 1));
    });
    const stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const headers = declaredLength === undefined ? {} : { "Content-Length": declaredLength };
    expect((await worker.fetch(post(stream, headers), env)).status).toBe(413);
    expect(pull).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects invalid UTF-8 instead of silently replacing bytes", async () => {
    const { env, run } = fixture();
    expect((await worker.fetch(post(new Uint8Array([0xc3, 0x28])), env)).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it("applies the shared limiter before paid inference and returns a retry hint", async () => {
    const { env, run, limit } = fixture();
    limit.mockResolvedValue({ success: false });
    const response = await worker.fetch(post(), env);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter is unavailable or missing", async () => {
    const { env, run, limit } = fixture();
    limit.mockRejectedValue(new Error("unavailable"));
    expect((await worker.fetch(post(), env)).status).toBe(503);
    const missing = { AI: env.AI, ASSETS: env.ASSETS } as Env;
    expect((await worker.fetch(post(), missing)).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it("hashes the client address and shares the quota across both workflows", async () => {
    const { env, limit } = fixture();
    limit.mockResolvedValue({ success: false });
    const headers = { "CF-Connecting-IP": "192.0.2.1" };
    await worker.fetch(post(JSON.stringify(notes), headers), env);
    const second = post(JSON.stringify(notes), headers);
    await worker.fetch(new Request(`${origin}/api/repurpose`, second), env);
    const key = limit.mock.calls[0]?.[0];
    expect(key).toEqual(limit.mock.calls[1]?.[0]);
    expect(JSON.stringify(key)).not.toContain("192.0.2.1");
    expect(key).toMatchObject({ key: expect.stringMatching(/^workflow:[a-f0-9]{64}$/) });
  });

  it("does not publish provider error contents to the response or logs", async () => {
    const { env, run } = fixture();
    run.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_INPUT"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await worker.fetch(post(), env);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("SYNTHETIC_PRIVATE_INPUT");
    expect(JSON.stringify(log.mock.calls)).not.toContain("SYNTHETIC_PRIVATE_INPUT");
  });

  it.each(["meeting-plan", "repurpose"])("does not log private model object keys for %s", async (workflow) => {
    const { env, run } = fixture();
    run.mockResolvedValue({ response: { SYNTHETIC_PRIVATE_MODEL_KEY: "private value" } });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const payload = { ...notes, audience: "Builders", tone: "friendly", callToAction: "Try the demo" };
    const response = await worker.fetch(new Request(`${origin}/api/${workflow}`, post(JSON.stringify(payload))), env);
    expect(response.status).toBe(502);
    expect(run).toHaveBeenCalledOnce();
    expect(await response.text()).not.toContain("SYNTHETIC_PRIVATE_MODEL_KEY");
    expect(JSON.stringify([...warning.mock.calls, ...error.mock.calls])).not.toContain("SYNTHETIC_PRIVATE_MODEL_KEY");
    expect(JSON.stringify(warning.mock.calls)).toContain("schema_mismatch");
  });
});
