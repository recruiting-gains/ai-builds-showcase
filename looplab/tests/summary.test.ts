import { describe, expect, it } from "vitest";
import { summarize, verdict } from "../src/client/summary";
import { CASES, CORPUS_HASH, CORPUS_VERSION } from "../src/shared/corpus";
import {
  MODEL,
  type ExperimentRun,
  type Lane,
  type TrialResult,
} from "../src/shared/contracts";
import { EXPERIMENT_FINGERPRINT } from "../src/shared/experiment";

function trial(
  caseId: string,
  lane: Lane,
  changes: Partial<TrialResult> = {},
): TrialResult {
  return {
    caseId,
    lane,
    raw: "{}",
    parsed: null,
    grade: {
      passed: true,
      valid: true,
      correctFields: 3,
      totalFields: 3,
      fields: [],
      formatError: null,
    },
    latencyMs: 1000,
    inputTokens: 10,
    outputTokens: 5,
    error: null,
    ...changes,
  };
}

function run(changes: Partial<ExperimentRun> = {}): ExperimentRun {
  return {
    id: "9b6f9d25-6967-4f89-a1b9-a3a46328d72d",
    createdAt: "2030-01-01T00:00:00.000Z",
    expiresAt: "2030-01-02T00:00:00.000Z",
    promptA: "Baseline instruction",
    promptB: "Candidate instruction",
    model: MODEL,
    corpusVersion: CORPUS_VERSION,
    corpusHash: CORPUS_HASH,
    experimentVersion: EXPERIMENT_FINGERPRINT,
    status: "complete",
    completed: 10,
    total: 10,
    results: CASES.flatMap(({ id }) => [trial(id, "A"), trial(id, "B")]),
    ...changes,
  };
}

function wrongFields(result: TrialResult, correctFields: number): TrialResult {
  return {
    ...result,
    grade: { ...result.grade, passed: false, correctFields },
  };
}

function serviceError(result: TrialResult): TrialResult {
  return {
    ...wrongFields(result, 0),
    raw: "",
    inputTokens: null,
    outputTokens: null,
    grade: {
      passed: false,
      valid: false,
      correctFields: 0,
      totalFields: 3,
      fields: [],
      formatError: "No model response.",
    },
    error: "The model service was unavailable.",
  };
}

describe("lane summaries", () => {
  it("separates lanes and reports complete known evidence", () => {
    const experiment = run();
    experiment.results[1].latencyMs = 5000;
    experiment.results[1].inputTokens = 100;
    expect(summarize(experiment, "A")).toEqual({
      passed: 10,
      fields: 30,
      errors: 0,
      averageLatency: 1000,
      tokens: 150,
    });
    expect(summarize(experiment, "B")).toMatchObject({
      averageLatency: 1400,
      tokens: 240,
    });
  });

  it("retains partial field credit without calling a failed case a pass", () => {
    const experiment = run();
    experiment.results[0] = wrongFields(experiment.results[0], 2);
    expect(summarize(experiment, "A")).toMatchObject({
      passed: 9,
      fields: 29,
      errors: 0,
    });
  });

  it("reports unknown tokens and latency when there are no responses", () => {
    expect(
      summarize(run({ status: "ready", completed: 0, results: [] }), "A"),
    ).toEqual({
      passed: 0,
      fields: 0,
      errors: 0,
      averageLatency: null,
      tokens: null,
    });
  });

  it("does not treat an omitted token count as zero", () => {
    const experiment = run();
    experiment.results[0].inputTokens = null;
    expect(summarize(experiment, "A").tokens).toBeNull();
    experiment.results[0].inputTokens = 10;
    experiment.results[0].outputTokens = null;
    expect(summarize(experiment, "A").tokens).toBeNull();
    expect(summarize(experiment, "B").tokens).toBe(150);
  });

  it("preserves an explicitly reported zero-token total", () => {
    const experiment = run();
    for (const result of experiment.results) {
      result.inputTokens = 0;
      result.outputTokens = 0;
    }
    expect(summarize(experiment, "A").tokens).toBe(0);
  });

  it("excludes service failures from correctness and response latency", () => {
    const experiment = run();
    experiment.results[0] = serviceError(experiment.results[0]);
    experiment.results[0].latencyMs = 20000;
    expect(summarize(experiment, "A")).toMatchObject({
      passed: 9,
      fields: 27,
      errors: 1,
      averageLatency: 1000,
    });
  });

  it("keeps total usage unknown when a failed request may have consumed unreported tokens", () => {
    const experiment = run();
    experiment.results[0] = serviceError(experiment.results[0]);
    expect(summarize(experiment, "A").tokens).toBeNull();
  });

  it("reports no scored evidence when every request failed", () => {
    const experiment = run();
    experiment.results = experiment.results.map(serviceError);
    expect(summarize(experiment, "A")).toEqual({
      passed: 0,
      fields: 0,
      errors: 10,
      averageLatency: null,
      tokens: null,
    });
  });
});

describe("comparison verdicts", () => {
  it("does not choose a winner before a run completes", () => {
    const experiment = run({ status: "running", completed: 1 });
    experiment.results = [
      experiment.results[0],
      wrongFields(experiment.results[1], 0),
    ];
    expect(verdict(experiment)).toMatchObject({
      title: "Experiment in progress",
    });
  });

  it("does not treat a complete status as sufficient when a response is missing", () => {
    const experiment = run();
    experiment.results.pop();
    expect(verdict(experiment).title).toBe("Comparison is incomplete");
  });

  it("requires one result per case and lane instead of accepting duplicate evidence", () => {
    const experiment = run();
    experiment.results[experiment.results.length - 1] = {
      ...experiment.results[0],
    };
    expect(verdict(experiment).title).toBe("Comparison is incomplete");
  });

  it("reports service errors without awarding the other prompt a win", () => {
    const experiment = run();
    experiment.results[0] = serviceError(experiment.results[0]);
    expect(verdict(experiment).title).toBe("Comparison is incomplete");
    expect(verdict(experiment).detail).toContain("service errors");
  });

  it("reports a tie by cases even when partial field scores differ", () => {
    const experiment = run();
    experiment.results[0] = wrongFields(experiment.results[0], 0);
    experiment.results[1] = wrongFields(experiment.results[1], 2);
    expect(verdict(experiment).title).toBe("A tie is a result, too.");
    expect(verdict(experiment).detail).toContain(
      "Both prompts passed 9 of 10 cases",
    );
  });

  it("describes a completed case-score difference as an observation", () => {
    const experiment = run();
    experiment.results[0] = wrongFields(experiment.results[0], 1);
    experiment.results[2] = wrongFields(experiment.results[2], 2);
    expect(verdict(experiment).title).toBe("Prompt B passed 2 more cases.");
    expect(verdict(experiment).detail).toContain("not a guarantee");
    expect(verdict(experiment).detail).toContain("regressions");
  });
});
