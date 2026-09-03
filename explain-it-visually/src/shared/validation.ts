import {
  INPUT_LIMITS,
  OUTPUT_LAYOUTS,
  VISUAL_LAYOUTS,
  VISUAL_STYLES,
  type GenerateRequest,
  type OutputLayout,
  type VisualItem,
  type VisualLayout,
  type VisualPlan,
  type VisualStyle,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isVisualLayout(value: unknown): value is VisualLayout {
  return (
    typeof value === "string" &&
    (VISUAL_LAYOUTS as readonly string[]).includes(value)
  );
}

function isOutputLayout(value: unknown): value is OutputLayout {
  return (
    typeof value === "string" &&
    (OUTPUT_LAYOUTS as readonly string[]).includes(value)
  );
}

function isVisualStyle(value: unknown): value is VisualStyle {
  return (
    typeof value === "string" &&
    (VISUAL_STYLES as readonly string[]).includes(value)
  );
}

export function parseGenerateRequest(value: unknown): GenerateRequest {
  if (!isRecord(value)) {
    throw new ValidationError(
      "INVALID_BODY",
      "Send an explanation, a visual format, and a style.",
    );
  }


  if (!hasOnlyKeys(value, ["text", "format", "style"])) {
    throw new ValidationError(
      "INVALID_FIELDS",
      "The request contains a field this app does not use.",
    );
  }

  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (text.length < INPUT_LIMITS.minCharacters) {
    throw new ValidationError(
      "INPUT_TOO_SHORT",
      `Add a little more detail—at least ${INPUT_LIMITS.minCharacters} characters.`,
    );
  }

  if (text.length > INPUT_LIMITS.maxCharacters) {
    throw new ValidationError(
      "INPUT_TOO_LONG",
      `Keep the explanation under ${INPUT_LIMITS.maxCharacters.toLocaleString()} characters.`,
      413,
    );
  }

  const format = value.format ?? "auto";
  if (!isVisualLayout(format)) {
    throw new ValidationError(
      "INVALID_FORMAT",
      "Choose Auto, Steps, Timeline, Comparison, or List.",
    );
  }

  const style = value.style ?? "bright";
  if (!isVisualStyle(style)) {
    throw new ValidationError(
      "INVALID_STYLE",
      "Choose Bright, Dark, or Sketch.",
    );
  }

  return { text, format, style };
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function parseItems(value: unknown): VisualItem[] | null {
  if (!Array.isArray(value)) return null;

  const items: VisualItem[] = [];
  for (const entry of value.slice(0, 6)) {
    if (!isRecord(entry)) return null;
    if (!hasOnlyKeys(entry, ["label", "description"])) return null;
    const label = cleanText(entry.label, 72);
    const description = cleanText(entry.description, 180);
    if (!label || !description) return null;
    items.push({ label, description });
  }

  return items;
}

export function parseVisualPlan(
  value: unknown,
  requestedFormat: VisualLayout,
): VisualPlan | null {
  if (!isRecord(value)) return null;
  if (
    !hasOnlyKeys(value, [
      "title",
      "summary",
      "layout",
      "items",
      "takeaway",
      "altText",
    ])
  ) {
    return null;
  }

  const title = cleanText(value.title, 90);
  const summary = cleanText(value.summary, 240);
  const takeaway = cleanText(value.takeaway, 220);
  const altText = cleanText(value.altText, 500);
  const modelLayout = value.layout;
  const items = parseItems(value.items);

  if (
    !title ||
    !summary ||
    !takeaway ||
    !altText ||
    !isOutputLayout(modelLayout) ||
    !items
  ) {
    return null;
  }

  const layout: OutputLayout =
    requestedFormat === "auto" ? modelLayout : requestedFormat;

  if (layout === "comparison") {
    if (items.length < 2) return null;
    const comparisonItems = items.slice(0, 2);
    return {
      title,
      summary,
      layout,
      items: comparisonItems,
      takeaway,
      altText: buildAccessibleDescription(
        title,
        summary,
        comparisonItems,
        takeaway,
      ),
    };
  }

  if (items.length < 3) return null;

  return {
    title,
    summary,
    layout,
    items,
    takeaway,
    altText: buildAccessibleDescription(title, summary, items, takeaway),
  };
}

function buildAccessibleDescription(
  title: string,
  summary: string,
  items: VisualItem[],
  takeaway: string,
): string {
  const itemText = items
    .map(
      (item, index) =>
        `Point ${index + 1}: ${item.label}. ${item.description}`,
    )
    .join(" ");
  return `${title}. ${summary} ${itemText} Takeaway: ${takeaway}`.slice(0, 500);
}
