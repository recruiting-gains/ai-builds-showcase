export const MAX_INPUT_CHARS = 12_000;
export const MIN_INPUT_CHARS = 40;

export const MEETING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 3, maxLength: 120 },
    summary: { type: "string", minLength: 80, maxLength: 1200 },
    decisions: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 3, maxLength: 300 }
    },
    actionItems: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          task: { type: "string", minLength: 3, maxLength: 300 },
          owner: { type: "string", minLength: 2, maxLength: 100 },
          dueDate: { type: "string", minLength: 2, maxLength: 100 }
        },
        required: ["task", "owner", "dueDate"]
      }
    }
  },
  required: ["title", "summary", "decisions", "actionItems"]
} as const;

export const CONTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    coreMessage: { type: "string", minLength: 60, maxLength: 500 },
    linkedinPost: { type: "string", minLength: 450, maxLength: 1800 },
    shortThread: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: { type: "string", minLength: 60, maxLength: 320 }
    },
    newsletterBlurb: { type: "string", minLength: 300, maxLength: 1400 },
    titleIdeas: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: { type: "string", minLength: 10, maxLength: 140 }
    },
    hashtags: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "string", minLength: 2, maxLength: 60 }
    }
  },
  required: [
    "coreMessage",
    "linkedinPost",
    "shortThread",
    "newsletterBlurb",
    "titleIdeas",
    "hashtags"
  ]
} as const;

export type Tone = "clear" | "friendly" | "professional" | "playful";

export interface MeetingInput {
  text: string;
}

export interface ContentInput {
  text: string;
  audience: string;
  tone: Tone;
  callToAction: string;
}

export interface ActionItem {
  task: string;
  owner: string;
  dueDate: string;
}

export interface MeetingExtraction {
  title: string;
  summary: string;
  decisions: string[];
  actionItems: ActionItem[];
}

export interface MeetingResult extends MeetingExtraction {
  followUpEmail: string;
}

export interface ContentResult {
  coreMessage: string;
  linkedinPost: string;
  shortThread: string[];
  newsletterBlurb: string;
  titleIdeas: string[];
  hashtags: string[];
}
