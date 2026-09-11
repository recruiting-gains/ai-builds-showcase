# Verification record

This record separates executed checks from observations that still require a real device or provider. The reference video is private and is not included as test or demo media.

## Executed locally

- **39 application tests passed:** compositor/portal pixels, mirrored geometry, pinch and palm timing, tracking loss, camera lifecycle races, mask-copy behavior, input limits and real Worker source with mocked AI/in-memory SQLite.
- **14 harness tests passed:** parallel dependency order, retries only with declared changed inputs, three-attempt cap, step/time bounds, exclusive lock, checkpoint-before-action, interrupted side-effect protection, source-bound external receipts and runtime-asset fingerprints.
- The successful fixture graph completed. The deliberate-failure graph stopped, then completed in the same run after an explicit correction; the failed node's attempt counter advanced from one to two.
- Frontend and Worker TypeScript checks, pinned asset verification, production build and Cloudflare deployment dry run passed through the actual project harness. It stopped at `awaiting-evidence` with publication, webcam and real-AI gates pending.
- **17 browser checks passed** in isolated desktop Chrome, including rendered Invisible changes/restoration, portal and style/layout controls, no upload while using local controls or preparing a still, explicit crop submission and returned-image display with a mock provider, failure recovery, desktop/390px mobile layout, and no uncaught page errors.
- Automated axe WCAG A/AA scan found no violations in the tested HandFrame state. This is not a complete accessibility certification or a substitute for manual usability review.
- Actual MediaPipe models initialized and processed generated test camera streams. A controlled blank canvas stream passed five-second empty-background calibration. Camera stop returned to the labelled simulated preview. These are browser/model integration checks, not physical-webcam gesture acceptance.
- Network inspection during the browser tests found requests only to the application's origin. AI success/failure was intercepted by the test, so this run made no provider call.

## Corrections discovered through testing

The independent review corrected stale/duplicate palm triggers, a request-ledger midnight partition issue, non-aborting timeout behavior, ledger cleanup preserving its schema and new claims, omitted runtime asset fingerprints, and unavailable cancellation during pending camera startup. Browser checks corrected low-contrast labels and ensured capture controls wait for model startup. Chromium's generated color bars produced some person-confidence pixels and were correctly rejected as an empty room; the empty-scene test therefore uses a known blank canvas stream.

## External verification

Publication, live provider response and physical-webcam acceptance must be recorded separately. Until their observed evidence is added, the executable graph keeps those gates pending. A prompt, source review or mocked image must not mark them passed.

Local reports and screenshots are generated into ignored `test-results/`; checkpoint/event evidence is under ignored `.harness/`. Public source contains no actual camera captures, reference video, raw prompts, credential values or personal filesystem paths.
