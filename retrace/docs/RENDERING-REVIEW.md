# ReTrace rendering review — 2026-10-05

This is the authorized cloud rendering pass on `codex/retrace-cloud-preview`,
in `/workspace/retrace-cloud-preview/retrace`. It builds on the imported
midnight redesign, with Git HEAD still
`403f2d1a5114d4f8aa76582f56e7a39146af1e7c` and main/merge-base
`983d5fc71b9794b3d66dbad9777289b889deeaff`. The review checkpoint was local and
uncommitted. The user subsequently approved the screenshots, explicitly
authorized a public preview, and then authorized pushing this review branch
and deploying the approved ReTrace build to its existing Cloudflare Worker.
No merge, production data connection, or Mac filesystem access is included.
Other repositories remain unchanged. Record the confirmed release commit and
deployment separately; this document does not claim a deployment succeeded.

## Visual changes

- Kept the architectural scroll story, dark interior, half-open oak door,
  visitors outside, and explicit simulated/future-concept disclosures.
- Added deterministic timber grain, stone/plaster mottling, fabric weave,
  roof variation, and material-specific roughness. Four small local maps are
  generated in memory; there are no external texture or HDRI downloads.
- Reshaped midnight lighting with a restrained cool rim and a visible warm
  porch lantern. Its exterior-directed spotlight avoids broad room lighting.
  A soft contact mask grounds the foundation.
- Rebuilt visitor silhouettes using tapered clothing, unequal limb poses,
  restrained hair/face planes, and a phone held by one visitor. They remain
  procedural figures, not photorealistic scans.
- Replaced olive foliage blobs with individual leaves and cleared the console
  surface for the router. Regenerated GLB: 2,239,412 bytes, 30,584 triangles,
  53 material-batched meshes (previously 2,273,924 bytes / 31,064 triangles).
- Shortened the roof lift and earlier fade, and added an entrance approach,
  controlled rise, closer cutaway, and field reveal. Mobile framing blends
  continuously and supports reverse scrolling.

## Router and simulated field

The physical router has a light chassis, dark underside, vents, two antennas,
and status lights. It rests on the entry console. Router, pulse shells, source
halo, and projected annotation share `ROUTER_ORIGIN = (3.22, 1.27, 2.5)`.
The origin lies between its antennas; the field is not centred arbitrarily in
the room.

Three expanding spherical wavefronts are clipped at floor height and fade
smoothly. They start at the router and expand spatially through the room.
The labelled source remains visible on desktop and mobile. The neutral
presence is illustrative. These are fictional visualizations, not measured
RF propagation, body heat, temperature, or validated person detection.

The scene provides Pause/Resume pulses. Reduced-motion mode uses static field
shells and fixed chapter poses while retaining user-initiated replay. The
current media preference is synchronized when its listener attaches, closing
a mount-time preference-change race found during QA.

## Usability and performance

- Moved the observatory action into the replay panel. On compact screens,
  editorial and replay content use a shared flow layout; at 320×568 the link
  is no longer covered. Narrow, unusually short viewports can scroll the
  compact content region. Short landscape layouts use two columns.
- Preserved 44px replay controls and selector hit areas. Added main/replay
  semantics, pressed states, keyboard orbit, visible canvas focus, and Escape
  focus return. Natural touch scrolling is restored outside orbit mode.
- Fixed disclosure text contrast. Strengthened the mobile field-stage
  vignette behind the editorial copy.
- Idle scenes stop requesting frames. Orbit redraws on changes. Field pulses
  are capped at 30fps desktop / 20fps compact widths; those are ceilings, not
  measured device performance. Hidden/offscreen scenes stop work. Shadows
  update for geometry changes and use a smaller mobile map. GPU resources and
  late loader results are disposed on exit.
- No dependencies were added or updated. The original simulation, Worker,
  bridge, and sensor contract are unchanged.

## Files and reproducibility

Product source: `src/experience/Experience.tsx`, `HomeScene.tsx`,
`experience.css`, new `sceneMaterials.ts`, and new `sceneDetails.ts`.
Asset source/output: `art/build_house.mjs`, `art/asset-report.json`,
`art/README.md`, and `public/models/retrace-home.glb`.

`scripts/verify-experience.mjs` adds regression coverage for the redesigned
root, router annotation, pulses/pause, keyboard orbit, compact navigation,
reduced motion, fallback, and accessibility. `package.json` exposes it as
`npm run test:experience`. The older browser suite now navigates to
`?observatory` explicitly and accepts `PLAYWRIGHT_EXECUTABLE_PATH`, preserving
its original channel option for other environments.

```sh
cd /workspace/retrace-cloud-preview/retrace
node art/build_house.mjs
npm run build
npm test
npm exec vite -- preview --host 127.0.0.1 --port 5179 --strictPort
# In a separate terminal while preview is running:
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium npm run test:experience
```

Node 24.19.0 / npm 11.9.0 were used. Keep the explicit-file test glob already
in `npm test`; `node --import tsx --test tests` fails on Node24 while
`node --import tsx --test tests/*.test.ts` works.

The existing asset and procedural preview remain fully local. No paid
generation or newly licensed external assets were used. No applicable
studio/Impeccable skill was present in the environment; independent design
and QA reviews were used, with one product-source writer.

## Reference and evidence

The [before/after review sheet](https://chatgpt.com/api/library/files/libfile_1667d88c5bd481918309b279dec5264f/download)
is saved to Library as `ReTrace-Cinematic-Rendering-Review.png`. It combines
unchanged before captures with final desktop and mobile browser captures;
it is a layout of real screenshots, not generated scene imagery.

Final verification:

| Check | Result |
| --- | --- |
| Production build, frontend and Worker TypeScript | Passed |
| Unit tests | 13 passed, 0 failed |
| Redesigned scene/browser regression | 11 groups passed, 0 failed |
| Existing observatory browser regression | 7 groups passed, 0 failed |
| Axe WCAG A/AA checks | 0 violations at 1440px, 390px, 320px |
| Final desktop/mobile screenshots | 9 captured; no page errors or horizontal overflow |
| Git whitespace check | Passed |
| Dependency lockfile | Unchanged |

Scene checks cover desktop/phone keyboard orbit and Escape focus return,
pulse pause/resume, all five replay scenarios, forward/reverse chapters,
four compact replay layouts (including 320×480 and 320×568), observatory
navigation, reduced-motion changes, stopped idle rendering, projected router
position, and failed-model fallback. Accessibility checks cover story stages
0, 2, and 3 at each width. The observatory suite also covers replay exports,
API-offline behavior, sensor fixtures, expiry, and cancelled pending login.
Its command was `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium
RETRACE_URL=http://127.0.0.1:8787 npm run test:browser`, against the local Worker.

The initial import's 12 Worker verification groups also passed; Worker code
was not changed or re-tested in this rendering pass. Its recorded native
slow-viewer/logout socket-close completion limitation remains. The production
build still emits the existing Three.js chunk-size warning. No hardware-GPU
frame-rate claim is made from the software renderer.

Machine-readable scene results: `/workspace/retrace-render-review/qa-results.json`.
Observatory results: `artifacts/browser-results.json` (ignored by Git).
Build, unit, and observatory logs plus final capture metrics are in
`/workspace/retrace-render-review`. The source-delta manifest there records
current hashes against the unchanged imported checkpoint.

The approved Library chat preview `ReTrace-Native4K-v2-CHAT-PREVIEW.mp4`
(`libfile_cdea5b292ba0819196f4085103d63238`) was materialized into this cloud
executor and inspected at 6s and 13s. It is a 15-second 3840×2160 file. The
warm lamp, dark doorway, tactile surfaces and restrained cyan graphics
informed this pass. The separate master was not downloaded or edited.

Before/after captures, QA results, and logs are in
`/workspace/retrace-render-review`. Before images and the original handoff
archive remain intact. Review captures use real Linux Chromium with software
WebGL; they are not hardware performance benchmarks. Google Fonts is blocked
in the executor, so screenshots use system fallback fonts.

The review server at `http://127.0.0.1:5179/` is internal to this cloud
executor. No private forwarding tool is exposed here. Library review images
provided the initial external review surface. The user subsequently approved
a public Cloudflare review URL and then production deployment; neither
authorization permits changes to unrelated products or repositories.

Commit only the reviewed source/assets/tests/docs and push the review branch.
Create a draft PR against `codex/retrace`, preserving unmerged PR32. Before
deployment, verify the original production version remains
`feaf8c42-f8b2-483a-9033-4dfeefb0b262` (recorded 100% deployment
`f5d63320-4a57-49df-a022-c0155bb42ebb`) and retain it as the rollback target.
Preserve existing bindings, secrets, storage and security settings; never copy
secret values. Verify the new version before routing production traffic.

On the Mac, fetch the exact reviewed GitHub commit into a new sibling
worktree, install from the unchanged lockfile, and repeat checks. Leave both
original Mac versions and the original cloud checkout untouched. See
`CLOUD-ENVIRONMENT.md` for the historical import and sync constraints.
