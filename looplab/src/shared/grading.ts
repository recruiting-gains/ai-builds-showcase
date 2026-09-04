import type { Extraction, FieldCheck, Grade, TestCase } from "./contracts";

const FIELDS = ["location", "date", "supplies"] as const;
const MAX_STRING_LENGTH = 200;
const MAX_SUPPLIES = 8;
const MAX_OUTPUT_LENGTH = 32768;

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function boundedString(value: unknown): value is string {
  return (
    typeof value === "string" && Array.from(value).length <= MAX_STRING_LENGTH
  );
}

// JSON.parse accepts duplicate object keys. Count the literal root keys separately
// so an overwritten answer cannot silently pass the exact-three-keys contract.
function rootKeys(raw: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let previous = "";
  for (let index = 0; index < raw.length; index++) {
    const character = raw[index];
    if (/\s/u.test(character)) continue;
    if (character === '"') {
      const start = index;
      for (index++; index < raw.length; index++) {
        if (raw[index] === "\\") index++;
        else if (raw[index] === '"') break;
      }
      if (depth === 1 && (previous === "{" || previous === ",")) {
        keys.push(JSON.parse(raw.slice(start, index + 1)) as string);
      }
      previous = '"';
      continue;
    }
    if (character === "{" || character === "[") depth++;
    else if (character === "}" || character === "]") depth--;
    previous = character;
  }
  return keys;
}

export function parseExtraction(raw: string): {
  parsed: Extraction | null;
  error: string | null;
} {
  const fail = (error: string) => ({ parsed: null, error });
  if (typeof raw !== "string" || raw.length > MAX_OUTPUT_LENGTH) {
    return fail(
      "The answer must be JSON text no longer than 32,768 characters.",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return fail(
      "Return one JSON object only, without Markdown fences, commentary, or trailing text.",
    );
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(
      "The answer must be a JSON object with location, date, and supplies.",
    );
  }
  const keys = rootKeys(raw);
  if (
    keys.length !== FIELDS.length ||
    new Set(keys).size !== FIELDS.length ||
    keys.some((key) => !FIELDS.includes(key as keyof Extraction))
  ) {
    return fail(
      "Use exactly three keys: location, date, and supplies, each appearing once.",
    );
  }
  const answer = value as Record<string, unknown>;
  for (const field of ["location", "date"] as const) {
    if (answer[field] !== null && !boundedString(answer[field])) {
      return fail(
        `${field} must be a string of at most 200 characters, or null.`,
      );
    }
  }
  if (
    !Array.isArray(answer.supplies) ||
    answer.supplies.length > MAX_SUPPLIES
  ) {
    return fail("supplies must be an array of at most 8 unique item strings.");
  }
  if (
    !answer.supplies.every(
      (item) => boundedString(item) && normalize(item).length > 0,
    )
  ) {
    return fail(
      "Each supply must be a non-empty string of at most 200 characters.",
    );
  }
  if (
    new Set(answer.supplies.map((item: string) => normalize(item))).size !==
    answer.supplies.length
  ) {
    return fail(
      "List each supply once; case and extra spaces do not make duplicate items unique.",
    );
  }
  return {
    parsed: {
      location: answer.location as string | null,
      date: answer.date as string | null,
      supplies: [...answer.supplies],
    },
    error: null,
  };
}

function gradeText(
  field: "location" | "date",
  actual: string | null,
  expected: string | null,
): FieldCheck {
  const passed =
    expected === null
      ? actual === null
      : actual !== null && normalize(actual) === normalize(expected);
  let reason: string;
  if (passed)
    reason =
      expected === null
        ? `Correct: no confirmed ${field} is available.`
        : `Correct: ${field} matches the confirmed announcement.`;
  else if (expected === null)
    reason = `Expected null because no confirmed ${field} is available; received ${JSON.stringify(actual)}.`;
  else if (actual === null)
    reason = `Missing the confirmed ${field}: ${JSON.stringify(expected)}.`;
  else
    reason = `Expected ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}. Only case and whitespace differences are ignored.`;
  return { field, passed, expected, actual, reason };
}

function gradeSupplies(actual: string[], expected: string[]): FieldCheck {
  const expectedSet = new Set(expected.map(normalize));
  const actualSet = new Set(actual.map(normalize));
  const missing = expected.filter((item) => !actualSet.has(normalize(item)));
  const extra = actual.filter((item) => !expectedSet.has(normalize(item)));
  const passed = missing.length === 0 && extra.length === 0;
  const reason = passed
    ? expected.length === 0
      ? "Correct: attendees have no required supplies."
      : "Correct: the required supplies match, regardless of order."
    : [
        missing.length
          ? `Missing required supplies: ${missing.map((item) => JSON.stringify(item)).join(", ")}.`
          : "",
        extra.length
          ? `Unexpected supplies: ${extra.map((item) => JSON.stringify(item)).join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
  return {
    field: "supplies",
    passed,
    expected: [...expected],
    actual: [...actual],
    reason,
  };
}

export function gradeOutput(raw: string, testCase: TestCase): Grade {
  const { parsed, error } = parseExtraction(raw);
  if (!parsed) {
    return {
      passed: false,
      valid: false,
      correctFields: 0,
      totalFields: FIELDS.length,
      fields: FIELDS.map((field) => ({
        field,
        passed: false,
        expected: Array.isArray(testCase.expected[field])
          ? [...(testCase.expected[field] as string[])]
          : testCase.expected[field],
        actual: null,
        reason: `Not scored: invalid answer format. ${error}`,
      })),
      formatError: error,
    };
  }
  const fields = [
    gradeText("location", parsed.location, testCase.expected.location),
    gradeText("date", parsed.date, testCase.expected.date),
    gradeSupplies(parsed.supplies, testCase.expected.supplies),
  ];
  const correctFields = fields.filter((field) => field.passed).length;
  return {
    passed: correctFields === fields.length,
    valid: true,
    correctFields,
    totalFields: fields.length,
    fields,
    formatError: null,
  };
}
