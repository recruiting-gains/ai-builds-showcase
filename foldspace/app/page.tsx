"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  HelpCircle,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Play,
  Check,
  Home as HomeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import {
  SAVE_KEY,
  ROOM_NAMES,
  ROOM_HINTS,
  initialState,
  normalizeSave,
  destination,
  gateOpen,
  gateMessage,
  type View,
} from "@/lib/game";
import type { WorldHandle } from "@/lib/world";
import { registerGameTools } from "@/lib/webmcp";

declare global {
  interface Window {
    foldspaceDemo?: {
      advance: (dt: number) => void;
      read: () => View;
      done: () => boolean;
    };
  }
}
const freshView = (): View => ({
  state: initialState(),
  position: { x: 0, z: 1.6 },
  target: null,
  notice: "",
  falls: 0,
  elapsed: 0,
});
const directions = [
  { id: "up", Icon: ArrowUp, label: "Move up" },
  { id: "left", Icon: ArrowLeft, label: "Move left" },
  { id: "down", Icon: ArrowDown, label: "Move down" },
  { id: "right", Icon: ArrowRight, label: "Move right" },
];
export default function Home() {
  const host = useRef<HTMLDivElement>(null),
    shell = useRef<HTMLElement>(null),
    world = useRef<WorldHandle | null>(null);
  const [view, setView] = useState<View>(freshView),
    [ready, setReady] = useState(false),
    [started, setStarted] = useState(false),
    [paused, setPaused] = useState(false),
    [help, setHelp] = useState(false),
    [sound, setSound] = useState(false),
    [error, setError] = useState(""),
    [saveNote, setSaveNote] = useState(""),
    [demo, setDemo] = useState(false),
    [reel, setReel] = useState(false),
    [verification, setVerification] = useState("");
  const start = useCallback(() => {
    world.current?.start();
    setStarted(true);
    setPaused(false);
    requestAnimationFrame(() => shell.current?.focus());
  }, []);
  useEffect(() => {
    let cancelled = false,
      unregister = () => {};
    const params = new URLSearchParams(location.search),
      isDemo = params.get("demo") === "1",
      isReel = params.get("reel") === "1",
      manual = params.get("manual") === "1";
    let restorationNote = "";
    let state = initialState();
    if (!isDemo)
      try {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) {
          const result = normalizeSave(JSON.parse(saved));
          state = result.state;
          if (result.repaired)
            restorationNote =
              "Saved progress needed repair. Continuing from a valid checkpoint.";
        }
      } catch {
        restorationNote = "Progress could not be loaded. Starting a fresh run.";
      }
    import("@/lib/world")
      .then(({ createWorld }) => {
        if (cancelled || !host.current) return;
        setDemo(isDemo);
        setReel(isReel);
        if (isDemo) setStarted(true);
        if (restorationNote) setSaveNote(restorationNote);
        const handle = createWorld(host.current, {
          state,
          demo: isDemo,
          manual,
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          onUpdate: setView,
          onError: setError,
          onChange(s) {
            if (!isDemo)
              try {
                localStorage.setItem(SAVE_KEY, JSON.stringify(s));
              } catch {
                setSaveNote(
                  "Progress stays in this session; storage is unavailable.",
                );
              }
          },
        });
        world.current = handle;
        unregister = registerGameTools(handle, start);
        if (isDemo)
          window.foldspaceDemo = {
            advance: handle.advance,
            read: () => handle.session.view(),
            done: handle.demoDone,
          };
        setReady(true);
        if (state.won) {
          handle.start();
          setStarted(true);
        }
        if (isDemo) requestAnimationFrame(() => shell.current?.focus());
      })
      .catch(() =>
        setError(
          "Your browser could not start the 3D scene. Enable WebGL or try another browser.",
        ),
      );
    return () => {
      cancelled = true;
      unregister();
      world.current?.dispose();
      world.current = null;
      delete window.foldspaceDemo;
    };
  }, [start]);
  useEffect(() => {
    world.current?.pause(paused || help);
  }, [paused, help]);
  useEffect(() => {
    if (!view.state.won) return;
    const session = world.current?.session;
    if (!session || !session.history.length) return;
    // A resumed run may only have a partial local history. Do not call it a full verified replay.
    if (
      session.history[0]?.type !== "interact" ||
      session.history[0].target !== "cyan"
    )
      return;
    const abort = new AbortController();
    fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions: session.history }),
      signal: abort.signal,
    })
      .then((r) => r.json())
      .then((result) => {
        if (
          result &&
          typeof result === "object" &&
          "ok" in result &&
          "won" in result &&
          result.ok &&
          result.won
        )
          setVerification("Puzzle sequence checked.");
      })
      .catch(() => {});
    return () => abort.abort();
  }, [view.state.won]);
  const s = view.state,
    solved = s.solved.filter(Boolean).length;
  const toggleSound = () => {
    setSound(!sound);
    world.current?.setSound(!sound);
  };
  const reset = () => {
    world.current?.reset();
    setVerification("");
    setPaused(false);
    setStarted(true);
    requestAnimationFrame(() => shell.current?.focus());
  };
  const keyEvent = (e: React.KeyboardEvent, down: boolean) => {
    if (!started || paused || help || demo) return;
    const map: Record<string, string> = {
      w: "up",
      ArrowUp: "up",
      s: "down",
      ArrowDown: "down",
      a: "left",
      ArrowLeft: "left",
      d: "right",
      ArrowRight: "right",
    };
    const key = map[e.key] ?? map[e.key.toLowerCase()];
    if (key) {
      e.preventDefault();
      world.current?.direction(key, down);
    } else if (down && !e.repeat && e.key.toLowerCase() === "e") {
      e.preventDefault();
      world.current?.interact();
    } else if (down && e.key === "Escape") {
      e.preventDefault();
      setPaused(true);
    }
  };
  const roomNumber = String(s.room + 1).padStart(2, "0");
  return (
    <main
      ref={shell}
      className={`game-shell ${started ? "playing" : ""} ${reel ? "reel-mode" : ""} ${s.won ? "won" : ""}`}
      tabIndex={0}
      onKeyDown={(e) => keyEvent(e, true)}
      onKeyUp={(e) => keyEvent(e, false)}
      aria-label="Foldspace portal puzzle. Enter the fold to play."
    >
      <div
        ref={host}
        className="world"
        onPointerDown={() => {
          if (started && !paused && !help) shell.current?.focus();
        }}
      />
      <div className="vignette" />
      <header className="topbar">
        <Button
          variant="ghost"
          className="wordmark"
          onClick={() => location.assign("/")}
          aria-label="Return to Foldspace title"
        >
          FOLDSPACE<span className="wordmark-mark">↗</span>
        </Button>
        <nav aria-label="Game controls">
          {demo && <span className="demo-tag">GAMEPLAY DEMO</span>}
          <Button
            className="icon-button"
            variant="ghost"
            size="icon"
            onClick={toggleSound}
            aria-label={sound ? "Mute sound" : "Enable sound"}
          >
            {sound ? <Volume2 /> : <VolumeX />}
          </Button>
          <Dialog open={help} onOpenChange={setHelp}>
            <DialogTrigger asChild>
              <Button
                className="icon-button"
                variant="ghost"
                size="icon"
                aria-label="How to play"
              >
                <HelpCircle />
              </Button>
            </DialogTrigger>
            <DialogContent className="help-dialog">
              <DialogTitle>Space is a suggestion.</DialogTitle>
              <DialogDescription>
                Five rooms. Three ways to connect them. Find the glowing circle
                in Home.
              </DialogDescription>
              <div className="help-steps">
                <p>
                  <strong>01 · Choose</strong> Rotate the cyan doorway to change
                  where it leads. Its window shows the destination.
                </p>
                <p>
                  <strong>02 · Carry</strong> Take a key from a plinth. Match
                  its shape to the amber door.
                </p>
                <p>
                  <strong>03 · Connect</strong> Point Relay toward Reach, and
                  Reach back toward Relay.
                </p>
              </div>
              <p>
                <kbd>W A S D</kbd> or arrow keys to move. <kbd>E</kbd> to use a
                nearby control. On a phone, hold a direction button and tap the
                action button. Walk through an open doorway to cross.
              </p>
              <p>
                White arches take you back. A fall returns you to the room’s
                entrance. Progress saves on this browser. Escape pauses.
              </p>
              <p className="small-note">
                A portal-routing experiment by Cruz Garza. Built with GPT-6
                Astra in Codex, using Ultra reasoning.
              </p>
            </DialogContent>
          </Dialog>
          {started && !demo && (
            <Button
              className="icon-button"
              variant="ghost"
              size="icon"
              onClick={() => setPaused(true)}
              aria-label="Pause game"
            >
              <Pause />
            </Button>
          )}
        </nav>
      </header>
      {!started ? (
        <>
          <aside className="chapter">
            <span className="eyebrow">A PUZZLE OF IMPOSSIBLE ROOMS</span>
            <h1>
              Some doors
              <br />
              change everything.
            </h1>
            <p>
              Five rooms. Three puzzles.
              <br />
              One impossible way home.
            </p>
          </aside>
          <div className="coordinates" aria-hidden="true">
            <span>NON-EUCLIDEAN STUDY</span>
            <span>35° · ∞</span>
          </div>
          <footer className="entry-dock">
            <span className="edition">AN EXPERIMENT BY CRUZ GARZA</span>
            <div className="entry-actions">
              <Button
                className="primary-button"
                disabled={!ready || !!error}
                onClick={start}
              >
                {error
                  ? "3D unavailable"
                  : ready
                    ? solved
                      ? "Continue the fold"
                      : "Enter the fold"
                    : "Opening the fold…"}
                <ArrowUpRight size={20} />
              </Button>
              <Button
                variant="link"
                className="demo-link"
                onClick={() => location.assign("/?demo=1")}
              >
                Watch a walkthrough <Play size={12} />
              </Button>
            </div>
            <span className="entry-note">
              NO TIMER. NO ENEMIES.
              <br />
              JUST A DIFFERENT WAY THROUGH.
            </span>
          </footer>
        </>
      ) : (
        <>
          <section className="room-panel" aria-label="Current room">
            <span className="eyebrow">ROOM {roomNumber} / 05</span>
            <h1>
              {ROOM_NAMES[s.room]}
              <span className="room-period">.</span>
            </h1>
            <p>{ROOM_HINTS[s.room]}</p>
          </section>
          <aside className="route-panel" aria-label="Doorway destination">
            <div className="route-heading">
              <span>{s.room === 4 ? "THE JOURNEY" : "THROUGH THE DOOR"}</span>
              <span className={`gate-status ${gateOpen(s) ? "open" : ""}`}>
                {s.room === 4 ? "ARRIVED" : gateOpen(s) ? "OPEN" : "LOCKED"}
              </span>
            </div>
            <div className="destination">
              <span className="portal-symbol">
                {s.room === 0
                  ? "↻"
                  : s.room === 1
                    ? "◇"
                    : s.room === 2
                      ? "⇄"
                      : "↗"}
              </span>
              {ROOM_NAMES[destination(s)]}
            </div>
            {s.room === 2 ? (
              <div className="pair-lines">
                <span>
                  Relay <b>→ {ROOM_NAMES[s.near]}</b>
                </span>
                <span>
                  Reach <b>→ {ROOM_NAMES[s.far]}</b>
                </span>
              </div>
            ) : (
              <p>{gateMessage(s)}</p>
            )}
          </aside>
          <ol className="journey" aria-label={`${solved} of 3 puzzles solved`}>
            {["Choose", "Carry", "Connect"].map((name, i) => (
              <li key={name} className={s.solved[i] ? "complete" : ""}>
                <span>
                  {s.solved[i] ? <Check size={14} /> : ["↻", "◇", "⇄"][i]}
                </span>
                {name}
              </li>
            ))}
          </ol>
          {!s.won && (
            <footer className="play-dock">
              <div className="dpad" aria-label="Movement controls">
                {directions.map(({ id, Icon, label }) => (
                  <Button
                    key={id}
                    className={`direction ${id}`}
                    variant="ghost"
                    aria-label={label}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      world.current?.direction(id, true);
                    }}
                    onPointerUp={() => world.current?.direction(id, false)}
                    onPointerCancel={() => world.current?.direction(id, false)}
                    onLostPointerCapture={() =>
                      world.current?.direction(id, false)
                    }
                  >
                    <Icon size={20} />
                  </Button>
                ))}
              </div>
              <div className="action-area">
                <div className="inventory">
                  <span
                    className={
                      s.key === "amber"
                        ? "amber"
                        : s.key === "violet"
                          ? "violet"
                          : ""
                    }
                  >
                    {s.key === "amber" ? "◇" : s.key === "violet" ? "△" : "—"}
                  </span>
                  {s.key === "none"
                    ? "Hands free"
                    : s.key === "amber"
                      ? "Amber diamond"
                      : "Violet triangle"}
                </div>
                <Button
                  className="primary-button action-button"
                  disabled={!view.target || demo || !!error}
                  onClick={() => world.current?.interact()}
                >
                  <span>
                    {view.target
                      ? view.target.label
                      : s.room === 3
                        ? "Follow the path"
                        : s.room === 4
                          ? "Step into the light"
                          : "Move near a control"}
                  </span>
                  {view.target ? <kbd>E</kbd> : <ArrowUpRight size={18} />}
                </Button>
                <span className="keyboard-note">
                  WASD / ARROWS TO MOVE · E TO INTERACT
                </span>
              </div>
            </footer>
          )}
          <div className="live-notice" role="status" aria-live="polite">
            {view.notice}
          </div>
        </>
      )}
      {demo && !s.won && (
        <div className="demo-caption">
          <span>
            {s.room === 0
              ? "01 / CHOOSE"
              : s.room === 1
                ? "02 / CARRY"
                : s.room === 2
                  ? "03 / CONNECT"
                  : "THE WAY HOME"}
          </span>
          <strong>
            {s.room === 0
              ? s.cyan === 1
                ? "Turn the door. Change the destination."
                : "The next room has no bridge."
              : s.room === 1
                ? s.key === "amber"
                  ? "The right key changes the path."
                  : "Match the shape. Open the door."
                : s.room === 2
                  ? gateOpen(s)
                    ? "Both ends agree. Space connects."
                    : "A portal takes two."
                  : s.room === 3
                    ? "Walk across the impossible."
                    : "One last step."}
          </strong>
        </div>
      )}
      {s.won && (
        <section className="completion" aria-label="Game complete">
          <span className="eyebrow">FIVE ROOMS. ONE WAY HOME.</span>
          <h2>
            You folded
            <br />
            the distance.
          </h2>
          <p>Three connections. A way through.</p>
          <Progress
            value={100}
            aria-label="All three puzzles completed"
            className="win-progress"
          />
          <div className="completion-symbols" aria-hidden="true">
            <span>↻</span>
            <span>◇</span>
            <span>⇄</span>
          </div>
          {demo ? (
            <div className="reel-credit">
              <strong>BUILT BY CRUZ GARZA</strong>
              <span>with GPT-6 Astra in Codex</span>
              <span>using Ultra reasoning</span>
            </div>
          ) : (
            <>
              <Button className="primary-button" onClick={reset}>
                Play again
                <RotateCcw size={18} />
              </Button>
              <span className="small-note">
                {saveNote
                  ? "Progress is kept in this session."
                  : verification || "Progress saved on this browser."}
              </span>
            </>
          )}
        </section>
      )}
      <Dialog open={paused} onOpenChange={setPaused}>
        <DialogContent className="help-dialog pause-dialog">
          <DialogTitle>The fold can wait.</DialogTitle>
          <DialogDescription>
            Your puzzle progress stays with this browser when local storage is
            available.
          </DialogDescription>
          <Button className="primary-button" onClick={start}>
            Resume
            <Play size={18} />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              world.current?.resetPosition();
              setPaused(false);
              requestAnimationFrame(() => shell.current?.focus());
            }}
          >
            Return to this room’s entrance
            <HomeIcon size={18} />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost">Reset all game progress</Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="help-dialog">
              <AlertDialogTitle>Begin a new journey?</AlertDialogTitle>
              <AlertDialogDescription>
                This clears only Foldspace’s progress on this browser and
                returns you to Arrival.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep my progress</AlertDialogCancel>
                <AlertDialogAction onClick={reset}>
                  Reset game
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogContent>
      </Dialog>
      {saveNote && !demo && (
        <div className="save-note" role="status">
          {saveNote}
        </div>
      )}
      {error && (
        <div className="error-panel" role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => location.reload()}>
            Reload game
          </Button>
        </div>
      )}
    </main>
  );
}
