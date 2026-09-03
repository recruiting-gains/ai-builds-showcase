import type { MeetingExtraction } from "./contracts";

export function buildFollowUpEmail(result: MeetingExtraction): string {
  const decisions =
    result.decisions.length > 0
      ? result.decisions.map((decision) => "- " + decision).join("\n")
      : "- No explicit decisions were recorded.";
  const actionItems =
    result.actionItems.length > 0
      ? result.actionItems
          .map(
            (item) =>
              "- " +
              item.task +
              " — Owner: " +
              item.owner +
              " — Due: " +
              item.dueDate
          )
          .join("\n")
      : "- No explicit action items were recorded.";

  return [
    "Subject: Follow-up — " + result.title,
    "",
    "Hi team,",
    "",
    "Thanks for meeting. Here is the recap:",
    result.summary,
    "",
    "Decisions",
    decisions,
    "",
    "Action items",
    actionItems,
    "",
    "Please reply with any corrections or missing details.",
    "",
    "Best,",
    "[Your name]"
  ].join("\n");
}
