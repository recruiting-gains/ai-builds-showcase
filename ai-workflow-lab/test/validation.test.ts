import { describe, expect, it } from "vitest";
import { buildFollowUpEmail } from "../src/formatters";
import {
  isContentResult,
  isMeetingExtraction,
  normalizePlainText,
  parseContentInput,
  parseMeetingInput,
  parseModelPayload,
  RequestError
} from "../src/validation";

describe("request validation", () => {
  it("normalizes valid meeting notes", () => {
    const result = parseMeetingInput({
      text: "  We agreed to ship the class demo on Friday. Jordan will test it.  "
    });
    expect(result.text.startsWith("We agreed")).toBe(true);
  });

  it("rejects short meeting notes", () => {
    expect(() => parseMeetingInput({ text: "Too short" })).toThrow(RequestError);
  });

  it("accepts a complete content request", () => {
    const result = parseContentInput({
      text: "This is a long enough source about learning how small AI workflows are built.",
      audience: "AI students",
      tone: "friendly",
      callToAction: "Try the demo"
    });
    expect(result.tone).toBe("friendly");
  });

  it("rejects unsupported tones", () => {
    expect(() =>
      parseContentInput({
        text: "This is a long enough source about learning how small AI workflows are built.",
        audience: "AI students",
        tone: "chaotic",
        callToAction: "Try the demo"
      })
    ).toThrow("Choose a supported tone.");
  });
});

describe("model response validation", () => {
  it("parses JSON strings and accepts a meeting extraction", () => {
    const value = parseModelPayload(
      JSON.stringify({
        title: "Demo planning",
        summary: "The group planned the demo.",
        decisions: ["Ship Friday"],
        actionItems: [
          { task: "Test the demo", owner: "Jordan", dueDate: "Friday" }
        ]
      })
    );
    expect(isMeetingExtraction(value)).toBe(true);
  });

  it("accepts a structured content response", () => {
    expect(
      isContentResult({
        coreMessage: "Small workflows are useful.",
        linkedinPost: "A post",
        shortThread: ["One", "Two", "Three", "Four"],
        newsletterBlurb: "A newsletter",
        titleIdeas: ["A", "B", "C", "D", "E"],
        hashtags: ["#AI", "#Learning", "#BuildInPublic"]
      })
    ).toBe(true);
  });

  it("rejects incomplete model output", () => {
    expect(isMeetingExtraction({ title: "Missing fields" })).toBe(false);
    expect(isContentResult({ coreMessage: "Missing fields" })).toBe(false);
  });

  it("normalizes model-generated HTML line breaks as plain text", () => {
    expect(normalizePlainText("Subject: Demo<br><br>Hello team")).toBe(
      "Subject: Demo\n\nHello team"
    );
  });
});

describe("deterministic formatting", () => {
  it("builds a readable email from the validated extraction", () => {
    const email = buildFollowUpEmail({
      title: "Demo planning",
      summary: "The group agreed to finish and test the class demo.",
      decisions: ["Present the demo Friday"],
      actionItems: [
        { task: "Test the demo", owner: "Jordan", dueDate: "Tuesday" }
      ]
    });

    expect(email).toContain("Subject: Follow-up — Demo planning");
    expect(email).toContain("- Test the demo — Owner: Jordan — Due: Tuesday");
    expect(email).toContain("[Your name]");
    expect(email).not.toContain("<br>");
  });
});
