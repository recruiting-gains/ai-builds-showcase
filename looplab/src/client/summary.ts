import type { ExperimentRun, Lane } from "../shared/contracts";
import { CASES } from "../shared/corpus";
export function summarize(run: ExperimentRun, lane: Lane) {
  const trials = run.results.filter((r) => r.lane === lane);
  const completed = trials.filter((r) => !r.error);
  const tokensKnown =
    trials.length > 0 &&
    trials.every(
      (r) => !r.error && r.inputTokens !== null && r.outputTokens !== null,
    );
  return {
    passed: completed.filter((r) => r.grade.passed).length,
    fields: completed.reduce((sum, r) => sum + r.grade.correctFields, 0),
    errors: trials.length - completed.length,
    averageLatency: completed.length
      ? completed.reduce((sum, r) => sum + r.latencyMs, 0) / completed.length
      : null,
    tokens: tokensKnown
      ? completed.reduce(
          (sum, r) => sum + (r.inputTokens ?? 0) + (r.outputTokens ?? 0),
          0,
        )
      : null,
  };
}
export function verdict(run: ExperimentRun): { title: string; detail: string } {
  const a = summarize(run, "A"),
    b = summarize(run, "B");
  if (run.status !== "complete")
    return {
      title: "Experiment in progress",
      detail: "Wait for all 20 responses before comparing prompts.",
    };
  const pairs = new Set(run.results.map((r) => `${r.caseId}:${r.lane}`));
  if (
    run.completed !== CASES.length ||
    run.total !== CASES.length ||
    run.results.length !== CASES.length * 2 ||
    pairs.size !== CASES.length * 2 ||
    !CASES.every((c) => pairs.has(`${c.id}:A`) && pairs.has(`${c.id}:B`))
  ) {
    return {
      title: "Comparison is incomplete",
      detail:
        "The saved evidence does not contain exactly one response from each prompt for every case. No winner can be determined.",
    };
  }
  if (a.errors || b.errors)
    return {
      title: "Comparison is incomplete",
      detail: `${a.errors + b.errors} model request(s) failed. These are service errors, not evidence that a prompt is worse. Start a new run to compare again.`,
    };
  if (a.passed === b.passed)
    return {
      title: "A tie is a result, too.",
      detail: `Both prompts passed ${a.passed} of 10 cases. Inspect field-level differences before changing your hypothesis.`,
    };
  const winner = a.passed > b.passed ? "A" : "B",
    difference = Math.abs(a.passed - b.passed);
  return {
    title: `Prompt ${winner} passed ${difference} more ${difference === 1 ? "case" : "cases"}.`,
    detail:
      "That is an observation from this run, not a guarantee. Inspect regressions and repeat before keeping the change.",
  };
}
