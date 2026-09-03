# Verification record

Final gate run: **2026-09-03 UTC** on the production build. No deployment or merge was performed.

## Clean-install gate

The final check started with a fresh dependency installation:

| Command | Result |
| --- | --- |
| `npm ci` | Pass — 111 packages installed from `package-lock.json` |
| `npm audit --audit-level=moderate` | Pass — 0 known vulnerabilities |
| `npm run format:check` | Pass — 27 files checked |
| `npm run lint` | Pass — 30 files checked, no diagnostics |
| `npm run typecheck` | Pass — client, Worker, unit-test, and browser-test TypeScript projects |
| `npm test` | Pass — 61 deterministic unit, validation, Worker/API, and static-boundary tests |
| `npm test -- --coverage` | Pass — 98.91% statements, 95% branches, 100% functions, 98.85% lines |
| `npm run test:e2e` | Pass — 17 Chromium tests |
| `npm run build` | Pass — Vite production build |
| `npm run deploy:check` | Pass — Wrangler bundled the Worker and seven assets with `--dry-run` |

`npm run check` executed formatting, lint, all four type checks, the 61-test suite, the full browser suite, a fresh production build, and the Cloudflare deployment dry-run in sequence.

The cloud environment could not reach Playwright's browser-download host. The final browser gate therefore used a local Chromium 149.0.7827.0 executable supplied through `CHROMIUM_EXECUTABLE_PATH`. It ran Playwright's normal Chromium project against the production build; the executable and test traces are ignored and are not part of the repository. Standard developer and CI environments can use `npx playwright install chromium`.

## Browser matrix

The 17 production-browser checks cover:

- the complete fictional journey through the real `/api/score` handler, with a verified 87 result;
- prohibited participation as a zero-score **Stay quiet** exclusion;
- empty submission, first-invalid-field focus, slow response, and unavailable endpoint states;
- refresh restoration and explicit deletion of the coarse local context;
- direct Worker links to `/read-the-room`, `/rules-first`, and `/privacy`;
- semantic landmarks and accessible names, plus an Axe scan with zero reported violations;
- skip navigation and keyboard operation of setup and checklist controls;
- the `prefers-reduced-motion` fallback;
- landing and completed-result layouts at 320×720, 390×844, 768×1024, and 1440×960;
- eight samples across a four-second decorative animation cycle with zero horizontal overflow;
- readable core guidance with JavaScript disabled; and
- a first-load budget, zero console errors, and zero requests to an external origin.

The final production screenshots were inspected at 1440×960 and 390×844 for both the landing and completed-result states. Content rendered immediately, remained legible, and did not show a blank or white-page failure. The app uses system font stacks and first-party SVG/CSS only; it has no CDN dependency and is served over HTTP by the Worker-compatible harness rather than relying on `file://` behavior.

## Accessibility and contrast

- Axe reported zero violations in the populated interactive state.
- Keyboard focus, skip navigation, form grouping, result focus, live status, dialog naming, and reduced motion have dedicated browser assertions.
- Primary measured palette pairs meet WCAG AA for normal text: bone/ink 16.98:1, muted/ink 9.56:1, orange-bright/ink 6.93:1, green/ink 11.07:1, red/ink 8.06:1, ink/orange 6.34:1, and orange-dark/bone 5.16:1.
- These automated and calculated checks do not replace review by people who use assistive technology.

## Practical performance

The retained Variant B capture, measured locally in Chromium, records:

| Measure | Result |
| --- | ---: |
| Core HTML + CSS + JavaScript | 91,730 bytes raw; 24,213 bytes gzip |
| First-load subresources | 2 |
| First-load encoded bodies | 56,038 bytes |
| Result-state DOM nodes | 720 |
| Horizontal overflow | 0 px |
| Console errors | 0 |
| External requests | 0 |

Wrangler's final dry-run reported a 24.12 KiB Worker upload and 7.13 KiB gzip, with the static-assets binding as the only resource binding. Local navigation timing is diagnostic only and is not presented as public-network or field performance.

## Security and privacy review

- The API reads request streams through a 4 KiB cap, accepts an exact JSON media type, validates an eleven-field allowlist, rejects cross-origin browser submissions, and returns consistent JSON errors with opaque request IDs.
- Document and API responses set restrictive content, framing, resource, referrer, permissions, transport, and MIME headers.
- The configuration includes no database, secret, AI binding, analytics, observability, custom domain, or production route.
- Static tests reject text/identity input fields, external runtime assets, missing internal anchors/assets, likely source secrets, and conflict markers.
- Manual searches found no credential material, unresolved conflict marker, platform integration, remote runtime URL, or generated report staged for commit.
- The final diff changes only the root discovery row and the new `no-megaphone/` folder.

## Review evidence

- [`THE-OPPONENT.md`](./THE-OPPONENT.md) records the adversarial findings, severities, improvements, second pass, and stop decision.
- [`BLINDED-EVALUATION.md`](./BLINDED-EVALUATION.md) records the honest simulated comparison and future human-study protocol.
- [`evaluation/RUBRIC.md`](./evaluation/RUBRIC.md) is the frozen scoring rubric.
- `evaluation/variant-a/` and `evaluation/variant-b/` preserve the screenshots and measured capture data.

## Remaining limitations

The inputs are self-reported by design, local measurements are not field data, localization is not implemented, and automated accessibility checks are not a substitute for evaluation with assistive-technology users. Host-level abuse controls and operational-metadata policy remain an owner decision before any explicitly approved deployment.
