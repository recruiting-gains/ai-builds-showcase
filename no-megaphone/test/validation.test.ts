import { describe, expect, it } from "vitest";

import { parseScoreInput, ValidationError } from "../src/shared/validation";
import { IDEAL_INPUT } from "./fixtures";

describe("parseScoreInput", () => {
  it("accepts exactly the published structured fields", () => {
    expect(parseScoreInput({ ...IDEAL_INPUT })).toEqual(IDEAL_INPUT);
  });

  it.each([
    null,
    [],
    "not an object",
    { ...IDEAL_INPUT, ruleFit: "maybe" },
    { ...IDEAL_INPUT, helpfulnessGap: "<script>alert(1)</script>" },
    { ...IDEAL_INPUT, username: "not-collected" },
    { ...IDEAL_INPUT, discussion: "not-collected" },
    { ...IDEAL_INPUT, geographicFit: undefined },
  ])("rejects malformed or out-of-bound input %#", (value) => {
    expect(() => parseScoreInput(value)).toThrow(ValidationError);
  });

  it("rejects a missing field instead of choosing a default", () => {
    const { freshness: _removed, ...incomplete } = IDEAL_INPUT;
    expect(() => parseScoreInput(incomplete)).toThrowError(
      expect.objectContaining({ code: "INVALID_FIELDS" }),
    );
  });

  it("does not accept inherited values as a replacement for exact fields", () => {
    const inherited = Object.create(IDEAL_INPUT) as Record<string, unknown>;
    expect(() => parseScoreInput(inherited)).toThrowError(
      expect.objectContaining({ code: "INVALID_FIELDS" }),
    );
  });
});
