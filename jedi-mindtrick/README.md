# Jedi mindtrick

Disappear into the room. Hold another world in your hands.

A browser camera playground with two independent effects: **Invisible**, which blends a captured empty background into your silhouette, and **HandFrame**, which uses two hands to position a floating styled frame. An original implementation inspired by a supplied visual demonstration.

## Try it

Start with the clearly labelled simulated preview. Its illustration is generated locally in Canvas; it is not a camera recording or an AI-generated result.

1. Choose **Invisible** or **HandFrame**.
2. Select **Start your camera** and allow camera access.
3. For Invisible, select **Capture empty background**, then step completely out for five seconds. Return to view. Hold an open palm for 0.85 seconds to disappear, lower it, and repeat to return. Visible/Ghost/Hidden and the slider also work.
4. For HandFrame, form an L with each hand. A quick pinch changes the local style. A pinch held for 0.6 seconds prepares one still; release before another action. The mouse/keyboard controls provide a fallback: drag the frame, use the size slider, or focus the canvas and use arrow keys.
5. **Send still to AI** explicitly submits that selected crop. Preparing a still alone uploads nothing. The returned AI image appears inside HandFrame. The local preview continues during rendering.

The portal checkbox limits disappearance to the hand-shaped or manually positioned rectangle. The frame layouts offer an outline, postcard and cinema treatment. Thermal is a brightness-based color palette, not a temperature sensor.

## Limits that matter

- Keep the camera fixed for Invisible. Camera movement, changed lighting, clutter and moving backgrounds can reveal the illusion; recapture when the scene changes.
- Hand tracking can be lost, especially with occlusion, crossed hands, low light or hands near the image edge. Tracking loss resets gestures. This is an experimental effect, not a promise of reliable gesture recognition in every setting.
- Hand/person inference runs in a local classic Web Worker, using the original camera input. One inference job is in flight; stale results and previous camera sessions are ignored. Camera stop, a hidden tab, startup failure or a watchdog timeout release resources.
- AI still rendering uses Cloudflare Workers AI's Stable Diffusion img2img model. It transforms the selected image; instant local filters do not call that model.
- The public preview has **20 shared AI attempts per UTC day**, including failed or uncertain attempts. It keeps request ID, payload hash, status and timestamp for up to 48 hours to prevent duplicate calls. It does not store camera or generated-image pixels. Cloudflare processes explicitly submitted stills under its service policies.
- A failed or uncertain render is not silently retried. Prepare a new still to make an explicit new attempt. The provider timeout is 45 seconds; abort is requested, but it cannot prove the remote model never ran.

## Run locally

Use Node 24 or newer:

```sh
npm ci
npm run assets
npm run types
npm test
npm run test:harness
npm run build
npx wrangler dev --local --port 8798
```

Open `http://127.0.0.1:8798`. `npm run dev` provides frontend-only development; the full Worker serves `/api/config`, `/api/health` and `/api/render`. An AI binding needs the account's remote Workers AI access. Local tests mock the provider and make no inference calls.

Browser checks use an isolated Chrome session, generated camera streams and mocked AI responses:

```sh
node scripts/browser-check.mjs http://127.0.0.1:8798
```

Set `PLAYWRIGHT_CHANNEL` if using another installed Playwright channel. These tests do not establish physical-webcam accuracy. Generated reports and screenshots stay in ignored `test-results/`.

## Structure

| Path | Responsibility |
| --- | --- |
| `src/main.ts`, `src/style.css` | Interface, modes, frame compositing and explicit still submission |
| `src/vision/camera.ts`, `public/vision-worker.js` | Camera lifecycle, bounded inference and original-input vision |
| `src/effects/` | Invisibility, mask alignment, portal and palm timing |
| `src/handframe/` | Frame geometry, pinch state machine and local color filters |
| `worker/` | Validated still endpoint, model call, durable idempotency and shared quota |
| `harness/` | Executable check graph, bounded commands, checkpoints and recovery |
| `tests/` | Pure effects, timing, lifecycle and real Worker logic with mocked AI |

The engineering harness is separate from the camera loop. It runs explicit commands and tracks operator-supplied external observations; it does not pretend to create agents. [Workflow, diagram and runnable recovery example](docs/WORKFLOW.md). [Ownership and acceptance contract](docs/OWNERSHIP.md). [Independent review](docs/REVIEW.md). [Verification evidence](docs/VERIFICATION.md).

## Deploy

`wrangler.jsonc` defines a Worker with static assets, a Workers AI binding and one small SQLite-backed Durable Object for the shared preview budget. No external database, authentication service or secret API key is needed.

```sh
npm run check:deploy
npm run deploy
```

Before claiming a release, verify the GitHub source, deployed assets, both real-camera modes and an actual returned AI still. Passing a synthetic test is evidence only for the behavior it exercises. The harness keeps unobserved external gates pending.

## Model and runtime sources

MediaPipe Tasks Vision is provided by Google under its package license. The model preparation script downloads fixed version-1 hand-landmarker and landscape selfie-segmenter assets from Google's model hosting, checks their pinned SHA-256 and sizes, and serves the reviewed assets from the same origin. See [model provenance](public/models/README.md).

- [MediaPipe hand landmarks](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [MediaPipe image segmentation](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js)
- [Cloudflare img2img model](https://developers.cloudflare.com/workers-ai/models/stable-diffusion-v1-5-img2img/)

Built by Cruz G. The supplied reference video and its images are not included in this repository, public demo or training data.
