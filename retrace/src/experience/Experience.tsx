import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Pause, Play, RotateCcw } from "lucide-react";
import { scenarios, sampleScenario, signalHistory } from "../../shared/scenarios";
import HomeScene from "./HomeScene";

const chapters = ["The arrival", "Beyond the surface", "A possible future", "Your moment"];
const anchors = [0, .32, .63, .94];
export default function Experience() {
  const story = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(() => new URLSearchParams(location.search).has("reduced") || matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [explore, setExplore] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const exploreButton = useRef<HTMLButtonElement>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [failed, setFailed] = useState(() => new URLSearchParams(location.search).has("fallback"));
  const [scenario, setScenario] = useState("movement");
  const [time, setTime] = useState(17.4);
  const [playing, setPlaying] = useState(false);
  const activeScenario = scenarios.find(s => s.id === scenario)!;
  const sample = sampleScenario(scenario, time);
  const history = signalHistory(scenario, time);
  const stage = progress < .2 ? 0 : progress < .5 ? 1 : progress < .78 ? 2 : 3;
  const atReplay = stage === 3;
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = story.current!;
      const rect = el.getBoundingClientRect();
      setProgress(Math.min(1, Math.max(0, -rect.top / (el.offsetHeight - innerHeight))));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onScroll = () => {setExplore(false); schedule();};
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(new URLSearchParams(location.search).has("reduced") || mq.matches);
    mq.addEventListener("change", change);
    change();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", schedule);
    update();
    return () => { cancelAnimationFrame(frame); removeEventListener("scroll", onScroll); removeEventListener("resize", schedule); mq.removeEventListener("change", change); };
  }, []);
  useEffect(() => {
    if (!playing || !atReplay) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), dt = (now - last) / 1000;
      last = now;
      if (document.hidden) return;
      setTime(t => {
        const next = t + dt;
        if (next >= activeScenario.duration) { setPlaying(false); return activeScenario.duration; }
        return next;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [playing, atReplay, activeScenario.duration]);
  function go(index: number) {
    setExplore(false);
    const el = story.current!;
    scrollTo({ top: el.offsetTop + anchors[index] * (el.offsetHeight - innerHeight), behavior: reduced ? "instant" : "smooth" });
  }
  const title = [<>Beyond<br />what you <em>see.</em></>, <>A different<br /><em>perspective.</em></>, <>Imagine the<br /><em>possibility.</em></>, <>Every moment.<br /><em>Retraceable.</em></>][stage];
  const descriptions = [
    "An open door. An unanswered question. A glimpse of what signal exploration could become.",
    "Move around the architecture. Peel back the surface. Follow one continuous point of view.",
    "A visible router. Expanding wavefronts. An imagined view of presence, shown entirely as a simulation.",
    "Explore the working experiment. Pause a simulated signal, move through time, and compare what changed.",
  ];
  return <div className="rt-experience" role="main" data-stage={stage} data-reduced={reduced}>
    <section className="rt-story" ref={story} aria-label="ReTrace interactive architectural concept">
      <div className="rt-stage">
        <div className="rt-scene" aria-label="Interactive 3D home concept">
          {!failed && <HomeScene progress={progress} reduced={reduced} paused={motionPaused} explore={explore} replay={atReplay} position={sample.position} onReady={() => setSceneReady(true)} onFail={() => setFailed(true)} onExitExplore={() => { setExplore(false); exploreButton.current?.focus({ preventScroll: true }); }} />}
          {failed && <div className="rt-fallback"><div className="rt-fallback-house" /><p>Architectural scene unavailable.<br />The simulated replay below remains available.</p></div>}
        </div>
        <div className="rt-vignette" />
        <header className="rt-header">
          <a className="rt-wordmark" href="#" aria-label="ReTrace home">re<span>trace</span><i /></a>
          <span className="rt-header-note">AN EXPERIMENT IN PERSPECTIVE</span>
          <button className="rt-text-link" onClick={() => go(3)}>Explore the demo <ArrowUpRight size={16}/></button>
        </header>
        <div className="rt-concept-label"><span />{atReplay ? "WORKING DEMO · SIMULATED DATA" : "FUTURE CONCEPT · SIMULATED"}</div>
        {stage === 2 && !reduced && <button className="rt-motion-control" aria-pressed={motionPaused} onClick={() => setMotionPaused(value => !value)}>{motionPaused ? <Play size={12}/> : <Pause size={12}/>} {motionPaused ? "Resume pulses" : "Pause pulses"}</button>}
        <div className="rt-content">
        <div className="rt-editorial" key={stage}>
          <div className="rt-kicker">0{stage + 1} / {chapters[stage]}</div>
          <h1>{title}</h1>
          <p>{descriptions[stage]}</p>
          {stage === 0 && <button className="rt-start" onClick={() => go(1)}><span><ArrowDown size={18}/></span>Scroll to explore</button>}
          {stage === 1 && <button ref={exploreButton} className="rt-outline" aria-pressed={explore} onClick={() => setExplore(v => !v)}>{explore ? "Return to the story" : "Explore in 3D"}<RotateCcw size={14}/></button>}
          {stage === 2 && <div className="rt-coming">ReTrace — Coming soon<span>Future concept · Simulated</span></div>}
        </div>
        {explore && <div className="rt-explore-note">Drag or use arrow keys · Escape returns to the story</div>}
        {!sceneReady && !failed && <div className="rt-loading">Preparing the architecture…</div>}
        {atReplay && <div className="rt-replay" role="region" aria-label="Working simulated replay">
          <div className="rt-replay-heading"><span>THE REPLAY LAB</span><span className="rt-source">SIMULATED</span></div>
          <div className="rt-replay-data"><div><small>Signal strength</small><strong>{sample.rssi.toFixed(1)}<span>dBm</span></strong></div><div className="rt-clock">{String(Math.floor(time)).padStart(2, "0")}<span>.{Math.floor((time + 1e-6) * 10) % 10} / {activeScenario.duration}s</span></div></div>
          <svg className="rt-chart" viewBox="0 0 500 70" preserveAspectRatio="none" role="img" aria-label="Simulated signal history"><path d="M0 20H500 M0 45H500" className="rt-chart-grid"/><polyline points={history.map((v, i) => `${i / Math.max(1, history.length - 1) * 500},${Math.max(4,Math.min(66,55-(v.rssi+66)*5))}`).join(" ")} /></svg>
          <div className="rt-replay-controls"><button aria-label={playing ? "Pause simulated replay" : "Play simulated replay"} onClick={() => { if(time >= activeScenario.duration) setTime(0); setPlaying(p => !p); }}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><input aria-label="Simulation time in seconds" type="range" min={0} max={activeScenario.duration} step={.1} value={time} onChange={e => {setPlaying(false);setTime(+e.target.value);}}/><button aria-label="Restart simulated replay" onClick={() => {setTime(0);setPlaying(false);}}><RotateCcw size={17}/></button></div>
          <div className="rt-replay-footer"><select aria-label="Simulated scenario" value={scenario} onChange={e => {setScenario(e.target.value);setTime(0);setPlaying(false);}}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select><span>Illustrative position · not a detection</span></div>
          <a className="rt-replay-open" href="?observatory">Open the full observatory <ArrowUpRight size={15}/></a>
        </div>}
        </div>
        <footer className="rt-chapters"><span className="rt-scroll-hint">{explore ? "MANUAL ORBIT" : "SCROLL TO DISCOVER"}</span><nav aria-label="Story chapters">{chapters.map((c,i) => <button key={c} onClick={() => go(i)} aria-current={stage === i ? "step" : undefined}><b>0{i+1}</b><span>{c}</span><i style={{transform:`scaleX(${Math.min(1,Math.max(0,(progress-anchors[i])/.22))})`}}/></button>)}</nav><span className="rt-location">CONCEPT STUDY / 001</span></footer>
      </div>
    </section>
    <section className="rt-after"><span className="rt-kicker">THE EXPERIMENT TODAY</span><h2>Curiosity, made <em>interactive.</em></h2><div><p>The concept above imagines a future interface. Today's ReTrace lets you explore five simulated scenarios, inspect signal charts, and replay a moment. A separate connection accepts structured sensor data.</p><a href="?observatory" className="rt-solid">Enter the observatory <ArrowUpRight size={18}/></a></div><p className="rt-truth">No physical sensing hardware or person-detection model has been validated. The presence silhouette is illustrative.</p><a className="rt-source-link" href="https://github.com/recruiting-gains/ai-builds-showcase/tree/codex/retrace/retrace">View the source ↗</a></section>
  </div>;
}
