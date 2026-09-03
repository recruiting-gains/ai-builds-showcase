import {
  MAX_INPUT_CHARS,
  MIN_INPUT_CHARS,
  type ContentInput,
  type ContentResult,
  type MeetingExtraction,
  type MeetingInput,
  type Tone
} from "./contracts";

const ALLOWED_TONES = new Set<Tone>([
  "clear",
  "friendly",
  "professional",
  "playful"
]);

export class RequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredText(
  value: unknown,
  label: string,
  minimum = 1,
  maximum = 240
): string {
  if (typeof value !== "string") {
    throw new RequestError(label + " must be text.");
  }

  const normalized = value.trim();
  if (normalized.length < minimum) {
    throw new RequestError(label + " must be at least " + minimum + " characters.");
  }
  if (normalized.length > maximum) {
    throw new RequestError(label + " must be " + maximum + " characters or fewer.");
  }
  return normalized;
}

export function parseMeetingInput(value: unknown): MeetingInput {
  const record = asRecord(value);
  if (!record) {
    throw new RequestError("Send a JSON object with a text field.");
  }

  return {
    text: requiredText(
      record.text,
      "Meeting notes",
      MIN_INPUT_CHARS,
      MAX_INPUT_CHARS
    )
  };
}

export function parseContentInput(value: unknown): ContentInput {
  const record = asRecord(value);
  if (!record) {
    throw new RequestError("Send a JSON object with content settings.");
  }

  const rawTone = requiredText(record.tone, "Tone", 1, 40) as Tone;
  if (!ALLOWED_TONES.has(rawTone)) {
    throw new RequestError("Choose a supported tone.");
  }

  return {
    text: requiredText(
      record.text,
      "Source material",
      MIN_INPUT_CHARS,
      MAX_INPUT_CHARS
    ),
    audience: requiredText(record.audience, "Audience", 2, 120),
    tone: rawTone,
    callToAction: requiredText(record.callToAction, "Call to action", 2, 180)
  };
}

export function parseModelPayload(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value
      .trim()
      .replace(/^(?:~~~|\x60{3})json\s*/i, "")
      .replace(/\s*(?:~~~|\x60{3})$/, "");
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error("The AI returned malformed JSON.");
    }
  }

  if (asRecord(value)) {
    return value;
  }

  throw new Error("The AI returned an empty result.");
}

export function normalizePlainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function isStringArray(
  value: unknown,
  minimum: number,
  maximum: number,
  maximumItemLength: number
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.every((item) => isBoundedString(item, maximumItemLength))
  );
}

export function isMeetingExtraction(value: unknown): value is MeetingExtraction {
  const record = asRecord(value);
  if (
    !record ||
    !isStringArray(record.decisions, 0, 8, 300) ||
    !Array.isArray(record.actionItems) ||
    record.actionItems.length > 10
  ) {
    return false;
  }

  return (
    isBoundedString(record.title, 120) &&
    isBoundedString(record.summary, 1200) &&
    record.actionItems.every((item) => {
      const action = asRecord(item);
      return (
        action !== null &&
        isBoundedString(action.task, 300) &&
        isBoundedString(action.owner, 100) &&
        isBoundedString(action.dueDate, 100)
      );
    })
  );
}

export function isContentResult(value: unknown): value is ContentResult {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return (
    isBoundedString(record.coreMessage, 500) &&
    isBoundedString(record.linkedinPost, 1800) &&
    isBoundedString(record.newsletterBlurb, 1400) &&
    isStringArray(record.shortThread, 4, 4, 320) &&
    isStringArray(record.titleIdeas, 5, 5, 140) &&
    isStringArray(record.hashtags, 3, 5, 60)
  );
}
