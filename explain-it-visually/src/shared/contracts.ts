export const VISUAL_LAYOUTS = [
  "auto",
  "steps",
  "timeline",
  "comparison",
  "list",
] as const;

export const OUTPUT_LAYOUTS = [
  "steps",
  "timeline",
  "comparison",
  "list",
] as const;

export const VISUAL_STYLES = ["bright", "dark", "sketch"] as const;

export type VisualLayout = (typeof VISUAL_LAYOUTS)[number];
export type OutputLayout = (typeof OUTPUT_LAYOUTS)[number];
export type VisualStyle = (typeof VISUAL_STYLES)[number];

export interface GenerateRequest {
  text: string;
  format: VisualLayout;
  style: VisualStyle;
}

export interface VisualItem {
  label: string;
  description: string;
}

export interface VisualPlan {
  title: string;
  summary: string;
  layout: OutputLayout;
  items: VisualItem[];
  takeaway: string;
  altText: string;
}

export interface GenerateResponse {
  plan: VisualPlan;
  meta: {
    generatedAt: string;
    notStored: true;
    requestId: string;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export const INPUT_LIMITS = {
  minCharacters: 30,
  maxCharacters: 3_500,
  maxBodyBytes: 16_384,
} as const;
