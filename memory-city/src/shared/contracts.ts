export const DISTRICTS = ["concepts", "skills", "evidence", "questions"] as const;
export const EDGE_KINDS = ["related", "supports", "questions", "applies"] as const;

export type District = (typeof DISTRICTS)[number];
export type EdgeKind = (typeof EDGE_KINDS)[number];

export interface CityNode {
  id: string;
  entryId: string;
  label: string;
  description: string;
  district: District;
  depth: number;
  createdAt: string;
}

export interface CityEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  kind: EdgeKind;
}

export interface CityEntry {
  id: string;
  title: string;
  summary: string;
  sourceText: string;
  createdAt: string;
}

export interface CitySnapshot {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: CityNode[];
  edges: CityEdge[];
  entries: CityEntry[];
}

export interface CreateCityResponse {
  city: CitySnapshot;
  editToken: string;
  requestId: string;
}

export interface AddEntryRequest {
  text: string;
  operationId: string;
}

export interface AddEntryResponse {
  city: CitySnapshot;
  addedNodeIds: string[];
  semanticLinksAdded: number;
  requestId: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export interface ModelNode {
  localId: string;
  label: string;
  description: string;
  district: District;
  depth: number;
}

export interface ModelEdge {
  sourceLocalId: string;
  targetLocalId: string;
  relationship: string;
  kind: EdgeKind;
}

export interface MemoryPlan {
  cityName: string;
  entryTitle: string;
  summary: string;
  nodes: ModelNode[];
  edges: ModelEdge[];
}

export const LIMITS = {
  minCharacters: 40,
  maxCharacters: 5_000,
  maxBodyBytes: 24_576,
  maxEntriesPerCity: 16,
  maxNodesPerCity: 96,
  maxNodesPerEntry: 7,
  maxEdgesPerEntry: 10,
} as const;
