export type Accent = 'mint' | 'amber' | 'blue';

export interface WorkspaceCard {
  id: string;
  title: string;
  eyebrow: string;
  body: string;
  accent: Accent;
  x: number;
  y: number;
}

export interface WorkspacePreset {
  id: string;
  name: string;
  subtitle: string;
  cards: WorkspaceCard[];
}

export interface LayoutCard {
  id: string;
  x: number;
  y: number;
}

export interface Layout {
  version: 1;
  presetId: string;
  cards: LayoutCard[];
}

// Fictional demonstration content. These presets are not customer or live operational data.
export const WORKSPACE_PRESETS: readonly WorkspacePreset[] = [
  {
    id: 'mission-control',
    name: 'Mission control',
    subtitle: 'Give your next idea some room.',
    cards: [
      { id: 'mission-brief', title: 'The next big idea', eyebrow: '01 / BRIEF', body: 'Turn a thought into something you can move, explore, and build.', accent: 'mint', x: 0.06, y: 0.12 },
      { id: 'mission-plan', title: 'Make your move', eyebrow: '02 / PLAN', body: 'Point to a card. Pinch to grab it. Release to place it in your workspace.', accent: 'blue', x: 0.89, y: 0.1 },
      { id: 'mission-launch', title: 'Ready for takeoff', eyebrow: '03 / LAUNCH', body: 'Arrange your workspace, save the layout, and come back to a clear starting point.', accent: 'amber', x: 0.18, y: 0.82 },
    ],
  },
  {
    id: 'creative-studio',
    name: 'Creative studio',
    subtitle: 'A little space for a different perspective.',
    cards: [
      { id: 'creative-spark', title: 'Catch the spark', eyebrow: '01 / INSPIRATION', body: 'Start with one interesting question. Keep the idea small enough to explore today.', accent: 'amber', x: 0.05, y: 0.13 },
      { id: 'creative-shape', title: 'Shape the story', eyebrow: '02 / DIRECTION', body: 'Move the pieces until the story feels clear. Experiment before you commit.', accent: 'mint', x: 0.9, y: 0.08 },
      { id: 'creative-share', title: 'Show your work', eyebrow: '03 / SHARE', body: 'A thoughtful demonstration can explain more than a page of promises.', accent: 'blue', x: 0.2, y: 0.8 },
    ],
  },
  {
    id: 'focus-desk',
    name: 'Focus desk',
    subtitle: 'Less noise. One useful next step.',
    cards: [
      { id: 'focus-now', title: 'Right here, right now', eyebrow: '01 / TODAY', body: 'Choose the one thing that deserves your attention for the next twenty minutes.', accent: 'mint', x: 0.07, y: 0.1 },
      { id: 'focus-later', title: 'Room for later', eyebrow: '02 / PARKING LOT', body: 'Good ideas can wait. Keep a little space for what comes after this moment.', accent: 'blue', x: 0.88, y: 0.12 },
      { id: 'focus-reset', title: 'Take a breath', eyebrow: '03 / RESET', body: 'Relax your arms, pause the camera, and return when you feel ready.', accent: 'amber', x: 0.19, y: 0.83 },
    ],
  },
];

export function getPreset(id: string): WorkspacePreset | undefined {
  return WORKSPACE_PRESETS.find((preset) => preset.id === id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export type LayoutValidation = { valid: true; layout: Layout } | { valid: false; message: string };

export function validateLayout(value: unknown): LayoutValidation {
  if (!isRecord(value) || !hasOnlyKeys(value, ['version', 'presetId', 'cards'])) {
    return { valid: false, message: 'Use a layout object with only version, presetId, and cards.' };
  }
  if (value.version !== 1 || typeof value.presetId !== 'string') {
    return { valid: false, message: 'Choose layout version 1 and a known presetId.' };
  }
  const preset = getPreset(value.presetId);
  if (!preset || !Array.isArray(value.cards) || value.cards.length !== preset.cards.length) {
    return { valid: false, message: 'Include every card from a known workspace exactly once.' };
  }

  const seen = new Set<string>();
  const cards: LayoutCard[] = [];
  for (const card of value.cards) {
    if (!isRecord(card) || !hasOnlyKeys(card, ['id', 'x', 'y']) || typeof card.id !== 'string'
      || !preset.cards.some((known) => known.id === card.id) || seen.has(card.id)
      || !isCoordinate(card.x) || !isCoordinate(card.y)) {
      return { valid: false, message: 'Each card needs a unique known id and finite x/y positions from 0 to 1.' };
    }
    seen.add(card.id);
    cards.push({ id: card.id, x: Math.round(card.x * 10_000) / 10_000, y: Math.round(card.y * 10_000) / 10_000 });
  }

  return { valid: true, layout: { version: 1, presetId: preset.id, cards } };
}
