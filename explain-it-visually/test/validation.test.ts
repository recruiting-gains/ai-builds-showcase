import { describe, expect, it } from "vitest";
import { parseGenerateRequest, parseVisualPlan, ValidationError } from "../src/shared/validation";

describe("parseGenerateRequest", () => {
  it("accepts a bounded request and supplies defaults", () => {
    expect(
      parseGenerateRequest({
        text: "  A clear process has enough detail to make a useful visual.  ",
      }),
    ).toEqual({
      text: "A clear process has enough detail to make a useful visual.",
      format: "auto",
      style: "bright",
    });
  });

  it.each([
    null,
    [],
    { text: "too short" },
    { text: "A long enough explanation that contains an invalid format.", format: "poster" },
    { text: "A long enough explanation that contains an unknown field.", extra: true },
  ])("rejects invalid input %#", (value) => {
    expect(() => parseGenerateRequest(value)).toThrow(ValidationError);
  });

  it("rejects text above the character limit", () => {
    expect(() => parseGenerateRequest({ text: "a".repeat(3_501) })).toThrowError(
      expect.objectContaining({ code: "INPUT_TOO_LONG", status: 413 }),
    );
  });
});

describe("parseVisualPlan", () => {
  const validPlan = {
    title: "How a useful workflow works",
    summary: "A short explanation of the full process.",
    layout: "steps",
    items: [
      { label: "Choose", description: "Start with one clear task." },
      { label: "Gather", description: "Bring in only useful information." },
      { label: "Review", description: "Check the draft before sharing." },
    ],
    takeaway: "A person still makes the final decision.",
    altText: "A three-step visual showing Choose, Gather, and Review.",
  };

  it("returns a newly validated plan", () => {
    expect(parseVisualPlan(validPlan, "auto")).toEqual({
      ...validPlan,
      altText:
        "How a useful workflow works. A short explanation of the full process. Point 1: Choose. Start with one clear task. Point 2: Gather. Bring in only useful information. Point 3: Review. Check the draft before sharing. Takeaway: A person still makes the final decision.",
    });
  });

  it("honors an explicit requested layout", () => {
    expect(parseVisualPlan(validPlan, "timeline")?.layout).toBe("timeline");
  });

  it("limits comparisons to two items", () => {
    const result = parseVisualPlan(
      { ...validPlan, layout: "comparison" },
      "comparison",
    );
    expect(result?.items).toHaveLength(2);
  });

  it("rejects extra model fields", () => {
    expect(parseVisualPlan({ ...validPlan, html: "<script>bad()</script>" }, "auto")).toBeNull();
  });

  it("rejects extra item fields and incomplete plans", () => {
    expect(
      parseVisualPlan(
        {
          ...validPlan,
          items: [
            ...validPlan.items.slice(0, 2),
            { ...validPlan.items[2], onload: "bad()" },
          ],
        },
        "auto",
      ),
    ).toBeNull();
    expect(parseVisualPlan({ ...validPlan, items: validPlan.items.slice(0, 2) }, "auto")).toBeNull();
  });
});
