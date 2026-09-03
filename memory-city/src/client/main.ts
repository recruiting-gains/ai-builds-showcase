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
const STORAGE_PROBE_KEY = "memory-city-storage-check";
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
const progressMessage = requiredElement<HTMLElement>("#build-progress p");
const formTitle = requiredElement<HTMLElement>("#form-title");
const formIntro = requiredElement<HTMLElement>(".rail-heading p");
const cityName = requiredElement<HTMLElement>("#city-name");
const cityStatus = requiredElement<HTMLElement>("#city-status");
const statIdeas = requiredElement<HTMLElement>("#stat-ideas");
const statDistricts = requiredElement<HTMLElement>("#stat-districts");
const statRoads = requiredElement<HTMLElement>("#stat-roads");
const citySummary = requiredElement<HTMLElement>("#city-summary");
const listDistricts = requiredElement<HTMLElement>("#list-districts");
const listView = requiredElement<HTMLElement>("#city-list");
const cityStage = requiredElement<HTMLElement>(".city-stage");
const builderSection = requiredElement<HTMLElement>("#city-builder");
const heroLoading = requiredElement<HTMLElement>("#hero-loading");
const workspaceLoading = requiredElement<HTMLElement>("#workspace-loading");
const showCityButton = requiredElement<HTMLButtonElement>("#show-city");
const showListButton = requiredElement<HTMLButtonElement>("#show-list");
const ideaInspector = requiredElement<HTMLElement>("#idea-inspector");
const heroInspector = requiredElement<HTMLElement>("#hero-inspector");
const tourDemoButton = requiredElement<HTMLButtonElement>("#tour-demo");
const exportButton = requiredElement<HTMLButtonElement>("#export-city");
const deleteButton = requiredElement<HTMLButtonElement>("#delete-city");
const deleteDialog = requiredElement<HTMLDialogElement>("#delete-dialog");
const toast = requiredElement<HTMLElement>("#toast");
const liveStatus = requiredElement<HTMLElement>("#live-status");

let currentCity = DEMO_CITY;
let persistentStorageAvailable = probePersistentStorage();
let inMemoryPendingEntry: PendingEntry | null = null;
let cityAccess: StoredCityAccess | null = readStoredAccess();
let heroScene: CityVisualizationController | null = null;
let workspaceScene: CityVisualizationController | null = null;
let selectedDistrict: District | "all" = "all";
let toastTimer: number | null = null;
let progressTimer: number | null = null;
let workspaceSceneObserver: IntersectionObserver | null = null;
let cityModulePromise: Promise<typeof import("./city")> | null = null;
let workspaceScenePromise: Promise<void> | null = null;
let heroInspectorReturnFocus: HTMLElement | null = null;
let workspaceInspectorReturnFocus: HTMLElement | null = null;

function probePersistentStorage(): boolean {
  try {
    localStorage.setItem(STORAGE_PROBE_KEY, "available");
    localStorage.removeItem(STORAGE_PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

function removeStoredValue(key: string): void {
  if (!persistentStorageAvailable) return;
  try {
    localStorage.removeItem(key);
  } catch {
    persistentStorageAvailable = false;
  }
}

function readStoredAccess(): StoredCityAccess | null {
  if (!persistentStorageAvailable) return null;
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
    persistentStorageAvailable = false;
    return null;
  }
}

function saveAccess(access: StoredCityAccess): boolean {
  if (!persistentStorageAvailable) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(access));
    cityAccess = access;
    return true;
  } catch {
    persistentStorageAvailable = false;
    cityAccess = null;
    return false;
  }
}

function clearAccess(): void {
  removeStoredValue(STORAGE_KEY);
  removeStoredValue(PENDING_STORAGE_KEY);
  inMemoryPendingEntry = null;
  cityAccess = null;
}

function readPendingEntry(): PendingEntry | null {
  if (!persistentStorageAvailable) return inMemoryPendingEntry;
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const cityId = "cityId" in value && typeof value.cityId === "string" ? value.cityId : "";
    const operationId = "operationId" in value && typeof value.operationId === "string" ? value.operationId : "";
    const text = "text" in value && typeof value.text === "string" ? value.text : "";
    if (!/^[0-9a-f-]{36}$/i.test(cityId) || !/^[0-9a-f-]{36}$/i.test(operationId) || text.length < 40 || text.length > 5_000) return null;
    const pending = { cityId, operationId, text };
    inMemoryPendingEntry = pending;
    return pending;
  } catch {
    persistentStorageAvailable = false;
    return inMemoryPendingEntry;
  }
}

function pendingEntryFor(access: StoredCityAccess, text: string): PendingEntry {
  const existing = readPendingEntry();
  if (existing && existing.cityId === access.cityId && existing.text === text) return existing;
  const pending = { cityId: access.cityId, operationId: crypto.randomUUID(), text };
  inMemoryPendingEntry = pending;
  if (persistentStorageAvailable) {
    try {
      localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending));
    } catch {
      persistentStorageAvailable = false;
    }
  }
  return pending;
}

async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiRequestError(
      0,
      "We could not reach Memory City. Check your connection and try again. Your note is still in the text box.",
    );
  }
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
  if (meta) meta.textContent = `${DISTRICT_LABELS[node.district]} · connection strength ${node.depth} of 5`;
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

function focusInspector(element: HTMLElement): void {
  const heading = element.querySelector<HTMLElement>("h2, h3");
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

function dismissInspector(element: HTMLElement, restoreFocus = true): void {
  if (element === heroInspector) {
    heroScene?.selectNode(null, { notify: false });
    element.hidden = true;
    const returnTarget = heroInspectorReturnFocus;
    heroInspectorReturnFocus = null;
    if (restoreFocus) (returnTarget?.isConnected ? returnTarget : tourDemoButton).focus();
    return;
  }

  workspaceScene?.selectNode(null, { notify: false });
  element.hidden = true;
  const returnTarget = workspaceInspectorReturnFocus;
  workspaceInspectorReturnFocus = null;
  if (!restoreFocus) return;
  const fallback = listView.hidden ? showCityButton : showListButton;
  const focusTarget =
    returnTarget?.isConnected && !returnTarget.closest("[hidden]")
      ? returnTarget
      : fallback;
  focusTarget.focus();
}

function updateCityInterface(city: CitySnapshot, announce = false): void {
  currentCity = city;
  const isDemo = city.id === DEMO_CITY.id;
  cityName.textContent = city.name;
  cityStatus.textContent = isDemo
    ? "Example city · ready to explore"
    : `Private city · ${city.entries.length} of 16 notes used · saved`;
  formTitle.textContent = isDemo ? "Create your own city" : "Add another learning note";
  formIntro.textContent = isDemo ? "Start with one useful thought." : "Grow your map one note at a time.";
  readyLabel.textContent = isDemo ? "Create city from this note ✦" : "Add this note ✦";
  statIdeas.textContent = String(city.nodes.length);
  const districtCount = new Set(city.nodes.map((node) => node.district)).size;
  statDistricts.textContent = String(districtCount);
  statRoads.textContent = String(city.edges.length);
  citySummary.textContent = `${city.name} contains ${city.nodes.length} ${city.nodes.length === 1 ? "idea" : "ideas"} across ${districtCount} ${districtCount === 1 ? "district" : "districts"}, connected by ${city.edges.length} ${city.edges.length === 1 ? "road" : "roads"}. Use List view for a text version of every idea.`;
  exportButton.disabled = isDemo;
  deleteButton.disabled = isDemo;
  const demoControlHint = "Available after you create your own city.";
  exportButton.title = isDemo ? demoControlHint : "Download a JSON record of this city";
  deleteButton.title = isDemo ? demoControlHint : "Permanently delete this city";
  renderList();
  workspaceScene?.setData(city);
  dismissInspector(ideaInspector, false);
  if (announce) liveStatus.textContent = `${city.name} is ready with ${city.nodes.length} ideas and ${city.edges.length} connections.`;
}

function renderList(): void {
  const visibleNodes = currentCity.nodes.filter(
    (node) => selectedDistrict === "all" || node.district === selectedDistrict,
  );
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleConnections = currentCity.edges.filter(
    (connection) =>
      visibleNodeIds.has(connection.source) && visibleNodeIds.has(connection.target),
  );
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
          workspaceInspectorReturnFocus = button;
          workspaceScene?.selectNode(node.id, { flyTo: false });
          showInspector(ideaInspector, node, currentCity);
          focusInspector(ideaInspector);
          liveStatus.textContent = `${node.label}. ${node.description}`;
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
  connectionCount.textContent = `${visibleConnections.length} ${visibleConnections.length === 1 ? "road" : "roads"}`;
  connectionHeading.append(connectionCount);
  const connectionList = document.createElement("ul");
  for (const connection of visibleConnections) {
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
  if (visibleConnections.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Roads appear after related ideas are found.";
    connectionList.append(item);
  }
  connectionSection.append(connectionHeading, connectionList);
  listDistricts.replaceChildren(...districts, connectionSection);
}

function showCityView(): void {
  if (!ideaInspector.hidden) dismissInspector(ideaInspector, false);
  listView.hidden = true;
  workspaceScene?.setSuspended(false);
  showCityButton.classList.add("active");
  showCityButton.setAttribute("aria-pressed", "true");
  showListButton.classList.remove("active");
  showListButton.setAttribute("aria-pressed", "false");
}

function showListView(): void {
  if (!ideaInspector.hidden) dismissInspector(ideaInspector, false);
  listView.hidden = false;
  workspaceScene?.setSuspended(true);
  showListButton.classList.add("active");
  showListButton.setAttribute("aria-pressed", "true");
  showCityButton.classList.remove("active");
  showCityButton.setAttribute("aria-pressed", "false");
}

function setDistrictFocus(district: District | "all"): void {
  selectedDistrict = district;
  const chips = Array.from(document.querySelectorAll<HTMLButtonElement>(".filter-chip"));
  const hasAllChip = chips.some((chip) => chip.dataset.district === "all");
  for (const chip of chips) {
    const active =
      district === "all"
        ? chip.dataset.district === "all" || !hasAllChip
        : chip.dataset.district === district;
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-pressed", String(active));
  }
  workspaceScene?.setDistrictFilter(district);
  renderList();
}

function showToast(message: string): void {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4_000);
}

function updateCharacterCount(): void {
  characterCount.textContent = `${memoryText.value.length.toLocaleString()} / 5,000`;
  if (memoryText.value.trim().length >= 40 && !formMessage.hidden) {
    clearFormError();
    memoryText.removeAttribute("aria-invalid");
  }
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
  if (progressTimer !== null) window.clearTimeout(progressTimer);
  progressTimer = null;
  if (!busy) return;
  busyLabel.textContent = "Organizing your note…";
  progressBar.style.width = "38%";
  progressMessage.textContent = "This usually takes a few moments. Keep this tab open.";
  progressTimer = window.setTimeout(() => {
    busyLabel.textContent = "Still organizing your note…";
    progressMessage.textContent = "This is taking longer than usual, but your note is still being processed.";
  }, 10_000);
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
  if (!persistentStorageAvailable) {
    throw new ApiRequestError(
      0,
      "This browser cannot safely save the private key for a city. Allow site storage or use a regular browser window, then try again.",
    );
  }
  const response = await apiRequest<CreateCityResponse>("/api/cities", { method: "POST" });
  const access = { cityId: response.city.id, editToken: response.editToken };
  if (!saveAccess(access)) {
    try {
      await apiRequest<void>(`/api/cities/${access.cityId}`, { method: "DELETE" }, access.editToken);
    } catch {
      // The city expires automatically; the important part is not accepting a
      // note when this browser cannot retain its private access key.
    }
    throw new ApiRequestError(
      0,
      "This browser could not save the private city key, so no note was added. Allow site storage and try again.",
    );
  }
  return access;
}

async function addMemory(text: string): Promise<void> {
  const access = await ensurePrivateCity();
  const previousRoadCount = currentCity.id === access.cityId ? currentCity.edges.length : 0;
  const pending = pendingEntryFor(access, text);
  const response = await apiRequest<AddEntryResponse>(
    `/api/cities/${access.cityId}/entries`,
    { method: "POST", body: JSON.stringify({ text, operationId: pending.operationId }) },
    access.editToken,
  );
  inMemoryPendingEntry = null;
  removeStoredValue(PENDING_STORAGE_KEY);
  setDistrictFocus("all");
  updateCityInterface(response.city, true);
  showCityView();
  const newest = response.addedNodeIds[0];
  window.setTimeout(() => {
    void initializeWorkspaceScene().then(() => {
      if (newest) workspaceScene?.selectNode(newest, { flyTo: true });
      if (window.matchMedia("(max-width: 760px)").matches) {
        const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth";
        cityStage.scrollIntoView({ behavior, block: "center" });
      }
    });
  }, 350);
  memoryText.value = "";
  updateCharacterCount();
  const buildingsAdded = response.addedNodeIds.length;
  const roadsAdded = Math.max(0, response.city.edges.length - previousRoadCount);
  const roadSummary = roadsAdded === 1 ? "1 road was added" : `${roadsAdded} roads were added`;
  const bridgeSummary = response.semanticLinksAdded > 0
    ? ` ${response.semanticLinksAdded} ${response.semanticLinksAdded === 1 ? "bridge connects" : "bridges connect"} to an earlier note.`
    : "";
  showToast(`${buildingsAdded} ${buildingsAdded === 1 ? "building" : "buildings"} and ${roadSummary}.${bridgeSummary}`);
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

function loadCityModule(): Promise<typeof import("./city")> {
  cityModulePromise ??= import("./city");
  return cityModulePromise;
}

function motionIsEnabled(target: "hero" | "workspace"): boolean {
  return document.querySelector<HTMLButtonElement>(`.motion-toggle[data-target="${target}"]`)
    ?.getAttribute("aria-pressed") !== "true";
}

function monitorWebGLContext(
  container: HTMLElement,
  loading: HTMLElement,
  target: "hero" | "workspace",
): void {
  const canvas = container.querySelector<HTMLCanvasElement>("canvas");
  if (!canvas) return;
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    loading.hidden = false;
    loading.removeAttribute("aria-hidden");
    loading.setAttribute("role", "status");
    loading.replaceChildren(document.createTextNode("3D view paused · your ideas are still safe"));
    if (target === "hero") heroScene?.setSuspended(true);
    if (target === "workspace") {
      showListView();
      liveStatus.textContent = "The 3D view paused. Your complete city is available in Read ideas.";
    }
  });
  canvas.addEventListener("webglcontextrestored", () => {
    loading.hidden = true;
    if (target === "hero") heroScene?.setSuspended(false);
    if (target === "workspace") workspaceScene?.setSuspended(!listView.hidden);
    liveStatus.textContent = "The 3D view is ready again.";
  });
}

async function initializeHeroScene(): Promise<void> {
  try {
    const { createMemoryCityVisualization } = await loadCityModule();
    heroScene = createMemoryCityVisualization({
      container: requiredElement<HTMLElement>("#hero-city"),
      data: DEMO_CITY,
      quality: "auto",
      onSelectNode: (node) => showInspector(heroInspector, node, DEMO_CITY),
    });
    heroScene.setMotion(motionIsEnabled("hero"));
    monitorWebGLContext(requiredElement<HTMLElement>("#hero-city"), heroLoading, "hero");
    heroLoading.hidden = true;
  } catch {
    const heroFallback = document.createElement("span");
    heroFallback.textContent = "3D view unavailable";
    heroLoading.replaceChildren(heroFallback);
    heroLoading.removeAttribute("aria-hidden");
    heroLoading.setAttribute("role", "status");
  }
}

async function initializeWorkspaceScene(): Promise<void> {
  if (workspaceScene) return;
  if (workspaceScenePromise) return workspaceScenePromise;

  workspaceScenePromise = (async () => {
    try {
      const { createMemoryCityVisualization } = await loadCityModule();
      workspaceScene = createMemoryCityVisualization({
        container: requiredElement<HTMLElement>("#workspace-city"),
        data: currentCity,
        quality: "auto",
        onSelectNode: (node) => showInspector(ideaInspector, node, currentCity),
      });
      workspaceScene.setMotion(motionIsEnabled("workspace"));
      monitorWebGLContext(requiredElement<HTMLElement>("#workspace-city"), workspaceLoading, "workspace");
      workspaceScene.setDistrictFilter(selectedDistrict);
      workspaceScene.setSuspended(!listView.hidden);
      workspaceLoading.hidden = true;
    } catch {
      const workspaceFallback = document.createElement("span");
      workspaceFallback.textContent = "3D view unavailable · Use List view";
      workspaceLoading.replaceChildren(workspaceFallback);
      workspaceLoading.removeAttribute("aria-hidden");
      workspaceLoading.setAttribute("role", "status");
      liveStatus.textContent = "The 3D view is unavailable. The complete city is open in List view.";
      showListView();
    } finally {
      workspaceSceneObserver?.disconnect();
      workspaceSceneObserver = null;
    }
  })();
  return workspaceScenePromise;
}

function observeWorkspaceScene(): void {
  if (!("IntersectionObserver" in window)) {
    void initializeWorkspaceScene();
    return;
  }
  workspaceSceneObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void initializeWorkspaceScene();
    },
    { rootMargin: "600px 0px", threshold: 0.01 },
  );
  workspaceSceneObserver.observe(builderSection);
}

async function initializeScenes(): Promise<void> {
  observeWorkspaceScene();
  await initializeHeroScene();
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
tourDemoButton.addEventListener("click", () => {
  const node = DEMO_CITY.nodes.find((item) => item.id === "demo-memory") ?? DEMO_CITY.nodes[0];
  if (node) {
    heroInspectorReturnFocus = tourDemoButton;
    heroScene?.selectNode(node.id, { flyTo: true });
    showInspector(heroInspector, node, DEMO_CITY);
    focusInspector(heroInspector);
    liveStatus.textContent = `${node.label}. ${node.description}`;
  }
});
document.querySelectorAll<HTMLButtonElement>(".inspector-close").forEach((button) => {
  button.addEventListener("click", () => {
    const inspector = button.closest<HTMLElement>(".floating-inspector, .idea-inspector");
    if (inspector) dismissInspector(inspector);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || deleteDialog.open) return;
  if (!ideaInspector.hidden) {
    event.preventDefault();
    dismissInspector(ideaInspector);
    return;
  }
  if (!heroInspector.hidden) {
    event.preventDefault();
    dismissInspector(heroInspector);
  }
});

document.querySelectorAll<HTMLButtonElement>(".motion-toggle").forEach((button) => {
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = motionPreference.matches;
  let manuallyChanged = false;
  const syncButton = (): void => {
    button.setAttribute("aria-pressed", String(paused));
    button.setAttribute("aria-label", paused ? "Resume city motion" : "Pause city motion");
    button.title = paused ? "Resume motion" : "Pause motion";
    button.classList.toggle("paused", paused);
    const visibleLabel = button.querySelector<HTMLElement>("span");
    if (visibleLabel) visibleLabel.textContent = paused ? "Motion off" : "Motion on";
  };
  syncButton();
  button.addEventListener("click", () => {
    manuallyChanged = true;
    paused = !paused;
    syncButton();
    if (button.dataset.target === "hero") heroScene?.setMotion(!paused);
    if (button.dataset.target === "workspace") workspaceScene?.setMotion(!paused);
    showToast(paused ? "City motion paused." : "City motion resumed.");
  });
  motionPreference.addEventListener("change", (event) => {
    if (manuallyChanged) return;
    paused = event.matches;
    syncButton();
    if (button.dataset.target === "hero") heroScene?.setMotion(!paused);
    if (button.dataset.target === "workspace") workspaceScene?.setMotion(!paused);
  });
});

document.querySelectorAll<HTMLButtonElement>(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => {
    const district = button.dataset.district;
    if (district !== "all" && !(district && district in DISTRICT_LABELS)) return;
    if (!ideaInspector.hidden) dismissInspector(ideaInspector, false);
    setDistrictFocus(district as District | "all");
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
  workspaceSceneObserver?.disconnect();
  heroScene?.dispose();
  workspaceScene?.dispose();
});

updateCharacterCount();
updateCityInterface(DEMO_CITY);
setDistrictFocus("all");
void restorePrivateCity();
const idleCallback = (window as Window & { requestIdleCallback?: typeof window.requestIdleCallback }).requestIdleCallback;
if (idleCallback) {
  idleCallback(() => void initializeScenes(), { timeout: 700 });
} else {
  globalThis.setTimeout(() => void initializeScenes(), 80);
}
