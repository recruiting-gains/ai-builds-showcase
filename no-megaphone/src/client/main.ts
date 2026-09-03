import "./styles.css";

import type { ScoreInput, ScoreResult } from "../shared/contracts";
import { scoreConversation } from "../shared/scoring";
import { parseScoreInput, ValidationError } from "../shared/validation";

document.documentElement.classList.add("has-js");

const CONTEXT_STORAGE_KEY = "no-megaphone-context-v1";

const BUSINESS_TYPES = [
  "local_service",
  "professional_service",
  "retail_product",
  "nonprofit",
  "independent_professional",
  "other",
] as const;
const EXPERIENCE_LEVELS = ["under_2", "2_to_5", "6_to_10", "10_plus"] as const;
const SERVICE_AREAS = ["local", "regional", "national", "location_free"] as const;

type BusinessType = (typeof BUSINESS_TYPES)[number];
type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
type ServiceArea = (typeof SERVICE_AREAS)[number];

interface LocalContext {
  businessType: BusinessType;
  experienceLevel: ExperienceLevel;
  serviceArea: ServiceArea;
}

const CONTEXT_LABELS = {
  businessType: {
    local_service: "Local service business",
    professional_service: "Professional service",
    retail_product: "Retail or product business",
    nonprofit: "Nonprofit or community organization",
    independent_professional: "Independent professional",
    other: "Other work experience",
  },
  experienceLevel: {
    under_2: "under 2 years",
    "2_to_5": "2–5 years",
    "6_to_10": "6–10 years",
    "10_plus": "more than 10 years",
  },
  serviceArea: {
    local: "local scope",
    regional: "regional scope",
    national: "national scope",
    location_free: "location-independent scope",
  },
} as const;

const DEMO_CONTEXT: LocalContext = {
  businessType: "local_service",
  experienceLevel: "10_plus",
  serviceArea: "local",
};

const DEMO_SCORE_INPUT: ScoreInput = {
  businessRelevance: "direct",
  helpfulnessGap: "clear",
  ruleFit: "conditional",
  freshness: "today",
  momentum: "active",
  trustOpportunity: "firsthand",
  geographicFit: "exact",
  topicSensitivity: "ordinary",
  primaryIntent: "help",
  selfContainedHelp: "yes",
  informationCompleteness: "sufficient",
};

function elementById<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}.`);
  return element as unknown as T;
}

function requiredDescendant<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required descendant ${selector}.`);
  return element;
}

const contextForm = elementById<HTMLFormElement>("context-form");
const checklistForm = elementById<HTMLFormElement>("checklist-form");
const contextPanel = elementById<HTMLElement>("context-panel");
const checklistPanel = elementById<HTMLElement>("checklist-panel");
const resultPanel = elementById<HTMLElement>("result-panel");
const demoScenario = elementById<HTMLElement>("demo-scenario");
const formMessage = elementById<HTMLParagraphElement>("form-message");
const evaluateButton = elementById<HTMLButtonElement>("evaluate-button");
const buttonReady = requiredDescendant<HTMLElement>(evaluateButton, ".button-ready");
const buttonLoading = requiredDescendant<HTMLElement>(evaluateButton, ".button-loading");
const deleteDialog = elementById<HTMLDialogElement>("delete-dialog");

function includesValue<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function isLocalContext(value: unknown): value is LocalContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 3 &&
    includesValue(BUSINESS_TYPES, candidate.businessType) &&
    includesValue(EXPERIENCE_LEVELS, candidate.experienceLevel) &&
    includesValue(SERVICE_AREAS, candidate.serviceArea)
  );
}

function readContextForm(): LocalContext | null {
  const formData = new FormData(contextForm);
  const candidate = {
    businessType: formData.get("businessType"),
    experienceLevel: formData.get("experienceLevel"),
    serviceArea: formData.get("serviceArea"),
  };
  return isLocalContext(candidate) ? candidate : null;
}

function applyContext(context: LocalContext): void {
  const businessType = elementById<HTMLSelectElement>("business-type");
  const experienceLevel = elementById<HTMLSelectElement>("experience-level");
  const serviceArea = elementById<HTMLSelectElement>("service-area");
  businessType.value = context.businessType;
  experienceLevel.value = context.experienceLevel;
  serviceArea.value = context.serviceArea;
}

function saveContext(context: LocalContext): void {
  try {
    localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // The form remains usable when browser storage is disabled.
  }
}

function restoreContext(): void {
  try {
    const saved = localStorage.getItem(CONTEXT_STORAGE_KEY);
    if (!saved) return;
    const parsed: unknown = JSON.parse(saved);
    if (isLocalContext(parsed)) applyContext(parsed);
  } catch {
    try {
      localStorage.removeItem(CONTEXT_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private or restricted browsing modes.
    }
  }
}

function setStepState(activeStep: "context" | "checklist" | "result"): void {
  const steps = {
    context: elementById<HTMLElement>("step-context"),
    checklist: elementById<HTMLElement>("step-checklist"),
    result: elementById<HTMLElement>("step-result"),
  };
  const order = ["context", "checklist", "result"] as const;
  const activeIndex = order.indexOf(activeStep);

  order.forEach((step, index) => {
    steps[step].classList.toggle("is-active", index === activeIndex);
    steps[step].classList.toggle("is-complete", index < activeIndex);
  });
}

function scrollToElement(element: HTMLElement): void {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
}

function revealChecklist(shouldScroll = true): void {
  checklistPanel.hidden = false;
  updateContextLens();
  updateAnswerProgress();
  setStepState("checklist");
  if (shouldScroll) scrollToElement(checklistPanel);
}

function updateContextLens(): void {
  const copy = elementById<HTMLElement>("context-lens-copy");
  const context = readContextForm();
  if (!context) {
    copy.textContent = "Use only experience you can support firsthand.";
    return;
  }

  copy.textContent = `You selected ${CONTEXT_LABELS.businessType[context.businessType].toLowerCase()}, ${CONTEXT_LABELS.experienceLevel[context.experienceLevel]}, and ${CONTEXT_LABELS.serviceArea[context.serviceArea]}. Keep every judgment inside that real boundary.`;
}

function updateAnswerProgress(): void {
  const answeredNames = new Set<string>();
  for (const input of checklistForm.querySelectorAll<HTMLInputElement>(
    'input[type="radio"]:checked',
  )) {
    answeredNames.add(input.name);
  }
  const count = answeredNames.size;
  elementById<HTMLElement>("answer-count").textContent = `${count} / 11 observations recorded`;
  const progress = elementById<HTMLProgressElement>("answer-progress");
  progress.value = count;
  progress.textContent = `${count} of 11`;
}

function setRadioValue(name: keyof ScoreInput, value: string): void {
  const controls = checklistForm.elements.namedItem(name);
  if (!(controls instanceof RadioNodeList)) return;
  controls.value = value;
}

function runDemo(): void {
  applyContext(DEMO_CONTEXT);
  saveContext(DEMO_CONTEXT);
  for (const [name, value] of Object.entries(DEMO_SCORE_INPUT)) {
    setRadioValue(name as keyof ScoreInput, value);
  }
  demoScenario.hidden = false;
  revealChecklist();
}

function readChecklist(): ScoreInput {
  const formData = new FormData(checklistForm);
  return parseScoreInput({
    businessRelevance: formData.get("businessRelevance"),
    helpfulnessGap: formData.get("helpfulnessGap"),
    ruleFit: formData.get("ruleFit"),
    freshness: formData.get("freshness"),
    momentum: formData.get("momentum"),
    trustOpportunity: formData.get("trustOpportunity"),
    geographicFit: formData.get("geographicFit"),
    topicSensitivity: formData.get("topicSensitivity"),
    primaryIntent: formData.get("primaryIntent"),
    selfContainedHelp: formData.get("selfContainedHelp"),
    informationCompleteness: formData.get("informationCompleteness"),
  });
}

function isMatchingServerResult(
  value: unknown,
  expected: ScoreResult,
): value is { result: ScoreResult } {
  if (typeof value !== "object" || value === null || !("result" in value)) return false;
  return JSON.stringify((value as { result: unknown }).result) === JSON.stringify(expected);
}

async function getScore(input: ScoreInput): Promise<{ result: ScoreResult; usedServer: boolean }> {
  const localResult = scoreConversation(input);

  try {
    const response = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) throw new Error(`Scoring endpoint returned ${response.status}.`);
    const body: unknown = await response.json();
    if (!isMatchingServerResult(body, localResult)) {
      throw new Error("Scoring endpoint did not match the published local formula.");
    }
    return { result: body.result, usedServer: true };
  } catch {
    return { result: localResult, usedServer: false };
  }
}

function makeTextElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function renderFactorRows(result: ScoreResult): void {
  const rows = elementById<HTMLTableSectionElement>("factor-rows");
  rows.replaceChildren();

  for (const factor of result.factors) {
    const row = document.createElement("tr");
    const factorCell = makeTextElement("td", factor.title);
    const observationCell = document.createElement("td");
    observationCell.append(
      makeTextElement("strong", factor.selection),
      makeTextElement("small", factor.reason),
    );
    const pointsCell = makeTextElement("td", `${factor.points} / ${factor.maximum}`);
    row.append(factorCell, observationCell, pointsCell);
    rows.append(row);
  }
}

function renderPenalties(result: ScoreResult): void {
  const section = elementById<HTMLElement>("penalty-section");
  const list = elementById<HTMLUListElement>("penalty-list");
  list.replaceChildren();
  section.hidden = result.penalties.length === 0;

  for (const penalty of result.penalties) {
    const item = document.createElement("li");
    item.append(
      makeTextElement("strong", penalty.title),
      makeTextElement("span", `${penalty.points}`),
      makeTextElement("small", penalty.reason),
    );
    list.append(item);
  }
}

function renderGuardrails(result: ScoreResult): void {
  const section = elementById<HTMLElement>("guardrail-section");
  const list = elementById<HTMLUListElement>("guardrail-list");
  list.replaceChildren();
  section.hidden = result.guardrails.length === 0;

  for (const guardrail of result.guardrails) {
    const item = document.createElement("li");
    const effect =
      guardrail.kind === "exclusion" ? "EXCLUSION → 0" : `CAP ≤ ${guardrail.maximumScore ?? 100}`;
    item.append(
      makeTextElement("strong", guardrail.title),
      makeTextElement("span", effect),
      makeTextElement("small", guardrail.reason),
    );
    list.append(item);
  }
}

function renderUncertainty(result: ScoreResult): void {
  const level = elementById<HTMLElement>("uncertainty-level");
  const copy = elementById<HTMLElement>("uncertainty-copy");
  const list = elementById<HTMLUListElement>("uncertainty-list");
  const card = level.closest<HTMLElement>(".uncertainty-card");
  level.textContent = result.uncertainty.level;
  list.replaceChildren();
  card?.classList.remove("uncertainty-low", "uncertainty-moderate", "uncertainty-high");
  card?.classList.add(`uncertainty-${result.uncertainty.level}`);

  if (result.uncertainty.reasons.length === 0) {
    copy.textContent = "Your answers were complete and specific.";
    return;
  }

  copy.textContent = "These unknowns reduce how confidently the result can be used:";
  for (const reason of result.uncertainty.reasons) list.append(makeTextElement("li", reason));
}

function renderNextSteps(result: ScoreResult): void {
  const list = elementById<HTMLOListElement>("next-steps");
  list.replaceChildren(...result.nextSteps.map((step) => makeTextElement("li", step)));
}

function formatPenaltyTotal(result: ScoreResult): string {
  const total = result.penalties.reduce((sum, penalty) => sum + penalty.points, 0);
  return total === 0 ? "0" : `${total}`;
}

function contextDescription(): string {
  const context = readContextForm();
  if (!context) return "Work context unavailable.";
  return [
    CONTEXT_LABELS.businessType[context.businessType],
    CONTEXT_LABELS.experienceLevel[context.experienceLevel],
    CONTEXT_LABELS.serviceArea[context.serviceArea],
  ].join(" · ");
}

function renderResult(result: ScoreResult, usedServer: boolean): void {
  elementById<HTMLElement>("result-score").textContent = String(result.score);
  elementById<HTMLElement>("result-label").textContent = result.label;
  elementById<HTMLElement>("result-summary").textContent = result.summary;
  elementById<HTMLElement>("result-badge").textContent = result.excluded
    ? "Exclusion applied"
    : "Decision label";
  elementById<HTMLElement>("result-context").textContent =
    `Context kept on this device: ${contextDescription()}`;
  elementById<HTMLElement>("base-score").textContent = String(result.baseScore);
  elementById<HTMLElement>("penalty-total").textContent = formatPenaltyTotal(result);
  elementById<HTMLElement>("pre-guardrail-score").textContent = String(
    result.totalBeforeGuardrails,
  );
  elementById<HTMLElement>("final-score").textContent = String(result.score);
  elementById<HTMLElement>("score-dial").setAttribute(
    "aria-label",
    `Contribution Opportunity Score: ${result.score} out of 100, ${result.label}`,
  );
  elementById<SVGCircleElement>("score-progress-value").setAttribute(
    "stroke-dashoffset",
    String(100 - result.score),
  );

  const override = elementById<HTMLElement>("decision-override");
  const exclusions = result.guardrails.filter((guardrail) => guardrail.kind === "exclusion");
  override.hidden = exclusions.length === 0;
  elementById<HTMLElement>("override-copy").textContent = exclusions
    .map((guardrail) => guardrail.reason)
    .join(" ");

  const seal = elementById<HTMLElement>("result-seal");
  const sealTitle = seal.querySelector<HTMLElement>("strong");
  const sealCopy = seal.querySelector<HTMLElement>("small");
  if (sealTitle && sealCopy) {
    sealTitle.textContent =
      result.label === "Stay quiet" ? "Responsible result" : "Judgment required";
    sealCopy.textContent =
      result.label === "Stay quiet"
        ? "Quiet is a valid completion."
        : "A score never overrides the rules.";
  }

  renderFactorRows(result);
  renderPenalties(result);
  renderGuardrails(result);
  renderUncertainty(result);
  renderNextSteps(result);

  elementById<HTMLElement>("api-status").textContent = usedServer
    ? "Verified by the no-storage scoring endpoint."
    : "The endpoint was unavailable. The identical published formula ran locally in this browser.";

  resultPanel.hidden = false;
  setStepState("result");
  scrollToElement(resultPanel);
  elementById<HTMLElement>("result-title").focus({ preventScroll: true });
}

function setEvaluationLoading(loading: boolean): void {
  evaluateButton.disabled = loading;
  buttonReady.hidden = loading;
  buttonLoading.hidden = !loading;
}

function showFormError(message: string): void {
  formMessage.textContent = message;
  formMessage.hidden = false;
  formMessage.focus();
}

function resetCurrentCheck(shouldScroll = true): void {
  checklistForm.reset();
  resultPanel.hidden = true;
  demoScenario.hidden = true;
  formMessage.hidden = true;
  setStepState("checklist");
  updateAnswerProgress();
  if (shouldScroll) scrollToElement(checklistPanel);
}

function deleteLocalData(): void {
  try {
    localStorage.removeItem(CONTEXT_STORAGE_KEY);
  } catch {
    // Resetting the visible state still works when storage access is blocked.
  }
  contextForm.reset();
  checklistForm.reset();
  checklistPanel.hidden = true;
  resultPanel.hidden = true;
  demoScenario.hidden = true;
  formMessage.hidden = true;
  setStepState("context");
  scrollToElement(contextPanel);
}

contextForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!contextForm.reportValidity()) return;
  const context = readContextForm();
  if (!context) return;
  saveContext(context);
  revealChecklist();
});

checklistForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.hidden = true;

  if (!checklistForm.checkValidity()) {
    showFormError("Answer every checklist question before calculating the score.");
    const firstInvalid = checklistForm.querySelector<HTMLInputElement>("input:invalid");
    firstInvalid?.focus();
    return;
  }

  try {
    const input = readChecklist();
    setEvaluationLoading(true);
    const { result, usedServer } = await getScore(input);
    renderResult(result, usedServer);
  } catch (error) {
    const message =
      error instanceof ValidationError
        ? error.message
        : "The score could not be calculated. Review the checklist and try again.";
    showFormError(message);
  } finally {
    setEvaluationLoading(false);
  }
});

checklistForm.addEventListener("change", updateAnswerProgress);

for (const button of document.querySelectorAll<HTMLButtonElement>(".demo-button")) {
  button.addEventListener("click", runDemo);
}
elementById<HTMLButtonElement>("hero-demo-button").addEventListener("click", runDemo);
elementById<HTMLButtonElement>("reset-check").addEventListener("click", () => resetCurrentCheck());
elementById<HTMLButtonElement>("delete-data-button").addEventListener("click", () => {
  deleteDialog.showModal();
});
elementById<HTMLButtonElement>("confirm-delete").addEventListener("click", deleteLocalData);

restoreContext();
