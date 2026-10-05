import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  Expand,
  Eye,
  Info,
  Layers3,
  LockKeyhole,
  Maximize2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Signal,
  SkipBack,
  SlidersHorizontal,
  Unplug,
  X,
} from "lucide-react";
import Room from "./Room";
import { scenarios, sampleScenario, signalHistory } from "../shared/scenarios";
import type { ReceivedEvent, StreamMessage } from "../shared/types";
const sourceURL =
  "https://github.com/recruiting-gains/ai-builds-showcase/tree/codex/retrace/retrace";
function Clock({ time }: { time: number }) {
  return (
    <>
      {Math.floor(time / 60)
        .toString()
        .padStart(2, "0")}
      :
      {Math.floor(time % 60)
        .toString()
        .padStart(2, "0")}
      <span className="milliseconds">.{Math.floor((time % 1) * 10)}</span>
    </>
  );
}
function Plot({
  values,
  min = -72,
  max = -54,
  kind = "line",
}: {
  values: (number | null)[];
  min?: number;
  max?: number;
  kind?: "line" | "bars";
}) {
  const y = (v: number) =>
    Math.max(8, Math.min(72, 72 - ((v - min) / (max - min)) * 60));
  const points = values
    .map((v, i) =>
      v === null ? "" : `${(i / Math.max(1, values.length - 1)) * 280},${y(v)}`,
    )
    .join(" ");
  const path = values
    .map((v, i) =>
      v === null
        ? ""
        : `${i === 0 || values[i - 1] === null ? "M" : "L"}${(i / Math.max(1, values.length - 1)) * 280},${y(v)}`,
    )
    .join(" ");
  return (
    <svg
      className="plot"
      viewBox="0 0 280 84"
      preserveAspectRatio="none"
      role="img"
      aria-label={
        kind === "bars"
          ? "Relative signal amplitude by subcarrier"
          : "Signal strength over time"
      }
    >
      <path d="M0 15H280 M0 42H280 M0 70H280" className="plot-grid" />
      {kind === "line" ? (
        <>
          {values.length > 1 && !values.includes(null) && (
            <polyline
              points={`0,84 ${points} 280,84`}
              fill="url(#signal-fill)"
              stroke="none"
            />
          )}
          <path
            data-signal-path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            vectorEffect="non-scaling-stroke"
          />
          <defs>
            <linearGradient id="signal-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity=".2" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
        </>
      ) : (
        values.map((v, i) =>
          v === null ? null : (
            <rect
              key={i}
              x={(i / values.length) * 280}
              y={y(v)}
              width={Math.max(0.2, (280 / values.length) * 0.7)}
              height={72 - y(v)}
              rx="1"
              fill="currentColor"
              opacity={0.3 + Math.min(1, v / max) * 0.6}
            />
          ),
        )
      )}
    </svg>
  );
}
function SensorPanel({ onClose }: { onClose: () => void }) {
  const [secret, setSecret] = useState(""),
    [events, setEvents] = useState<ReceivedEvent[]>([]),
    [status, setStatus] = useState("disconnected"),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now()),
    [mode, setMode] = useState<"live" | "replay">("live"),
    [selected, setSelected] = useState(""),
    [stream, setStream] = useState(""),
    [busy, setBusy] = useState(false);
  const socket = useRef<WebSocket | null>(null),
    reconnect = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    active = useRef(false),
    generation = useRef(0),
    epoch = useRef("");
  const key = (e: ReceivedEvent) =>
    `${e.sessionId}:${e.sensorId}:${e.sequence}`;
  const series = (e: ReceivedEvent) => `${e.sessionId}:${e.sensorId}`;
  useEffect(() => {
    const id = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setEvents((old) =>
        old.length && tick - Date.parse(old[0].receivedAt) > 60_000
          ? old.filter((e) => tick - Date.parse(e.receivedAt) <= 60_000)
          : old,
      );
    }, 500);
    return () => {
      clearInterval(id);
      active.current = false;
      generation.current++;
      if (timer.current) clearTimeout(timer.current);
      socket.current?.close();
    };
  }, []);
  function retire() {
    active.current = false;
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    socket.current?.close();
    socket.current = null;
  }
  function connect(gen: number) {
    if (gen !== generation.current || !active.current) return;
    setStatus("connecting");
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/stream`,
    );
    socket.current = ws;
    ws.onopen = () => {
      if (gen !== generation.current) {
        ws.close();
        return;
      }
      setStatus("waiting");
      setError("");
    };
    ws.onmessage = (e) => {
      if (gen !== generation.current) return;
      try {
        const msg = JSON.parse(e.data) as StreamMessage;
        if (msg.type === "samples") {
          reconnect.current = 0;
          setEvents((old) =>
            [...old, ...msg.events]
              .filter((v) => Date.now() - Date.parse(v.receivedAt) <= 60_000)
              .slice(-600),
          );
          setStatus("receiving");
          ws.send(JSON.stringify({ type: "ack" }));
        } else if (msg.type === "status") {
          if (msg.status === "disconnected") {
            retire();
            setStatus("disconnected");
            setError(
              "The stream ended. Connect again to resume fresh measurements.",
            );
          } else {
            if (epoch.current && epoch.current !== msg.epoch)
              setError("The stream restarted. Previous samples were cleared.");
            epoch.current = msg.epoch;
            setStatus("waiting");
            setEvents([]);
          }
        } else if (msg.type === "error") setError(msg.message);
      } catch {
        setError("The stream sent an unsupported message.");
      }
    };
    ws.onclose = (e) => {
      if (gen !== generation.current) return;
      setStatus("disconnected");
      if (e.code === 1008) {
        active.current = false;
        setError("Viewer session ended. Connect again to continue.");
        return;
      }
      if (active.current && reconnect.current < 5) {
        timer.current = setTimeout(
          () => connect(gen),
          Math.min(16000, 1000 * 2 ** reconnect.current++),
        );
      } else if (active.current)
        setError(
          "Connection stopped after five retries. Reconnect when the bridge is ready.",
        );
    };
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    retire();
    const gen = generation.current;
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (gen !== generation.current) return;
      if (!r.ok)
        throw new Error(
          r.status === 503
            ? "The private stream has not been configured on this deployment."
            : r.status === 429
              ? "Too many attempts. Wait before trying again."
              : "The viewer key was not accepted.",
        );
      setSecret("");
      setEvents([]);
      setMode("live");
      setStream("");
      active.current = true;
      reconnect.current = 0;
      connect(gen);
    } catch (e) {
      if (gen === generation.current) {
        setStatus("disconnected");
        setError((e as Error).message);
      }
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }
  async function disconnect() {
    retire();
    setBusy(false);
    setEvents([]);
    setStatus("disconnected");
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
  }
  const streamOptions = [
    ...new Map(events.map((e) => [series(e), e])).values(),
  ];
  const activeStream = streamOptions.some((e) => series(e) === stream)
    ? stream
    : streamOptions.at(-1)
      ? series(streamOptions.at(-1)!)
      : "";
  const filtered = events.filter((e) => series(e) === activeStream),
    latest = filtered.at(-1),
    age = latest ? now - Date.parse(latest.receivedAt) : Infinity;
  const displayStatus =
    status === "receiving"
      ? age > 15000
        ? "disconnected"
        : age > 5000
          ? "stale"
          : "receiving"
      : status;
  const chosen =
    mode === "live"
      ? latest
      : (filtered.find((e) => key(e) === selected) ?? filtered[0]);
  const plotValues = filtered.flatMap((e, i) => [
    ...(i &&
    Date.parse(e.receivedAt) - Date.parse(filtered[i - 1].receivedAt) > 1500
      ? [null]
      : []),
    e.rssi ?? null,
  ]);
  return (
    <section className="sensor-panel">
      <div className="sensor-heading">
        <button className="text-button" onClick={onClose}>
          <ArrowLeft size={16} /> Back to observatory
        </button>
        <span className="eyebrow">PRIVATE CONNECTION</span>
      </div>
      <div className="sensor-intro">
        <Radio size={32} />
        <h2>Bring your own signal.</h2>
        <p>
          Connect a local bridge to inspect structured sensor measurements. This
          interface does not capture Wi-Fi, detect people, or estimate
          positions.
        </p>
      </div>
      <div className="sensor-grid">
        <form className="sensor-login" onSubmit={login}>
          <span className="eyebrow">01 / CONNECT</span>
          <h3>Your private stream</h3>
          <p>
            Use the viewer key from your deployment setup. Your ingest key stays
            with the local bridge.
          </p>
          <label htmlFor="viewer-key">Viewer key</label>
          <input
            id="viewer-key"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter viewer key"
            required
          />
          <button className="primary-button" disabled={busy}>
            {busy ? "Connecting…" : "Connect stream"}
            <ArrowUpRight size={16} />
          </button>
          <button type="button" className="text-button" onClick={disconnect}>
            <Unplug size={15} /> Disconnect and clear
          </button>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <a
            href={`${sourceURL}/docs/SENSOR-CONTRACT.md`}
            target="_blank"
            rel="noreferrer"
          >
            Bridge setup & data format <ArrowUpRight size={14} />
          </a>
        </form>
        <div className="sensor-readings">
          <div className="inspector-heading">
            <span className="eyebrow">02 / INSPECT</span>
            <span className="badge" role="status">
              {displayStatus}
            </span>
          </div>
          <h3>
            {chosen
              ? chosen.rssi === undefined
                ? "RSSI unavailable"
                : `${chosen.rssi.toFixed(1)} dBm`
              : "Waiting for measurements"}
          </h3>
          <p>
            Source: <strong>{chosen?.sourceKind ?? "No source"}</strong> · Mode:{" "}
            <strong>{mode}</strong>
          </p>
          {chosen?.sourceKind === "fixture" && (
            <p className="notice">
              Protocol test fixture — not hardware evidence.
            </p>
          )}
          {streamOptions.length > 1 && (
            <select
              aria-label="Signal stream"
              value={activeStream}
              onChange={(e) => {
                setStream(e.target.value);
                setMode("live");
              }}
            >
              {streamOptions.map((e) => (
                <option key={series(e)} value={series(e)}>
                  {e.sensorId} / {e.sourceKind} / {e.sessionId.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
          <Plot values={plotValues} min={-150} max={0} />
          {chosen?.amplitudes && (
            <>
              <p>Channel response · relative units</p>
              <Plot
                values={chosen.amplitudes}
                kind="bars"
                min={0}
                max={Math.max(1, ...chosen.amplitudes)}
              />
            </>
          )}
          <div className="segmented">
            <button
              onClick={() => setMode("live")}
              aria-pressed={mode === "live"}
            >
              Live stream
            </button>
            <button
              onClick={() => {
                setMode("replay");
                setSelected(latest ? key(latest) : "");
              }}
              aria-pressed={mode === "replay"}
              disabled={!filtered.length}
            >
              Replay buffer
            </button>
          </div>
          {mode === "replay" && (
            <input
              aria-label="Sensor replay sample"
              type="range"
              min="0"
              max={Math.max(0, filtered.length - 1)}
              value={Math.max(
                0,
                filtered.findIndex((e) => key(e) === selected),
              )}
              onChange={(e) => setSelected(key(filtered[+e.target.value]))}
            />
          )}
          <dl>
            <div>
              <dt>Captured</dt>
              <dd>
                {chosen
                  ? new Date(chosen.capturedAt).toLocaleTimeString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>
                {chosen
                  ? new Date(chosen.receivedAt).toLocaleTimeString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Buffered samples</dt>
              <dd>{events.length} / 600</dd>
            </div>
          </dl>
          <p className="small-note">
            A temporary, 60-second buffer in this browser. Gaps mean missing
            data, never an empty room.
          </p>
        </div>
      </div>
    </section>
  );
}
export default function App() {
  const [scenarioId, setScenario] = useState("movement"),
    [time, setTime] = useState(17.4),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [view, setView] = useState<"demo" | "sensor">("demo"),
    [about, setAbout] = useState(false),
    [resetKey, setResetKey] = useState(0),
    [reduced, setReduced] = useState(
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [api, setApi] = useState("checking"),
    [notice, setNotice] = useState("");
  const scenario = scenarios.find((s) => s.id === scenarioId)!;
  const sample = sampleScenario(scenarioId, time);
  const history = useMemo(
    () => signalHistory(scenarioId, time),
    [scenarioId, time],
  );
  const lastFocus = useRef<HTMLElement | null>(null);
  function openAbout() {
    lastFocus.current = document.activeElement as HTMLElement;
    setAbout(true);
  }
  useEffect(() => {
    if (!about) return;
    const dialog = document.querySelector(".about-dialog")!;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbout(false);
        return;
      }
      if (e.key === "Tab") {
        const nodes = Array.from(
          dialog.querySelectorAll<HTMLElement>("button,a[href],input,select"),
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      lastFocus.current?.focus();
    };
  }, [about]);
  const fallback = new URLSearchParams(location.search).has("fallback");
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/health", { signal: c.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => setApi("online"))
      .catch(() => setApi("offline"));
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (!playing || view !== "demo") return;
    let previous = performance.now();
    const id = setInterval(() => {
      const current = performance.now(),
        dt = (current - previous) / 1000;
      previous = current;
      if (!document.hidden)
        setTime((t) => {
          const next = t + dt * speed;
          if (next >= scenario.duration) {
            setPlaying(false);
            return scenario.duration;
          }
          return next;
        });
    }, 100);
    return () => clearInterval(id);
  }, [playing, speed, scenario.duration, view]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(id);
  }, [notice]);
  function select(id: string) {
    setScenario(id);
    setTime(0);
    setPlaying(false);
  }
  function exportFrame() {
    const payload = {
      project: "ReTrace",
      playbackMode: "replay",
      scenario: scenarioId,
      ...sample,
      roomPositionIsIllustrative: true,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `retrace-${scenarioId}-${Math.floor(time)}s.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Simulated snapshot saved as JSON.");
  }
  return (
    <div className="app-shell">
      <aside className="rail" aria-label="Workspace navigation">
        <a
          className="brand-mark"
          href="#"
          aria-label="ReTrace home"
          onClick={() => setView("demo")}
        >
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M8 24V8h10a6 6 0 0 1 0 12h-4l10 7M13 13h5a1 1 0 0 1 0 2h-5" />
          </svg>
        </a>
        <span className="rail-divider" />
        <button
          className={view === "demo" ? "rail-button active" : "rail-button"}
          title="Observatory"
          aria-label="Observatory"
          onClick={() => setView("demo")}
        >
          <Layers3 size={20} />
        </button>
        <button
          className={view === "sensor" ? "rail-button active" : "rail-button"}
          title="Sensor connection"
          aria-label="Sensor connection"
          onClick={() => {
            setPlaying(false);
            setView("sensor");
          }}
        >
          <Radio size={20} />
        </button>
        <div className="rail-bottom">
          <a
            className="rail-button"
            href="/media/ReTrace-landscape.mp4"
            target="_blank"
            rel="noreferrer"
            title="Watch the 30-second tour"
            aria-label="Watch the 30-second tour"
          >
            <Play size={20} />
          </a>
          <button
            className="rail-button"
            title="About ReTrace"
            aria-label="About ReTrace"
            onClick={openAbout}
          >
            <Info size={20} />
          </button>
          <span className="avatar">CG</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a className="wordmark" href="#" onClick={() => setView("demo")}>
            ReTrace<span> / </span>
            <small>Signal observatory</small>
          </a>
          <div className="topbar-right">
            <span className="version">EXPERIMENT 001</span>
            <a
              className="source-link"
              href={sourceURL}
              target="_blank"
              rel="noreferrer"
            >
              View source <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <main>
          {view === "sensor" ? (
            <SensorPanel onClose={() => setView("demo")} />
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="tiny-cross">+</span> MAKE THE INVISIBLE
                    EXPLORABLE
                  </div>
                  <h1>
                    Every signal leaves a trace<span>.</span>
                  </h1>
                  <p>Step inside a moment. Follow the signal. Play it back.</p>
                </div>
                <button
                  className="connect-button"
                  onClick={() => {
                    setPlaying(false);
                    setView("sensor");
                  }}
                >
                  <Radio size={16} /> Connect a sensor{" "}
                  <ArrowUpRight size={15} />
                </button>
              </section>
              <div className="observatory">
                <section className="scene-panel" aria-labelledby="room-heading">
                  <div className="scene-toolbar">
                    <div className="scene-title">
                      <span className="status-dot" />
                      <h2 id="room-heading">The living room</h2>
                      <span className="scene-divider">/</span>
                      <span>Scene 01</span>
                    </div>
                    <span className="simulation-badge">
                      <span /> Simulated demo
                    </span>
                  </div>
                  <div className="scene-view">
                    <div className="scene-meta">
                      <span className="eyebrow">SPATIAL VIEW</span>
                      <span>Room illustration · 4 × 5 m</span>
                    </div>
                    <Room
                      sample={sample}
                      resetKey={resetKey}
                      reduced={reduced}
                      forceFallback={fallback}
                    />
                    <div className="node-label node-label-one">
                      <span /> A <small>transmitter illustration</small>
                    </div>
                    <div className="node-label node-label-two">
                      <span /> B <small>receiver illustration</small>
                    </div>
                    <div className="room-legend">
                      <span className="legend-signal" /> Signal field{" "}
                      <span className="legend-path" /> Scenario path
                    </div>
                    <div className="scene-tools">
                      <button
                        aria-label="Reset room view"
                        title="Reset room view"
                        onClick={() => setResetKey((v) => v + 1)}
                      >
                        <RotateCcw size={15} />
                      </button>
                      <button
                        aria-label="About the room illustration"
                        title="About the room illustration"
                        onClick={openAbout}
                      >
                        <Info size={15} />
                      </button>
                    </div>
                    <span className="orientation">
                      N <span>↗</span>
                    </span>
                  </div>
                  <div className="scene-caption">
                    <Eye size={14} />
                    <span>
                      Illustrative movement. No camera. No measured position.
                    </span>
                    <span className="drag-hint">
                      DRAG TO EXPLORE <Command size={11} />
                    </span>
                  </div>
                </section>
                <aside className="inspector">
                  <div className="inspector-heading">
                    <div>
                      <span className="eyebrow">SIGNAL INSPECTOR</span>
                      <h2>A closer look.</h2>
                    </div>
                    <AudioLines size={20} />
                  </div>
                  <div className="reading">
                    <div className="reading-label">
                      <span>Signal strength</span>
                      <span className="mono">RSSI</span>
                    </div>
                    <div className="metric">
                      {sample.rssi.toFixed(1)}
                      <span>dBm</span>
                      <span className="metric-trend">
                        <Activity size={13} /> simulated
                      </span>
                    </div>
                    <Plot values={history.map((s) => s.rssi)} />
                    <div className="plot-axis">
                      <span>−12 SEC</span>
                      <span>NOW</span>
                    </div>
                  </div>
                  <div className="reading amplitude">
                    <div className="reading-label">
                      <span>Channel response</span>
                      <span className="mono">32 BINS</span>
                    </div>
                    <Plot
                      values={sample.amplitudes}
                      kind="bars"
                      min={0}
                      max={1}
                    />
                    <div className="plot-axis">
                      <span>SUBCARRIER INDEX</span>
                      <span>RELATIVE UNITS</span>
                    </div>
                  </div>
                  <div className="moment">
                    <span className="moment-icon">
                      <Activity size={18} />
                    </span>
                    <div>
                      <span className="eyebrow">THIS MOMENT</span>
                      <strong>{sample.phase}</strong>
                      <span>Scenario event · not a detection</span>
                    </div>
                  </div>
                  <button className="export-button" onClick={exportFrame}>
                    <ArrowDownToLine size={15} /> Save this snapshot{" "}
                    <span>
                      JSON <ArrowUpRight size={12} />
                    </span>
                  </button>
                </aside>
              </div>
              <section className="playback" aria-labelledby="playback-heading">
                <div className="playback-top">
                  <div>
                    <span className="eyebrow">REPLAY LAB</span>
                    <h2 id="playback-heading">Find the moment that matters.</h2>
                  </div>
                  <div className="scenario-select">
                    <label htmlFor="scenario">SCENARIO</label>
                    <div>
                      <select
                        aria-label="Scenario"
                        id="scenario"
                        value={scenarioId}
                        onChange={(e) => select(e.target.value)}
                      >
                        {scenarios.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} />
                    </div>
                  </div>
                </div>
                <div className="transport">
                  <div className="transport-buttons">
                    <button
                      className="play-button"
                      aria-label={playing ? "Pause replay" : "Play replay"}
                      onClick={() => {
                        if (time >= scenario.duration) setTime(0);
                        setPlaying((v) => !v);
                      }}
                    >
                      {playing ? (
                        <Pause size={17} />
                      ) : (
                        <Play size={17} fill="currentColor" />
                      )}
                    </button>
                    <button
                      className="restart-button"
                      aria-label="Restart replay"
                      onClick={() => {
                        setTime(0);
                        setPlaying(false);
                      }}
                    >
                      <SkipBack size={17} />
                    </button>
                  </div>
                  <div className="time-display">
                    <Clock time={time} />
                    <span> / 00:48</span>
                  </div>
                  <div className="timeline-wrap">
                    <div className="timeline-wave" aria-hidden="true">
                      {Array.from({ length: 100 }, (_, i) => {
                        const s = sampleScenario(scenarioId, i * 0.48);
                        return (
                          <span
                            key={i}
                            className={i / 100 <= time / 48 ? "passed" : ""}
                            style={{ height: `${7 + s.activity * 34}px` }}
                          />
                        );
                      })}
                    </div>
                    <input
                      id="timeline"
                      aria-label="Replay time in seconds"
                      type="range"
                      min="0"
                      max="48"
                      step="0.1"
                      value={time}
                      onChange={(e) => {
                        setPlaying(false);
                        setTime(+e.target.value);
                      }}
                    />
                    <div className="timeline-ticks">
                      <span>00:00</span>
                      <span>00:12</span>
                      <span>00:24</span>
                      <span>00:36</span>
                      <span>00:48</span>
                    </div>
                  </div>
                  <select
                    className="speed-select"
                    aria-label="Playback speed"
                    value={speed}
                    onChange={(e) => setSpeed(+e.target.value)}
                  >
                    <option value="0.5">0.5×</option>
                    <option value="1">1×</option>
                    <option value="2">2×</option>
                  </select>
                </div>
                <div className="chapter-row">
                  <button
                    onClick={() => {
                      setTime(0);
                      setPlaying(false);
                    }}
                  >
                    <span>01</span> Establish a baseline
                  </button>
                  <ChevronRight size={12} />
                  <button
                    onClick={() => {
                      setTime(13);
                      setPlaying(false);
                    }}
                  >
                    <span>02</span> Notice the change
                  </button>
                  <ChevronRight size={12} />
                  <button
                    onClick={() => {
                      setTime(36);
                      setPlaying(false);
                    }}
                  >
                    <span>03</span> Trace it back
                  </button>
                  <span className="deterministic">
                    <Check size={12} /> Same input. Same replay.
                  </span>
                </div>
              </section>
              <section className="bottom-notes">
                <div>
                  <span className="note-number">01—</span>
                  <div>
                    <h3>A window into the signal.</h3>
                    <p>
                      Radio measurements become something you can explore. Start
                      with a simulation; inspect each change at your own pace.
                    </p>
                  </div>
                </div>
                <button onClick={openAbout}>
                  <span>
                    Built to be understood.<small>How ReTrace works</small>
                  </span>
                  <ArrowUpRight size={22} />
                </button>
              </section>
            </>
          )}
        </main>
        <footer>
          <span>
            <i className={api === "online" ? "online" : ""} />{" "}
            {api === "online"
              ? "API connected"
              : api === "checking"
                ? "Checking connection"
                : "Local demo · API unavailable"}
          </span>
          <span>AN ORIGINAL EXPERIMENT BY CRUZ GARZA</span>
          <span>
            ReTrace <span className="footer-version">v1.0</span>
          </span>
        </footer>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
      {about && (
        <div className="modal-backdrop" onClick={() => setAbout(false)}>
          <section
            className="about-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              autoFocus
              aria-label="Close explanation"
              onClick={() => setAbout(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">A CLEAR VIEW OF WHAT IS REAL</span>
            <h2 id="about-title">Signals, with context.</h2>
            <p>
              ReTrace is an original signal visualization and replay experiment
              inspired by an analysis of RuView.
            </p>
            <div className="about-item">
              <Layers3 />
              <div>
                <h3>The public observatory is simulated.</h3>
                <p>
                  Every signal, event, and room position comes from a repeatable
                  scenario. It demonstrates the interface, not real Wi-Fi
                  sensing.
                </p>
              </div>
            </div>
            <div className="about-item">
              <Radio />
              <div>
                <h3>The connection interface is real.</h3>
                <p>
                  A local bridge can send structured measurements to a private
                  stream. Device drivers, calibration, and sensing models are
                  separate work.
                </p>
              </div>
            </div>
            <div className="about-item">
              <LockKeyhole />
              <div>
                <h3>Source labels travel with the data.</h3>
                <p>
                  Simulation, test fixtures, and sensor inputs stay distinct.
                  Replaying a signal never changes its origin.
                </p>
              </div>
            </div>
            <a href={sourceURL} target="_blank" rel="noreferrer">
              Explore the implementation <ArrowUpRight size={16} />
            </a>
          </section>
        </div>
      )}
    </div>
  );
}
