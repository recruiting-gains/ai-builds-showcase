import type {
  AddEntryResponse,
  ApiErrorResponse,
  CityEntry,
  CityNode,
  CitySnapshot,
  CreateCityResponse,
  District,
} from "../shared/contracts";
import type { CityVisualizationController } from "./city";
import "./styles.css";

const STORAGE_KEY = "memory-city-private-key-v1";
const PENDING_STORAGE_KEY = "memory-city-pending-note-v1";
const DISTRICT_LABELS: Record<District, string> = {
  concepts: "Concepts",
  skills: "Skills",
  evidence: "Evidence",
  questions: "Open questions",
};
const DISTRICT_COLORS: Record<District, string> = {
  concepts: "#a48bff",
  skills: "#58d6ff",
  evidence: "#ffc857",
  questions: "#ff8b73",
};

const EXAMPLES = {
  sleep:
    "Deep sleep helps the brain organize and strengthen new memories. Sleep cycles repeat through the night, and each stage supports the brain differently. A steady sleep schedule can make it easier to learn and remember.",
  creativity:
    "Creative work improves when ideas are allowed to start rough. Making a small draft gives you something real to examine, and feedback reveals what to change. Repeating that cycle turns uncertainty into a useful result.",
} as const;

const DEMO_CREATED_AT = "2026-09-03T00:00:00.000Z";
const DEMO_ENTRIES: CityEntry[] = [
  {
    id: "demo-entry-sleep",
    title: "How sleep supports memory",
    summary: "Sleep gives the brain time to organize and strengthen new memories.",
    sourceText: "Deep sleep helps the brain organize and strengthen new memories. Sleep cycles repeat through the night, and each stage supports the brain differently.",
    createdAt: DEMO_CREATED_AT,
  },
  {
    id: "demo-entry-making",
    title: "Learning by making",
    summary: "Small experiments turn an unclear idea into something that can be tested and improved.",
    sourceText: "A useful experiment starts with one small question. Build the smallest test, look at what happened, and use the evidence to decide what to try next.",
    createdAt: DEMO_CREATED_AT,
  },
  {
    id: "demo-entry-ai",
    title: "A careful AI workflow",
    summary: "AI can shape a first draft, while a person checks the meaning and makes the final decision.",
    sourceText: "Give AI one clear task and only the information it needs. Let it make a first draft, check important details, and keep a person responsible for the final decision.",
    createdAt: DEMO_CREATED_AT,
  },
];

const DEMO_NODES: CityNode[] = [
  { id: "demo-memory", entryId: "demo-entry-sleep", label: "Memory formation", description: "The brain organizes new information so it can be found again later.", district: "concepts", depth: 5, createdAt: DEMO_CREATED_AT },
  { id: "demo-sleep-cycles", entryId: "demo-entry-sleep", label: "Sleep cycles", description: "Different stages repeat through the night and support the brain in different ways.", district: "concepts", depth: 4, createdAt: DEMO_CREATED_AT },
  { id: "demo-human-judgment", entryId: "demo-entry-ai", label: "Human judgment", description: "A person checks important details and remains responsible for the final choice.", district: "concepts", depth: 5, createdAt: DEMO_CREATED_AT },
  { id: "demo-small-test", entryId: "demo-entry-making", label: "Build a small test", description: "Make the smallest version that can answer one useful question.", district: "skills", depth: 4, createdAt: DEMO_CREATED_AT },
  { id: "demo-feedback", entryId: "demo-entry-making", label: "Use feedback", description: "Look at a real result and let it guide the next change.", district: "skills", depth: 3, createdAt: DEMO_CREATED_AT },
  { id: "demo-clear-task", entryId: "demo-entry-ai", label: "Give one clear task", description: "A focused request makes an AI draft easier to understand and check.", district: "skills", depth: 4, createdAt: DEMO_CREATED_AT },
  { id: "demo-deep-sleep", entryId: "demo-entry-sleep", label: "Deep sleep", description: "The note identifies deep sleep as support for organizing and strengthening memories.", district: "evidence", depth: 4, createdAt: DEMO_CREATED_AT },
  { id: "demo-real-result", entryId: "demo-entry-making", label: "A real result", description: "A working test provides something concrete to examine instead of a guess.", district: "evidence", depth: 3, createdAt: DEMO_CREATED_AT },
  { id: "demo-checked-details", entryId: "demo-entry-ai", label: "Checked details", description: "Important parts of an AI draft are reviewed before the result is used.", district: "evidence", depth: 4, createdAt: DEMO_CREATED_AT },
  { id: "demo-sleep-question", entryId: "demo-entry-sleep", label: "Which stage helps most?", description: "A useful next question is how each stage supports a different kind of memory.", district: "questions", depth: 2, createdAt: DEMO_CREATED_AT },
  { id: "demo-next-test", entryId: "demo-entry-making", label: "What should change next?", description: "The result of one test creates the question for the next experiment.", district: "questions", depth: 2, createdAt: DEMO_CREATED_AT },
  { id: "demo-ai-question", entryId: "demo-entry-ai", label: "What needs a person?", description: "The workflow should identify which decisions should never be left to a draft alone.", district: "questions", depth: 3, createdAt: DEMO_CREATED_AT },
];

const edge = (id: string, source: string, target: string, relationship: string, kind: "related" | "supports" | "questions" | "applies") => ({ id, source, target, relationship, kind });
const DEMO_CITY: CitySnapshot = {
  id: "demo-city",
  name: "The Curious Mind",
  createdAt: DEMO_CREATED_AT,
  updatedAt: DEMO_CREATED_AT,
  entries: DEMO_ENTRIES,
  nodes: DEMO_NODES,
  edges: [
    edge("demo-edge-1", "demo-deep-sleep", "demo-memory", "Deep sleep supports the formation of new memories.", "supports"),
    edge("demo-edge-2", "demo-memory", "demo-sleep-cycles", "Memory formation happens while sleep cycles repeat.", "related"),
    edge("demo-edge-3", "demo-sleep-cycles", "demo-sleep-question", "The stages create a question worth exploring.", "questions"),
    edge("demo-edge-4", "demo-small-test", "demo-real-result", "A small test creates a real result.", "applies"),
    edge("demo-edge-5", "demo-feedback", "demo-real-result", "Feedback begins with evidence from a real result.", "supports"),
    edge("demo-edge-6", "demo-feedback", "demo-next-test", "Feedback helps choose what to change next.", "questions"),
    edge("demo-edge-7", "demo-clear-task", "demo-checked-details", "A clear task makes the result easier to check.", "supports"),
    edge("demo-edge-8", "demo-checked-details", "demo-human-judgment", "Reviewing details supports a responsible decision.", "supports"),
    edge("demo-edge-9", "demo-ai-question", "demo-human-judgment", "The open question helps define where people should decide.", "questions"),
    edge("demo-edge-10", "demo-clear-task", "demo-small-test", "Both begin by narrowing the work to one useful goal.", "related"),
    edge("demo-edge-11", "demo-feedback", "demo-human-judgment", "Feedback gives a person better information for a decision.", "related"),
    edge("demo-edge-12", "demo-memory", "demo-feedback", "Remembering and improving both depend on returning to information.", "related"),
    edge("demo-edge-13", "demo-real-result", "demo-checked-details", "Both provide evidence that can be reviewed.", "related"),
  ],
};

interface StoredCityAccess {
  cityId: string;
  editToken: string;
}

interface PendingEntry {
  cityId: string;
  operationId: string;
  text: string;
}

class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const form = requiredElement<HTMLFormElement>("#memory-form");
const memoryText = requiredElement<HTMLTextAreaElement>("#memory-text");
const characterCount = requiredElement<HTMLElement>("#character-count");
const buildButton = requiredElement<HTMLButtonElement>("#build-button");
const readyLabel = requiredElement<HTMLElement>(".button-ready");
const busyLabel = requiredElement<HTMLElement>(".button-busy");
const formMessage = requiredElement<HTMLElement>("#form-message");
const buildProgress = requiredElement<HTMLElement>("#build-progress");
const progressBar = requiredElement<HTMLElement>(".progress-line i");
const progressSteps = Array.from(document.querySelectorAll<HTMLElement>("#build-progress li"));
const cityName = requiredElement<HTMLElement>("#city-name");
const cityStatus = requiredElement<HTMLElement>("#city-status");
const statIdeas = requiredElement<HTMLElement>("#stat-ideas");
const statDistricts = requiredElement<HTMLElement>("#stat-districts");
const statRoads = requiredElement<HTMLElement>("#stat-roads");
const citySummary = requiredElement<HTMLElement>("#city-summary");
const listDistricts = requiredElement<HTMLElement>("#list-districts");
const listView = requiredElement<HTMLElement>("#city-list");
const showCityButton = requiredElement<HTMLButtonElement>("#show-city");
const showListButton = requiredElement<HTMLButtonElement>("#show-list");
const ideaInspector = requiredElement<HTMLElement>("#idea-inspector");
const heroInspector = requiredElement<HTMLElement>("#hero-inspector");
const exportButton = requiredElement<HTMLButtonElement>("#export-city");
const deleteButton = requiredElement<HTMLButtonElement>("#delete-city");
const deleteDialog = requiredElement<HTMLDialogElement>("#delete-dialog");
const toast = requiredElement<HTMLElement>("#toast");
const liveStatus = requiredElement<HTMLElement>("#live-status");

let currentCity = DEMO_CITY;
let cityAccess: StoredCityAccess | null = readStoredAccess();
let heroScene: CityVisualizationController | null = null;
let workspaceScene: CityVisualizationController | null = null;
let selectedDistrict: District | "all" = "all";
let toastTimer: number | null = null;
let progressTimer: number | null = null;

function readStoredAccess(): StoredCityAccess | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const cityId = "cityId" in parsed && typeof parsed.cityId === "string" ? parsed.cityId : "";
    const editToken = "editToken" in parsed && typeof parsed.editToken === "string" ? parsed.editToken : "";
    if (!/^[0-9a-f-]{36}$/.test(cityId) || !/^[a-f0-9]{64}$/.test(editToken)) return null;
    return { cityId, editToken };
  } catch {
    return null;
  }
}

function saveAccess(access: StoredCityAccess): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(access));
  cityAccess = access;
}

function clearAccess(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PENDING_STORAGE_KEY);
  cityAccess = null;
}

function readPendingEntry(): PendingEntry | null {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const cityId = "cityId" in value && typeof value.cityId === "string" ? value.cityId : "";
    const operationId = "operationId" in value && typeof value.operationId === "string" ? value.operationId : "";
    const text = "text" in value && typeof value.text === "string" ? value.text : "";
    if (!/^[0-9a-f-]{36}$/i.test(cityId) || !/^[0-9a-f-]{36}$/i.test(operationId) || text.length < 40 || text.length > 5_000) return null;
    return { cityId, operationId, text };
  } catch {
    return null;
  }
}

function pendingEntryFor(access: StoredCityAccess, text: string): PendingEntry {
  const existing = readPendingEntry();
  if (existing && existing.cityId === access.cityId && existing.text === text) return existing;
  const pending = { cityId: access.cityId, operationId: crypto.randomUUID(), text };
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending));
  return pending;
}

async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let message = "The city could not complete that request. Please try again.";
    try {
      const body = (await response.json()) as ApiErrorResponse;
      if (body.error?.message) message = body.error.message;
    } catch {
      // The friendly fallback above is enough when an intermediary returns non-JSON.
    }
    throw new ApiRequestError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function entryForNode(node: CityNode, city = currentCity): CityEntry | undefined {
  return city.entries.find((entry) => entry.id === node.entryId);
}

function showInspector(element: HTMLElement, node: CityNode | null, city: CitySnapshot): void {
  if (!node) {
    element.hidden = true;
    return;
  }
  const entry = entryForNode(node, city);
  const kicker = element.querySelector<HTMLElement>(".inspector-kicker");
  const heading = element.querySelector<HTMLElement>("h2, h3");
  const description = element.querySelector<HTMLElement>(".inspector-description");
  if (kicker) {
    const textTarget = kicker.querySelector<HTMLElement>("b") ?? kicker;
    textTarget.textContent = DISTRICT_LABELS[node.district];
    kicker.style.color = DISTRICT_COLORS[node.district];
    const dot = kicker.querySelector<HTMLElement>("span");
    if (dot) dot.style.background = DISTRICT_COLORS[node.district];
  }
  if (heading) heading.textContent = node.label;
  if (description) description.textContent = node.description;
  const meta = element.querySelector<HTMLElement>(".inspector-meta");
  if (meta) meta.textContent = `${DISTRICT_LABELS[node.district]} · ${node.depth}/5 connected material`;
  const depthBar = element.querySelector<HTMLElement>(".inspector-depth i b");
  const depthValue = element.querySelector<HTMLElement>(".inspector-depth strong");
  if (depthBar) depthBar.style.width = `${node.depth * 20}%`;
  if (depthValue) depthValue.textContent = `${node.depth}/5`;
  const source = element.querySelector<HTMLElement>(".inspector-source");
  if (source) {
    const sourceText = entry?.sourceText ?? entry?.summary ?? "The original note is not available in this demo.";
    source.textContent = `From “${entry?.title ?? "Saved note"}” — ${sourceText.slice(0, 220)}${sourceText.length > 220 ? "…" : ""}`;
  }
  const connectionList = element.querySelector<HTMLUListElement>(".inspector-connections ul");
  if (connectionList) {
    const connections = city.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
    connectionList.replaceChildren(
      ...connections.slice(0, 4).map((connection) => {
        const otherId = connection.source === node.id ? connection.target : connection.source;
        const other = city.nodes.find((candidate) => candidate.id === otherId);
        const item = document.createElement("li");
        const name = document.createElement("strong");
        name.textContent = other?.label ?? "Connected idea";
        const explanation = document.createElement("span");
        explanation.textContent = connection.relationship;
        item.append(name, explanation);
        return item;
      }),
    );
    if (connections.length === 0) {
      const item = document.createElement("li");
      item.textContent = "No roads reach this building yet.";
      connectionList.append(item);
    }
  }
  element.hidden = false;
}

function updateCityInterface(city: CitySnapshot, announce = false): void {
  currentCity = city;
  cityName.textContent = city.name;
  cityStatus.textContent = city.id === DEMO_CITY.id ? "Demo city · ready to explore" : "Private city · saved";
  statIdeas.textContent = String(city.nodes.length);
  const districtCount = new Set(city.nodes.map((node) => node.district)).size;
  statDistricts.textContent = String(districtCount);
  statRoads.textContent = String(city.edges.length);
  citySummary.textContent = `${city.name} contains ${city.nodes.length} ${city.nodes.length === 1 ? "idea" : "ideas"} across ${districtCount} ${districtCount === 1 ? "district" : "districts"}, connected by ${city.edges.length} ${city.edges.length === 1 ? "road" : "roads"}. Use List view for a text version of every idea.`;
  exportButton.disabled = city.id === DEMO_CITY.id;
  deleteButton.disabled = city.id === DEMO_CITY.id;
  renderList();
  workspaceScene?.setData(city);
  showInspector(ideaInspector, null, city);
  if (announce) liveStatus.textContent = `${city.name} is ready with ${city.nodes.length} ideas and ${city.edges.length} connections.`;
}

function renderList(): void {
  const districts = (Object.keys(DISTRICT_LABELS) as District[])
    .filter((district) => selectedDistrict === "all" || selectedDistrict === district)
    .map((district) => {
      const section = document.createElement("section");
      section.className = "list-district";
      const nodes = currentCity.nodes.filter((node) => node.district === district);
      const heading = document.createElement("h4");
      heading.style.color = DISTRICT_COLORS[district];
      heading.append(document.createTextNode(DISTRICT_LABELS[district]));
      const count = document.createElement("span");
      count.textContent = `${nodes.length} ${nodes.length === 1 ? "idea" : "ideas"}`;
      heading.append(count);
      const list = document.createElement("ul");
      for (const node of nodes) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        const label = document.createElement("strong");
        label.textContent = node.label;
        const description = document.createElement("span");
        description.textContent = node.description;
        button.append(label, description);
        button.addEventListener("click", () => {
          showCityView();
          workspaceScene?.selectNode(node.id, { flyTo: true });
          showInspector(ideaInspector, node, currentCity);
        });
        item.append(button);
        list.append(item);
      }
      if (nodes.length === 0) {
        const item = document.createElement("li");
        item.textContent = "No ideas here yet.";
        item.style.color = "#66758a";
        item.style.fontSize = "11px";
        list.append(item);
      }
      section.append(heading, list);
      return section;
    });
  const connectionSection = document.createElement("section");
  connectionSection.className = "list-district list-connections";
  const connectionHeading = document.createElement("h4");
  connectionHeading.append(document.createTextNode("Roads and connections"));
  const connectionCount = document.createElement("span");
  connectionCount.textContent = `${currentCity.edges.length} ${currentCity.edges.length === 1 ? "road" : "roads"}`;
  connectionHeading.append(connectionCount);
  const connectionList = document.createElement("ul");
  for (const connection of currentCity.edges) {
    const source = currentCity.nodes.find((node) => node.id === connection.source);
    const target = currentCity.nodes.find((node) => node.id === connection.target);
    if (!source || !target) continue;
    const item = document.createElement("li");
    const relationship = document.createElement("p");
    const names = document.createElement("strong");
    names.textContent = `${source.label} ↔ ${target.label}`;
    const explanation = document.createElement("span");
    explanation.textContent = connection.relationship;
    relationship.append(names, explanation);
    item.append(relationship);
    connectionList.append(item);
  }
  if (currentCity.edges.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Roads appear after related ideas are found.";
    connectionList.append(item);
  }
  connectionSection.append(connectionHeading, connectionList);
  listDistricts.replaceChildren(...districts, connectionSection);
}

function showCityView(): void {
  listView.hidden = true;
  showCityButton.classList.add("active");
  showCityButton.setAttribute("aria-pressed", "true");
  showListButton.classList.remove("active");
  showListButton.setAttribute("aria-pressed", "false");
}

function showListView(): void {
  listView.hidden = false;
  showListButton.classList.add("active");
  showListButton.setAttribute("aria-pressed", "true");
  showCityButton.classList.remove("active");
  showCityButton.setAttribute("aria-pressed", "false");
}

function showToast(message: string): void {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4_000);
}

function updateCharacterCount(): void {
  characterCount.textContent = `${memoryText.value.length.toLocaleString()} / 5,000`;
}

function setBusy(busy: boolean): void {
  buildButton.disabled = busy;
  memoryText.readOnly = busy;
  readyLabel.hidden = busy;
  busyLabel.hidden = !busy;
  form.setAttribute("aria-busy", String(busy));
  buildProgress.hidden = !busy;
  deleteButton.disabled = busy || currentCity.id === DEMO_CITY.id;
  exportButton.disabled = busy || currentCity.id === DEMO_CITY.id;
  if (progressTimer !== null) window.clearInterval(progressTimer);
  if (!busy) return;
  let stage = 0;
  busyLabel.textContent = "Finding the main ideas…";
  progressSteps.forEach((step, index) => step.classList.toggle("active", index === 0));
  progressBar.style.width = "33%";
  progressTimer = window.setInterval(() => {
    stage = Math.min(2, stage + 1);
    progressSteps.forEach((step, index) => step.classList.toggle("active", index <= stage));
    progressBar.style.width = `${(stage + 1) * 33.34}%`;
    busyLabel.textContent = stage === 0 ? "Finding the main ideas…" : stage === 1 ? "Connecting related thoughts…" : "Raising the buildings…";
  }, 1_700);
}

function showFormError(message: string): void {
  formMessage.textContent = message;
  formMessage.hidden = false;
  formMessage.focus({ preventScroll: true });
  liveStatus.textContent = `The city could not grow. ${message}`;
}

function clearFormError(): void {
  formMessage.textContent = "";
  formMessage.hidden = true;
}

async function ensurePrivateCity(): Promise<StoredCityAccess> {
  if (cityAccess) return cityAccess;
  const response = await apiRequest<CreateCityResponse>("/api/cities", { method: "POST" });
  const access = { cityId: response.city.id, editToken: response.editToken };
  saveAccess(access);
  return access;
}

async function addMemory(text: string): Promise<void> {
  const access = await ensurePrivateCity();
  const pending = pendingEntryFor(access, text);
  const response = await apiRequest<AddEntryResponse>(
    `/api/cities/${access.cityId}/entries`,
    { method: "POST", body: JSON.stringify({ text, operationId: pending.operationId }) },
    access.editToken,
  );
  localStorage.removeItem(PENDING_STORAGE_KEY);
  updateCityInterface(response.city, true);
  const newest = response.addedNodeIds[0];
  if (newest) window.setTimeout(() => workspaceScene?.selectNode(newest, { flyTo: true }), 350);
  memoryText.value = "";
  updateCharacterCount();
  showToast(`${response.addedNodeIds.length} buildings rose and ${response.semanticLinksAdded} new cross-city ${response.semanticLinksAdded === 1 ? "road was" : "roads were"} found.`);
}

async function restorePrivateCity(): Promise<void> {
  if (!cityAccess) return;
  try {
    const response = await apiRequest<{ city: CitySnapshot }>(`/api/cities/${cityAccess.cityId}`, {}, cityAccess.editToken);
    updateCityInterface(response.city);
    const pending = readPendingEntry();
    if (pending?.cityId === cityAccess.cityId) {
      memoryText.value = pending.text;
      updateCharacterCount();
      showToast("A note may not have finished last time. It is ready to retry without creating a duplicate.");
    }
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 401 || error.status === 404)) {
      clearAccess();
      updateCityInterface(DEMO_CITY);
      showToast("The saved city key no longer opens a city. The demo is ready instead.");
      return;
    }
    showToast("Your private city could not be loaded right now. Its key is still safe in this browser.");
  }
}

function triggerDownload(): void {
  if (currentCity.id === DEMO_CITY.id) return;
  const blob = new Blob([JSON.stringify(currentCity, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${currentCity.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "memory-city"}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("A copy of your city was downloaded.");
}

async function deletePrivateCity(): Promise<void> {
  if (!cityAccess) return;
  const access = cityAccess;
  deleteButton.disabled = true;
  try {
    await apiRequest<void>(`/api/cities/${access.cityId}`, { method: "DELETE" }, access.editToken);
    clearAccess();
    updateCityInterface(DEMO_CITY, true);
    showToast("Your private city and its notes were deleted.");
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      clearAccess();
      updateCityInterface(DEMO_CITY, true);
      showToast("Your private city and its notes were already deleted.");
      return;
    }
    deleteButton.disabled = false;
    showToast(error instanceof Error ? error.message : "The city could not be deleted. Please try again.");
  }
}

async function initializeScenes(): Promise<void> {
  try {
    const { createMemoryCityVisualization } = await import("./city");
    heroScene = createMemoryCityVisualization({
      container: requiredElement<HTMLElement>("#hero-city"),
      data: DEMO_CITY,
      quality: "auto",
      onSelectNode: (node) => showInspector(heroInspector, node, DEMO_CITY),
    });
    workspaceScene = createMemoryCityVisualization({
      container: requiredElement<HTMLElement>("#workspace-city"),
      data: currentCity,
      quality: "auto",
      onSelectNode: (node) => showInspector(ideaInspector, node, currentCity),
    });
    requiredElement<HTMLElement>("#hero-loading").hidden = true;
    requiredElement<HTMLElement>("#workspace-loading").hidden = true;
  } catch {
    const heroFallback = document.createElement("span");
    heroFallback.textContent = "3D view unavailable";
    requiredElement<HTMLElement>("#hero-loading").replaceChildren(heroFallback);
    const workspaceFallback = document.createElement("span");
    workspaceFallback.textContent = "3D view unavailable · Use List view";
    requiredElement<HTMLElement>("#workspace-loading").replaceChildren(workspaceFallback);
    showListView();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFormError();
  const text = memoryText.value.trim();
  if (text.length < 40) {
    showFormError("Add a little more detail—at least 40 characters.");
    memoryText.setAttribute("aria-invalid", "true");
    memoryText.focus();
    return;
  }
  memoryText.removeAttribute("aria-invalid");
  setBusy(true);
  void addMemory(text)
    .catch((error: unknown) => showFormError(error instanceof Error ? error.message : "The city could not finish this block. Your note is still in the text box."))
    .finally(() => setBusy(false));
});

memoryText.addEventListener("input", updateCharacterCount);
document.querySelectorAll<HTMLButtonElement>("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.example as keyof typeof EXAMPLES | undefined;
    if (!key || !(key in EXAMPLES)) return;
    memoryText.value = EXAMPLES[key];
    updateCharacterCount();
    memoryText.focus();
  });
});

showCityButton.addEventListener("click", showCityView);
showListButton.addEventListener("click", showListView);
requiredElement<HTMLButtonElement>("#workspace-reset").addEventListener("click", () => workspaceScene?.resetView());
requiredElement<HTMLButtonElement>("#hero-reset").addEventListener("click", () => heroScene?.resetView());
requiredElement<HTMLButtonElement>("#tour-demo").addEventListener("click", () => {
  const node = DEMO_CITY.nodes.find((item) => item.id === "demo-memory") ?? DEMO_CITY.nodes[0];
  if (node) {
    heroScene?.selectNode(node.id, { flyTo: true });
    showInspector(heroInspector, node, DEMO_CITY);
  }
});
document.querySelectorAll<HTMLButtonElement>(".inspector-close").forEach((button) => {
  button.addEventListener("click", () => {
    const inspector = button.closest<HTMLElement>(".floating-inspector, .idea-inspector");
    if (inspector === heroInspector) heroScene?.selectNode(null);
    if (inspector === ideaInspector) workspaceScene?.selectNode(null);
    if (inspector) inspector.hidden = true;
  });
});

document.querySelectorAll<HTMLButtonElement>(".motion-toggle").forEach((button) => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let paused = reduceMotion;
  button.setAttribute("aria-pressed", String(paused));
  button.setAttribute("aria-label", paused ? "Resume city motion" : "Pause city motion");
  button.title = paused ? "Resume motion" : "Pause motion";
  button.classList.toggle("paused", paused);
  button.addEventListener("click", () => {
    paused = !paused;
    button.setAttribute("aria-pressed", String(paused));
    button.setAttribute("aria-label", paused ? "Resume city motion" : "Pause city motion");
    button.title = paused ? "Resume motion" : "Pause motion";
    button.classList.toggle("paused", paused);
    if (button.dataset.target === "hero") heroScene?.setMotion(!paused);
    if (button.dataset.target === "workspace") workspaceScene?.setMotion(!paused);
    showToast(paused ? "City motion paused." : "City motion resumed.");
  });
});

document.querySelectorAll<HTMLButtonElement>(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => {
    const district = button.dataset.district as District | undefined;
    if (!district) return;
    selectedDistrict = selectedDistrict === district ? "all" : district;
    document.querySelectorAll<HTMLButtonElement>(".filter-chip").forEach((chip) => {
      const active = selectedDistrict === "all" || chip.dataset.district === selectedDistrict;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
    workspaceScene?.setDistrictFilter(selectedDistrict);
    renderList();
  });
});

exportButton.addEventListener("click", triggerDownload);
deleteButton.addEventListener("click", () => {
  if (cityAccess) deleteDialog.showModal();
});
deleteDialog.addEventListener("close", () => {
  if (deleteDialog.returnValue === "delete") void deletePrivateCity();
});

window.addEventListener("beforeunload", () => {
  heroScene?.dispose();
  workspaceScene?.dispose();
});

updateCharacterCount();
updateCityInterface(DEMO_CITY);
void restorePrivateCity();
const idleCallback = (window as Window & { requestIdleCallback?: typeof window.requestIdleCallback }).requestIdleCallback;
if (idleCallback) {
  idleCallback(() => void initializeScenes(), { timeout: 700 });
} else {
  globalThis.setTimeout(() => void initializeScenes(), 80);
}
