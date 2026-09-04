export const MAX_INPUT_CODE_UNITS = 50_000;
export const MAX_NAMES_TO_HIDE = 50;
export const MAX_NAME_CODE_UNITS = 100;

export const FINDING_KINDS = [
  "email",
  "phone",
  "ipv4",
  "ipv6",
  "date",
  "private_url",
  "account_reference",
  "payment_card",
  "custom_name",
] as const;

export const MASKING_POLICY = {
  version: "1.0",
  execution: "browser_only",
  maxInputCodeUnits: MAX_INPUT_CODE_UNITS,
  maxNamesToHide: MAX_NAMES_TO_HIDE,
  findingKinds: FINDING_KINDS,
  humanReviewRequired: true,
  serverReceivesText: false,
  storesText: false,
  guarantee: "possible_matches_only",
} as const;

export type FindingKind = (typeof FINDING_KINDS)[number];
export type FindingConfidence = "strong_match" | "review_suggested";

/**
 * A possible piece of private information found in the original text.
 *
 * Offsets are UTF-16 code-unit offsets so they can be passed directly to
 * String.prototype.slice in browsers. Findings returned by the scanner are
 * deterministic, non-overlapping, and ordered by `start`.
 */
export interface Finding {
  id: string;
  start: number;
  end: number;
  kind: FindingKind;
  label: string;
  replacement: string;
  confidence: FindingConfidence;
  normalizedValue: string;
  reason: string;
}
