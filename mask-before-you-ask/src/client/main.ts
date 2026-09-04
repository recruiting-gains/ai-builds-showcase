import "./styles.css";

import {
  type Finding,
  MAX_INPUT_CODE_UNITS,
  MAX_NAME_CODE_UNITS,
  MAX_NAMES_TO_HIDE,
} from "../shared/contracts";
import { maskSelectedFindings, scanSensitiveText } from "../shared/masking";

type StageName = "paste" | "review" | "copy";

const SAFE_DEMO_TEXT = `Hi Taylor,

Please call me at (202) 555-0147 or email jordan@example.com about account reference ACCT-4829-7713.

My appointment is September 18, 2026. The private confirmation link is https://example.com/confirm?token=sample-4829.

Thanks,
Jordan Lee`;

const SAFE_DEMO_NAMES = "Jordan Lee";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: ${id}`);
  return element as T;
}

const scanForm = byId<HTMLFormElement>("scan-form");
const sourceText = byId<HTMLTextAreaElement>("source-text");
const namesToHide = byId<HTMLInputElement>("names-to-hide");
const characterCount = byId<HTMLSpanElement>("character-count");
const scanMessage = byId<HTMLParagraphElement>("scan-message");
const scanButton = byId<HTMLButtonElement>("scan-button");
const loadExampleButton = byId<HTMLButtonElement>("load-example");
const clearInputButton = byId<HTMLButtonElement>("clear-input");
const reviewTitle = byId<HTMLHeadingElement>("review-title");
const reviewSummary = byId<HTMLParagraphElement>("review-summary");
const findingCount = byId<HTMLSpanElement>("finding-count");
const sourcePreview = byId<HTMLDivElement>("source-preview");
const noFindings = byId<HTMLDivElement>("no-findings");
const findingsFieldset = byId<HTMLFieldSetElement>("findings-fieldset");
const findingsList = byId<HTMLDivElement>("findings-list");
const selectionMessage = byId<HTMLParagraphElement>("selection-message");
const backToPasteButton = byId<HTMLButtonElement>("back-to-paste");
const maskButton = byId<HTMLButtonElement>("mask-button");
const copyTitle = byId<HTMLHeadingElement>("copy-title");
const copySummary = byId<HTMLParagraphElement>("copy-summary");
const cleanedText = byId<HTMLTextAreaElement>("cleaned-text");
const replacementCount = byId<HTMLSpanElement>("replacement-count");
const changeSelectionsButton = byId<HTMLButtonElement>("change-selections");
const startOverButton = byId<HTMLButtonElement>("start-over");
const copyButton = byId<HTMLButtonElement>("copy-button");
const copyLabel = copyButton.querySelector<HTMLElement>(".copy-label");
const statusMessage = byId<HTMLDivElement>("status-message");

const stages = Array.from(document.querySelectorAll<HTMLElement>("[data-stage]"));
const progressSteps = Array.from(document.querySelectorAll<HTMLElement>("[data-progress-step]"));

let currentText = "";
let findings: Finding[] = [];
let selectedFindingIds = new Set<string>();
let copyResetTimer: number | undefined;

function announce(message: string): void {
  statusMessage.textContent = "";
  window.requestAnimationFrame(() => {
    statusMessage.textContent = message;
  });
}

function focusAfterReveal(element: HTMLElement): void {
  window.requestAnimationFrame(() => element.focus());
}

function setStage(stageName: StageName): void {
  const stageOrder: readonly StageName[] = ["paste", "review", "copy"];
  const activeIndex = stageOrder.indexOf(stageName);

  for (const stage of stages) {
    stage.hidden = stage.dataset.stage !== stageName;
  }

  for (const step of progressSteps) {
    const stepName = step.dataset.progressStep as StageName;
    const stepIndex = stageOrder.indexOf(stepName);
    const isActive = stepName === stageName;
    step.classList.toggle("is-active", isActive);
    step.classList.toggle("is-complete", stepIndex < activeIndex);

    if (isActive) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");

    const number = step.querySelector<HTMLElement>(":scope > span");
    if (number) number.textContent = stepIndex < activeIndex ? "✓" : String(stepIndex + 1);
  }
}

function showScanError(message: string): void {
  scanMessage.textContent = message;
  scanMessage.hidden = false;
}

function clearScanError(): void {
  scanMessage.textContent = "";
  scanMessage.hidden = true;
}

function updateInputState(): void {
  const length = sourceText.value.length;
  characterCount.textContent = `${length.toLocaleString("en-US")} / ${MAX_INPUT_CODE_UNITS.toLocaleString("en-US")}`;
  characterCount.classList.toggle("is-near-limit", length >= MAX_INPUT_CODE_UNITS * 0.9);
  characterCount.classList.toggle("is-over-limit", length > MAX_INPUT_CODE_UNITS);
  scanButton.disabled = sourceText.value.trim().length === 0 || length > MAX_INPUT_CODE_UNITS;
  clearInputButton.disabled = sourceText.value.length === 0 && namesToHide.value.length === 0;
}

function parseNamesToHide(): string[] {
  const rawNames = namesToHide.value
    .split(/[\n,]/u)
    .map((name) => name.trim().replace(/\s+/gu, " "))
    .filter((name) => name.length > 0);

  if (rawNames.length > MAX_NAMES_TO_HIDE) {
    throw new RangeError(`Add no more than ${MAX_NAMES_TO_HIDE} names or phrases.`);
  }

  if (rawNames.some((name) => name.length > MAX_NAME_CODE_UNITS)) {
    throw new RangeError(
      `Keep each name or phrase to ${MAX_NAME_CODE_UNITS.toLocaleString("en-US")} characters or fewer.`,
    );
  }

  const uniqueNames = new Map<string, string>();
  for (const name of rawNames) {
    const key = name.toLocaleLowerCase("en-US");
    if (!uniqueNames.has(key)) uniqueNames.set(key, name);
  }

  return Array.from(uniqueNames.values());
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function renderSourcePreview(): void {
  sourcePreview.replaceChildren();
  let cursor = 0;

  for (const finding of findings) {
    if (finding.start > cursor) {
      sourcePreview.append(document.createTextNode(currentText.slice(cursor, finding.start)));
    }

    const mark = document.createElement("mark");
    mark.dataset.findingId = finding.id;
    mark.dataset.confidence = finding.confidence;
    mark.classList.toggle("is-not-selected", !selectedFindingIds.has(finding.id));
    mark.append(document.createTextNode(currentText.slice(finding.start, finding.end)));

    const accessibleLabel = document.createElement("span");
    accessibleLabel.className = "sr-only";
    accessibleLabel.textContent = ` — ${finding.label}`;
    mark.append(accessibleLabel);
    sourcePreview.append(mark);
    cursor = finding.end;
  }

  if (cursor < currentText.length) {
    sourcePreview.append(document.createTextNode(currentText.slice(cursor)));
  }
}

function updateMarkedSelection(findingId: string, isSelected: boolean): void {
  for (const mark of sourcePreview.querySelectorAll<HTMLElement>("mark[data-finding-id]")) {
    if (mark.dataset.findingId === findingId) {
      mark.classList.toggle("is-not-selected", !isSelected);
      break;
    }
  }
}

function setMaskButtonLabel(label: string): void {
  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  maskButton.replaceChildren(document.createTextNode(`${label} `), arrow);
}

function updateSelectionSummary(): void {
  const selectedCount = selectedFindingIds.size;

  if (findings.length === 0) {
    selectionMessage.textContent = "Read the text once more before continuing.";
    setMaskButtonLabel("Continue with this text");
    return;
  }

  selectionMessage.textContent = `${selectedCount} of ${findings.length} ${pluralize(findings.length, "detail")} selected to mask.`;
  setMaskButtonLabel(
    selectedCount === 0 ? "Continue without masking" : `Mask ${selectedCount} selected`,
  );
}

function createFindingOption(finding: Finding, index: number): HTMLLabelElement {
  const option = document.createElement("label");
  option.className = "finding-option";
  option.classList.toggle("is-selected", selectedFindingIds.has(finding.id));

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = `finding-${index + 1}`;
  checkbox.checked = selectedFindingIds.has(finding.id);

  const main = document.createElement("span");
  main.className = "finding-main";

  const label = document.createElement("strong");
  label.textContent = finding.label;

  const reason = document.createElement("small");
  reason.textContent = finding.reason;
  main.append(label, reason);

  const meta = document.createElement("span");
  meta.className = "finding-meta";

  const replacement = document.createElement("code");
  replacement.className = "replacement-token";
  replacement.textContent = finding.replacement;

  const confidence = document.createElement("span");
  confidence.className = "confidence-label";
  const needsReview = finding.confidence === "review_suggested";
  confidence.classList.toggle("is-review", needsReview);
  confidence.textContent = needsReview ? "Check this one" : "Strong match";
  meta.append(replacement, confidence);

  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selectedFindingIds.add(finding.id);
    else selectedFindingIds.delete(finding.id);
    option.classList.toggle("is-selected", checkbox.checked);
    updateMarkedSelection(finding.id, checkbox.checked);
    updateSelectionSummary();
  });

  option.append(checkbox, main, meta);
  return option;
}

function renderFindings(): void {
  findingsList.replaceChildren();
  noFindings.hidden = findings.length !== 0;
  findingsFieldset.hidden = findings.length === 0;

  for (const [index, finding] of findings.entries()) {
    findingsList.append(createFindingOption(finding, index));
  }

  findingCount.textContent = `${findings.length} ${pluralize(findings.length, "match", "matches")}`;

  if (findings.length === 0) {
    reviewSummary.textContent =
      "Nothing common was detected. A careful final read is still important.";
  } else {
    const reviewCount = findings.filter(
      (finding) => finding.confidence === "review_suggested",
    ).length;
    reviewSummary.textContent =
      reviewCount > 0
        ? `${reviewCount} ${pluralize(reviewCount, "match", "matches")} ${pluralize(reviewCount, "needs", "need")} a closer look.`
        : "Strong matches are selected. Uncheck anything you need to keep.";
  }

  updateSelectionSummary();
}

function runScan(): void {
  clearScanError();
  const text = sourceText.value;

  if (text.trim().length === 0) {
    showScanError("Add some text before starting the check.");
    sourceText.focus();
    return;
  }

  if (text.length > MAX_INPUT_CODE_UNITS) {
    showScanError(
      `Please shorten this to ${MAX_INPUT_CODE_UNITS.toLocaleString("en-US")} characters or fewer.`,
    );
    sourceText.focus();
    return;
  }

  try {
    const customNames = parseNamesToHide();
    currentText = text;
    findings = scanSensitiveText(currentText, customNames);
    selectedFindingIds = new Set(
      findings
        .filter(
          (finding) => finding.confidence === "strong_match" || finding.kind === "custom_name",
        )
        .map((finding) => finding.id),
    );

    renderSourcePreview();
    renderFindings();
    setStage("review");
    focusAfterReveal(reviewTitle);

    const message =
      findings.length === 0
        ? "No common private details found. Review the text before continuing."
        : `${findings.length} possible ${pluralize(findings.length, "private detail")} found. Review each match.`;
    announce(message);
  } catch (error) {
    const message =
      error instanceof RangeError
        ? error.message
        : "The check could not finish. Your text is still here; please try again.";
    showScanError(message);
    announce(message);
  }
}

function createCleanedCopy(): void {
  try {
    cleanedText.value = maskSelectedFindings(currentText, findings, selectedFindingIds);
    const count = selectedFindingIds.size;
    replacementCount.textContent = `${count} ${pluralize(count, "replacement")}`;
    copySummary.textContent =
      count === 0
        ? "No details were replaced. Review the text carefully before sharing it."
        : `${count} ${pluralize(count, "private detail")} ${pluralize(count, "was", "were")} replaced with useful labels.`;
    setStage("copy");
    focusAfterReveal(copyTitle);
    announce(
      count === 0
        ? "Text ready for a final review."
        : `${count} private ${pluralize(count, "detail")} masked.`,
    );
  } catch {
    selectionMessage.textContent =
      "Masking could not finish. Your original text and choices are still here.";
    announce("Masking could not finish. Your work was not cleared.");
  }
}

function resetCopyButton(): void {
  if (copyResetTimer !== undefined) window.clearTimeout(copyResetTimer);
  copyButton.classList.remove("is-copied");
  if (copyLabel) copyLabel.textContent = "Copy cleaned text";
}

async function copyCleanedText(): Promise<void> {
  resetCopyButton();

  try {
    if (!navigator.clipboard || !window.isSecureContext) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(cleanedText.value);
    copyButton.classList.add("is-copied");
    if (copyLabel) copyLabel.textContent = "Copied";
    announce("Cleaned text copied.");
    copyResetTimer = window.setTimeout(resetCopyButton, 2400);
  } catch {
    cleanedText.focus();
    cleanedText.select();
    cleanedText.setSelectionRange(0, cleanedText.value.length);
    announce("Copy was blocked. The cleaned text is selected; copy it manually.");
  }
}

function clearAll(options: { focus: boolean; announceChange: boolean }): void {
  resetCopyButton();
  currentText = "";
  findings = [];
  selectedFindingIds = new Set();
  sourceText.value = "";
  namesToHide.value = "";
  cleanedText.value = "";
  sourcePreview.replaceChildren();
  findingsList.replaceChildren();
  clearScanError();
  setStage("paste");
  updateInputState();

  if (options.focus) focusAfterReveal(sourceText);
  if (options.announceChange) announce("The working copy was cleared.");
}

sourceText.addEventListener("input", () => {
  clearScanError();
  updateInputState();
});

sourceText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !scanButton.disabled) {
    event.preventDefault();
    runScan();
  }
});

namesToHide.addEventListener("input", () => {
  clearScanError();
  updateInputState();
});

namesToHide.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing && !scanButton.disabled) {
    event.preventDefault();
    runScan();
  }
});

scanForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runScan();
});

loadExampleButton.addEventListener("click", () => {
  sourceText.value = SAFE_DEMO_TEXT;
  namesToHide.value = SAFE_DEMO_NAMES;
  clearScanError();
  updateInputState();
  sourceText.focus();
  announce("Fictional example loaded. Select Find private details when you are ready.");
});

clearInputButton.addEventListener("click", () => clearAll({ focus: true, announceChange: true }));

backToPasteButton.addEventListener("click", () => {
  setStage("paste");
  focusAfterReveal(sourceText);
  announce("Text is ready to edit.");
});

maskButton.addEventListener("click", createCleanedCopy);

changeSelectionsButton.addEventListener("click", () => {
  setStage("review");
  focusAfterReveal(reviewTitle);
  announce("Review your masking choices.");
});

startOverButton.addEventListener("click", () => clearAll({ focus: true, announceChange: true }));
copyButton.addEventListener("click", () => void copyCleanedText());

window.addEventListener("pagehide", () => {
  clearAll({ focus: false, announceChange: false });
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) clearAll({ focus: false, announceChange: false });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // The privacy checker remains fully usable without offline support.
    });
  });
}

setStage("paste");
updateInputState();
