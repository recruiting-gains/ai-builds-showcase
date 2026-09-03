import {
  BUSINESS_RELEVANCE_VALUES,
  FRESHNESS_VALUES,
  GEOGRAPHIC_FIT_VALUES,
  HELPFULNESS_GAP_VALUES,
  INFORMATION_COMPLETENESS_VALUES,
  MOMENTUM_VALUES,
  PRIMARY_INTENT_VALUES,
  RULE_FIT_VALUES,
  SELF_CONTAINED_HELP_VALUES,
  TOPIC_SENSITIVITY_VALUES,
  TRUST_OPPORTUNITY_VALUES,
  type ScoreInput,
} from "./contracts";

export class ValidationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.status = status;
  }
}

const INPUT_KEYS = [
  "businessRelevance",
  "helpfulnessGap",
  "ruleFit",
  "freshness",
  "momentum",
  "trustOpportunity",
  "geographicFit",
  "topicSensitivity",
  "primaryIntent",
  "selfContainedHelp",
  "informationCompleteness",
] as const satisfies readonly (keyof ScoreInput)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }

  throw new ValidationError("INVALID_ANSWER", `Choose one of the available answers for ${field}.`);
}

export function parseScoreInput(value: unknown): ScoreInput {
  if (!isRecord(value)) {
    throw new ValidationError(
      "INVALID_BODY",
      "Send one structured answer for every checklist question.",
    );
  }

  const suppliedKeys = Object.keys(value);
  if (
    suppliedKeys.length !== INPUT_KEYS.length ||
    !suppliedKeys.every((key) => (INPUT_KEYS as readonly string[]).includes(key))
  ) {
    throw new ValidationError(
      "INVALID_FIELDS",
      "Send exactly the checklist fields shown by this tool.",
    );
  }

  return {
    businessRelevance: parseEnum(
      value.businessRelevance,
      BUSINESS_RELEVANCE_VALUES,
      "business relevance",
    ),
    helpfulnessGap: parseEnum(value.helpfulnessGap, HELPFULNESS_GAP_VALUES, "helpfulness gap"),
    ruleFit: parseEnum(value.ruleFit, RULE_FIT_VALUES, "community-rule fit"),
    freshness: parseEnum(value.freshness, FRESHNESS_VALUES, "freshness"),
    momentum: parseEnum(value.momentum, MOMENTUM_VALUES, "conversation momentum"),
    trustOpportunity: parseEnum(
      value.trustOpportunity,
      TRUST_OPPORTUNITY_VALUES,
      "trust opportunity",
    ),
    geographicFit: parseEnum(value.geographicFit, GEOGRAPHIC_FIT_VALUES, "geographic fit"),
    topicSensitivity: parseEnum(
      value.topicSensitivity,
      TOPIC_SENSITIVITY_VALUES,
      "topic sensitivity",
    ),
    primaryIntent: parseEnum(value.primaryIntent, PRIMARY_INTENT_VALUES, "primary intent"),
    selfContainedHelp: parseEnum(
      value.selfContainedHelp,
      SELF_CONTAINED_HELP_VALUES,
      "self-contained help",
    ),
    informationCompleteness: parseEnum(
      value.informationCompleteness,
      INFORMATION_COMPLETENESS_VALUES,
      "information completeness",
    ),
  };
}
