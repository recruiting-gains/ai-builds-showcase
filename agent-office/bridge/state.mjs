import { createHash } from 'node:crypto';
const shortId = (id) =>
  createHash('sha256').update(id).digest('hex').slice(0, 16);
const EVENTS = new Set([
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'Interrupt',
  'SessionEnd',
  'PreCompact',
  'PostCompact',
]);
const LABELS = {
  working: 'Work signal received',
  waiting: 'Approval requested',
  'needs-help': 'A tool reported an error',
  ended: 'Turn ended — outcome not evaluated',
  idle: 'Standing by',
  unknown: 'Activity unavailable',
};
const validId = (x) =>
  typeof x === 'string' && /^[a-zA-Z0-9_./:-]{1,160}$/.test(x);

// Raw hook bodies are projected immediately. Text, inputs and paths never reach snapshots.
export function sanitizeHook(raw, allowedPaths) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !allowedPaths.includes(raw.cwd) ||
    !EVENTS.has(raw.hook_event_name) ||
    !validId(raw.session_id)
  )
    return null;
  const event = raw.hook_event_name;
  if (event.startsWith('Subagent') && !validId(raw.agent_id)) return null;
  const response = raw.tool_response;
  const failed =
    event === 'PostToolUse' &&
    response &&
    typeof response === 'object' &&
    (response.isError === true ||
      (Number.isInteger(response.exit_code) && response.exit_code !== 0));
  return {
    sessionId: raw.session_id,
    agentId: event.startsWith('Subagent') ? raw.agent_id : null,
    event,
    failed: !!failed,
  };
}

export class OfficeStore {
  constructor(config, clock = Date.now) {
    this.config = config;
    this.clock = clock;
    this.floors = new Map();
    this.parents = new Map();
    this.lastSignal = null;
  }
  apply(raw) {
    const signal = sanitizeHook(raw, this.config.allowedPaths ?? []);
    if (!signal) return false;
    let root = this.parents.get(signal.sessionId)?.root ?? signal.sessionId;
    if (!(this.config.projects ?? []).some((p) => p.threadId === root))
      return false;
    if (!this.floors.has(root)) {
      if (this.floors.size >= 20) return false;
      const configFloor = (this.config.projects ?? []).find(
        (p) => p.threadId === root,
      );
      this.floors.set(root, {
        id: shortId(root),
        label: configFloor?.label ?? 'Project ' + (this.floors.size + 1),
        agents: new Map(),
        events: [],
      });
    }
    const floor = this.floors.get(root);
    if (signal.agentId && signal.event === 'SubagentStart')
      this.parents.set(signal.agentId, { root, parent: signal.sessionId });
    if (signal.agentId && !this.parents.has(signal.agentId)) return false;
    const rawId = signal.agentId ?? signal.sessionId;
    if (!floor.agents.has(rawId) && floor.agents.size >= 32) return false;
    let state = 'working';
    switch (signal.event) {
      case 'SessionStart':
        state = 'idle';
        break;
      case 'PermissionRequest':
        state = 'waiting';
        break;
      case 'Stop':
      case 'SubagentStop':
        state = 'ended';
        break;
      case 'Interrupt':
      case 'SessionEnd':
        state = 'idle';
        break;
      case 'PostToolUse':
        if (signal.failed) state = 'needs-help';
        break;
    }
    const now = this.clock(),
      old = floor.agents.get(rawId);
    const agent = {
      id: shortId(rawId),
      parentId:
        rawId === root
          ? null
          : shortId(this.parents.get(rawId)?.parent ?? root),
      label:
        rawId === root
          ? 'Lead agent'
          : (old?.label ?? 'Agent ' + (floor.agents.size + 1)),
      state,
      observedAt: now,
      source: 'hooks',
    };
    floor.agents.set(rawId, agent);
    if (!old || old.state !== state || signal.event === 'SubagentStart') {
      floor.events.unshift({
        id: shortId(rawId + now + signal.event),
        agentId: agent.id,
        state,
        at: now,
        message:
          signal.event === 'SubagentStart'
            ? 'Agent assignment observed'
            : LABELS[state],
      });
      floor.events = floor.events.slice(0, 20);
    }
    this.lastSignal = now;
    return true;
  }
  snapshot() {
    const now = this.clock();
    return {
      source: 'hooks',
      connected: this.lastSignal !== null && now - this.lastSignal <= 60_000,
      observedAt: this.lastSignal,
      message: this.lastSignal
        ? 'Read-only local event feed. Quiet agents become unknown, never automatically successful.'
        : 'Waiting for a trusted project observer to send its first event.',
      floors: [...this.floors.values()].map((f) => ({
        ...f,
        agents: [...f.agents.values()].map((a) => ({
          ...a,
          state:
            ['working', 'waiting', 'needs-help'].includes(a.state) &&
            now - a.observedAt > 60_000
              ? 'unknown'
              : a.state,
        })),
      })),
    };
  }
}
