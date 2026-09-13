# Development ownership

The coordinator owns shared contracts, app/camera/invisibility, backend, harness, infrastructure and integration. The feature engineer owns `src/handframe/` and `tests/handframe.test.ts` until its explicit handoff. The independent reviewer owns `tests/acceptance.test.ts` and `docs/REVIEW.md`; implementation is read-only for this reviewer. Shared contracts change only through the coordinator. No concurrent writers to a resource.

The coordinator may use project files, terminal/build tools, the browser, Git and the deployment CLI. The feature engineer may read contracts and edit/test its assigned feature. The independent reviewer may read implementation and write/run assigned tests. Camera frames, reference video and credentials do not enter agent logs or public source. These role boundaries are a collaboration procedure, not an OS sandbox. Independent agents execute in the supported host; the local harness runs explicit checks and tracks handoffs, and does not pretend to spawn models.

Acceptance before implementation: Invisible replaces intended person/portal pixels with the captured background and restores the source; HandFrame bounds/stabilizes its frame, quick pinch advances exactly once, hold at 600 ms captures once and needs release to rearm; original camera feeds tracking; lost tracking cannot fire actions; stop releases resources. Only explicit still submission uploads an image. Provider failures preserve local preview and must not duplicate a request. Live camera acceptance and a real returned AI image are separate from synthetic success.

## Perspective follow-up

For this iteration, the feature engineer owned `src/handframe/index.ts`, `src/handframe/perspective.ts`, `tests/handframe.test.ts` and `tests/perspective.test.ts` until its completed handoff. The coordinator owned the new `src/handframe/surface.ts`, integration, camera changes, surface/lifecycle/browser tests and documentation. The independent critic reviewed source and visual evidence read-only. No resources had concurrent writers. Follow-up acceptance criteria and evidence are in [HandFrame 3D](HANDFRAME-3D.md).

## Phone studio iteration

The camera engineer owned `src/vision/camera.ts`, its orientation helper and their tests. The coordinator owned local photos, finger-corner projection, dashboard UI, integration, browser tests, workflow/CI updates and publication. The independent reviewer inspected the reference and implementation read-only, with private synthetic probes. Checkpoints tracked stage/elapsed/retry budgets. Acceptance and supported runtime boundaries are documented in [Phone studio](PHONE-STUDIO.md).

## Cube mode iteration

The coordinator owns `src/main.ts`, shared contracts, styling, dependency manifests, documentation and release. The Cube controller specialist owns `src/cube/controller.ts` and `tests/cube.test.ts`; the renderer specialist owns `src/cube/renderer.ts`. The independent reviewer owns `scripts/cube-browser-check.mjs` and `docs/CUBE-REVIEW.md`, with read-only access to implementation. Each resource has one writer until handoff. All browser media fixtures are synthetic; physical iPhone acceptance remains pending until observed.

Acceptance: final-canvas blue fill and white wireframe in an encoded and replayed saved clip; raw landmark midpoint/separation with exactly one camera mirror; one completed deliberate pinch/release changes Cube appearance; no HandFrame/photo/still/upload side effects; bounded loss recovery, mode/camera/orientation transitions, graphics failure and cleanup. The private build checkpoint tracks finite elapsed/action/correction budgets; no new agent runtime is embedded in the app.


## Cube appearance and carry correction

For this correction, the controller specialist owned `src/cube/controller.ts` and `tests/cube.test.ts`; the renderer specialist owned `src/cube/renderer.ts`; the browser specialist authored the additional checks in `scripts/cube-browser-check.mjs` without operating a browser. After explicit handoff, the coordinator owned those files, integration/help text, documentation, all browser execution, source publication and the existing Cloudflare release. The independent critic reviewed source and preview/decoded recording images read-only.

Acceptance: readable translucent core and separated cages on dark and bright backgrounds; two-hand sizing, either-hand carry at fixed size with no transition jump, return to sizing; fresh acquisition after loss/reset; no false appearance or photo/still action across those transitions; actual saved and decoded gesture clip; existing mirror/aspect/lifecycle checks. Physical iPhone observation remains distinct from simulated checks.
