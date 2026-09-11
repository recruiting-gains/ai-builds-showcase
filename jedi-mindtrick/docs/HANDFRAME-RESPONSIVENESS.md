# HandFrame responsiveness

The current local correction makes gentle automatic-outline motion follow sooner and schedules hand tracking at a 16 ms minimum in both modes. Person masks run no more often than every 50 ms in the same worker; their processing still delays that frame's hand result. GPU hand inference is preferred where supported, with CPU fallback and one concrete CPU recovery attempt after a GPU detection failure. None of these settings guarantees a frame rate or a particular latency.

Automatic joint smoothing now uses a minimum blend of 0.60, previously 0.24, and follows directly at a displacement of 0.006 normalized image units, previously 0.012. This intentionally accepts more small motion in exchange for less delay. Existing fixed-outline rectangle smoothing is separate.

| Synthetic automatic-outline measurement | Previous | Current local update |
| --- | ---: | ---: |
| Mean position error during gentle movement | 0.002650 | 0.000792 |
| Output RMS for stationary input noise of 0.001 | 0.000139 | 0.000431 |

Values come from the current unit log and are normalized image fractions. Gentle-motion error decreased by about 70%; stationary jitter increased. Both are part of the result. The final local regressions pass 118 application tests, 74 browser checks and eight print-flow scenarios. The deployed HTML, JavaScript, CSS and vision worker match the tested build. These geometry measurements do not establish physical-hand latency. See [automatic outlines](AUTOMATIC-HAND-SHAPES.md) and [continuous palm visibility](PALM-VISIBILITY.md).

## Actual-model benchmark on generated input

A separate local Chrome check ran the actual hand model in HandFrame mode against a generated empty camera stream, with 30 completed samples per backend. Person segmentation was not part of this hand-only comparison.

| Observed backend | Median inference | Median capture-to-result | Completed samples/second |
| --- | ---: | ---: | ---: |
| CPU | 36.2 ms | 37.2 ms | 26.44 |
| GPU | 6.6 ms | 9.5 ms | 57.95 |

The GPU was available and faster in this particular run. These measurements exclude physical hand motion, camera sensor delay and the time until the rendered effect appears. They do not predict accuracy or physical-hand latency, and do not guarantee the same result on another browser or device. The generated-input report is retained locally in ignored `test-results/tracking-benchmark.json`; it contains no physical-camera recording.

## First correction — historical record

The following records the first responsiveness correction. Its scheduling, smoothing and test counts are historical; later changes are described above and in the [3D update](HANDFRAME-3D.md).

A real-camera user reported that the frame followed their hands slowly. The existing UI showed about 30 ms per inference at one observed moment; that is model compute time, not end-to-end tracking latency.

The old 85 ms sampling interval sat behind a 32 ms paint gate. On an otherwise regular 60 Hz animation loop, that combination ordinarily admitted a new sample roughly every 100 ms. The fixed 0.32 smoothing blend then needed six samples to cover 90% of a deliberate position change.

## Changes in that release

- Inference scheduling moved before the paint gate. That release used a 33 ms hand-only minimum and an 85 ms minimum with person segmentation. HandFrame painting used a 16 ms minimum while Invisible retained 32 ms.
- The pipeline keeps one capture/inference in flight, drops intervening frames instead of queuing them, skips unchanged video timestamps and resumes from current input.
- Adaptive smoothing follows larger movements directly while damping small changes. Center and dimensions are filtered separately; existing clipping, teleport rejection and tracking-loss behavior remain.
- Returned frames older than one second are rejected. The app uses capture time for freshness, rather than treating delayed arrival as fresh input.
- Pinch/palm timing, image resolution, local styles and AI submission behavior were unchanged in that release. The later continuous-palm controller retires the old 850 ms visibility toggle.

## Historical evidence

Deployed Cloudflare version: `0b201ccd-a748-4006-97c1-538f5c97c66c`. Live HTML and health checks pass; the deployed JavaScript/CSS bytes match the tested local production build.

That application suite passed **53 tests**, including five added pipeline cases and four added smoothing cases. TypeScript, model integrity, production build and deployment dry run passed through a bounded workflow run for that correction. Its **18 browser checks** also passed locally using generated camera streams and mocked AI responses.

| Synthetic smoothing measurement | Previous | Updated |
| --- | ---: | ---: |
| Samples to reach 90% of a translation | 6 | 2 |
| Samples to reach 90% of a resize | 6 | 2 |
| Mean position error over eight moving samples | 0.023795 | 0.011550 |
| Stationary alternating-noise RMS | 0.000290 | 0.000208 |

Error values are normalized image fractions. These measurements isolate smoothing; they do not establish a physical camera latency, an achieved 30/60 FPS rate, or a guaranteed improvement on every device. Camera frame rate, model work, browser scheduling and rendering still affect the result.

The independent review found no material regression in the bounded change. Source fingerprint: `6ab9cf475a7c2035007cad27f0b877765f003fefff0df9b72c268ce547252e6d`. Physical-camera feel after this update still needs user observation. This correction does not repeat the unchanged live AI provider test; the original release's live image evidence is retained separately.
