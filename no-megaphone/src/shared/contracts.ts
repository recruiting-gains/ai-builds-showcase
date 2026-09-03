export const BUSINESS_RELEVANCE_VALUES = ["direct", "adjacent", "weak", "none"] as const;

export const HELPFULNESS_GAP_VALUES = ["clear", "partial", "already_answered", "none"] as const;

export const RULE_FIT_VALUES = ["allowed", "conditional", "unknown", "prohibited"] as const;

export const FRESHNESS_VALUES = ["today", "recent", "old"] as const;
export const MOMENTUM_VALUES = ["early", "active", "slow", "saturated"] as const;
export const TRUST_OPPORTUNITY_VALUES = ["firsthand", "informed", "limited"] as const;
export const GEOGRAPHIC_FIT_VALUES = [
  "exact",
  "nearby",
  "broad",
  "irrelevant",
  "not_applicable",
] as const;
export const TOPIC_SENSITIVITY_VALUES = ["ordinary", "unsure", "sensitive"] as const;
export const PRIMARY_INTENT_VALUES = ["help", "mixed", "promotion"] as const;
export const SELF_CONTAINED_HELP_VALUES = ["yes", "partial", "requires_click"] as const;
export const INFORMATION_COMPLETENESS_VALUES = ["sufficient", "gaps", "insufficient"] as const;

export type BusinessRelevance = (typeof BUSINESS_RELEVANCE_VALUES)[number];
export type HelpfulnessGap = (typeof HELPFULNESS_GAP_VALUES)[number];
export type RuleFit = (typeof RULE_FIT_VALUES)[number];
export type Freshness = (typeof FRESHNESS_VALUES)[number];
export type Momentum = (typeof MOMENTUM_VALUES)[number];
export type TrustOpportunity = (typeof TRUST_OPPORTUNITY_VALUES)[number];
export type GeographicFit = (typeof GEOGRAPHIC_FIT_VALUES)[number];
export type TopicSensitivity = (typeof TOPIC_SENSITIVITY_VALUES)[number];
export type PrimaryIntent = (typeof PRIMARY_INTENT_VALUES)[number];
export type SelfContainedHelp = (typeof SELF_CONTAINED_HELP_VALUES)[number];
export type InformationCompleteness = (typeof INFORMATION_COMPLETENESS_VALUES)[number];

export interface ScoreInput {
  businessRelevance: BusinessRelevance;
  helpfulnessGap: HelpfulnessGap;
  ruleFit: RuleFit;
  freshness: Freshness;
  momentum: Momentum;
  trustOpportunity: TrustOpportunity;
  geographicFit: GeographicFit;
  topicSensitivity: TopicSensitivity;
  primaryIntent: PrimaryIntent;
  selfContainedHelp: SelfContainedHelp;
  informationCompleteness: InformationCompleteness;
}

export type OpportunityLabel = "Helpful opening" | "Worth reading" | "Observe" | "Stay quiet";

export interface FactorBreakdown {
  key:
    | "businessRelevance"
    | "helpfulnessGap"
    | "ruleFit"
    | "freshness"
    | "momentum"
    | "trustOpportunity"
    | "geographicFit";
  title: string;
  selection: string;
  points: number;
  maximum: number;
  reason: string;
}

export interface ScorePenalty {
  code: string;
  title: string;
  points: number;
  reason: string;
}

export interface ScoreGuardrail {
  code: string;
  kind: "exclusion" | "cap";
  title: string;
  reason: string;
  maximumScore?: number;
}

export interface ScoreResult {
  modelVersion: "1.0";
  score: number;
  baseScore: number;
  totalBeforeGuardrails: number;
  maximumScore: 100;
  label: OpportunityLabel;
  excluded: boolean;
  summary: string;
  factors: FactorBreakdown[];
  penalties: ScorePenalty[];
  guardrails: ScoreGuardrail[];
  uncertainty: {
    level: "low" | "moderate" | "high";
    reasons: string[];
  };
  nextSteps: string[];
}

export interface ScoreResponse {
  result: ScoreResult;
  meta: {
    requestId: string;
    notStored: true;
    deterministic: true;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export const API_LIMITS = {
  maxBodyBytes: 4_096,
} as const;
