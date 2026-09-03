import type {
  FactorBreakdown,
  OpportunityLabel,
  ScoreGuardrail,
  ScoreInput,
  ScorePenalty,
  ScoreResult,
} from "./contracts";

interface FactorChoice {
  points: number;
  selection: string;
  reason: string;
}

interface FactorDefinition {
  key: FactorBreakdown["key"];
  title: string;
  maximum: number;
  choices: Record<string, FactorChoice>;
}

const FACTORS: readonly FactorDefinition[] = [
  {
    key: "businessRelevance",
    title: "Business relevance",
    maximum: 16,
    choices: {
      direct: {
        points: 16,
        selection: "Direct match",
        reason: "Your real work experience directly matches the question being discussed.",
      },
      adjacent: {
        points: 9,
        selection: "Related experience",
        reason: "Your experience is related, but it does not fully match the question.",
      },
      weak: {
        points: 3,
        selection: "Loose connection",
        reason: "The connection to your work is limited and may not add much context.",
      },
      none: {
        points: 0,
        selection: "No real connection",
        reason: "Your business experience does not match what the conversation needs.",
      },
    },
  },
  {
    key: "helpfulnessGap",
    title: "Helpfulness gap",
    maximum: 24,
    choices: {
      clear: {
        points: 24,
        selection: "Clear unanswered need",
        reason: "A specific question remains unanswered and your experience could address it.",
      },
      partial: {
        points: 13,
        selection: "Partly answered",
        reason: "Useful answers exist, but an important practical gap remains.",
      },
      already_answered: {
        points: 4,
        selection: "Already answered well",
        reason:
          "The conversation already contains useful answers, so another voice has limited value.",
      },
      none: {
        points: 0,
        selection: "No help requested",
        reason: "There is no visible request or need that your experience would resolve.",
      },
    },
  },
  {
    key: "ruleFit",
    title: "Community-rule fit",
    maximum: 22,
    choices: {
      allowed: {
        points: 22,
        selection: "Clearly allowed",
        reason: "You read the rules and business participation is clearly allowed here.",
      },
      conditional: {
        points: 12,
        selection: "Allowed with conditions",
        reason:
          "Participation is permitted only if you follow stated limits or disclose affiliation.",
      },
      unknown: {
        points: 0,
        selection: "Rules not confirmed",
        reason: "You have not confirmed whether the community allows business participation.",
      },
      prohibited: {
        points: 0,
        selection: "Business participation prohibited",
        reason: "The community rules prohibit this kind of business participation.",
      },
    },
  },
  {
    key: "freshness",
    title: "Freshness",
    maximum: 8,
    choices: {
      today: {
        points: 8,
        selection: "Current",
        reason: "The discussion is recent enough for a practical answer to remain timely.",
      },
      recent: {
        points: 5,
        selection: "Recent",
        reason: "The discussion is still reasonably current, though the need may have changed.",
      },
      old: {
        points: 1,
        selection: "Older",
        reason: "The discussion may no longer need another response.",
      },
    },
  },
  {
    key: "momentum",
    title: "Conversation momentum",
    maximum: 10,
    choices: {
      early: {
        points: 10,
        selection: "Early and unsolved",
        reason: "The conversation is active without being crowded or repetitive.",
      },
      active: {
        points: 7,
        selection: "Active",
        reason: "People are still engaged, with some room for a distinct practical perspective.",
      },
      slow: {
        points: 3,
        selection: "Quiet or slowing",
        reason: "The conversation has limited current activity.",
      },
      saturated: {
        points: 0,
        selection: "Saturated",
        reason: "Many similar answers are already competing for attention.",
      },
    },
  },
  {
    key: "trustOpportunity",
    title: "Trust opportunity",
    maximum: 12,
    choices: {
      firsthand: {
        points: 12,
        selection: "Specific firsthand experience",
        reason: "You can offer concrete experience and clearly disclose your connection.",
      },
      informed: {
        points: 7,
        selection: "Informed perspective",
        reason: "You understand the subject, but your experience is not directly firsthand.",
      },
      limited: {
        points: 2,
        selection: "Limited basis",
        reason: "You would have little specific experience to support what you say.",
      },
    },
  },
  {
    key: "geographicFit",
    title: "Geographic fit",
    maximum: 8,
    choices: {
      exact: {
        points: 8,
        selection: "Exact local fit",
        reason: "Your direct knowledge of the place is relevant to the question.",
      },
      nearby: {
        points: 5,
        selection: "Nearby knowledge",
        reason: "Your regional experience may help, but local differences could matter.",
      },
      broad: {
        points: 2,
        selection: "Broad only",
        reason: "You have general context but no meaningful local knowledge.",
      },
      irrelevant: {
        points: 0,
        selection: "Location mismatch",
        reason: "The conversation depends on a place you do not know well.",
      },
      not_applicable: {
        points: 4,
        selection: "Location not relevant",
        reason: "Geography does not materially affect the question.",
      },
    },
  },
] as const;

const SUMMARY_BY_LABEL: Record<OpportunityLabel, string> = {
  "Helpful opening": "There is a clear, rules-compatible gap your experience may help fill.",
  "Worth reading": "The conversation may benefit, but read more before deciding.",
  Observe: "The opening is limited. More context or time may change the judgment.",
  "Stay quiet": "Not entering this conversation is a responsible result.",
};

const NEXT_STEPS: Record<OpportunityLabel, string[]> = {
  "Helpful opening": [
    "Re-read the community rules immediately before participating.",
    "Answer the actual question with useful detail that stands on its own.",
    "Disclose your business connection plainly and respect moderator direction.",
  ],
  "Worth reading": [
    "Read the full conversation and confirm the unresolved need.",
    "Check whether a better answer appeared after your review.",
    "Participate only if the answer can be useful without a click or sales follow-up.",
  ],
  Observe: [
    "Keep listening and verify the missing context before entering.",
    "Do not repeat advice that the community already has.",
    "Recheck only if a clearer, rules-compatible need appears.",
  ],
  "Stay quiet": [
    "Do not enter this conversation for business purposes.",
    "Treat restraint as the completed decision, not a missed opportunity.",
    "Look for a different conversation with a clear request for your experience.",
  ],
};

export function classifyScore(score: number): OpportunityLabel {
  if (score >= 75) return "Helpful opening";
  if (score >= 55) return "Worth reading";
  if (score >= 35) return "Observe";
  return "Stay quiet";
}

function buildFactors(input: ScoreInput): FactorBreakdown[] {
  return FACTORS.map((definition) => {
    const selectedValue = input[definition.key];
    const choice = definition.choices[selectedValue];
    if (!choice) {
      throw new Error(`Missing scoring definition for ${definition.key}.`);
    }

    return {
      key: definition.key,
      title: definition.title,
      selection: choice.selection,
      points: choice.points,
      maximum: definition.maximum,
      reason: choice.reason,
    };
  });
}

function buildPenalties(input: ScoreInput): ScorePenalty[] {
  const penalties: ScorePenalty[] = [];

  if (input.momentum === "saturated") {
    penalties.push({
      code: "SATURATED_CONVERSATION",
      title: "Saturated conversation",
      points: -18,
      reason: "A crowded thread makes another business-adjacent voice more likely to add noise.",
    });
  }

  if (input.primaryIntent === "mixed") {
    penalties.push({
      code: "MIXED_INTENT",
      title: "Mixed helpful and promotional intent",
      points: -20,
      reason:
        "A hoped-for business benefit weakens the case for joining, even when help is also intended.",
    });
  }

  if (input.selfContainedHelp === "partial") {
    penalties.push({
      code: "PARTIAL_SELF_CONTAINED_VALUE",
      title: "Help is only partly self-contained",
      points: -8,
      reason:
        "The useful part should not depend on visiting a business page or starting a sales conversation.",
    });
  }

  if (input.selfContainedHelp === "requires_click") {
    penalties.push({
      code: "REQUIRES_CLICK",
      title: "Value depends on a click or contact",
      points: -25,
      reason:
        "A contribution that withholds the useful part until someone clicks or contacts you is not community-first.",
    });
  }

  if (input.informationCompleteness === "gaps") {
    penalties.push({
      code: "INFORMATION_GAPS",
      title: "Important information is missing",
      points: -12,
      reason:
        "The decision is less reliable because some rules or conversation context remain unclear.",
    });
  }

  return penalties;
}

function buildGuardrails(input: ScoreInput): ScoreGuardrail[] {
  const guardrails: ScoreGuardrail[] = [];

  if (input.ruleFit === "prohibited") {
    guardrails.push({
      code: "BUSINESS_PARTICIPATION_PROHIBITED",
      kind: "exclusion",
      title: "The rules say no",
      reason:
        "Community rules prohibit this business participation, so the responsible result is to stay out.",
    });
  }

  if (input.topicSensitivity === "sensitive") {
    guardrails.push({
      code: "SENSITIVE_TOPIC",
      kind: "exclusion",
      title: "Sensitive or high-stakes topic",
      reason:
        "Health, legal, safety, financial-crisis, employment-crisis, or private-hardship discussions are outside this business tool.",
    });
  }

  if (input.primaryIntent === "promotion") {
    guardrails.push({
      code: "PROMOTION_ONLY",
      kind: "exclusion",
      title: "Promotion is the main purpose",
      reason: "A promotional opening is not a genuine helpfulness gap.",
    });
  }

  if (input.informationCompleteness === "insufficient") {
    guardrails.push({
      code: "INSUFFICIENT_INFORMATION",
      kind: "exclusion",
      title: "Not enough information",
      reason:
        "The conversation or its rules are too unclear to make a responsible participation decision.",
    });
  }

  if (input.ruleFit === "unknown") {
    guardrails.push({
      code: "RULES_UNKNOWN",
      kind: "cap",
      title: "Rules must be confirmed first",
      reason: "Until the community rules are known, the score cannot rise above Stay quiet.",
      maximumScore: 34,
    });
  }

  if (input.helpfulnessGap === "none") {
    guardrails.push({
      code: "NO_HELPFULNESS_GAP",
      kind: "cap",
      title: "No request for help",
      reason: "Without a genuine unmet need, the score cannot rise above Stay quiet.",
      maximumScore: 34,
    });
  }

  if (input.helpfulnessGap === "already_answered") {
    guardrails.push({
      code: "NEED_ALREADY_MET",
      kind: "cap",
      title: "The need is already met",
      reason: "Good answers are already present, so the score cannot rise above Observe.",
      maximumScore: 54,
    });
  }

  if (input.selfContainedHelp === "requires_click") {
    guardrails.push({
      code: "NOT_SELF_CONTAINED",
      kind: "cap",
      title: "Useful value is withheld",
      reason:
        "If the answer requires a click or contact to become useful, the score cannot rise above Stay quiet.",
      maximumScore: 34,
    });
  }

  if (input.topicSensitivity === "unsure") {
    guardrails.push({
      code: "SENSITIVITY_UNCLEAR",
      kind: "cap",
      title: "Possible sensitive subject",
      reason: "When sensitivity is unclear, the score cannot rise above Stay quiet.",
      maximumScore: 34,
    });
  }

  if (input.informationCompleteness === "gaps") {
    guardrails.push({
      code: "CONTEXT_INCOMPLETE",
      kind: "cap",
      title: "Context needs another read",
      reason: "With important gaps, the score cannot rise above Observe.",
      maximumScore: 54,
    });
  }

  return guardrails;
}

function buildUncertainty(input: ScoreInput): ScoreResult["uncertainty"] {
  const reasons: string[] = [];

  if (input.ruleFit === "unknown") reasons.push("Community participation rules are unconfirmed.");
  if (input.topicSensitivity === "unsure")
    reasons.push("The subject may involve sensitive or high-stakes circumstances.");
  if (input.informationCompleteness === "gaps")
    reasons.push("Some important conversation context is missing.");
  if (input.informationCompleteness === "insufficient")
    reasons.push("There is not enough context for a reliable decision.");

  const level =
    input.informationCompleteness === "insufficient" ||
    input.ruleFit === "unknown" ||
    input.topicSensitivity === "unsure"
      ? "high"
      : input.informationCompleteness === "gaps"
        ? "moderate"
        : "low";

  return { level, reasons };
}

export function scoreConversation(input: ScoreInput): ScoreResult {
  const factors = buildFactors(input);
  const penalties = buildPenalties(input);
  const guardrails = buildGuardrails(input);
  const baseScore = factors.reduce((total, factor) => total + factor.points, 0);
  const penaltyTotal = penalties.reduce((total, penalty) => total + penalty.points, 0);
  const totalBeforeGuardrails = Math.max(0, Math.min(100, baseScore + penaltyTotal));
  const excluded = guardrails.some((guardrail) => guardrail.kind === "exclusion");
  const caps = guardrails
    .filter((guardrail) => guardrail.kind === "cap")
    .map((guardrail) => guardrail.maximumScore ?? 100);
  const activeCap = caps.length > 0 ? Math.min(...caps) : 100;
  const score = excluded ? 0 : Math.min(totalBeforeGuardrails, activeCap);
  const label = classifyScore(score);

  return {
    modelVersion: "1.0",
    score,
    baseScore,
    totalBeforeGuardrails,
    maximumScore: 100,
    label,
    excluded,
    summary: SUMMARY_BY_LABEL[label],
    factors,
    penalties,
    guardrails,
    uncertainty: buildUncertainty(input),
    nextSteps: NEXT_STEPS[label],
  };
}
