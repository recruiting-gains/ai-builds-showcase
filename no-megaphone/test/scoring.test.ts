import { describe, expect, it } from "vitest";

import type { ScoreInput } from "../src/shared/contracts";
import { classifyScore, scoreConversation } from "../src/shared/scoring";
import { IDEAL_INPUT } from "./fixtures";

describe("classifyScore", () => {
  it.each([
    [0, "Stay quiet"],
    [34, "Stay quiet"],
    [35, "Observe"],
    [54, "Observe"],
    [55, "Worth reading"],
    [74, "Worth reading"],
    [75, "Helpful opening"],
    [100, "Helpful opening"],
  ] as const)("classifies the exact %i boundary", (score, label) => {
    expect(classifyScore(score)).toBe(label);
  });
});

describe("scoreConversation", () => {
  it("gives the published maximum to an ideal, rules-compatible opening", () => {
    const result = scoreConversation(IDEAL_INPUT);
    expect(result).toMatchObject({
      score: 100,
      baseScore: 100,
      totalBeforeGuardrails: 100,
      maximumScore: 100,
      label: "Helpful opening",
      excluded: false,
    });
    expect(result.factors).toHaveLength(7);
    expect(result.factors.reduce((sum, factor) => sum + factor.maximum, 0)).toBe(100);
    expect(result.penalties).toEqual([]);
    expect(result.guardrails).toEqual([]);
  });

  it.each([
    ["ruleFit", "prohibited", "BUSINESS_PARTICIPATION_PROHIBITED"],
    ["topicSensitivity", "sensitive", "SENSITIVE_TOPIC"],
    ["primaryIntent", "promotion", "PROMOTION_ONLY"],
    ["informationCompleteness", "insufficient", "INSUFFICIENT_INFORMATION"],
  ] as const)("applies the %s exclusion", (field, value, code) => {
    const result = scoreConversation({ ...IDEAL_INPUT, [field]: value } as ScoreInput);
    expect(result.score).toBe(0);
    expect(result.label).toBe("Stay quiet");
    expect(result.excluded).toBe(true);
    expect(result.guardrails).toContainEqual(expect.objectContaining({ code, kind: "exclusion" }));
  });

  it.each([
    ["ruleFit", "unknown", 34, "RULES_UNKNOWN"],
    ["helpfulnessGap", "none", 34, "NO_HELPFULNESS_GAP"],
    ["helpfulnessGap", "already_answered", 54, "NEED_ALREADY_MET"],
    ["selfContainedHelp", "requires_click", 34, "NOT_SELF_CONTAINED"],
    ["topicSensitivity", "unsure", 34, "SENSITIVITY_UNCLEAR"],
    ["informationCompleteness", "gaps", 54, "CONTEXT_INCOMPLETE"],
  ] as const)("caps %s=%s at %i", (field, value, cap, code) => {
    const result = scoreConversation({ ...IDEAL_INPUT, [field]: value } as ScoreInput);
    expect(result.score).toBeLessThanOrEqual(cap);
    expect(result.guardrails).toContainEqual(
      expect.objectContaining({ code, kind: "cap", maximumScore: cap }),
    );
  });

  it("makes unknown rules and no helpfulness gap decisive together", () => {
    const result = scoreConversation({
      ...IDEAL_INPUT,
      ruleFit: "unknown",
      helpfulnessGap: "none",
    });
    expect(result.score).toBe(34);
    expect(result.label).toBe("Stay quiet");
    expect(result.uncertainty.level).toBe("high");
    expect(result.guardrails.filter((item) => item.kind === "cap")).toHaveLength(2);
  });

  it("subtracts every applicable penalty exactly once", () => {
    const result = scoreConversation({
      ...IDEAL_INPUT,
      momentum: "saturated",
      primaryIntent: "mixed",
      selfContainedHelp: "partial",
      informationCompleteness: "gaps",
    });
    expect(result.penalties.map((penalty) => penalty.points)).toEqual([-18, -20, -8, -12]);
    expect(result.baseScore).toBe(90);
    expect(result.totalBeforeGuardrails).toBe(32);
    expect(result.score).toBe(32);
    expect(result.label).toBe("Stay quiet");
  });

  it("strongly penalizes a saturated conversation while retaining the visible factor math", () => {
    const result = scoreConversation({ ...IDEAL_INPUT, momentum: "saturated" });
    expect(result.baseScore).toBe(90);
    expect(result.totalBeforeGuardrails).toBe(72);
    expect(result.score).toBe(72);
    expect(result.label).toBe("Worth reading");
    expect(result.penalties[0]).toMatchObject({ code: "SATURATED_CONVERSATION", points: -18 });
  });

  it("is deterministic and does not mutate its input", () => {
    const frozen = Object.freeze({ ...IDEAL_INPUT });
    const first = scoreConversation(frozen);
    const second = scoreConversation(frozen);
    expect(second).toEqual(first);
    expect(frozen).toEqual(IDEAL_INPUT);
  });

  it("keeps representative weak inputs inside the 0–100 range", () => {
    const result = scoreConversation({
      businessRelevance: "none",
      helpfulnessGap: "none",
      ruleFit: "conditional",
      freshness: "old",
      momentum: "saturated",
      trustOpportunity: "limited",
      geographicFit: "irrelevant",
      topicSensitivity: "ordinary",
      primaryIntent: "mixed",
      selfContainedHelp: "requires_click",
      informationCompleteness: "gaps",
    });
    expect(result.totalBeforeGuardrails).toBe(0);
    expect(result.score).toBe(0);
    expect(result.label).toBe("Stay quiet");
  });
});
