# Development ownership

The coordinator owns shared contracts, app/camera/invisibility, backend, harness, infrastructure and integration. The feature engineer owns `src/handframe/` and `tests/handframe.test.ts` until its explicit handoff. The independent reviewer owns `tests/acceptance.test.ts` and `docs/REVIEW.md`; implementation is read-only for this reviewer. Shared contracts change only through the coordinator. No concurrent writers to a resource.

The coordinator may use project files, terminal/build tools, the browser, Git and the deployment CLI. The feature engineer may read contracts and edit/test its assigned feature. The independent reviewer may read implementation and write/run assigned tests. Camera frames, reference video and credentials do not enter agent logs or public source. These role boundaries are a collaboration procedure, not an OS sandbox. Independent agents execute in the supported host; the local harness runs explicit checks and tracks handoffs, and does not pretend to spawn models.

Acceptance before implementation: Invisible replaces intended person/portal pixels with the captured background and restores the source; HandFrame bounds/stabilizes its frame, quick pinch advances exactly once, hold at 600 ms captures once and needs release to rearm; original camera feeds tracking; lost tracking cannot fire actions; stop releases resources. Only explicit still submission uploads an image. Provider failures preserve local preview and must not duplicate a request. Live camera acceptance and a real returned AI image are separate from synthetic success.

## Perspective follow-up

For this iteration, the feature engineer owned `src/handframe/index.ts`, `src/handframe/perspective.ts`, `tests/handframe.test.ts` and `tests/perspective.test.ts` until its completed handoff. The coordinator owned the new `src/handframe/surface.ts`, integration, camera changes, surface/lifecycle/browser tests and documentation. The independent critic reviewed source and visual evidence read-only. No resources had concurrent writers. Follow-up acceptance criteria and evidence are in [HandFrame 3D](HANDFRAME-3D.md).
