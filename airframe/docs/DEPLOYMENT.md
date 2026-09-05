# Deploy Airframe on Cloudflare

Airframe is one Cloudflare Worker containing the frontend assets and a small stateless API. There is no database to provision, no AI API key, and no camera upload service.

## Before deploying

1. Fork or clone the showcase repository and open its `airframe` directory.
2. Use Node.js 24 and install the locked dependencies with `npm ci`.
3. Run `npm run check`, then `npx tsx scripts/runtime-smoke.ts`. The first command includes type generation, tests, a production build, and a deployment dry run—not a live deployment. The second starts its own real local Wrangler on port 8797 and checks startup plus HTTP routes/headers before shutting that process down. It catches runtime entrypoint failures a dry run or imported-handler unit test can miss. An occupied port is an error; use `AIRFRAME_SMOKE_PORT` to choose another free port.
4. Install the test browser with `npx playwright install chromium`, start `npm run dev:worker`, and open `http://localhost:8791`. Check mouse, keyboard, camera permission denial, and camera shutdown. In a second terminal, run `npm run test:browser` against that local server for automated UI checks. For real model inference on a public still image, run `AIRFRAME_VISION_TEST_URL=http://127.0.0.1:8791 npx tsx scripts/vision-smoke.ts`. Neither test accesses a physical camera.
5. Verify an actual hand on the webcam you will demonstrate. Unit tests and automated camera plumbing cannot prove tracking quality in your room or on every device.

The first build downloads a versioned model from Google's official model hosting, checks a pinned size and SHA-256, and copies the pinned MediaPipe WASM runtime from the installed package. All runtime files are then hosted with your site. A changed or failed model download stops the build; do not bypass its integrity check to get a deployment through.

The repository's path-scoped Airframe Actions workflow runs the locked install, checks/build/dry run, and actual Worker HTTP smoke test on Node.js 24. Its permissions are read-only and it contains no automatic deployment or deployment secrets. Browser/model smoke tests remain explicit local release checks rather than claims about physical-camera reliability. Inspect the actual Actions run result after pushing; adding the workflow file does not itself prove CI passed.

## Publish to your account

```sh
npx wrangler login
npx wrangler whoami
npm run deploy
```

Confirm that the authenticated account is the intended destination before the deploy command. A logged-in browser session and CLI authentication are separate. Never paste account tokens into source files or a public issue.

Wrangler prints the actual deployment URL. With the default Worker name, it has the form `https://airframe.YOUR-SUBDOMAIN.workers.dev`. Use the URL returned by your deployment; do not treat this placeholder as a live site. A custom domain is optional.

The configuration does not contain someone else's account ID, domain, or credentials. If a Worker named `airframe` already belongs to another application in your account, change `name` in `wrangler.jsonc` before deploying. Do not overwrite an unrelated Worker.

## Verify the published version

- Open the returned HTTPS URL and check that the full interface and three workspaces load.
- Open `/api/health`; expect HTTP 200 and `service: "airframe"`.
- Open `/api/presets`; expect three presets with three cards each.
- Request an unknown API path, such as `/api/not-a-route`; expect a JSON 404, not an HTML success page.
- Test **Save layout**, reload the page, and verify that the positions return in that browser. This is local browser storage—not cloud synchronization.
- Test real camera startup and pinch/release, denied permission, Stop camera, Escape, and switching tabs. Check the browser's camera indicator actually turns off.
- Inspect the browser network panel while moving your hand: there should be no outgoing frame/landmark upload. Model and WASM requests are same-origin; saving sends only preset IDs and panel coordinates.
- Check mobile layout and keyboard navigation. Device-specific camera support and performance are not guaranteed.

Keep the Wrangler version/deployment ID, tested URL, test outcome, and known limits in your release notes. Only describe a release as live after checking its public URL.

## Security and operation choices

`assets.run_worker_first` is true so the Worker adds security/privacy headers to every response, not just `/api/*`. This means static requests also invoke the Worker; account request limits and applicable costs matter. There is no smart-placement configuration or remote storage binding.

The content security policy allows only same-origin scripts, connections, fonts, and model assets. `wasm-unsafe-eval` enables WebAssembly compilation without enabling broad JavaScript `unsafe-eval`. Inline styles support panel positioning; inline scripts and arbitrary HTML injection are not needed. Blob workers/media are allowed for local browser operations. The policy forbids framing and limits camera permission to this origin; microphone and screen-capture permissions are disabled.

Do not relax `connect-src` or add an external analytics script while continuing to claim that the app has no third-party runtime connections. Recheck camera behavior after changing security headers.

The layout endpoint has a hard streamed 8 KB byte limit and an allowlisted schema. It stores nothing and has no authenticated user or paid inference call to abuse. If the project is expanded into accounts, collaborative workspaces, native computer control, or billable services, add appropriate authentication, authorization, rate limits, and privacy review before exposing those capabilities. Those capabilities are not part of this demonstration.

Cloudflare observability uses a 0.1 sampling rate with query-string redaction. No custom body or landmark logs are emitted. Cloudflare may retain normal operational request metadata; review the hosting account's current logging and retention settings before making privacy commitments to someone else.

## Updating and recovering

Repeat local checks and deploy only the intended project. Changing `wrangler.jsonc` requires rerunning `npm run cf:typegen`. Keep dependency and model versions pinned until you deliberately review an upgrade. New versions of the model may behave differently even if all unit tests pass.

To investigate a failed release, inspect its deployment status and safe operational logs. Use a previously verified deployment version through Cloudflare's version controls if a rollback is necessary. Do not delete Workers, repositories, or history as a troubleshooting step.

## Official references

- [Worker-first static assets](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [MediaPipe Hand Landmarker for the web](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
