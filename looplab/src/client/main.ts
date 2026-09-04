import "./styles.css";
import { CASES, CORPUS_VERSION, CORPUS_HASH } from "../shared/corpus";
import {
  DEFAULT_PROMPT_A,
  DEFAULT_PROMPT_B,
  MODEL,
  type ExperimentConfig,
  type ExperimentRun,
  type Lane,
  type TrialResult,
} from "../shared/contracts";
import { summarize, verdict } from "./summary";
import { EXPERIMENT_FINGERPRINT, getProvenance } from "../shared/experiment";
import type { LabScene } from "./scene";

function el<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const promptA = el<HTMLTextAreaElement>("prompt-a"),
  promptB = el<HTMLTextAreaElement>("prompt-b");
const caseDialog = el<HTMLDialogElement>("case-dialog"),
  infoDialog = el<HTMLDialogElement>("info-dialog");
const runButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".run-trigger"),
);
let config: ExperimentConfig | null = null,
  current: ExperimentRun | null = null,
  scene: LabScene | null = null;
let busy = false,
  pauseRequested = false,
  filter = "all",
  paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
let creation: {
  promptA: string;
  promptB: string;
  idempotencyKey: string;
} | null = null;
const history: ExperimentRun[] = [];
const STORAGE_KEY = "looplab.current-run.v1";
promptA.value = DEFAULT_PROMPT_A;
promptB.value = DEFAULT_PROMPT_B;
function storageRead() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function storageWrite(id: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* Browsing with storage disabled still supports the current run. */
  }
}
function status(text: string) {
  el("run-status").textContent = text;
}
function showError(message: string | null) {
  el("error-message").hidden = !message;
  el("error-message").textContent = message ?? "";
}
function count() {
  el("count-a").textContent = `${promptA.value.length} / 1600`;
  el("count-b").textContent = `${promptB.value.length} / 1600`;
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const message =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
          ? data.error
          : "The lab could not complete that request.";
      throw new Error(message);
    }
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error(
        "The model is taking longer than expected. Your completed results are saved. Resume to retrieve the experiment.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
function updateControls() {
  const unfinished = current !== null && current.status !== "complete";
  runButtons.forEach((button) => {
    button.disabled = !config || busy || unfinished;
    button.innerHTML = busy
      ? 'Experiment running <span aria-hidden="true">◌</span>'
      : 'Run experiment <span aria-hidden="true">↗</span>';
  });
  promptA.disabled = busy || unfinished;
  promptB.disabled = busy || unfinished;
  el<HTMLButtonElement>("reset-prompts").disabled = busy || unfinished;
  el("pause-run").hidden = !busy || !current;
  el<HTMLButtonElement>("pause-run").disabled = pauseRequested;
  el("resume-run").hidden = busy || !unfinished;
  el("new-run").hidden = busy || !unfinished;
  el<HTMLButtonElement>("export-button").disabled = !current?.results.length;
}
async function runApi(path: string, body?: unknown): Promise<ExperimentRun> {
  const run = await api<ExperimentRun>(path, body);
  if (
    run.experimentVersion !== EXPERIMENT_FINGERPRINT ||
    run.corpusHash !== CORPUS_HASH ||
    run.corpusVersion !== CORPUS_VERSION ||
    run.model !== MODEL
  )
    throw new Error(
      "The experiment setup changed while this tab was open. Refresh before continuing so the answer key and model settings match.",
    );
  return run;
}
function resultFor(id: string, lane: Lane) {
  return current?.results.find((r) => r.caseId === id && r.lane === lane);
}
function resultBadge(result: TrialResult | undefined, lane: Lane) {
  const state = !result
    ? "waiting"
    : result.error
      ? "error"
      : result.grade.passed
        ? "pass"
        : "fail";
  const symbol = !result
    ? "·"
    : result.error
      ? "!"
      : result.grade.passed
        ? "✓"
        : "×";
  const label = !result
    ? "Waiting"
    : result.error
      ? "Service error"
      : result.grade.passed
        ? "Passed"
        : "Failed";
  return `<span class="case-status ${state}" aria-label="Prompt ${lane}: ${label}">${lane} <span aria-hidden="true">${symbol}</span> ${!result ? "—" : result.error ? "Error" : `${result.grade.correctFields}/3`}</span>`;
}
function renderCases() {
  const visible = CASES.filter(
    (c) =>
      filter === "all" ||
      (["A", "B"] as Lane[]).some((lane) => {
        const r = resultFor(c.id, lane);
        return r && !r.grade.passed;
      }),
  );
  el("case-grid").innerHTML = visible
    .map(
      (c) =>
        `<button class="case-card" data-case="${c.id}" aria-label="Inspect ${escape(c.title)}"><span class="case-top"><b>TEST ${String(CASES.indexOf(c) + 1).padStart(2, "0")}</b><span aria-hidden="true">↗</span></span><h3>${escape(c.title)}</h3><span class="case-statuses">${resultBadge(resultFor(c.id, "A"), "A")}${resultBadge(resultFor(c.id, "B"), "B")}</span></button>`,
    )
    .join("");
  el("empty-results").hidden = visible.length > 0;
  el("empty-results").textContent =
    current?.status === "complete"
      ? "No failures in this run. Try a different instruction or repeat the experiment."
      : "No failures to inspect yet. Run the experiment to collect evidence.";
}
function renderSummary() {
  el("scoreboard").hidden = !current?.results.length;
  if (!current) {
    el("arena-a").innerHTML = "—<small>/10</small>";
    el("arena-b").innerHTML = "—<small>/10</small>";
    el("progress-fill").style.width = "0%";
    document
      .querySelector("[role=progressbar]")
      ?.setAttribute("aria-valuenow", "0");
    el("scene-status").innerHTML =
      '<i class="signal"></i> Lab ready. Your move.';
    return;
  }
  const a = summarize(current, "A"),
    b = summarize(current, "B");
  el("arena-a").innerHTML = `${a.passed}<small>/10</small>`;
  el("arena-b").innerHTML = `${b.passed}<small>/10</small>`;
  const card = (lane: Lane) => {
    const summary = lane === "A" ? a : b;
    return `<div class="score ${lane.toLowerCase()}"><h3>PROMPT ${lane} / ${lane === "A" ? "BASELINE" : "CHALLENGER"}</h3><div class="large">${summary.passed}<small> / 10 cases passed</small></div><p>${summary.fields}/30 fields correct${summary.errors ? ` · ${summary.errors} service errors` : ""}</p><p>${summary.averageLatency === null ? "—" : `${(summary.averageLatency / 1000).toFixed(1)}s`} avg response · ${summary.tokens === null ? "Tokens unavailable" : `${summary.tokens.toLocaleString()} total tokens`}</p></div>`;
  };
  const outcome = verdict(current);
  el("scoreboard").innerHTML =
    card("A") +
    card("B") +
    `<div class="score verdict"><h3>${escape(outcome.title)}</h3><p>${escape(outcome.detail)}</p></div>`;
  const completed = current.results.length;
  el("progress-fill").style.width = `${(completed / 20) * 100}%`;
  document
    .querySelector("[role=progressbar]")
    ?.setAttribute("aria-valuenow", String(completed));
  el("scene-status").innerHTML =
    `<i class="signal"></i> ${current.status === "complete" ? "Experiment complete. Inspect your evidence." : `${completed}/20 responses collected${busy ? " · Testing…" : " · Paused"}`}`;
}
function render() {
  renderCases();
  renderSummary();
  updateControls();
  scene?.update(current, busy);
}
function remember(run: ExperimentRun) {
  if (run.status !== "complete" || history.some((item) => item.id === run.id))
    return;
  history.unshift(structuredClone(run));
  el("history-list").innerHTML = history
    .map((item, index) => {
      const a = summarize(item, "A"),
        b = summarize(item, "B");
      return `<div class="history-row"><div>Experiment ${String(history.length - index).padStart(2, "0")}<small>${escape(new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))} · ${escape(item.corpusVersion)}</small></div><span class="history-score">A ${a.passed}/10</span><span class="history-score b">B ${b.passed}/10</span><button class="text-button" data-history="${item.id}">Inspect</button><button class="text-button" data-promote="${item.id}">Use B as baseline ↗</button></div>`;
    })
    .join("");
}
async function advance() {
  if (!current || busy) return;
  busy = true;
  pauseRequested = false;
  showError(null);
  render();
  let unchangedSince = Date.now(),
    previousCount = current.completed;
  try {
    while (current.status !== "complete" && !pauseRequested) {
      status(
        `Testing case ${Math.min(10, current.completed + 1)} of 10. Both prompts receive the same announcement…`,
      );
      current = await runApi(`/api/runs/${current.id}/step`, {});
      storageWrite(current.id);
      render();
      if (current.completed === previousCount) {
        if (Date.now() - unchangedSince > 75000)
          throw new Error(
            "This case is still being settled. Pause for a moment, then resume to retrieve its saved result.",
          );
        await new Promise((resolve) => setTimeout(resolve, 1800));
      } else {
        previousCount = current.completed;
        unchangedSince = Date.now();
      }
    }
    if (current.status === "complete") {
      remember(current);
      status(
        "Experiment complete. Select any case to compare the answers and inspect the scoring.",
      );
    } else
      status(
        "Experiment paused. Resume to continue with the same prompts and saved results.",
      );
  } catch (error) {
    showError(
      error instanceof Error
        ? error.message
        : "Something interrupted this run. Resume to retrieve saved results.",
    );
    status("Experiment interrupted. Completed results remain available.");
  } finally {
    busy = false;
    pauseRequested = false;
    render();
  }
}
async function start() {
  if (busy || !config || (current && current.status !== "complete")) return;
  if (!promptA.value.trim() || !promptB.value.trim()) {
    showError("Add an instruction to both prompt lanes first.");
    return;
  }
  showError(null);
  busy = true;
  updateControls();
  status("Preparing a fresh experiment with the fixed test set…");
  const a = promptA.value.trim(),
    b = promptB.value.trim();
  if (!creation || creation.promptA !== a || creation.promptB !== b)
    creation = { promptA: a, promptB: b, idempotencyKey: crypto.randomUUID() };
  try {
    current = await runApi("/api/runs", creation);
    creation = null;
    storageWrite(current.id);
    promptA.value = current.promptA;
    promptB.value = current.promptB;
    count();
  } catch (error) {
    showError(
      error instanceof Error
        ? error.message
        : "The experiment could not start.",
    );
    status("The lab is ready when you are.");
    busy = false;
    updateControls();
    return;
  }
  busy = false;
  await advance();
}
function fieldValue(value: unknown) {
  return value === null
    ? "Not provided (null)"
    : Array.isArray(value)
      ? value.length
        ? value.join(", ")
        : "None required ([])"
      : String(value);
}
function trialDetail(result: TrialResult | undefined, lane: Lane) {
  if (!result)
    return `<div class="trial-detail ${lane.toLowerCase()}"><h3>Prompt ${lane}</h3><p>No response yet. Run the experiment to see the actual answer.</p></div>`;
  return `<div class="trial-detail ${lane.toLowerCase()}"><h3>Prompt ${lane} · ${result.error ? "Service error" : result.grade.passed ? "Passed" : "Needs a closer look"}</h3>${result.error ? `<p>${escape(result.error)}</p>` : `<pre>${escape(result.raw)}</pre>${result.grade.fields.map((f) => `<div class="field-line ${f.passed ? "" : "failed"}"><b>${f.passed ? "✓" : "×"} ${escape(f.field)}</b><p>${escape(f.reason)}</p></div>`).join("")}`}<p class="trial-meta">${(result.latencyMs / 1000).toFixed(2)}s · Input ${result.inputTokens ?? "unavailable"} / output ${result.outputTokens ?? "unavailable"} tokens${result.providerModel ? `<br>Provider-reported model: ${escape(result.providerModel)}` : ""}</p></div>`;
}
function openCase(id: string) {
  const c = CASES.find((test) => test.id === id);
  if (!c) return;
  scene?.select(CASES.indexOf(c));
  el("case-title").textContent = c.title;
  el("case-category").textContent =
    `TEST ${String(CASES.indexOf(c) + 1).padStart(2, "0")} / ${c.category.toUpperCase()}`;
  el("case-detail").innerHTML =
    `<div class="source-block">${escape(c.text)}</div><p class="case-note">${escape(c.note)}</p><div class="expected-box"><h3>The fixed answer key</h3><div class="expected-fields">${Object.entries(
      c.expected,
    )
      .map(
        ([key, value]) =>
          `<div><span>${escape(key)}</span><b>${escape(fieldValue(value))}</b></div>`,
      )
      .join(
        "",
      )}</div></div><div class="trial-columns">${trialDetail(resultFor(id, "A"), "A")}${trialDetail(resultFor(id, "B"), "B")}</div><div class="notice"><p>Scoring ignores case and extra spaces. Supply order does not matter. Extra fields, invented details, or an invalid answer format fail the relevant checks. The model never receives this answer key.</p></div>`;
  if (!caseDialog.open) caseDialog.showModal();
}
function showInfo(kind: "how" | "method" | "privacy") {
  const content = {
    how: {
      title: "Your first experiment, in three moves.",
      html: `<div class="info-step"><h3>1. Pick your hypothesis</h3><p>The task is to extract an event’s location, date, and required supplies. Prompt A is your starting instruction. Prompt B adds a change you want to test.</p></div><div class="info-step"><h3>2. Run both through the same cases</h3><p>Each prompt sees the same ten fictional announcements through the same model with the same settings. Twenty fresh responses are collected. Service delays can make a run take a few minutes.</p></div><div class="info-step"><h3>3. Open the failures</h3><p>Click a case to compare the original text, expected answer, and both responses. A case passes only when all three fields and the answer format pass. A tie or a regression is useful evidence.</p></div><div class="notice"><p>The shared output contract requests JSON with exactly location, date, and supplies. Leave unavailable location/date as null; use [] when nothing is required. These formatting instructions are common to both lanes.</p></div>`,
    },
    method: {
      title: "One change. Fixed tests. Honest evidence.",
      html: `<p>LoopLab adapts the experiment structure of <a href="https://github.com/karpathy/autoresearch" target="_blank" rel="noopener noreferrer">Karpathy’s autoresearch</a>: establish a baseline, change one variable, evaluate against fixed rules, record the result, then keep or reject the change.</p><div class="info-step"><h3>The answer key stays put</h3><p>The examples and grader are versioned. The release check detects an unexpected change to the test set. The AI being tested cannot edit either one.</p><h3>You decide what to keep</h3><p>Completed experiments appear below the results. “Use B as baseline” carries that instruction into your next experiment. Look for regressions, repeat promising changes, and use new held-out examples before claiming general improvement.</p><h3>This is a learning experiment</h3><p>One run on ten public examples cannot establish that a prompt is universally better. Responses may vary even with the same settings. This loop tests instructions; it does not train model weights or rewrite a live website.</p></div><div class="notice"><p>Corpus: <code>${escape(CORPUS_VERSION)}</code><br>SHA-256: <code>${CORPUS_HASH}</code></p></div><p><a href="https://github.com/recruiting-gains/ai-builds-showcase/blob/main/looplab/docs/LOOP-METHOD.md" target="_blank" rel="noopener noreferrer">Read the full method and evaluation limits ↗</a></p>`,
    },
    privacy: {
      title: "A small public lab, with clear limits.",
      html: `<div class="info-step"><h3>Use fictional information</h3><p>Your two prompts are sent to the hosted AI service together with the supplied fictional announcements. Do not enter personal details, passwords, or confidential business information.</p><h3>What is saved</h3><p>A private browser cookie links you to your experiment. Prompts, model responses, timings, and reported token counts are stored in the hosting database. Experiments become inaccessible after 24 hours; database records remain until the owner performs maintenance. This tab keeps a run identifier so you can resume after a refresh.</p><h3>A bounded experiment</h3><p>Each experiment makes at most 20 model requests, with capped prompt and response lengths. This public installation allows up to four new experiments per browser session per UTC day and 100 new experiments across the site per UTC day. A separate daily model-call limit also applies. These limits help keep the public lab available.</p><h3>What the scores mean</h3><p>Scores describe this extraction task and these ten examples. Latency is observed request time, not a model speed benchmark. Tokens are shown only when the provider reports them. Service errors prevent a winner recommendation.</p></div><p>Live experiments use <code>${escape(config?.model ?? MODEL)}</code> on Cloudflare Workers AI. The app is an independent project and is not affiliated with OpenAI, Meta, or Cloudflare.</p>`,
    },
  }[kind];
  el("info-title").textContent = content.title;
  el("info-content").innerHTML = content.html;
  infoDialog.showModal();
}
runButtons.forEach((button) =>
  button.addEventListener("click", () => void start()),
);
promptA.addEventListener("input", count);
promptB.addEventListener("input", count);
el("reset-prompts").addEventListener("click", () => {
  promptA.value = DEFAULT_PROMPT_A;
  promptB.value = DEFAULT_PROMPT_B;
  creation = null;
  count();
});
el("pause-run").addEventListener("click", () => {
  pauseRequested = true;
  el<HTMLButtonElement>("pause-run").disabled = true;
  status("Finishing the current case, then pausing.");
});
el("resume-run").addEventListener("click", () => void advance());
el("new-run").addEventListener("click", () => {
  if (busy) return;
  current = null;
  creation = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* No local storage to clear. */
  }
  showError(null);
  render();
  status(
    "Ready for a fresh experiment. The previous run remains stored; no new model calls have started.",
  );
});
document
  .querySelectorAll<HTMLButtonElement>("[data-filter]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      filter = button.dataset.filter ?? "all";
      document
        .querySelectorAll<HTMLButtonElement>("[data-filter]")
        .forEach((b) => {
          b.classList.toggle("active", b === button);
          b.setAttribute("aria-pressed", String(b === button));
        });
      renderCases();
    }),
  );
el("case-grid").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-case]",
  );
  if (button?.dataset.case) openCase(button.dataset.case);
});
el("history-list").addEventListener("click", (event) => {
  if (busy || (current && current.status !== "complete")) return;
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-history],[data-promote]",
  );
  if (!target) return;
  const run = history.find(
    (item) => item.id === (target.dataset.history ?? target.dataset.promote),
  );
  if (!run) return;
  if (target.dataset.promote) {
    promptA.value = run.promptB;
    promptB.value = run.promptB;
    count();
    el("experiment").scrollIntoView({
      behavior: paused ? "auto" : "smooth",
      block: "start",
    });
    promptB.focus();
    status(
      "Challenger copied into both lanes. Change one instruction in B before the next run.",
    );
  } else {
    current = structuredClone(run);
    promptA.value = run.promptA;
    promptB.value = run.promptB;
    count();
    render();
    el("results-heading").scrollIntoView({
      behavior: paused ? "auto" : "smooth",
    });
  }
});
el("export-button").addEventListener("click", () => {
  if (!current) return;
  const artifact = {
    ...current,
    exportedAt: new Date().toISOString(),
    provenance: getProvenance(),
    answerKey: CASES,
    summary: {
      A: summarize(current, "A"),
      B: summarize(current, "B"),
      verdict: verdict(current),
    },
    limits:
      "Ten public examples. Scores are task-specific; latency is observed time; model outputs may vary. No general performance claim.",
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `looplab-${current.id.slice(0, 8)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
el("how-button").addEventListener("click", () => showInfo("how"));
el("method-button").addEventListener("click", () => showInfo("method"));
el("privacy-button").addEventListener("click", () => showInfo("privacy"));
document
  .querySelectorAll<HTMLButtonElement>("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog")?.close()),
  );
for (const dialog of [caseDialog, infoDialog])
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    }
  });
function updateMotion() {
  const button = el<HTMLButtonElement>("motion-button");
  button.setAttribute("aria-pressed", String(paused));
  button.setAttribute(
    "aria-label",
    paused ? "Resume lab animation" : "Pause lab animation",
  );
  button.innerHTML = paused
    ? 'Resume motion <span aria-hidden="true">▷</span>'
    : 'Pause motion <span aria-hidden="true">Ⅱ</span>';
  scene?.pause(paused);
}
el("motion-button").addEventListener("click", () => {
  paused = !paused;
  updateMotion();
});
el("reset-view").addEventListener("click", () => scene?.reset());
count();
render();
updateMotion();
async function initialize() {
  try {
    config = await api<ExperimentConfig>("/api/config");
    if (
      config.corpusHash !== CORPUS_HASH ||
      config.experimentVersion !== EXPERIMENT_FINGERPRINT
    )
      throw new Error(
        "The website and experiment setup were updated at different times. Refresh before starting an experiment.",
      );
    el("model-label").textContent = "Llama 3.1 · Workers AI";
    status("Ready. Run the starter prompts, or make your own hypothesis.");
    const saved = storageRead();
    if (saved) {
      try {
        current = await runApi(`/api/runs/${saved}`);
        promptA.value = current.promptA;
        promptB.value = current.promptB;
        remember(current);
        count();
        status(
          current.status === "complete"
            ? "Your last experiment is restored. Inspect it or start a new one."
            : "Your experiment is restored. Resume to continue collecting results.",
        );
      } catch {
        status(
          "Ready for a new experiment. The previous run is unavailable, expired, or uses a different experiment setup. Refresh if the lab was recently updated.",
        );
      }
    }
  } catch (error) {
    config = null;
    el("model-label").textContent = "Connection unavailable";
    showError(
      error instanceof Error
        ? error.message
        : "Could not connect to the experiment service. Refresh to retry.",
    );
    status("You can inspect the test cases while the lab reconnects.");
  } finally {
    render();
  }
}
void initialize();
void import("./scene")
  .then(({ createLabScene }) => {
    scene = createLabScene(el("lab-scene"), (index) =>
      openCase(CASES[index].id),
    );
    scene.pause(paused);
    scene.update(current, busy);
  })
  .catch(() => {
    el<HTMLButtonElement>("motion-button").disabled = true;
    el<HTMLButtonElement>("reset-view").disabled = true;
    el("scene-status").textContent =
      "Illustrated view · Experiment controls work below.";
  });
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) scene?.dispose();
});
