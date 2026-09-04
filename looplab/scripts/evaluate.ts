import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  CASES,
  CORPUS_HASH,
  CORPUS_VERSION,
  canonicalCorpusJson,
} from "../src/shared/corpus";
import { gradeOutput, parseExtraction } from "../src/shared/grading";
import {
  CORRECT_CONTROLS,
  INCORRECT_CONTROLS,
  INVALID_CONTROLS,
} from "../evals/fixtures";

// Independent release manifest: changing both the corpus and exported digest alone
// does not silently make a modified benchmark pass its frozen v1 contract.
const RELEASE = {
  version: "event-extraction-v1",
  sha256: "9705d81a811312442125a487bf994201e34f9f14ace00c7342b274925cb0ea6c",
  cases: 10,
};

function evaluate(): void {
  const digest = createHash("sha256")
    .update(canonicalCorpusJson(), "utf8")
    .digest("hex");
  assert.equal(
    CORPUS_VERSION,
    RELEASE.version,
    "Corpus version differs from the frozen evaluation release.",
  );
  assert.equal(
    CORPUS_HASH,
    RELEASE.sha256,
    "Exported corpus digest differs from the frozen release.",
  );
  assert.equal(
    digest,
    RELEASE.sha256,
    "Corpus contents changed. Restore them or create an explicitly reviewed new benchmark version.",
  );
  assert.equal(CASES.length, RELEASE.cases);
  assert.equal(
    new Set(CASES.map(({ id }) => id)).size,
    RELEASE.cases,
    "Case IDs must be unique.",
  );
  assert.equal(CASES.filter(({ category }) => category === "Simple").length, 3);
  assert.deepEqual(
    Object.keys(CORRECT_CONTROLS).sort(),
    CASES.map(({ id }) => id).sort(),
  );
  assert.deepEqual(
    INCORRECT_CONTROLS.map(({ caseId }) => caseId).sort(),
    CASES.map(({ id }) => id).sort(),
  );

  let assertions = 0;
  for (const testCase of CASES) {
    assert.ok(
      parseExtraction(JSON.stringify(testCase.expected)).parsed,
      `${testCase.id}: answer key must satisfy the format contract.`,
    );
    for (const field of ["location", "date"] as const) {
      const value = testCase.expected[field];
      assert.ok(
        value === null || testCase.text.includes(value),
        `${testCase.id}: ${field} must be a literal source substring.`,
      );
    }
    for (const item of testCase.expected.supplies)
      assert.ok(
        testCase.text.includes(item),
        `${testCase.id}: supply must appear in the announcement.`,
      );
    const grade = gradeOutput(CORRECT_CONTROLS[testCase.id], testCase);
    assert.equal(
      grade.passed,
      true,
      `${testCase.id}: correct control should pass.`,
    );
    assert.equal(grade.valid, true);
    assert.equal(grade.correctFields, 3);
    assertions++;
  }
  for (const control of INCORRECT_CONTROLS) {
    const testCase = CASES.find(({ id }) => id === control.caseId)!;
    const grade = gradeOutput(control.raw, testCase);
    assert.equal(
      grade.valid,
      true,
      `${control.caseId}: wrong content is still valid JSON.`,
    );
    assert.equal(grade.passed, false, `${control.caseId}: ${control.reason}`);
    assert.deepEqual(
      grade.fields.filter(({ passed }) => !passed).map(({ field }) => field),
      control.failedFields,
    );
    assert.equal(grade.correctFields, 3 - control.failedFields.length);
    assert.ok(grade.fields.every(({ reason }) => reason.length > 0));
    assertions++;
  }
  for (const raw of INVALID_CONTROLS) {
    const grade = gradeOutput(raw, CASES[0]);
    assert.equal(
      grade.valid,
      false,
      "Invalid JSON/schema control must not pass validation.",
    );
    assert.equal(grade.passed, false);
    assert.equal(grade.correctFields, 0);
    assert.equal(grade.totalFields, 3);
    assert.ok(grade.formatError);
    assert.ok(
      grade.fields.every(({ passed, actual }) => !passed && actual === null),
    );
    assertions++;
  }
  console.log(
    `PASS: ${assertions} handwritten grader controls; ${CASES.length} frozen public cases.`,
  );
  console.log(`Corpus: ${CORPUS_VERSION} / SHA-256 ${digest}`);
  console.log(
    "This offline harness verifies the grader and answer keys. It does not call AI, measure prompt improvement, or write result files.",
  );
}

try {
  evaluate();
} catch (error) {
  console.error(
    "Evaluation harness FAILED:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
