# Verification record

Observed September 10, 2026 (America/Chicago). This record separates executed checks from observations that still require a physical device. The reference video is private and is not included as test or demo media.

## Executed checks

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

The application is deployed at [Jedi mindtrick](https://jedi-mindtrick.recruiting-gains.workers.dev). The final application deployment is Cloudflare version `82a11722-2467-42a0-baa3-9d61fb217402`. Live HTML, health/config responses and same-origin model assets loaded successfully. Source is on the `codex/jedi-mindtrick` branch in [draft pull request 10](https://github.com/recruiting-gains/ai-builds-showcase/pull/10); it has not been merged into `main`.

A real FLUX.2 klein 4B image was requested through the deployed HandFrame interface using its original procedural illustration, with no camera or private reference media. The provider returned HTTP 200 `image/jpeg`; returned-image requests observed approximately 4–6 seconds. Visual inspection of the saved browser screenshot confirmed the transformed watercolor scene inside HandFrame and in the selected-image panel, with the app's returned-image status. This demonstrates an actual model return and browser display, not just a mocked response or local color filter.

The auxiliary live image-export helper did **not** finish as an all-passing automated suite. Chromium's response-body observer returned an empty buffer even while the app displayed the image; a subsequent attempt to fetch the displayed blob was blocked by the app's Content Security Policy. Those failed helper observations are preserved separately. They are not relabelled as passing assertions. Live image-display evidence is visual; exact selected-crop submission is covered by the deployed browser request-contract check and actual Worker multipart test.

## Remaining acceptance

**Physical-webcam acceptance remains pending.** A person disappearing/restoring, the moving invisibility portal, two real hands moving HandFrame, short/long pinches, and camera stop must be observed with a real camera. Generated streams, source review and a returned AI illustration cannot substitute for that check. The executable graph retains that external gate as pending.

The repository-wide Security checks run also reports dependency-audit failures in other applications. Its inspected `no-megaphone` job reports a vulnerable older Sharp/Miniflare/Wrangler chain. This project's new lockfile uses Wrangler 4.131.0 and its own dependency audit passes. This record does not claim that every repository-wide check passes or that unrelated applications were repaired.

## Corrections discovered through testing

Independent review corrected stale/duplicate palm triggers, client-midnight ledger partitioning, non-aborting timeout behavior, cleanup preserving its schema and oldest expiry, omitted runtime fingerprints, and cancellation during pending camera startup. Browser checks corrected low-contrast labels and made capture controls wait for model startup. Generated color bars produced person-confidence pixels and were correctly rejected as an empty room; the empty-scene test therefore uses a known blank canvas stream.

The first live model, Stable Diffusion 1.5 img2img, was denied by the account with provider code 5018. A controlled FLUX.2 klein 4B diagnostic succeeded, so the implementation changed to that available model's multipart input and base64 JPEG/PNG output. Provider access failures, ordinary failures and timeouts now have distinct safe responses; diagnostic logs contain a classification/code, not image data or provider messages.

Local reports/screenshots are generated into ignored `test-results/`; checkpoint/event evidence is under ignored `.harness/`. Public source contains no actual camera captures, reference video, private prompts, credential values or personal filesystem paths.
