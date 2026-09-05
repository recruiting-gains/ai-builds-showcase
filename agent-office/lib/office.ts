export type AgentState =
  | 'working'
  | 'waiting'
  | 'needs-help'
  | 'ended'
  | 'idle'
  | 'unknown';
export type Agent = {
  id: string;
  parentId: string | null;
  label: string;
  state: AgentState;
  observedAt: number;
  source: string;
};
export type OfficeEvent = {
  id: string;
  agentId: string;
  state: AgentState;
  at: number;
  message: string;
};
export type Floor = {
  id: string;
  label: string;
  agents: Agent[];
  events: OfficeEvent[];
};
export type Snapshot = {
  source: 'hooks' | 'daemon' | 'demo';
  connected: boolean;
  observedAt: number | null;
  floors: Floor[];
  message: string;
};
export const layouts = [
  { id: 'midnight-lab', name: 'Midnight Lab', accent: '#e27961' },
  { id: 'industrial-loft', name: 'Industrial Loft', accent: '#d8ac74' },
  { id: 'skyline-studio', name: 'Skyline Studio', accent: '#7eb8f2' },
  { id: 'garden-workspace', name: 'Garden Workspace', accent: '#a2c67f' },
  { id: 'orbital-office', name: 'Orbital Office', accent: '#ba9aef' },
] as const;
export const stateInfo: Record<
  AgentState,
  { label: string; color: string; bubble: string }
> = {
  working: { label: 'Working', color: 'cyan', bubble: 'On the task' },
  waiting: { label: 'Waiting for you', color: 'amber', bubble: 'Your move' },
  'needs-help': { label: 'Needs help', color: 'red', bubble: 'Needs a look' },
  ended: { label: 'Turn ended', color: 'green', bubble: 'Turn wrapped up' },
  idle: { label: 'Idle', color: 'muted', bubble: 'Standing by' },
  unknown: {
    label: 'No recent signal',
    color: 'muted',
    bubble: 'Signal paused',
  },
};
const cycle: AgentState[] = [
  'working',
  'working',
  'waiting',
  'working',
  'needs-help',
  'working',
  'ended',
  'idle',
];
export function demoSnapshot(step: number): Snapshot {
  const now = Date.now();
  const names = ['Agent Office', 'Website refresh', 'Launch toolkit'];
  const roles = ['Lead agent', 'Builder', 'Reviewer', 'Designer'];
  return {
    source: 'demo',
    connected: true,
    observedAt: now,
    message: 'Scripted sample activity. No real tasks are connected.',
    floors: names.map((label, f) => {
      const agents = roles
        .slice(0, 4 - f)
        .map((name, a) => ({
          id: `demo-${f}-${a}`,
          parentId: a ? `demo-${f}-0` : null,
          label: name,
          state: cycle[(step + a * 2 + f) % cycle.length],
          observedAt: now,
          source: 'demo',
        }));
      return {
        id: `demo-${f}`,
        label,
        agents,
        events: agents.map((agent, a) => ({
          id: `event-${step}-${f}-${a}`,
          agentId: agent.id,
          state: agent.state,
          at: now - a * 1800,
          message: stateInfo[agent.state].label,
        })),
      };
    }),
  };
}
export function summarize(agents: Agent[]): AgentState {
  for (const state of [
    'needs-help',
    'waiting',
    'working',
    'unknown',
    'idle',
    'ended',
  ] as AgentState[])
    if (agents.some((a) => a.state === state)) return state;
  return 'unknown';
}
export function ageLabel(at: number | null, now: number): string {
  if (!at) return 'No signal yet';
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  return seconds < 5
    ? 'Just observed'
    : seconds < 60
      ? `${seconds}s ago`
      : `${Math.floor(seconds / 60)}m ago`;
}
