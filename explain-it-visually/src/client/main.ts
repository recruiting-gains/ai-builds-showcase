import type { Infographic as InfographicInstance } from "@antv/infographic";
import type {
  ApiErrorResponse,
  GenerateRequest,
  GenerateResponse,
  OutputLayout,
  VisualItem,
  VisualPlan,
  VisualStyle,
} from "../shared/contracts";
import "./styles.css";

const TEMPLATE_BY_LAYOUT: Record<OutputLayout, string> = {
  steps: "sequence-steps-simple",
  timeline: "sequence-timeline-simple",
  comparison: "compare-binary-horizontal-simple-vs",
  list: "list-grid-compact-card",
};

const THEME_BY_STYLE: Record<VisualStyle, string> = {
  bright: "light",
  dark: "dark",
  sketch: "hand-drawn",
};

const SAMPLE_TEXT =
  "A useful AI workflow begins with one clear task. Next, gather only the information needed for that task. Ask the AI for a small first draft, then check every important fact and decision. Finally, a person reviews the result, makes corrections, and decides whether it is ready to share.";

let infographic: InfographicInstance | null = null;
let currentPlan: VisualPlan | null = null;
let currentStyle: VisualStyle = "bright";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const form = requiredElement<HTMLFormElement>("#visual-form");
const sourceText = requiredElement<HTMLTextAreaElement>("#source-text");
const characterCount = requiredElement<HTMLElement>("#character-count");
const generateButton = requiredElement<HTMLButtonElement>("#generate-button");
const readyLabel = requiredElement<HTMLElement>(".button-ready");
const loadingLabel = requiredElement<HTMLElement>(".button-loading");
const formMessage = requiredElement<HTMLElement>("#form-message");
const liveStatus = requiredElement<HTMLElement>("#live-status");
const resultEmpty = requiredElement<HTMLElement>("#result-empty");
const resultReady = requiredElement<HTMLElement>("#result-ready");
const visualStage = requiredElement<HTMLElement>("#visual-stage");
const structuredTitle = requiredElement<HTMLElement>("#structured-title");
const structuredSummary = requiredElement<HTMLElement>("#structured-summary");
const structuredItems = requiredElement<HTMLOListElement>("#structured-items");
const structuredTakeaway = requiredElement<HTMLElement>("#structured-takeaway");
const editTitle = requiredElement<HTMLInputElement>("#edit-title");
const editSummary = requiredElement<HTMLTextAreaElement>("#edit-summary");
const editItems = requiredElement<HTMLElement>("#edit-items");
const editTakeaway = requiredElement<HTMLTextAreaElement>("#edit-takeaway");
const editAltText = requiredElement<HTMLTextAreaElement>("#edit-alt-text");
const downloadPng = requiredElement<HTMLButtonElement>("#download-png");
const downloadSvg = requiredElement<HTMLButtonElement>("#download-svg");

function updateCharacterCount(): void {
  characterCount.textContent = `${sourceText.value.length.toLocaleString()} / 3,500`;
}

function setBusy(busy: boolean): void {
  generateButton.disabled = busy;
  sourceText.readOnly = busy;
  readyLabel.hidden = busy;
  loadingLabel.hidden = !busy;
  form.setAttribute("aria-busy", String(busy));
}

function showError(message: string): void {
  formMessage.textContent = message;
  formMessage.hidden = false;
  liveStatus.textContent = `Could not create the visual. ${message}`;
  formMessage.focus({ preventScroll: true });
}

function clearError(): void {
  formMessage.textContent = "";
  formMessage.hidden = true;
}

function selectedValue(name: string): string {
  const checked = form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  return checked?.value ?? "";
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "explain-it-visually";
}

function triggerDownload(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

export function infographicOptions(plan: VisualPlan, style: VisualStyle) {
  const items = plan.items.map((item) => ({
    label: item.label,
    desc: item.description,
  }));

  const data =
    plan.layout === "comparison"
      ? {
          title: plan.title,
          desc: plan.summary,
          compares: items.map((item) => ({ children: [item] })),
        }
      : plan.layout === "list"
        ? { title: plan.title, desc: plan.summary, lists: items }
        : { title: plan.title, desc: plan.summary, sequences: items };

  return {
    width: "100%",
    height: "100%",
    editable: true,
    template: TEMPLATE_BY_LAYOUT[plan.layout],
    theme: THEME_BY_STYLE[style],
    data,
    themeConfig: {
      base: { text: { "font-family": "Arial, sans-serif" } },
    },
    svg: { background: true },
  } as const;
}

function populateStructuredResult(plan: VisualPlan): void {
  structuredTitle.textContent = plan.title;
  structuredSummary.textContent = plan.summary;
  structuredTakeaway.textContent = plan.takeaway;
  structuredItems.replaceChildren(
    ...plan.items.map((item) => {
      const listItem = document.createElement("li");
      const heading = document.createElement("strong");
      heading.textContent = item.label;
      const description = document.createElement("span");
      description.textContent = item.description;
      listItem.append(heading, description);
      return listItem;
    }),
  );
}

async function renderVisual(): Promise<void> {
  if (!currentPlan) return;

  downloadPng.disabled = true;
  downloadSvg.disabled = true;
  infographic?.destroy();
  visualStage.replaceChildren();
  const { Infographic } = await import("@antv/infographic");
  infographic = new Infographic({
    container: visualStage,
    ...infographicOptions(currentPlan, currentStyle),
  });

  const instance = infographic;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      instance.off("loaded", finish);
      resolve();
    };
    instance.on("loaded", finish);
    instance.render();
    window.setTimeout(finish, 2_500);
  });

  visualStage.setAttribute("aria-label", currentPlan.altText);
  populateStructuredResult(currentPlan);
  downloadPng.disabled = false;
  downloadSvg.disabled = false;
}

function itemField(item: VisualItem, index: number): HTMLElement {
  const wrapper = document.createElement("fieldset");
  wrapper.className = "edit-item";

  const legend = document.createElement("legend");
  legend.textContent = `Point ${index + 1}`;
  wrapper.append(legend);

  const labelWrapper = document.createElement("label");
  labelWrapper.textContent = "Label";
  const labelInput = document.createElement("input");
  labelInput.className = "edit-item-label";
  labelInput.maxLength = 72;
  labelInput.value = item.label;
  labelWrapper.append(labelInput);

  const descriptionWrapper = document.createElement("label");
  descriptionWrapper.textContent = "Description";
  const descriptionInput = document.createElement("textarea");
  descriptionInput.className = "edit-item-description";
  descriptionInput.rows = 2;
  descriptionInput.maxLength = 180;
  descriptionInput.value = item.description;
  descriptionWrapper.append(descriptionInput);

  wrapper.append(labelWrapper, descriptionWrapper);
  return wrapper;
}

function populateEditor(plan: VisualPlan): void {
  editTitle.value = plan.title;
  editSummary.value = plan.summary;
  editTakeaway.value = plan.takeaway;
  editAltText.value = plan.altText;
  editItems.replaceChildren(...plan.items.map(itemField));
}

async function showResult(plan: VisualPlan, style: VisualStyle): Promise<void> {
  currentPlan = plan;
  currentStyle = style;
  populateEditor(plan);
  resultEmpty.hidden = true;
  resultReady.hidden = false;
  await renderVisual();
  liveStatus.textContent = `Visual created: ${plan.title}. Review the wording and meaning before downloading.`;
  resultReady.scrollIntoView({ behavior: "smooth", block: "start" });
}

function readEditedItems(): VisualItem[] {
  const groups = Array.from(editItems.querySelectorAll<HTMLElement>(".edit-item"));
  return groups.map((group) => ({
    label: requiredChild<HTMLInputElement>(group, ".edit-item-label").value.trim(),
    description: requiredChild<HTMLTextAreaElement>(group, ".edit-item-description").value.trim(),
  }));
}

function requiredChild<T extends Element>(parent: Element, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Missing editor field: ${selector}`);
  return element;
}

async function applyEdits(): Promise<void> {
  if (!currentPlan) return;
  const items = readEditedItems();
  const values = [
    editTitle.value.trim(),
    editSummary.value.trim(),
    editTakeaway.value.trim(),
    editAltText.value.trim(),
    ...items.flatMap((item) => [item.label, item.description]),
  ];
  if (values.some((value) => !value)) {
    liveStatus.textContent = "Every edit field needs text before the visual can be updated.";
    return;
  }

  currentPlan = {
    ...currentPlan,
    title: editTitle.value.trim(),
    summary: editSummary.value.trim(),
    takeaway: editTakeaway.value.trim(),
    altText: editAltText.value.trim(),
    items,
  };
  await renderVisual();
  liveStatus.textContent = "Your edits are now shown in the visual.";
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Partial<ApiErrorResponse>;
    return body.error?.message ?? "Something went wrong. Please try again.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  clearError();

  const text = sourceText.value.trim();
  if (text.length < 30) {
    showError("Add a little more detail—at least 30 characters.");
    sourceText.focus();
    return;
  }

  const request: GenerateRequest = {
    text,
    format: selectedValue("format") as GenerateRequest["format"],
    style: selectedValue("style") as VisualStyle,
  };

  setBusy(true);
  liveStatus.textContent = "Organizing the main ideas into a visual draft.";

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(await parseApiError(response));

    const body = (await response.json()) as GenerateResponse;
    await showResult(body.plan, request.style);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
  } finally {
    setBusy(false);
  }
}

function loadExample(): void {
  sourceText.value = SAMPLE_TEXT;
  updateCharacterCount();
  sourceText.focus();
  sourceText.scrollIntoView({ behavior: "smooth", block: "center" });
  liveStatus.textContent = "Example added. Choose a format or let Auto decide.";
}

async function download(type: "png" | "svg"): Promise<void> {
  if (!infographic || !currentPlan) return;
  liveStatus.textContent = `Preparing the ${type.toUpperCase()} download.`;
  try {
    const dataUrl = await infographic.toDataURL(
      type === "png" ? { type: "png", dpr: 2 } : { type: "svg" },
    );
    triggerDownload(dataUrl, `${slugify(currentPlan.title)}.${type}`);
    liveStatus.textContent = `${type.toUpperCase()} downloaded.`;
  } catch {
    liveStatus.textContent = `The ${type.toUpperCase()} download did not work. Try the other format.`;
  }
}

async function copyAltText(): Promise<void> {
  const value = editAltText.value.trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    liveStatus.textContent = "Accessible description copied.";
  } catch {
    editAltText.select();
    liveStatus.textContent = "The description is selected. Copy it with Command+C or Control+C.";
  }
}

sourceText.addEventListener("input", updateCharacterCount);
form.addEventListener("submit", (event) => void handleSubmit(event));
requiredElement<HTMLButtonElement>("#load-example").addEventListener("click", loadExample);
requiredElement<HTMLButtonElement>("#load-example-top").addEventListener("click", loadExample);
requiredElement<HTMLButtonElement>("#apply-edits").addEventListener("click", () => void applyEdits());
downloadPng.addEventListener("click", () => void download("png"));
downloadSvg.addEventListener("click", () => void download("svg"));
requiredElement<HTMLButtonElement>("#copy-alt-text").addEventListener("click", () => void copyAltText());

updateCharacterCount();
