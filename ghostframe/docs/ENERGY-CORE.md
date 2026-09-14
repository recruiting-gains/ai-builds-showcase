# Living Energy Core — first prototype

Status: implemented on the isolated `codex/ghostframe-energy-core` branch. Production is unchanged. This upgrade affects Cube only; Invisible and HandFrame keep their existing behavior.

## Try the working example

Run the existing setup (`npm ci`, `npm run assets`), then `npm run dev`. Choose **Cube**, then **Living Energy Core** in **Light style**. With the camera off, drag or use the position/size sliders. With a camera, existing two-hand sizing, one-hand carry and pinch/release color changes remain. Faster movement raises the internal light briefly; stillness settles it. Select **Classic Cube** to compare the original look.

`energy-proof.html` is a developer-only Vite entry for the synthetic browser matrix and a six-second local recording. `mobile-proof.html` embeds the app in a real 390px CSS viewport for layout inspection. Neither entry is included in the production Vite build. These do not use a real camera or stand in for a physical iPhone test.

## Architecture

```text
Camera → existing local hand detector → CubeController
                                         ├─ accepted measurement → EnergyResponse.sample
                                         └─ held visual pose ────────────────┐
Paint clock → EnergyResponse.advance → bounded light state                  │
                                             └──────── CubeRenderer ←───────┘
Camera canvas + transparent WebGL layer → existing composed canvas → recorder
```

`measurementAt(timestamp)` exposes only a newly accepted input, not the controller's brief held visual pose. Motion speed uses measurement time; animation and settling use paint time. Missing/rejected input, discontinuities and lifecycle boundaries reset the decorative state. No new tracking model or gesture decision is introduced.

Renderer keeps DPR 1, the 768px long-edge cap and 192 particles. Three reusable 48×4-segment strips add contained depth; no per-frame geometry allocation, postprocessing render targets, history trails or camera sampling. Phase periods match across the particle loop and respawn emission tapers. Classic disables the new strips and restores original color/opacity and particle behavior. Reduced motion freezes time and surge; direct controls remain usable.

No new backend, database, account, microphone, camera/photo upload endpoint, or live Runway call. The existing optional **Send still to AI** remains a separate explicit action. Local Vite config lookup fails closed to AI disabled. No secrets or generated Studio media are part of this branch.

## Verified September 14, 2026

- TypeScript checks and production build passed. The existing large lazy-loaded Three.js chunk warning remains (new renderer gzip about133.29kB); this is not a mobile performance pass.
- 293 unit tests passed, including10 new energy tests;14 existing harness tests passed.
- Energy tests cover varied independent tracking/paint rates, decay, clamps, invalid/reversed/repeated time, resizing, carry transition, loss/reacquisition through the real controller, explicit resets and reduced motion. Existing controller tests still verify ten deliberate pinch/releases produce ten changes.
- Actual browser component matrix passed12 combinations:360×640/640×360, dark/bright backgrounds, sizes0.15/0.38/0.65. It checks successful rendering, visible change from Classic and no changed pixels outside the central80% area (RGB difference threshold8).
- Strict byte comparisons passed for static reduced motion including the first post-resize draw, and for Classic restoration. The test reuses identical background pixels so unrelated ellipse edge rasterization cannot masquerade as effect motion. All compared renderer calls must succeed.
- Disposal fails closed and an explicitly created renderer recovers. A real WebGL-context-loss event was not tested this pass.
- Actual browser compositor→MediaRecorder→decode proof passed:6.0008s H.264,360×640,937138bytes, roughly30 encodedfps, silent. Decoded color detection found8753 qualifying energy-object pixels. The separate full-file FFmpeg decode passed. This is component-level synthetic recording, not the complete app recording-button or real-camera pipeline.
- 390px iframe layout/control inspection and desktop simulated Cube inspection performed. Browser viewport emulation was not treated as proof of a real device.

## Review and remaining gates

Independent review found cadence amplification, loss/reacquisition rearming and a phase-loop discontinuity; these were corrected and tests added. A manual-mode callback reset was also corrected. No production deployment, source push, physical camera test or sustained thermal benchmark is claimed.

Before release, perform paired60-second Classic/Energy runs on the actual iPhone with camera+tracking+recording: target median cadence≥30fps, p95display interval≤50ms, no effect-related freeze>250ms and≤10%regression versus baseline. Measure rather than infer. Verify ten pinch/release changes, brief hand loss, carry, camera switch, stop/page-hide cleanup, portrait/landscape/mirror mapping, actual recorded replay and native saving. If baseline misses the targets, investigate or lower quality—do not redefine a failure as a pass.

The separate Studio concept uses editable Blender geometry and a Runway-generated appearance texture. It is look development, explicitly labeled **CONCEPT / NOT LIVE CAMERA**, not evidence that the app renders the same complexity or runs on a phone.
