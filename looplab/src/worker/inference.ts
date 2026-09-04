import {
  MODEL,
  type Lane,
  type TestCase,
  type TrialResult,
} from "../shared/contracts";
import { gradeOutput, parseExtraction } from "../shared/grading";
import { MODEL_SETTINGS, SYSTEM_PROMPT } from "../shared/experiment";
import { isRecord } from "./http";

export const AI_TIMEOUT_MS = 20_000;
export const STEP_LEASE_MS = 60_000;

export function failedTrial(
  testCase: TestCase,
  lane: Lane,
  message: string,
  latencyMs = 0,
): TrialResult {
  return {
    caseId: testCase.id,
    lane,
    raw: "",
    parsed: null,
    grade: gradeOutput("", testCase),
    latencyMs,
    inputTokens: null,
    outputTokens: null,
    providerModel: null,
    error: message,
  };
}

export async function infer(
  env: Env,
  testCase: TestCase,
  lane: Lane,
  prompt: string,
): Promise<TrialResult> {
  const started = performance.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("MODEL_TIMEOUT"));
      }, AI_TIMEOUT_MS);
    });
    // Only the announcement enters inference. The answer key stays in grading.
    // Both lanes receive identical model settings and this exact system message.
    const response: unknown = await Promise.race([
      env.AI.run(
        MODEL,
        {
          ...MODEL_SETTINGS,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Extraction instructions:\n${prompt}\n\nAnnouncement (JSON-encoded text):\n${JSON.stringify(testCase.text)}`,
            },
          ],
        },
        { signal: controller.signal },
      ),
      timeout,
    ]);
    const raw = providerText(response);
    if (raw === null || raw.length > 8000 || !isRecord(response)) {
      return failedTrial(
        testCase,
        lane,
        "The model service returned an unreadable response. This case was not scored.",
        Math.round(performance.now() - started),
      );
    }
    const usage = isRecord(response.usage) ? response.usage : {};
    return {
      caseId: testCase.id,
      lane,
      raw,
      parsed: parseExtraction(raw).parsed,
      grade: gradeOutput(raw, testCase),
      latencyMs: Math.round(performance.now() - started),
      inputTokens: tokenCount(usage.prompt_tokens),
      outputTokens: tokenCount(usage.completion_tokens),
      error: null,
      providerModel:
        typeof response.model === "string" &&
        response.model.length > 0 &&
        response.model.length <= 200
          ? response.model
          : null,
    };
  } catch (error) {
    const timedOut =
      controller.signal.aborted ||
      (error instanceof Error && error.message === "MODEL_TIMEOUT");
    // Never log input prompts or provider errors, which can contain request data.
    console.warn(
      JSON.stringify({
        event: "model_call_failed",
        lane,
        caseId: testCase.id,
        timedOut,
      }),
    );
    return failedTrial(
      testCase,
      lane,
      timedOut
        ? "The model took too long. This attempt was counted against the demo allowance but was not scored."
        : "The model service was unavailable. This attempt was not scored.",
      Math.round(performance.now() - started),
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function providerText(value: unknown): string | null {
  if (!isRecord(value)) return null;
  // The fast model's current binding includes OpenAI-compatible choices and an
  // already-parsed response object. Preserve message.content verbatim: serializing
  // the parsed object would erase duplicate keys, formatting errors, and evidence.
  if (Array.isArray(value.choices)) {
    if (value.choices.length !== 1 || !isRecord(value.choices[0])) return null;
    const message = value.choices[0].message;
    return isRecord(message) && typeof message.content === "string"
      ? message.content
      : null;
  }
  // Older Workers AI response envelopes return the original text here.
  return typeof value.response === "string" ? value.response : null;
}
