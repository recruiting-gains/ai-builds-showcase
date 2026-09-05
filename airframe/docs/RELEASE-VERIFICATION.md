# Airframe release verification

This report records the original **browser** release. The separate native companion has its own [safety and verification notes](../native/docs/SAFETY.md); its permissions and system-pointer capabilities are not part of the browser sandbox.

Verified on September 4, 2026 in America/Chicago (September 5 UTC).

- **Live website:** https://airframe.recruiting-gains.workers.dev/
- **Source:** https://github.com/recruiting-gains/ai-builds-showcase/tree/main/airframe
- **Cloudflare version:** `4dcc74a7-c052-408a-bb66-24c59a4a57b0`
- **Scope:** original browser-contained gesture workspace. No native desktop-control companion.

## Observed results

| Check | Result | Evidence boundary |
| --- | --- | --- |
| TypeScript | Browser and Worker checks passed | Compilation/type checks, not runtime accuracy |
| Unit tests | 67 passed: 45 backend/schema/runtime-export tests and 22 gesture/camera-lifecycle tests | Gesture inputs and camera lifecycle fixtures are synthetic/mocked |
| Build and deployment dry run | Passed; pinned model verified | Nonfatal main-bundle size warning remains; no performance score is claimed |
| Actual local Wrangler runtime | 11 HTTP/security checks passed | Real Worker runtime, not only mocked route tests |
| Local browser suite | 19 check groups passed | Chromium at 1440 px and 380 px, including actual touch-event input |
| Public browser suite | All 19 groups passed at `2026-09-05T03:22:00.498Z` | Same deployed site, isolated browser contexts, camera intentionally denied |
| Automated accessibility | No serious or critical axe violations in tested states | Not a screen-reader or accessibility certification |
| Real vision-model smoke | Actual GPU inference and actual GPU-init failure followed by successful CPU inference | One official public hand photograph; one hand and 21 landmarks in both paths, not a physical webcam trial |
| Public release HTTP checks | Passed at `2026-09-05T03:22:01.819Z` | Homepage exactly matches built HTML; health, presets, valid/invalid layout requests, JSON 404, security headers, screenshot, runtime, and notices verified |
| Published model integrity | 7,819,105 bytes and expected SHA-256 | Project pin from Google's official HTTPS file, not a publisher-signed checksum |

Both browser suites observed zero unexpected browser exceptions and zero third-party browser requests. Camera access was absent before explicit opt-in. The permission-denial test made exactly one deliberate camera request after real model initialization; its test harness denied access. **No physical camera was opened during testing.**

The real-model smoke test ran against built Worker assets with the application's Content Security Policy. It fetched Google's public reference photograph for the test only, without committing or deploying that photograph. The browser then used same-origin test input and real model/WASM files. No hand-detection results were fabricated for that test.

## Reproduce the checks

See [the README](../README.md), [test plan](TEST-PLAN.md), [tracking notes](TRACKING.md), and [deployment guide](DEPLOYMENT.md). The scripts retain structured reports in ignored `test-results/` directories when an output directory is specified. The public site contains no test-injection hook.

The repository includes a path-scoped [GitHub Actions workflow](../../.github/workflows/airframe.yml) for a clean Node 24 installation, type checks, unit tests, production build, deployment dry run, and actual local Worker HTTP smoke. Public deployment is deliberate, not an automatic side effect of that workflow.

## Still requires hands-on acceptance

- A consenting person's actual webcam gestures: aiming, pinching, holding, releasing, losing/reacquiring the hand, and emergency stop.
- Tracking comfort and reliability across lighting, distance, skin tones, hand shapes, camera quality, and device speed. No population-wide accuracy claim is made.
- Real iPhone/Safari camera behavior and assistive-technology/screen-reader testing. A mobile Chromium viewport is not equivalent to testing an iPhone.
- Larger-scale performance or traffic/load testing.

Mobile panels can overlap in the spatial canvas; tested handles remain reachable and panels can be moved with touch. The first tracking start downloads a model and runtime, so it can take a moment and uses data. Basic mouse, keyboard, and touch exploration does not require camera permission.

## Product and privacy limits

Airframe moves its own panels, not the operating-system cursor or other applications. It does not record/upload video, request a microphone, perform cloud AI inference, or save hand landmarks. Saving sends only a layout for stateless validation, then stores it in that browser. There is no account, database, cloud backup, or cross-device sync. Ordinary Cloudflare hosting metadata may still be logged as described in the README.
