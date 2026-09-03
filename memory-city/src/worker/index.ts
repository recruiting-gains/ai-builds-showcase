import {
  DISTRICTS,
  EDGE_KINDS,
  LIMITS,
  type AddEntryResponse,
  type ApiErrorResponse,
  type CityEdge,
  type CityEntry,
  type CityNode,
  type CitySnapshot,
  type CreateCityResponse,
  type MemoryPlan,
} from "../shared/contracts";
import {
  isRecord,
  parseAddEntryRequest,
  parseMemoryPlan,
  ValidationError,
} from "../shared/validation";
import { buildMessages, MEMORY_PLAN_SCHEMA } from "./prompt";
import {
  completeVectorCleanup,
  enqueueVectorCleanup,
  finalizeCityDeletion,
  runScheduledCleanup,
} from "./lifecycle";

const TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as const;
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5" as const;
const VECTOR_DIMENSIONS = 768;
const SEMANTIC_THRESHOLD = 0.72;
const CITY_RETENTION_DAYS = 180;

const DOCUMENT_SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "worker-src 'self' blob:",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

interface CityRow {
  id: string;
  edit_token_hash: string;
  name: string;
  created_at: string;
  updated_at: string;
  state: "active" | "deleting";
  expires_at: string;
}

interface EntryRow {
  id: string;
  title: string;
  source_text: string;
  summary: string;
  created_at: string;
}

interface NodeRow {
  id: string;
  entry_id: string;
  label: string;
  description: string;
  district: CityNode["district"];
  depth: number;
  created_at: string;
}

interface EdgeRow {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relationship: string;
  kind: CityEdge["kind"];
}

function isEntryRow(value: unknown): value is EntryRow {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.source_text === "string" &&
    typeof value.summary === "string" &&
    typeof value.created_at === "string";
}

function isNodeRow(value: unknown): value is NodeRow {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.entry_id === "string" &&
    typeof value.label === "string" &&
    typeof value.description === "string" &&
    typeof value.district === "string" &&
    (DISTRICTS as readonly string[]).includes(value.district) &&
    typeof value.depth === "number" &&
    Number.isInteger(value.depth) &&
    typeof value.created_at === "string";
}

function isEdgeRow(value: unknown): value is EdgeRow {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.source_node_id === "string" &&
    typeof value.target_node_id === "string" &&
    typeof value.relationship === "string" &&
    typeof value.kind === "string" &&
    (EDGE_KINDS as readonly string[]).includes(value.kind);
}

function checkedRows<T>(rows: readonly unknown[], guard: (value: unknown) => value is T): T[] {
  if (!rows.every(guard)) {
    throw new HttpError(500, "CITY_DATA_INVALID", "The city could not be opened safely. Please try again.");
  }
  return [...rows];
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function apiHeaders(requestId: string): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Content-Type": "application/json; charset=utf-8",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": requestId,
  });
}

function jsonResponse(value: unknown, requestId: string, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = apiHeaders(requestId);
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(value), { status, headers });
}

function errorResponse(requestId: string, status: number, code: string, message: string, extraHeaders?: HeadersInit): Response {
  const body: ApiErrorResponse = { error: { code, message, requestId } };
  return jsonResponse(body, requestId, status, extraHeaders);
}

function requireSameOrigin(request: Request): void {
  const requestOrigin = request.headers.get("Origin");
  const url = new URL(request.url);
  if (requestOrigin && requestOrigin !== url.origin) {
    throw new HttpError(403, "CROSS_ORIGIN_REQUEST", "Use the controls on this website to change a city.");
  }
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new HttpError(403, "CROSS_ORIGIN_REQUEST", "Use the controls on this website to change a city.");
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "The request must be sent as JSON.");
  }
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > LIMITS.maxBodyBytes) {
    throw new HttpError(413, "BODY_TOO_LARGE", "That note is too large. Shorten it and try again.");
  }
  if (!request.body) throw new HttpError(400, "EMPTY_BODY", "Add a note and try again.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LIMITS.maxBodyBytes) {
      await reader.cancel("Body exceeded limit");
      throw new HttpError(413, "BODY_TOO_LARGE", "That note is too large. Shorten it and try again.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "The request could not be read. Refresh the page and try again.");
  }
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function bearerToken(request: Request): string {
  const value = request.headers.get("Authorization") ?? "";
  const match = /^Bearer ([a-f0-9]{64})$/.exec(value);
  if (!match?.[1]) throw new HttpError(401, "CITY_KEY_REQUIRED", "This browser no longer has the private key for that city.");
  return match[1];
}

const CITY_COLUMNS = "id, edit_token_hash, name, created_at, updated_at, state, expires_at";

function expiresAtFrom(now: number): string {
  return new Date(now + CITY_RETENTION_DAYS * 24 * 60 * 60 * 1_000).toISOString();
}

async function getAuthorizedCity(request: Request, env: Env, cityId: string, allowDeleting = false): Promise<CityRow> {
  const row = await env.DB.prepare(
    `SELECT ${CITY_COLUMNS} FROM cities WHERE id = ?`,
  ).bind(cityId).first<CityRow>();
  if (!row) throw new HttpError(404, "CITY_NOT_FOUND", "That city could not be found.");
  const suppliedHash = await sha256(bearerToken(request));
  if (!constantTimeEqual(row.edit_token_hash, suppliedHash)) {
    throw new HttpError(404, "CITY_NOT_FOUND", "That city could not be found.");
  }
  if (!allowDeleting && (row.state !== "active" || row.expires_at <= new Date().toISOString())) {
    throw new HttpError(404, "CITY_NOT_FOUND", "That city could not be found.");
  }
  return row;
}

async function citySnapshot(env: Env, city: CityRow): Promise<CitySnapshot> {
  const [entryResult, nodeResult, edgeResult] = await env.DB.batch([
    env.DB.prepare("SELECT id, title, source_text, summary, created_at FROM entries WHERE city_id = ? ORDER BY created_at").bind(city.id),
    env.DB.prepare("SELECT id, entry_id, label, description, district, depth, created_at FROM nodes WHERE city_id = ? ORDER BY created_at").bind(city.id),
    env.DB.prepare("SELECT id, source_node_id, target_node_id, relationship, kind FROM edges WHERE city_id = ? ORDER BY created_at").bind(city.id),
  ]);
  if (!entryResult || !nodeResult || !edgeResult) {
    throw new HttpError(500, "CITY_READ_FAILED", "The city could not be opened. Please try again.");
  }
  const entries = checkedRows(entryResult.results, isEntryRow).map<CityEntry>((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    sourceText: row.source_text,
    createdAt: row.created_at,
  }));
  const nodes = checkedRows(nodeResult.results, isNodeRow).map<CityNode>((row) => ({
    id: row.id,
    entryId: row.entry_id,
    label: row.label,
    description: row.description,
    district: row.district,
    depth: row.depth,
    createdAt: row.created_at,
  }));
  const edges = checkedRows(edgeResult.results, isEdgeRow).map<CityEdge>((row) => ({
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    relationship: row.relationship,
    kind: row.kind,
  }));
  return { id: city.id, name: city.name, createdAt: city.created_at, updatedAt: city.updated_at, entries, nodes, edges };
}

async function idempotentEntryResponse(
  env: Env,
  city: CityRow,
  operationId: string,
  requestId: string,
): Promise<Response | null> {
  const existing = await env.DB.prepare(
    "SELECT id FROM entries WHERE city_id = ? AND operation_id = ?",
  ).bind(city.id, operationId).first<{ id: string }>();
  if (!existing) return null;
  const nodeRows = await env.DB.prepare(
    "SELECT id FROM nodes WHERE city_id = ? AND entry_id = ? ORDER BY id",
  ).bind(city.id, existing.id).all<{ id: string }>();
  const refreshed = await env.DB.prepare(`SELECT ${CITY_COLUMNS} FROM cities WHERE id = ?`)
    .bind(city.id).first<CityRow>();
  if (!refreshed || refreshed.state !== "active") {
    throw new HttpError(409, "CITY_CHANGED", "That city changed while the note was being added. Refresh and try again.");
  }
  const response: AddEntryResponse = {
    city: await citySnapshot(env, refreshed),
    addedNodeIds: nodeRows.results.map((row) => row.id),
    semanticLinksAdded: 0,
    requestId,
  };
  return jsonResponse(response, requestId);
}

function parseModelValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function safeWords(text: string): string[] {
  return text
    .replace(/[^\p{L}\p{N}' -]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3)
    .slice(0, 18);
}

function fallbackPlan(text: string): MemoryPlan {
  const sentences = text.split(/(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean);
  const words = safeWords(text);
  const titleWords = words.slice(0, 5);
  const baseTitle = titleWords.join(" ") || "A new memory";
  const first = sentences[0] ?? text;
  const second = sentences[1] ?? "This note adds supporting detail to the main idea.";
  const third = sentences[2] ?? "This creates a useful question to return to later.";
  return {
    cityName: `${titleWords.slice(0, 3).join(" ") || "Memory"} City`.slice(0, 48),
    entryTitle: baseTitle.slice(0, 72),
    summary: first.slice(0, 240),
    nodes: [
      { localId: "main-idea", label: baseTitle.slice(0, 60), description: first.slice(0, 180), district: "concepts", depth: 3 },
      { localId: "supporting-detail", label: words.slice(5, 9).join(" ").slice(0, 60) || "Supporting detail", description: second.slice(0, 180), district: "evidence", depth: 2 },
      { localId: "open-question", label: "A question to explore", description: third.slice(0, 180), district: "questions", depth: 1 },
    ],
    edges: [
      { sourceLocalId: "main-idea", targetLocalId: "supporting-detail", relationship: "This detail supports the main idea in the note.", kind: "supports" },
      { sourceLocalId: "main-idea", targetLocalId: "open-question", relationship: "This question is a useful next direction for the main idea.", kind: "questions" },
    ],
  };
}

async function generatePlan(env: Env, text: string, requestId: string): Promise<MemoryPlan> {
  const input = { text };
  const modelInput = {
    messages: buildMessages(input),
    max_tokens: 1_700,
    stream: false,
    temperature: 0.2,
    response_format: { type: "json_schema", json_schema: MEMORY_PLAN_SCHEMA },
  } as const;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const output = await env.AI.run(TEXT_MODEL, modelInput);
      const responseValue: unknown =
        typeof output === "string" ? output : output && typeof output === "object" && "response" in output ? output.response : null;
      const plan = parseMemoryPlan(parseModelValue(responseValue));
      if (plan) return plan;
      console.warn(JSON.stringify({ event: "ai_output_invalid", requestId, attempt, model: TEXT_MODEL }));
    } catch (error) {
      console.warn(JSON.stringify({ event: "ai_request_failed", requestId, attempt, model: TEXT_MODEL, errorClass: error instanceof Error ? error.name : "UnknownError" }));
    }
  }
  console.warn(JSON.stringify({ event: "ai_fallback_used", requestId, model: TEXT_MODEL }));
  return fallbackPlan(text);
}

function validEmbedding(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === VECTOR_DIMENSIONS && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

async function embeddingsFor(env: Env, values: string[], requestId: string): Promise<number[][] | null> {
  try {
    const output = await env.AI.run(EMBEDDING_MODEL, { text: values });
    const data: unknown = output && typeof output === "object" && "data" in output ? output.data : null;
    if (Array.isArray(data) && data.length === values.length && data.every(validEmbedding)) return data;
  } catch (error) {
    console.warn(JSON.stringify({ event: "embedding_failed", requestId, model: EMBEDDING_MODEL, errorClass: error instanceof Error ? error.name : "UnknownError" }));
  }
  return null;
}

function orderedPair(source: string, target: string): [string, string] {
  return source < target ? [source, target] : [target, source];
}

function connectDisjointIdeas(nodes: CityNode[], edgesByPair: Map<string, CityEdge>): void {
  const parent = new Map(nodes.map((node) => [node.id, node.id]));
  const find = (id: string): string => {
    const next = parent.get(id) ?? id;
    if (next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  const unite = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  for (const edge of edgesByPair.values()) unite(edge.source, edge.target);
  const anchor = nodes[0];
  if (!anchor) return;
  for (const node of nodes.slice(1)) {
    if (find(anchor.id) === find(node.id)) continue;
    const [source, target] = orderedPair(anchor.id, node.id);
    const key = `${source}:${target}`;
    edgesByPair.set(key, {
      id: crypto.randomUUID(),
      source,
      target,
      relationship: "These ideas belong together because they came from the same saved note.",
      kind: "related",
    });
    unite(source, target);
  }
}

async function handleCreateCity(request: Request, env: Env, requestId: string): Promise<Response> {
  if (request.method !== "POST") return errorResponse(requestId, 405, "METHOD_NOT_ALLOWED", "Use the city builder to create a city.", { Allow: "POST" });
  requireSameOrigin(request);
  const key = `create:${await sha256(request.headers.get("CF-Connecting-IP") ?? "unknown-client")}`;
  const rateLimit = await env.CITY_RATE_LIMITER.limit({ key });
  if (!rateLimit.success) return errorResponse(requestId, 429, "RATE_LIMITED", "Too many cities were started at once. Wait one minute and try again.", { "Retry-After": "60" });

  const now = new Date().toISOString();
  const expiresAt = expiresAtFrom(Date.now());
  const cityId = crypto.randomUUID();
  const editToken = randomToken();
  const tokenHash = await sha256(editToken);
  await env.DB.prepare("INSERT INTO cities (id, edit_token_hash, name, created_at, updated_at, state, expires_at) VALUES (?, ?, ?, ?, ?, 'active', ?)")
    .bind(cityId, tokenHash, "My Memory City", now, now, expiresAt).run();
  const city: CitySnapshot = { id: cityId, name: "My Memory City", createdAt: now, updatedAt: now, nodes: [], edges: [], entries: [] };
  const response: CreateCityResponse = { city, editToken, requestId };
  return jsonResponse(response, requestId, 201);
}

async function handleGetCity(request: Request, env: Env, requestId: string, cityId: string): Promise<Response> {
  if (request.method !== "GET") return errorResponse(requestId, 405, "METHOD_NOT_ALLOWED", "That city view only accepts GET.", { Allow: "GET" });
  const city = await getAuthorizedCity(request, env, cityId);
  return jsonResponse({ city: await citySnapshot(env, city), requestId }, requestId);
}

async function handleAddEntry(request: Request, env: Env, requestId: string, cityId: string): Promise<Response> {
  if (request.method !== "POST") return errorResponse(requestId, 405, "METHOD_NOT_ALLOWED", "Use the city builder to add a note.", { Allow: "POST" });
  requireSameOrigin(request);
  const city = await getAuthorizedCity(request, env, cityId);
  const body = parseAddEntryRequest(await readBoundedJson(request));
  const replay = await idempotentEntryResponse(env, city, body.operationId, requestId);
  if (replay) return replay;

  const clientHash = await sha256(request.headers.get("CF-Connecting-IP") ?? "unknown-client");
  const [globalRateLimit, cityRateLimit] = await Promise.all([
    env.CITY_RATE_LIMITER.limit({ key: `ai:${clientHash}` }),
    env.CITY_RATE_LIMITER.limit({ key: `city:${cityId}:${clientHash}` }),
  ]);
  if (!globalRateLimit.success || !cityRateLimit.success) return errorResponse(requestId, 429, "RATE_LIMITED", "The city is growing too quickly. Wait one minute and try again.", { "Retry-After": "60" });

  const counts = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM entries WHERE city_id = ?) AS entry_count, (SELECT COUNT(*) FROM nodes WHERE city_id = ?) AS node_count",
  ).bind(cityId, cityId).first<{ entry_count: number; node_count: number }>();
  if (!counts || counts.entry_count >= LIMITS.maxEntriesPerCity || counts.node_count >= LIMITS.maxNodesPerCity) {
    throw new HttpError(409, "CITY_FULL", "This showcase city is full. Export it, then start a fresh city.");
  }

  const startedAt = Date.now();
  const plan = await generatePlan(env, body.text, requestId);
  const availableNodes = Math.max(0, LIMITS.maxNodesPerCity - counts.node_count);
  plan.nodes = plan.nodes.slice(0, availableNodes);
  const now = new Date().toISOString();
  const entryId = crypto.randomUUID();
  const nodeIdByLocal = new Map(plan.nodes.map((node) => [node.localId, crypto.randomUUID()]));
  const nodes: CityNode[] = plan.nodes.map((node) => ({
    id: nodeIdByLocal.get(node.localId)!, entryId, label: node.label, description: node.description,
    district: node.district, depth: node.depth, createdAt: now,
  }));

  const edgesByPair = new Map<string, CityEdge>();
  for (const edge of plan.edges) {
    const sourceId = nodeIdByLocal.get(edge.sourceLocalId);
    const targetId = nodeIdByLocal.get(edge.targetLocalId);
    if (!sourceId || !targetId) continue;
    const [source, target] = orderedPair(sourceId, targetId);
    edgesByPair.set(`${source}:${target}`, { id: crypto.randomUUID(), source, target, relationship: edge.relationship, kind: edge.kind });
  }
  connectDisjointIdeas(nodes, edgesByPair);

  const vectorTexts = nodes.map((node) => `${node.label}. ${node.description}`);
  const vectors = nodes.length > 0 ? await embeddingsFor(env, vectorTexts, requestId) : null;
  let semanticLinksAdded = 0;
  if (vectors) {
    const existingRows = await env.DB.prepare("SELECT id FROM nodes WHERE city_id = ?").bind(cityId).all<{ id: string }>();
    const existingIds = new Set(existingRows.results.map((row) => row.id));
    const searches = await Promise.allSettled(vectors.map((vector) => env.CONCEPT_INDEX.query(vector, { topK: 3, namespace: cityId, returnMetadata: "all" })));
    let failedSearches = 0;
    searches.forEach((outcome, index) => {
      if (outcome.status === "rejected") {
        failedSearches += 1;
        return;
      }
      const result = outcome.value;
      const node = nodes[index];
      if (!node) return;
      for (const match of result.matches) {
        if (match.score < SEMANTIC_THRESHOLD || !existingIds.has(match.id)) continue;
        const metadata = match.metadata;
        if (!metadata || metadata.cityId !== cityId) continue;
        const [source, target] = orderedPair(node.id, match.id);
        const key = `${source}:${target}`;
        if (edgesByPair.has(key)) continue;
        edgesByPair.set(key, { id: crypto.randomUUID(), source, target, relationship: "These ideas use similar meaning in two different notes.", kind: "related" });
        semanticLinksAdded += 1;
        break;
      }
    });
    if (failedSearches > 0) {
      console.warn(JSON.stringify({ event: "semantic_query_partial_failure", requestId, cityId, failedSearches, attemptedSearches: vectors.length }));
    }
  }

  const vectorIds = nodes.map((node) => node.id);
  let vectorCleanupQueued = false;
  if (vectors) {
    try {
      await enqueueVectorCleanup(env, cityId, entryId, vectorIds);
      vectorCleanupQueued = true;
    } catch (error) {
      console.error(JSON.stringify({ event: "vector_cleanup_enqueue_failed", requestId, cityId, entryId, errorClass: error instanceof Error ? error.name : "UnknownError" }));
    }
  }

  let vectorsSubmitted = false;
  if (vectors && vectorCleanupQueued) {
    try {
      await env.CONCEPT_INDEX.upsert(nodes.map((node, index) => ({
        id: node.id,
        values: vectors[index]!,
        namespace: cityId,
        metadata: { cityId, nodeId: node.id, entryId },
      })));
      vectorsSubmitted = true;
    } catch (error) {
      console.warn(JSON.stringify({ event: "vector_upsert_failed", requestId, errorClass: error instanceof Error ? error.name : "UnknownError" }));
    }
  }

  const nextExpiry = expiresAtFrom(Date.now());
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("INSERT INTO entries (id, city_id, operation_id, title, source_text, summary, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM cities WHERE id = ? AND state = 'active')")
      .bind(entryId, cityId, body.operationId, plan.entryTitle, body.text, plan.summary, now, cityId),
    ...nodes.map((node) => env.DB.prepare("INSERT INTO nodes (id, city_id, entry_id, label, description, district, depth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(node.id, cityId, entryId, node.label, node.description, node.district, node.depth, now)),
    ...Array.from(edgesByPair.values()).map((edge) => env.DB.prepare("INSERT OR IGNORE INTO edges (id, city_id, source_node_id, target_node_id, relationship, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(edge.id, cityId, edge.source, edge.target, edge.relationship, edge.kind, now)),
    env.DB.prepare("UPDATE cities SET name = CASE WHEN name = 'My Memory City' THEN ? ELSE name END, updated_at = ?, expires_at = ? WHERE id = ? AND state = 'active'")
      .bind(plan.cityName, now, nextExpiry, cityId),
  ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (vectorCleanupQueued && vectorsSubmitted) {
      try {
        await env.CONCEPT_INDEX.deleteByIds(vectorIds);
        await completeVectorCleanup(env, entryId);
      } catch (cleanupError) {
        console.error(JSON.stringify({ event: "vector_compensation_failed", requestId, cityId, errorClass: cleanupError instanceof Error ? cleanupError.name : "UnknownError" }));
      }
    } else if (vectorCleanupQueued) {
      try {
        await completeVectorCleanup(env, entryId);
      } catch (cleanupError) {
        console.error(JSON.stringify({ event: "vector_cleanup_cancel_failed", requestId, cityId, entryId, errorClass: cleanupError instanceof Error ? cleanupError.name : "UnknownError" }));
      }
    }
    try {
      const replayAfterRace = await idempotentEntryResponse(env, city, body.operationId, requestId);
      if (replayAfterRace) return replayAfterRace;
    } catch {
      // The city may have entered deletion or expired while AI was working.
    }
    const currentCounts = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM entries WHERE city_id = ?) AS entry_count, (SELECT COUNT(*) FROM nodes WHERE city_id = ?) AS node_count",
    ).bind(cityId, cityId).first<{ entry_count: number; node_count: number }>();
    if (currentCounts && (currentCounts.entry_count >= LIMITS.maxEntriesPerCity || currentCounts.node_count >= LIMITS.maxNodesPerCity)) {
      throw new HttpError(409, "CITY_FULL", "This showcase city is full. Export it, then start a fresh city.");
    }
    console.warn(JSON.stringify({ event: "city_commit_rejected", requestId, cityId, errorClass: error instanceof Error ? error.name : "UnknownError" }));
    throw new HttpError(409, "CITY_CHANGED", "That city changed while this block was being built. Refresh and try again.");
  }

  if (vectorCleanupQueued) {
    try {
      await completeVectorCleanup(env, entryId);
    } catch (error) {
      console.warn(JSON.stringify({ event: "vector_cleanup_completion_deferred", requestId, cityId, entryId, errorClass: error instanceof Error ? error.name : "UnknownError" }));
    }
  }

  const refreshed = await env.DB.prepare(`SELECT ${CITY_COLUMNS} FROM cities WHERE id = ? AND state = 'active'`).bind(cityId).first<CityRow>();
  if (!refreshed) throw new HttpError(500, "CITY_SAVE_FAILED", "The city could not finish this block. Your note may still be safe; refresh and try again.");
  const response: AddEntryResponse = {
    city: await citySnapshot(env, refreshed),
    addedNodeIds: nodes.map((node) => node.id).sort(),
    semanticLinksAdded,
    requestId,
  };
  console.log(JSON.stringify({ event: "city_grown", requestId, cityId, nodesAdded: nodes.length, semanticLinksAdded, inputCharacters: body.text.length, durationMs: Date.now() - startedAt }));
  return jsonResponse(response, requestId, 201);
}

async function handleDeleteCity(request: Request, env: Env, requestId: string, cityId: string): Promise<Response> {
  if (request.method !== "DELETE") return errorResponse(requestId, 405, "METHOD_NOT_ALLOWED", "That action only accepts DELETE.", { Allow: "DELETE" });
  requireSameOrigin(request);
  await getAuthorizedCity(request, env, cityId, true);
  if (!await finalizeCityDeletion(env, cityId)) {
    throw new HttpError(503, "DELETE_PENDING", "The city could not be fully removed yet. Please try delete again.");
  }
  return new Response(null, { status: 204, headers: apiHeaders(requestId) });
}

function secureDocumentResponse(response: Response): Response {
  const secured = new Response(response.body, response);
  Object.entries(DOCUMENT_SECURITY_HEADERS).forEach(([key, value]) => secured.headers.set(key, value));
  return secured;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        if (request.method !== "GET" && request.method !== "HEAD") return errorResponse(requestId, 405, "METHOD_NOT_ALLOWED", "This check only accepts GET.", { Allow: "GET, HEAD" });
        const response = jsonResponse({ ok: true, service: "memory-city" }, requestId);
        return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
      }
      if (url.pathname === "/api/cities") return await handleCreateCity(request, env, requestId);

      const entryRoute = /^\/api\/cities\/([0-9a-f-]{36})\/entries$/.exec(url.pathname);
      if (entryRoute?.[1]) return await handleAddEntry(request, env, requestId, entryRoute[1]);
      const cityRoute = /^\/api\/cities\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (cityRoute?.[1]) {
        if (request.method === "GET") return await handleGetCity(request, env, requestId, cityRoute[1]);
        if (request.method === "DELETE") return await handleDeleteCity(request, env, requestId, cityRoute[1]);
        return errorResponse(requestId, 405, "METHOD_NOT_ALLOWED", "That action is not available.", { Allow: "GET, DELETE" });
      }
      if (url.pathname.startsWith("/api/")) return errorResponse(requestId, 404, "NOT_FOUND", "That API route does not exist.");
      if (request.method !== "GET" && request.method !== "HEAD") return errorResponse(requestId, 405, "METHOD_NOT_ALLOWED", "That action is not available.");

      const assetRequest = url.pathname === "/" ? new Request(new URL("/index.html", url), request) : request;
      const assetResponse = await env.ASSETS.fetch(assetRequest);
      return secureDocumentResponse(assetResponse);
    } catch (error) {
      if (error instanceof ValidationError) return errorResponse(requestId, error.status, error.code, error.message);
      if (error instanceof HttpError) return errorResponse(requestId, error.status, error.code, error.message);
      console.error(JSON.stringify({ event: "request_failed", requestId, method: request.method, path: url.pathname, errorClass: error instanceof Error ? error.name : "UnknownError" }));
      return errorResponse(requestId, 500, "INTERNAL_ERROR", "Memory City hit an unexpected problem. Please try again.");
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledCleanup(env));
  },
} satisfies ExportedHandler<Env>;
