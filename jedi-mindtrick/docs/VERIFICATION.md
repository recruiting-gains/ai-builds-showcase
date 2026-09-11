# Verification record

Observed September 10, 2026 (America/Chicago). This record separates executed checks from observations that still require a physical device. The reference video is private and is not included as test or demo media.

## HandFrame responsiveness update

A subsequent user-reported lag correction passes **53 application tests** and **18 local browser checks**. See [the scoped changes and before/after synthetic measurements](HANDFRAME-RESPONSIVENESS.md). The records below describe the original release, including its separate live AI observations.

## Original release checks

- **44 application tests passed:** compositor/portal pixels, mirrored geometry, pinch and palm timing, tracking loss, camera lifecycle races, mask-copy behavior, input limits and real Worker source with mocked AI/in-memory SQLite. The Worker cases include the exact FLUX multipart crop, PNG/JPEG handling, invalid/oversized output, provider denial, timeout/abort, duplicate protection, daily budget and expiry scheduling.
- **14 harness tests passed:** parallel dependency order, retries only with declared changed inputs, three-attempt cap, step/time bounds, exclusive lock, checkpoint-before-action, interrupted side-effect protection, source-bound external receipts and runtime-asset fingerprints.
- The successful fixture graph completed. The deliberate-failure graph stopped, then completed in the same run after an explicit correction; the failed node's attempt counter advanced from one to two.
- Frontend and Worker TypeScript checks, pinned asset verification, production build and Cloudflare deployment dry run passed through the actual project harness. Its current source fingerprint is `f62ade10368aae3a531fd53350cc9210610abc9e23c3228c8b57558a40bad103`.
- **18 browser checks passed**, both locally and against the deployed app in isolated desktop Chrome. They cover rendered Invisible changes/restoration, portal and style/layout controls, no upload during local controls or still preparation, provider-compatible crop dimensions, explicit selected-crop submission, mock image display/failure recovery, desktop/390px layout and no uncaught page errors.
- Automated axe WCAG A/AA scan found no violations in the tested HandFrame state. This is not a complete accessibility certification or a substitute for manual usability review.
- Actual MediaPipe models initialized and processed generated test camera streams. A controlled blank canvas stream passed five-second empty-background calibration. Camera stop returned to the labelled simulated preview. These are browser/model integration checks, not physical-webcam gesture acceptance.
- Network inspection during those browser tests found requests only to the application's origin. Their AI success/failure was intercepted, so the 18-check suite made no provider call.
- `npm audit --audit-level=moderate --ignore-scripts` reported **zero vulnerabilities** for this project's lockfile.

## Live publication and image result

The application is deployed at [Jedi mindtrick](https://jedi-mindtrick.recruiting-gains.workers.dev). The original release deployment is Cloudflare version `82a11722-2467-42a0-baa3-9d61fb217402`. Live HTML, health/config responses and same-origin model assets loaded successfully. Source is on the `codex/jedi-mindtrick` branch in [draft pull request 10](https://github.com/recruiting-gains/ai-builds-showcase/pull/10); it has not been merged into `main`.

A real FLUX.2 klein 4B image was requested through the deployed HandFrame interface using its original procedural illustration, with no camera or private reference media. The provider returned HTTP 200 `image/jpeg`; returned-image requests observed approximately 4–6 seconds. Visual inspection of the saved browser screenshot confirmed the transformed watercolor scene inside HandFrame and in the selected-image panel, with the app's returned-image status. This demonstrates an actual model return and browser display, not just a mocked response or local color filter.

The auxiliary live image-export helper did **not** finish as an all-passing automated suite. Chromium's response-body observer returned an empty buffer even while the app displayed the image; a subsequent attempt to fetch the displayed blob was blocked by the app's Content Security Policy. Those failed helper observations are preserved separately. They are not relabelled as passing assertions. Live image-display evidence is visual; exact selected-crop submission is covered by the deployed browser request-contract check and actual Worker multipart test.

## Remaining acceptance

**Physical-webcam acceptance remains pending.** A person disappearing/restoring, the moving invisibility portal, two real hands moving HandFrame, short/long pinches, and camera stop must be observed with a real camera. Generated streams, source review and a returned AI illustration cannot substitute for that check. The executable graph retains that external gate as pending.

The repository-wide Security checks run also reports dependency-audit failures in other applications. Its inspected `no-megaphone` job reports a vulnerable older Sharp/Miniflare/Wrangler chain. This project's new lockfile uses Wrangler 4.131.0 and its own dependency audit passes. This record does not claim that every repository-wide check passes or that unrelated applications were repaired.

## Corrections discovered through testing

Independent review corrected stale/duplicate palm triggers, client-midnight ledger partitioning, non-aborting timeout behavior, cleanup preserving its schema and oldest expiry, omitted runtime fingerprints, and cancellation during pending camera startup. Browser checks corrected low-contrast labels and made capture controls wait for model startup. Generated color bars produced person-confidence pixels and were correctly rejected as an empty room; the empty-scene test therefore uses a known blank canvas stream.

The first live model, Stable Diffusion 1.5 img2img, was denied by the account with provider code 5018. A controlled FLUX.2 klein 4B diagnostic succeeded, so the implementation changed to that available model's multipart input and base64 JPEG/PNG output. Provider access failures, ordinary failures and timeouts now have distinct safe responses; diagnostic logs contain a classification/code, not image data or provider messages.

Local reports/screenshots are generated into ignored `test-results/`; checkpoint/event evidence is under ignored `.harness/`. Public source contains no actual camera captures, reference video, private prompts, credential values or personal filesystem paths.

## Four additional worlds

Aurora, Deep sea, Golden hour and Cosmic expand HandFrame to eight local filters. The same catalog drives the controls and pinch cycle; all eight styles are accepted by the selected-still endpoint. Changing worlds on a returned image applies local colors to its original bitmap, and returning to its submitted look restores that image. Prepared crops explicitly name their frozen look.

The update passed 71 application tests and 25 browser checks, including distinct rendered output for all eight worlds, a world change during an in-flight mocked render, original-image restoration, noncompounding filters, one-request submission, and all eight exact-crop/allowlisted-prompt Worker routes. An independent source and screenshot review found no material blocker. No live AI request was made for this palette update; new AI prompt aesthetics have not been judged from real provider outputs.

Run `1789095905313-66b71cc8-31fc-4124-8539-15605609d9f8` passed all six command nodes on attempt 1. Source fingerprint: `336ddf9e03032e329482830aeeb617e43eb19f1bef16deb58191f0ec9ab96b9a`. Cloudflare version: `ab95748c-b83e-4999-8757-7a7c24529266`. Live HTML/health respond successfully; JavaScript and CSS match the tested production build. Physical-camera acceptance remains separate from generated camera and landmark fixtures.

## Three print worlds and texture reuse

Risograph, Cyanotype and Stippling bring the catalog to eleven worlds. Stable grain and antialiased dots follow the picture on the existing perspective surface. The renderer reuses unchanged textures while continuing to draw each changing pose. See [print implementation and measurements](PRINT-FILTERS.md).

The update passes 78 application tests, 25 browser checks and eight controlled flow scenarios. Each flow scenario paints 120 changing poses in about two seconds; frozen styles rebuild their texture once, compared with 120 times in the baseline. Five responsive widths from 320 to 1440 pixels were checked after a final mobile grid adjustment. Independent source and screenshot review found no material blocker. New AI styles use mocked provider coverage; physical-hand latency and new paid-provider aesthetics remain unverified.

Run `1789096871671-96d888a5-a9d4-430c-8267-f6fffcbe9f07` passed all six command nodes on its third source revision, within the three-attempt limit. Source fingerprint: `304e5d8aacc2506e3f2f6f27568aeb6d9d93528a26fcc330e47c206c6cb99f3d`. Cloudflare version: `72ea1944-fbc0-425d-93a3-2dcf22b0d259`. Live HTML and health returned HTTP 200; JavaScript and CSS bytes match the tested production build.

## Fullscreen camera and custom shapes

The new Full screen control hides the surrounding page and preserves the camera session. Native fullscreen and tab-sized fallback, camera-only viewing, fit/fill and exit controls are implemented. Six preset outlines and a custom 3–12-point polygon editor clip HandFrame in perspective. [Controls, implementation and verification](FULLSCREEN-SHAPES.md).

88 application tests, 25 existing browser checks, 11 shape browser checks and nine fullscreen cases passed. Native Chrome fullscreen was accepted. Rejection, absent APIs, delayed completion races and generated-camera disconnection were exercised explicitly. The shape checks include 18 preset/perspective clipping combinations, a concave custom outline, invalid drafts, pointer cancellation, keyboard editing and responsive layouts. No physical camera or AI provider call was used. All eight print-flow scenarios continue to pass.

Run `1789098181049-d539f7a8-4dca-4227-9122-7a6f82cd7026` passed all six command nodes on attempt 1. Source fingerprint: `34e4329576d0704a5bd572949fe19dc542a8392ea3405d11f38292707598170f`. Publication is pending: the deploy command stopped before upload because Cloudflare authentication expired and could not refresh. The new source and local preview are ready; this record does not claim the fullscreen/shape update is on the live URL yet.


## Automatic hand outlines and fullscreen publication

HandFrame now follows the opening between both thumbs and index fingers by default. Joint-chain contours preserve inward bends without selecting a preset; optional saved shapes and custom drawing remain available. Pinch actions are disabled while automatic following is enabled. The fullscreen camera update described above is included in this publication. See [automatic controls and limits](AUTOMATIC-HAND-SHAPES.md).

102 application tests and 55 browser checks passed: 25 existing behavior checks, 11 optional shape/editor checks, nine fullscreen cases and ten automatic-outline integration checks. These include actual pixels in a concave heart notch, changing outlines without preset clicks, both depth directions, lost/weak/malformed/crossed tracking recovery, no gesture-triggered uploads, returned mock-image clipping and camera restart. Eight print-flow scenarios passed with 120 changing poses each and 95th-percentile paint intervals of 17.1–17.6 ms. These are controlled renderer measurements, not physical-hand latency.

The new test file changed the harness test-command graph, so resuming the preceding run correctly stopped with a graph-change message. Explicit new run `1789099711637-f7bed5e9-500e-4f25-bbe7-8baced51ea9b` passed all six command nodes on attempt 1, within the same 30-step/90-minute/three-attempt limits. Source fingerprint: `b8da5b836e4b40de957d873cd8483c614ef4657f7530320e72e94b9089eb947b`. No retry budget was reset to work around a failing command.

Cloudflare version `832b8cc3-8542-440f-993a-3ed742b74652` was published after normal account sign-in restored access. Live HTML and health returned HTTP 200, and both JavaScript and CSS exactly match the tested production build. Source remains on the draft PR branch. The earlier expired-auth publication blocker is resolved.

Independent source review found and corrected a sparse/missing-palm validation hole before publication. The critic independently reproduced safe rejection and neutral recovery after the fix. The browser driver's first restart test sent a fixture to the previous worker; waiting for the new camera-on state fixed the test and all ten cases passed. No physical camera, private reference media or AI provider call was used for this update. The physical-camera and current-source real-provider gates remain unobserved, separate from publication proof.


## Continuous palm visibility, hand coverage and fullscreen recovery

Invisible now starts with a clearly open palm at fully visible. Closing that same hand continuously increases disappearance; reopening restores the original picture. Tracked finger, palm and short forearm coverage supplements the person mask so a missed raised hand can disappear with the body. Coverage is an approximation from joints, not exact skin segmentation. Missing, malformed, stale or ambiguous hands disarm control until a clear open palm returns. Saved-room calibration requires a fresh person mask as well as fresh tracking messages.

The update passes **118 application tests, 74 local browser checks and eight print-flow scenarios**. The browser total comprises 25 existing behavior checks, 11 saved-shape/editor checks, 19 fullscreen cases, ten automatic-outline cases and nine new palm cases. All nine palm cases also passed against the deployed app with generated camera colors and synthetic landmarks. They verify gradual body/hand pixel blending, exact visible/hidden endpoints, fresh-mask calibration, tracking loss/reacquisition, portal separation, camera reset and no uploads. No physical camera or AI provider was used for these automated cases.

Hands now prefer a GPU delegate, with CPU fallback during initialization and one CPU recovery attempt after a GPU detection error. Both modes admit fresh hand samples at a minimum 16 ms interval; person masks have a minimum 50 ms interval in the same worker. There remains one job in flight. An actual-model benchmark on generated empty-camera input measured median capture-to-result times of 37.2 ms on CPU and 9.5 ms on GPU. This is pipeline evidence on the tested machine, not physical-hand latency or a universal speed guarantee. Reduced contour smoothing lowered measured gentle-motion position error by about 70%, while stationary RMS jitter increased from 0.000139 to 0.000431 normalized image units. The eight print scenarios retained 95th-percentile paint intervals of 17.2–17.5 ms. [Measurements and tradeoffs](HANDFRAME-RESPONSIVENESS.md).

Fullscreen expands the document immediately, then attempts native fullscreen as an optional enhancement. Added cases cover WebKit APIs, stalled/rejected entry and exit, unsupported inert/focus behavior, focus restoration, late completion races, and transient versus sustained page hiding. The first expanded-suite attempt passed 14 of 19 cases; it exposed a test fixture that left the real WebKit alias active and a native-exit focus restoration gap. Both were corrected before the final 19-case pass. The failed report is retained locally rather than counted as a passing run.

A targeted check in the user's existing embedded browser successfully opened and exited fullscreen; the original failure was not reproduced. After publication, a separate embedded tab using the simulated preview expanded the camera to the full 1920×1080 document, successfully toggled Fill view and Just camera, then restored the controls and entry-button focus. This verifies the deployed embedded-browser controls without claiming a new physical-camera session was tested.

The new test file changed the harness command graph, requiring explicit run `1789100994773-ce2d7e44-dc3e-4c83-ae71-673a836cf003`. After the fresh-mask correction, all six command nodes passed on attempt 2, within 12 steps and the configured 30-step/90-active-minute/three-attempt limits. Source fingerprint: `def5c78ed15fa6d822c716a203ee29c8d6014215150f3698c739d6c686f07417`. Independent review also corrected an outlier finger-bone mask and reviewed fullscreen generation/focus safety.

Cloudflare version `c475b4c1-4005-4574-b9c5-aca2a066d385` is deployed. Live HTML and health returned HTTP 200; HTML, JavaScript, CSS and `vision-worker.js` exactly match the tested production build. Source remains on the draft pull-request branch. Physical-camera accuracy/latency and a current-source real-provider image return remain separate, unobserved acceptance gates. No camera or private reference images were uploaded for this update.
