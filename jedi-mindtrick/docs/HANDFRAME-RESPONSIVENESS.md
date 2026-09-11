# HandFrame responsiveness

This records the first responsiveness correction. The [subsequent 3D and response update](HANDFRAME-3D.md) supersedes its 33 ms scheduling and smoothing settings; the evidence below remains historical.

A real-camera user reported that the frame followed their hands slowly. The existing UI showed about 30 ms per inference at one observed moment; that is model compute time, not end-to-end tracking latency.

The old 85 ms sampling interval sat behind a 32 ms paint gate. On an otherwise regular 60 Hz animation loop, that combination ordinarily admitted a new sample roughly every 100 ms. The fixed 0.32 smoothing blend then needed six samples to cover 90% of a deliberate position change.

## Changes

- Inference scheduling now runs before the paint gate. Hand-only mode has a 33 ms minimum; person segmentation retains 85 ms. HandFrame painting uses a 16 ms minimum while Invisible retains 32 ms.
- The pipeline keeps one capture/inference in flight, drops intervening frames instead of queuing them, skips unchanged video timestamps and resumes from current input.
- Adaptive smoothing follows larger movements directly while damping small changes. Center and dimensions are filtered separately; existing clipping, teleport rejection and tracking-loss behavior remain.
- Returned frames older than one second are rejected. The app uses capture time for freshness, rather than treating delayed arrival as fresh input.
- Pinch/palm timing, image resolution, local styles and AI submission behavior are unchanged.

## Evidence

Deployed Cloudflare version: `0b201ccd-a748-4006-97c1-538f5c97c66c`. Live HTML and health checks pass; the deployed JavaScript/CSS bytes match the tested local production build.

The current application suite passes **53 tests**, including five added pipeline cases and four added smoothing cases. TypeScript, model integrity, production build and deployment dry run passed through a new bounded workflow run for this correction. The existing **18 browser checks** also passed locally using generated camera streams and mocked AI responses.

| Synthetic smoothing measurement | Previous | Updated |
| --- | ---: | ---: |
| Samples to reach 90% of a translation | 6 | 2 |
| Samples to reach 90% of a resize | 6 | 2 |
| Mean position error over eight moving samples | 0.023795 | 0.011550 |
| Stationary alternating-noise RMS | 0.000290 | 0.000208 |

Error values are normalized image fractions. These measurements isolate smoothing; they do not establish a physical camera latency, an achieved 30/60 FPS rate, or a guaranteed improvement on every device. Camera frame rate, model work, browser scheduling and rendering still affect the result.

The independent review found no material regression in the bounded change. Source fingerprint: `6ab9cf475a7c2035007cad27f0b877765f003fefff0df9b72c268ce547252e6d`. Physical-camera feel after this update still needs user observation. This correction does not repeat the unchanged live AI provider test; the original release's live image evidence is retained separately.
