# LoopLab release verification

Verified September 4, 2026. Public installation: [Open LoopLab](https://looplab.recruiting-gains.workers.dev/).

## What passed

| Check | Observed result |
| --- | --- |
| TypeScript, production frontend build, Worker deployment dry run | Passed |
| Automated tests | 81 passed: 46 grading, 21 Worker/storage/inference, 14 summaries/verdicts |
| Offline grading harness | 32 handwritten controls passed; ten frozen public cases |
| Database deployment | Both migrations applied; tables, quota triggers, and experiment fingerprint column verified remotely |
| Real browser interface check | Completed comparison, field inspector, keyboard dialogs, filtering, export, promotion, pause/start-fresh, stale-deployment rejection, reduced motion, and illustrated fallback passed |
| Responsive layout | No horizontal overflow at 320, 390, or 768 CSS pixels in the automated checks; desktop and mobile screenshots visually reviewed |
| Automated accessibility | Zero violations reported for the tested initial page and result dialog under axe WCAG 2 A/AA and 2.1 AA tags |
| Live end-to-end experiment | One creation, ten step requests, twenty real responses, no service errors; raw outputs independently regraded |
| Export | Answer keys and full experiment provenance matched the released source |
| Recovery | Same-tab refresh restored the completed run |
| Isolation | No session received 401; a different session received 404 for the original run; cross-site step request received 403 |
| Browser errors | Zero uncaught page errors during the completed live check |
| Runtime dependency audit | `npm audit --omit=dev` reported zero known vulnerabilities at verification time |

The browser fixture check substitutes inference only within its own intercepted browser requests. The live check does not intercept requests or use those fixtures. No public mock mode exists.

## Actual experiment evidence

Final live check completed at `2026-09-04T23:32:07.890Z`.

| Observation | Baseline A | Challenger B |
| --- | ---: | ---: |
| Cases passed | 5/10 | 8/10 |
| Fields correct | 22/30 | 28/30 |
| Service errors | 0 | 0 |
| Provider-reported total tokens | 2,151 | 2,774 |
| Observed mean inference request time | 351.2 ms | 354.5 ms |

The longer instruction improved this run's measured correctness but used more tokens. This is **not** evidence of token savings, a universal improvement, or a general speed benchmark. The two starter instructions differ in several rules, so this is not an ablation attributing the improvement to one individual rule.

An earlier successful inference run returned A 6/10 and B 8/10. Both reports are retained in [evaluation evidence](../evals/README.md); the application never substitutes them for new model calls. Both lanes failed at least one exact supply-wording check. The final challenger also regressed on one case that A passed. The raw answers remain visible so these tradeoffs can be inspected.

Configured model alias: `@cf/meta/llama-3.1-8b-instruct-fast`.

Provider-reported model for these responses: `@cf/meta/llama-3.1-8b-fast-v2`.

Experiment fingerprint: `ca15419616ed60fc6a6b0ed3755087c348c5db8212fd0f6d45b2864a578f4b4b`.

Live verification Worker version: `bdde9edf-5dde-443d-b5c3-c75e66648720`. Subsequent documentation or license-whitespace publication does not change the experiment setup; verify the currently deployed version separately when auditing a later release.

## Issues caught and fixed before handoff

- Cloudflare's remote trigger parser required parentheses around `CASE … END`; the migration now works remotely without changing quota behavior.
- The fast model returned a parsed `response` object alongside original `choices[0].message.content`. The integration now preserves and scores the original text, never reconstructed JSON. The initial failed attempts remain recorded as service errors, not successes.
- Unknown usage from a failed call can no longer become a misleading partial token total.
- Duplicate or incomplete trial evidence cannot produce a winner verdict.
- Every run response is checked against the browser's experiment fingerprint before rendering or advancing, preventing an old tab from mixing new results with an old answer key.
- Browser recovery checks now wait for the application to restore its result instead of requiring every network connection to be idle.

## Limits of this verification

These are release checks, not a security certification, load test, broad model benchmark, or guarantee of future availability. Automated accessibility checks do not replace testing with assistive technology users. Real-device mobile testing and generalization to unseen cases remain outside this small release's evidence.

The Three.js bundle is approximately 577 kB minified / 144 kB gzip and produces Vite's default large-chunk warning. It loads separately from the ordinary controls; a blocked or unavailable 3D module falls back to the illustration. Rendering pauses offscreen or in a hidden tab; reduced-motion and manual pause stop continuous scene animation. No measured Web Vitals claim is made.

Public inference is bounded by the documented session, site, and daily attempt allowances. Access expiry denies reads after 24 hours but does not delete stored records. See [Deployment](./DEPLOYMENT.md) for retention and operating details.
