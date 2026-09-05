'use client';
import { flushSync } from 'react-dom';
import { assignLayouts } from '@/lib/preferences.mjs';
import { wantsWidget, widgetStatus } from '@/lib/widget.mjs';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Bot,
  Building2,
  ChevronRight,
  ShieldCheck,
  Pause,
  Play,
  Eye,
  Radio,
  Unplug,
  ArrowUpRight,
  Volume2,
  VolumeX,
  Info,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  layouts,
  demoSnapshot,
  summarize,
  stateInfo,
  ageLabel,
  type Agent,
  type Snapshot,
  type Floor,
} from '@/lib/office';
const empty: Snapshot = {
  source: 'hooks',
  connected: false,
  observedAt: null,
  floors: [],
  message:
    'Waiting for a trusted project observer. No real task activity is being displayed.',
};
const positions = [
  [31, 56],
  [49, 43],
  [66, 59],
  [49, 76],
  [72, 73],
  [29, 73],
];
type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
function Robot({
  agent,
  small = false,
  position = 0,
  onSelect,
}: {
  agent: Agent;
  small?: boolean;
  position?: number;
  onSelect: (agent: Agent) => void;
}) {
  const point = positions[position % positions.length],
    info = stateInfo[agent.state];
  return (
    <button
      className={'robot ' + agent.state + (small ? ' small' : '')}
      style={
        {
          left: point[0] + '%',
          top: point[1] + '%',
          '--delay': -position * 1.7 + 's',
        } as CSSProperties
      }
      onClick={(e) => {
        e.stopPropagation();
        onSelect(agent);
      }}
      aria-label={agent.label + ': ' + info.label}
    >
      {!small && (
        <span className={'robot-bubble ' + info.color}>{info.bubble}</span>
      )}
      <img src="/robot.png" alt="" draggable={false} />
      <span className={'robot-tag ' + info.color}>
        {small ? '●' : agent.label}
      </span>
    </button>
  );
}
function Scene({
  f,
  room,
  small = false,
  onSelect,
}: {
  f: Floor;
  room: (typeof layouts)[number];
  small?: boolean;
  onSelect: (agent: Agent) => void;
}) {
  return (
    <div
      className={'office-scene ' + (small ? 'mini' : '')}
      aria-label={room.name + ' office'}
    >
      <img
        className="room-art"
        src={'/rooms/' + room.id + '.png'}
        alt={
          room.name +
          ': an isometric miniature office with four desks and an open central floor.'
        }
        loading={small ? 'lazy' : 'eager'}
      />
      {f.agents.slice(0, 6).map((a, i) => (
        <Robot
          key={a.id}
          agent={a}
          small={small}
          position={i}
          onSelect={onSelect}
        />
      ))}
      {!small && f.agents.length > 6 && (
        <span className="overflow-agents">
          +{f.agents.length - 6} more in team list
        </span>
      )}
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<'demo' | 'live'>('demo'),
    [compact, setCompact] = useState(false),
    [booted, setBooted] = useState(false),
    [snapshot, setSnapshot] = useState<Snapshot>(empty),
    [step, setStep] = useState(0),
    [floorId, setFloorId] = useState(''),
    [view, setView] = useState('floor'),
    [paused, setPaused] = useState(false),
    [safe, setSafe] = useState(true),
    [sound, setSound] = useState(false),
    [local, setLocal] = useState(false),
    [now, setNow] = useState(0),
    [layoutPrefs, setLayoutPrefs] = useState<Record<string, string>>({}),
    [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const key = useRef(''),
    audio = useRef<AudioContext | null>(null),
    previous = useRef('');
  const visible: Snapshot =
    mode === 'demo'
      ? demoSnapshot(step)
      : {
          ...snapshot,
          connected:
            snapshot.connected &&
            !!snapshot.observedAt &&
            now - snapshot.observedAt <= 60000,
          floors: snapshot.floors.map((f) => ({
            ...f,
            agents: f.agents.map((a) => ({
              ...a,
              state:
                now - a.observedAt > 60000 &&
                ['working', 'waiting', 'needs-help'].includes(a.state)
                  ? 'unknown'
                  : a.state,
            })),
          })),
        };
  const selectedAgent =
    visible.floors
      .flatMap((f) => f.agents)
      .find((a) => a.id === selectedAgentId) ?? null;
  const selectAgent = (a: Agent | null) => setSelectedAgentId(a?.id ?? null);
  useEffect(() => setSelectedAgentId(null), [mode]);
  const floor =
    visible.floors.find((f) => f.id === floorId) ?? visible.floors[0];
  const index = Math.max(
    0,
    visible.floors.findIndex((f) => f.id === floor?.id),
  );
  const layout =
    layouts.find((l) => l.id === layoutPrefs[floor?.id ?? '']) ??
    layouts[index % layouts.length];
  const name = (f: Floor, i: number) => (safe ? 'Project ' + (i + 1) : f.label);
  useEffect(() => {
    setNow(Date.now());
    const nativeWindow = window as Window & { __AGENT_OFFICE_VIEW?: string };
    setCompact(wantsWidget(location.search, nativeWindow.__AGENT_OFFICE_VIEW));
    setBooted(true);
    const onDisplayMode = (event: Event) => {
      const value = (event as CustomEvent).detail;
      if (value === 'widget' || value === 'full') setCompact(value === 'widget');
    };
    window.addEventListener('agent-office-view', onDisplayMode);
    try {
      const p = JSON.parse(
        localStorage.getItem('agent-office-layouts') ?? '{}',
      );
      if (p && typeof p === 'object' && !Array.isArray(p)) setLayoutPrefs(p);
    } catch {}
    const isLocal = location.hostname === '127.0.0.1';
    const capability =
      new URLSearchParams(location.hash.slice(1)).get('key') ?? '';
    if (isLocal && /^[a-f0-9]{64}$/.test(capability)) {
      key.current = capability;
      setLocal(true);
      setMode('live');
      history.replaceState(null, '', location.pathname + location.search);
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(interval); window.removeEventListener('agent-office-view', onDisplayMode); };
  }, []);
  useEffect(() => {
    if (mode !== 'demo' || paused) return;
    const t = setInterval(() => setStep((s) => s + 1), 6500);
    return () => clearInterval(t);
  }, [mode, paused]);
  useEffect(() => {
    if (!local || mode !== 'live') return;
    let gone = false,
      inFlight = false;
    let current: AbortController | null = null;
    async function poll() {
      if (document.hidden || inFlight) return;
      inFlight = true;
      current = new AbortController();
      const timeout = setTimeout(() => current?.abort(), 4000);
      try {
        const res = await fetch('/api/status', {
          headers: { Authorization: 'Bearer ' + key.current },
          cache: 'no-store',
          signal: current.signal,
        });
        if (!res.ok) throw Error();
        const data = (await res.json()) as Snapshot;
        if (!Array.isArray(data.floors) || data.source !== 'hooks')
          throw Error();
        if (!gone) setSnapshot(data);
      } catch {
        if (!gone)
          setSnapshot((s) => ({
            ...s,
            connected: false,
            message: 'Local observer is disconnected.',
            floors: s.floors.map((f) => ({
              ...f,
              agents: f.agents.map((a) => ({ ...a, state: 'unknown' })),
            })),
          }));
      } finally {
        clearTimeout(timeout);
        inFlight = false;
      }
    }
    void poll();
    const t = setInterval(() => void poll(), 2500);
    const onVisible = () => void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      current?.abort();
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [local, mode]);
  const setLayout = (id: string) => {
    if (!layouts.some((l) => l.id === id) || !floor) return;
    const next = { ...layoutPrefs, [floor.id]: id };
    setLayoutPrefs(next);
    try {
      localStorage.setItem('agent-office-layouts', JSON.stringify(next));
    } catch {}
  };
  const needsAttention = visible.floors
    .flatMap((f) => f.agents)
    .filter((a) => a.state === 'waiting' || a.state === 'needs-help')
    .map((a) => a.id + a.state)
    .join('|');
  const visibleFloorIds = visible.floors.map((f) => f.id).join('|');
  useEffect(() => {
    setLayoutPrefs((previous) => {
      const next = assignLayouts(
        previous,
        visibleFloorIds ? visibleFloorIds.split('|') : [],
        layouts.map((l) => l.id),
      );
      if (next !== previous) {
        try {
          localStorage.setItem('agent-office-layouts', JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  }, [visibleFloorIds]);
  useEffect(() => {
    if (
      previous.current &&
      previous.current !== needsAttention &&
      sound &&
      !paused &&
      audio.current
    ) {
      const ctx = audio.current,
        osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 480;
      gain.gain.setValueAtTime(0.035, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    }
    previous.current = needsAttention;
  }, [needsAttention, sound, paused]);
  const actionRef = useRef({
    visible,
    floorId: floor?.id,
    view,
    setFloorId,
    setView,
    setLayout,
  });
  actionRef.current = {
    visible,
    floorId: floor?.id,
    view,
    setFloorId,
    setView,
    setLayout,
  };
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<ModelContext['registerTool']>[0]) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: 'read_office_view',
      description:
        'Read generic floor IDs, states, selected floor and sample/live mode. Never returns task messages.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => {
        const v = actionRef.current;
        return {
          source: v.visible.source,
          connected: v.visible.connected,
          selectedFloor: v.floorId,
          view: v.view,
          floors: v.visible.floors.map((f) => ({
            id: f.id,
            states: f.agents.map((a) => a.state),
          })),
        };
      },
    });
    register({
      name: 'select_office_floor',
      description:
        'Select an existing office floor and optionally its room layout. Only changes this display, never tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          floorId: { type: 'string' },
          layout: { type: 'string', enum: layouts.map((l) => l.id) },
        },
        required: ['floorId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => {
        if (!input || typeof input !== 'object')
          throw Error('Expected floor selection');
        const i = input as { floorId?: unknown; layout?: unknown };
        if (
          typeof i.floorId !== 'string' ||
          !actionRef.current.visible.floors.some((f) => f.id === i.floorId) ||
          Object.keys(i).some((k) => !['floorId', 'layout'].includes(k)) ||
          (i.layout !== undefined && !layouts.some((l) => l.id === i.layout))
        )
          throw Error('Unknown floor or layout');
        const selectedFloorId = i.floorId;
        flushSync(() => {
          actionRef.current.setFloorId(selectedFloorId);
          actionRef.current.setView('floor');
          if (typeof i.layout === 'string') {
            const id = i.layout;
            setLayoutPrefs((p) => {
              const n = { ...p, [i.floorId as string]: id };
              try {
                localStorage.setItem('agent-office-layouts', JSON.stringify(n));
              } catch {}
              return n;
            });
          }
        });
        return {
          selectedFloor: i.floorId,
          view: 'floor',
          layout: i.layout ?? null,
        };
      },
    });
    return () => lifecycle.abort();
  }, []);
  const stale =
    mode === 'live' &&
    !!snapshot.observedAt &&
    now - snapshot.observedAt > 60000;
  if (!booted) return <main className="office-widget" aria-label="Loading office workspace" />;
  if (compact) return (
    <main className={'office-widget ' + (paused ? 'motion-paused' : '')} aria-label="Agent Office workspace widget">
      <header className="widget-toolbar">
        <span className={'widget-feed ' + (mode === 'live' && visible.connected ? 'cyan' : 'amber')} title={widgetStatus(mode, snapshot.connected, stale, !!floor)}>
          {mode === 'live' ? <Radio size={15} /> : <Play size={15} />}<span>{mode === 'live' ? 'LOCAL' : 'DEMO'}</span>
        </span>
        <Select value={floor?.id ?? ''} disabled={!floor} onValueChange={(value) => { if (value) { setFloorId(String(value)); setSelectedAgentId(null); } }}>
          <SelectTrigger className="widget-floor-select" aria-label="Widget project"><SelectValue>{floor ? name(floor,index) : 'Waiting for activity'}</SelectValue></SelectTrigger>
          <SelectContent>{visible.floors.map((f,i) => <SelectItem key={f.id} value={f.id}>{name(f,i)}</SelectItem>)}</SelectContent>
        </Select>
        <button className="icon-button" aria-label={paused ? 'Resume agent motion' : 'Pause agent motion'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
      </header>
      <div className="widget-room">
        {booted && floor ? <Scene f={floor} room={layout} onSelect={selectAgent} /> : <div className="empty-office"><img className="room-art" src="/rooms/midnight-lab.png" alt="An empty office waiting for local activity" /></div>}
        <div className="widget-caption">{widgetStatus(mode, snapshot.connected, stale, !!floor)}{floor && mode === 'live' ? ' · ' + stateInfo[summarize(floor.agents)].label : ''}</div>
        {selectedAgent && <output className="widget-agent-note"><strong>{selectedAgent.label}</strong><span className={stateInfo[selectedAgent.state].color}>{stateInfo[selectedAgent.state].label}</span><button className="icon-button" aria-label="Close agent status" onClick={() => selectAgent(null)}>×</button></output>}
      </div>
    </main>
  );
  return (
    <main className={'office-app ' + (paused ? 'motion-paused' : '')}>
      <header className="topbar">
        <div className="wordmark">
          <Bot size={30} />
          <div>
            AGENT OFFICE<small>YOUR WORK. A LITTLE MORE ALIVE.</small>
          </div>
        </div>
        <div className="header-controls">
          <span
            className={
              'mode-pill ' +
              (mode === 'live' && snapshot.connected && !stale
                ? 'connected'
                : '')
            }
          >
            {mode === 'demo'
              ? '● DEMO · SAMPLE ACTIVITY'
              : !snapshot.connected
                ? '○ NOT CONNECTED'
                : stale
                  ? '○ NO RECENT SIGNAL'
                  : '● LOCAL EVENT FEED'}
          </span>
          <Dialog>
            <DialogTrigger
              className="icon-button"
              aria-label="About the office"
            >
              <Info size={19} />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Meet your little coworkers</DialogTitle>
                <DialogDescription>
                  Each robot represents an observed agent. Its expression is a
                  visual metaphor, not a feeling.
                </DialogDescription>
              </DialogHeader>
              <div className="help-copy">
                <p>
                  <strong>Local office:</strong> the Mac companion receives
                  allowlisted project events. It does not read chats, code,
                  credentials, or your screen. Codex must trust the project
                  observer before it can run.
                </p>
                <p>
                  <strong>Demo:</strong> scripted sample projects let you
                  explore all five rooms. No model calls run behind these
                  robots.
                </p>
                <p>
                  “Turn ended” means an agent stopped speaking—not that a
                  project passed its tests. After a minute without a fresh work
                  signal, the robot becomes unknown.
                </p>
                <p>
                  Robots show actual assignment events when supplied. Status
                  bubbles are short labels, not invented agent conversations.
                </p>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <div className="workspace">
        <aside className="floor-rail">
          <div className="rail-title">
            <Building2 size={17} /> THE BUILDING
          </div>
          <p className="rail-note">A floor for every project.</p>
          <div className="floor-list">
            {visible.floors.map((f, i) => {
              const info = stateInfo[summarize(f.agents)];
              return (
                <button
                  key={f.id}
                  className={
                    'floor-card ' + (floor?.id === f.id ? 'selected' : '')
                  }
                  onClick={() => {
                    setFloorId(f.id);
                    setView('floor');
                  }}
                  aria-pressed={floor?.id === f.id}
                >
                  <span className="floor-number">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <strong>{name(f, i)}</strong>
                    <span className={info.color}>● {info.label}</span>
                  </div>
                  <ChevronRight size={15} />
                </button>
              );
            })}
            {!visible.floors.length && (
              <p className="empty-rail">
                Your first floor appears when an approved project sends
                activity.
              </p>
            )}
          </div>
          <div className="rail-bottom">
            <ShieldCheck size={22} />
            <strong>Just an observer.</strong>
            <p>
              No approvals. No task controls. No extra AI usage to animate the
              office.
            </p>
            <Tabs
              value={mode}
              onValueChange={(v) => {
                if (v === 'demo' || local) {
                  setMode(v as 'demo' | 'live');
                  setFloorId('');
                }
              }}
            >
              <TabsList aria-label="Activity source">
                <TabsTrigger value="demo">Demo</TabsTrigger>
                <TabsTrigger value="live" disabled={!local}>
                  My work
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {!local && (
              <p className="local-hint">
                Your real work is only available in the local Mac companion.
              </p>
            )}
          </div>
        </aside>
        <section className="main-stage">
          <div className="stage-heading">
            <div>
              <span className="eyebrow">
                {view === 'building'
                  ? 'ALL FLOORS'
                  : floor
                    ? 'FLOOR ' +
                      String(index + 1).padStart(2, '0') +
                      ' / ' +
                      layout.name.toUpperCase()
                    : 'YOUR LOCAL COMPANION'}
              </span>
              <h1>
                {view === 'building'
                  ? 'The whole building'
                  : floor
                    ? name(floor, index)
                    : 'Ready when you are'}
              </h1>
            </div>
            <Tabs value={view} onValueChange={(v) => setView(String(v))}>
              <TabsList aria-label="Office view">
                <TabsTrigger value="floor">Inside office</TabsTrigger>
                <TabsTrigger value="building">Building</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div
            className="scene-shell"
            style={{ '--room-accent': layout.accent } as CSSProperties}
          >
            <div className="scene-topline">
              <span>
                {mode === 'demo' ? (
                  <Play size={13} />
                ) : snapshot.connected ? (
                  <Radio size={14} />
                ) : (
                  <Unplug size={14} />
                )}{' '}
                {mode === 'demo'
                  ? 'Sample shift in progress'
                  : stale
                    ? 'No recent activity signal'
                    : snapshot.connected
                      ? 'Events received locally'
                      : 'Waiting for connection'}
              </span>
              <span>
                {mode === 'demo'
                  ? 'SCRIPTED DEMO'
                  : ageLabel(snapshot.observedAt, now)}
              </span>
            </div>
            {view === 'building' && visible.floors.length ? (
              <div className="building-stack">
                {visible.floors.map((f, i) => {
                  const room =
                    layouts.find((l) => l.id === layoutPrefs[f.id]) ??
                    layouts[i % 5];
                  return (
                    <section key={f.id} className="building-floor">
                      <button
                        className="building-floor-label"
                        onClick={() => {
                          setFloorId(f.id);
                          setView('floor');
                        }}
                      >
                        <span>FLOOR {String(i + 1).padStart(2, '0')}</span>
                        <strong>{name(f, i)}</strong>
                        <span>
                          {f.agents.length} agents <ArrowUpRight size={14} />
                        </span>
                      </button>
                      <Scene f={f} room={room} small onSelect={selectAgent} />
                    </section>
                  );
                })}
              </div>
            ) : floor ? (
              <Scene f={floor} room={layout} onSelect={selectAgent} />
            ) : (
              <div className="empty-office">
                <img
                  className="room-art"
                  src="/rooms/midnight-lab.png"
                  alt="A quiet empty office waiting for agents."
                />
                <div className="empty-overlay">
                  <Unplug size={26} />
                  <h2>No real activity yet</h2>
                  <p>{snapshot.message}</p>
                  <button
                    className="demo-button"
                    onClick={() => setMode('demo')}
                  >
                    Explore the demo <Play size={15} />
                  </button>
                </div>
              </div>
            )}
            <div className="scene-caption">
              {mode === 'demo'
                ? 'Sample activity · click a robot to see its status'
                : 'Read-only local events · no conversations or code displayed'}
            </div>
          </div>
          <div className="control-bar">
            <div className="layout-control">
              <span>Office layout</span>
              <Select
                value={layout.id}
                disabled={!floor}
                onValueChange={(v) => v && setLayout(String(v))}
              >
                <SelectTrigger aria-label="Office layout">
                  <SelectValue>{layout.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {layouts.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              className="quiet-button"
              onClick={() => setPaused(!paused)}
              aria-pressed={paused}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}{' '}
              {paused ? 'Resume' : 'Pause'} motion
            </button>
            <button
              className="quiet-button"
              onClick={() => {
                const next = !sound;
                if (next) {
                  try {
                    audio.current ??= new AudioContext();
                    void audio.current.resume();
                  } catch {}
                }
                setSound(next);
              }}
              aria-pressed={sound}
            >
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} Sound{' '}
              {sound ? 'on' : 'off'}
            </button>
            <label className="safe-control">
              <Eye size={16} /> Recording-safe{' '}
              <Switch
                checked={safe}
                onCheckedChange={setSafe}
                aria-label="Recording-safe labels"
              />
            </label>
          </div>
          <div className="status-key">
            {Object.entries(stateInfo)
              .filter(([k]) => k !== 'idle')
              .map(([k, v]) => (
                <span className={v.color} key={k}>
                  ● {v.label}
                </span>
              ))}
          </div>
          {floor && (
            <details className="team-details">
              <summary>Team list · {floor.agents.length} agents</summary>
              <div className="team-list">
                {floor.agents.map((a) => (
                  <button key={a.id} onClick={() => selectAgent(a)}>
                    <Bot size={18} />
                    <strong>{a.label}</strong>
                    <span className={stateInfo[a.state].color}>
                      {stateInfo[a.state].label}
                    </span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </section>
        <aside className="activity-rail">
          <div className="rail-title">
            ACTIVITY LOG <span>{mode === 'demo' ? 'DEMO' : 'LOCAL'}</span>
          </div>
          <p className="rail-note">Signals, not conversations.</p>
          <div className="event-list">
            {floor?.events.slice(0, 6).map((e) => (
              <div className="event-item" key={e.id}>
                <span className={'event-dot ' + stateInfo[e.state].color}>
                  ●
                </span>
                <div>
                  <strong>
                    {floor.agents.find((a) => a.id === e.agentId)?.label ??
                      'Agent'}
                  </strong>
                  <p>{e.message}</p>
                  <time>
                    {mode === 'demo' ? 'Sample event' : ageLabel(e.at, now)}
                  </time>
                </div>
              </div>
            ))}
            {!floor?.events.length && (
              <p className="subtle">
                No events received. The room stays quiet until a real signal
                arrives.
              </p>
            )}
          </div>
          <div className="honesty-note">
            <ShieldCheck size={20} />
            <p>
              {mode === 'demo'
                ? 'This shift is a simulation. Switch to your local office for real project signals.'
                : 'A quiet connection is not proof that work finished. Unknown states stay visibly unknown.'}
            </p>
          </div>
          <div className="activity-footer">BUILT BY RECRUITING-GAINS</div>
        </aside>
      </div>
      <Dialog
        open={!!selectedAgent}
        onOpenChange={(v) => !v && selectAgent(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedAgent?.label}</DialogTitle>
            <DialogDescription>
              {selectedAgent ? stateInfo[selectedAgent.state].label : ''}
            </DialogDescription>
          </DialogHeader>
          {selectedAgent && (
            <div className="agent-inspector">
              <img src="/robot.png" alt="Your friendly robot coworker" />
              <div>
                <p>
                  {selectedAgent.source === 'demo'
                    ? 'Scripted sample agent.'
                    : 'Observed by the local event adapter.'}
                </p>
                <p>
                  {selectedAgent.parentId
                    ? 'Assigned by another agent.'
                    : 'This floor’s lead agent.'}
                </p>
                <p>No task content is stored in this display.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
