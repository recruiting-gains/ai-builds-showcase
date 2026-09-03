import {
  DISTRICTS,
  EDGE_KINDS,
  LIMITS,
  type AddEntryRequest,
  type District,
  type EdgeKind,
  type MemoryPlan,
  type ModelEdge,
  type ModelNode,
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function isDistrict(value: unknown): value is District {
  return typeof value === "string" && (DISTRICTS as readonly string[]).includes(value);
}

function isEdgeKind(value: unknown): value is EdgeKind {
  return typeof value === "string" && (EDGE_KINDS as readonly string[]).includes(value);
}

export function parseAddEntryRequest(value: unknown): AddEntryRequest {
  if (!isRecord(value) || !hasOnlyKeys(value, ["text", "operationId"])) {
    throw new ValidationError("INVALID_BODY", "Add one note for the city to read.");
  }

  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (text.length < LIMITS.minCharacters) {
    throw new ValidationError(
      "INPUT_TOO_SHORT",
      `Add a little more detail—at least ${LIMITS.minCharacters} characters.`,
    );
  }
  if (text.length > LIMITS.maxCharacters) {
    throw new ValidationError(
      "INPUT_TOO_LONG",
      `Keep this note under ${LIMITS.maxCharacters.toLocaleString()} characters.`,
      413,
    );
  }

  const operationId = typeof value.operationId === "string" ? value.operationId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
    throw new ValidationError("INVALID_OPERATION_ID", "Refresh the page and try adding that note again.");
  }

  return { text, operationId };
}

function parseModelNodes(value: unknown): ModelNode[] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > LIMITS.maxNodesPerEntry) {
    return null;
  }

  const nodes: ModelNode[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["localId", "label", "description", "district", "depth"])) {
      return null;
    }
    const localId = cleanText(item.localId, 24);
    const label = cleanText(item.label, 60);
    const description = cleanText(item.description, 180);
    const depth = typeof item.depth === "number" ? Math.round(item.depth) : 0;
    if (!localId || !/^[a-z][a-z0-9-]*$/.test(localId) || ids.has(localId) || !label || !description || !isDistrict(item.district) || depth < 1 || depth > 5) {
      return null;
    }
    ids.add(localId);
    nodes.push({ localId, label, description, district: item.district, depth });
  }
  return nodes;
}

function parseModelEdges(value: unknown, nodeIds: ReadonlySet<string>): ModelEdge[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.maxEdgesPerEntry) return null;
  const edges: ModelEdge[] = [];
  const pairs = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["sourceLocalId", "targetLocalId", "relationship", "kind"])) {
      return null;
    }
    const sourceLocalId = cleanText(item.sourceLocalId, 24);
    const targetLocalId = cleanText(item.targetLocalId, 24);
    const relationship = cleanText(item.relationship, 140);
    if (!sourceLocalId || !targetLocalId || sourceLocalId === targetLocalId || !nodeIds.has(sourceLocalId) || !nodeIds.has(targetLocalId) || !relationship || !isEdgeKind(item.kind)) {
      return null;
    }
    const pair = [sourceLocalId, targetLocalId].sort().join(":");
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    edges.push({ sourceLocalId, targetLocalId, relationship, kind: item.kind });
  }
  return edges;
}

export function parseMemoryPlan(value: unknown): MemoryPlan | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["cityName", "entryTitle", "summary", "nodes", "edges"])) {
    return null;
  }
  const cityName = cleanText(value.cityName, 48);
  const entryTitle = cleanText(value.entryTitle, 72);
  const summary = cleanText(value.summary, 240);
  const nodes = parseModelNodes(value.nodes);
  if (!cityName || !entryTitle || !summary || !nodes) return null;
  const edges = parseModelEdges(value.edges, new Set(nodes.map((node) => node.localId)));
  if (!edges) return null;
  return { cityName, entryTitle, summary, nodes, edges };
}
