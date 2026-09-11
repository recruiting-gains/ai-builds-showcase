# Jedi mindtrick

Disappear into the room. Hold another world in your hands.

A browser camera playground with two independent effects: **Invisible**, which blends a captured empty background into your silhouette, and **HandFrame**, which follows the opening formed by both thumbs and index fingers, with a floating picture that can stretch in perspective. An original implementation inspired by a supplied visual demonstration.

HandFrame follows the shape between your fingers and can change worlds when both hands come together and reopen. Its camera now uses the full studio width, with the tools underneath. Invisible uses continuous open-palm → close-to-hide → open-to-return control. [World cycling and wider view](docs/WORLD-CYCLE-WIDE-VIEW.md) · [Verification and limits](docs/VERIFICATION.md).

## Try it

[Open Jedi mindtrick](https://jedi-mindtrick.recruiting-gains.workers.dev)

Start with the clearly labelled simulated preview. Its illustration is generated locally in Canvas; it is not a camera recording or an AI-generated result.

1. Choose **Invisible** or **HandFrame**.
2. Select **Start your camera** and allow camera access.
3. For Invisible, select **Capture empty background**, then step completely out for five seconds. Return and show a clearly open palm to arm control at fully visible. Slowly close that hand to fade toward hidden; reopen it to become visible again. The saved room is required before disappearing. Visible/Ghost/Hidden and the slider also work. [Continuous palm control](docs/PALM-VISIBILITY.md).
4. For HandFrame, leave **Follow my hands** on and form an opening with both thumbs and index fingers. Both L shapes may point up, or one may be upside down to connect opposite corners. Join the tips, curve the fingers or spread them apart: the window follows those joints without selecting a preset. Hold your palms toward the camera at a similar distance and select **Center depth**. Push one hand closer to stretch that side; lifting or turning your hands also moves the measured outline. The first opening keeps your selected world. Bring both palms together and pause for **“Hands together · reopen for the next color.”** Then reopen: the color changes once and the new world's name appears. Touching fingertips alone keeps the current look. If the detector briefly sees only one palm at contact, **“Reopen both hands now for the next color.”** signals the short recovery window. If the cue returns to asking for an opening, open both hands to re-arm and try again. World buttons also work, and **Prepare a still** selects a crop. Pinch shortcuts are disabled while Follow my hands is on.
5. **Send still to AI** explicitly submits that selected crop. Preparing a still alone uploads nothing. The returned AI image appears inside HandFrame. The local preview continues during rendering.

HandFrame opens in a wider studio with the camera controls above and design tools below. Select **Full screen** above the preview for a clean camera view. Move the pointer or tap to reveal **Exit full screen**, **Fill view**, and **Just camera**. Esc returns to the controls. In a browser that cannot enter native fullscreen, the camera expands within its tab. It starts fitted to show the whole image; leave Fill view off to keep the sides visible. A larger preview does not increase the lens field of view.

### Use it on your phone

Open the [live HTTPS app](https://jedi-mindtrick.recruiting-gains.workers.dev) in Safari on iPhone, select **Start your camera**, and allow camera access. The app runs from Cloudflare and uses the phone's front camera; your computer does not need to stay on. Internet access is required to load the app and its vision models, and to submit an optional AI still.

Turn the phone sideways and prop it somewhere stable for more room to move both hands. Choose **HandFrame → Full screen** and leave **Fill view** off to preserve the whole camera image. Tap the picture to reveal the exit controls. If camera permission is unavailable inside another app's browser, open the same link directly in Safari.

Tap **Record** below the camera (also available in fullscreen), make your hand movements, then tap **Stop recording**. Preview the clip and tap **Save video**. On iPhone, choose **Save Video** in the share menu when offered; **Download** saves through the browser to Downloads/Files. A website cannot silently write to Photos. Keep the page open until you have saved the clip; cancelling the menu retains it for another attempt. Tap **Discard clip** only when you are finished with it. Recordings contain the whole camera canvas and its effects, without the controls or microphone audio. Clips stop at one minute or the memory limit. [Recording behavior and checks](docs/RECORDING.md).

For a shortcut, use Safari's **Share → Add to Home Screen → Add** ([Apple's instructions](https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios)). Responsive layouts and fullscreen fallback are tested with simulated camera input; physical iPhone hand tracking and frame rate still depend on the device, lighting and browser.

**Saved shapes & drawing** is optional. Choosing Rectangle, Triangle, Oval, Diamond, Hexagon or Star—or applying a custom 3–12-point outline with **Use shape**—turns off Follow my hands. Turn it back on to shape the opening directly. With it off, the usual two-hand frame controls move the saved outline, a quick pinch changes the world, and a 0.6-second pinch prepares one still. Release before another pinch action. Mouse/keyboard controls also provide a fallback: drag the frame, use the size/depth/tilt sliders, or focus the canvas and use arrow keys. Live automatic outlines require mouse controls to be off. [Automatic hand outlines](docs/AUTOMATIC-HAND-SHAPES.md) · [Fullscreen and saved shapes](docs/FULLSCREEN-SHAPES.md).

The Invisible portal checkbox limits disappearance to a hand-positioned or manually positioned rectangle and uses manual visibility controls instead of palm closure. HandFrame layouts offer an outline, postcard and cinema treatment. Choose from eleven local worlds: **Daydream**, **Thermal**, **Ink study**, **Neon night**, **Aurora**, **Deep sea**, **Golden hour**, **Cosmic**, **Risograph**, **Cyanotype**, and **Stippling**. Thermal is a brightness-based color palette, not a temperature sensor. A prepared still keeps its selected rectangular crop and named look; prepare again to change that selection. Switching worlds on a returned AI still applies local colors without another upload. Returning to its original look restores the original AI image. The print looks use stable, image-anchored grain or dots. Cached textures keep moving with the 3D frame without rebuilding a frozen picture every display tick. [Print effects and flow measurements](docs/PRINT-FILTERS.md).

## Limits that matter

- Keep the camera fixed for Invisible. Camera movement, changed lighting, clutter and moving backgrounds can reveal the illusion; recapture when the scene changes.
- Invisible supplements person segmentation with approximate finger, palm and short forearm coverage from tracked joints. This helps when the person mask misses a hand, but does not provide exact skin boundaries. Losing the controlling hand preserves the current visibility target and requires a clearly open palm to re-arm.
- Perspective depth is estimated from changes in apparent palm size. It is a visual control, not measured distance. Palm rotation can also affect the estimate; keep your palms facing the camera and use Center depth to reset.
- Automatic outlines approximate the opening along detected thumb/index joints. They do not trace exact skin edges or recognize arbitrary shapes made with other fingers. Crossed contours, very small openings and invalid tracking hide the window until a valid opening returns; they do not substitute a square.
- Hand tracking can be lost, especially with occlusion, crossed hands, low light or hands near the image edge. HandFrame's color gesture tolerates overlapping palms and up to 700 ms of local one-hand loss near an observed close. Before contact, a shorter 300 ms gap can preserve an armed opening, but cannot count toward closing. Missing both hands, longer loss or an unrelated remaining hand resets it; reopen both hands to re-arm before another attempt. The visible hand outline can disappear while this brief gesture recovery is still active. This is an experimental effect, not a promise of reliable gesture recognition in every setting.
- Hand/person inference runs in a local classic Web Worker, using the original camera input. Hands prefer GPU where supported, fall back to CPU at initialization, and get one CPU recovery attempt after a GPU detection failure. Both modes have a 16 ms minimum hand-sampling interval; person masks have a 50 ms minimum within the same worker. Mask work still delays that frame's result. These limits promise neither a frame rate nor GPU availability. One job stays in flight; stale results and previous camera sessions are ignored.
- AI still rendering uses Cloudflare Workers AI's FLUX.2 klein 4B model. It transforms the selected image; instant local filters do not call that model.
- The public preview has **20 shared AI attempts per UTC day**, including failed or uncertain attempts. It keeps request ID, payload hash, status and timestamp to prevent duplicate calls. Records become eligible for deletion after 48 hours; requests prune expired records and an alarm schedules the oldest record’s cleanup. Platform scheduling can delay deletion. It does not store camera or generated-image pixels. Cloudflare processes explicitly submitted stills under its service policies.
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
| `src/vision/` and `public/vision-worker.js` | Camera lifecycle, continuous palm visibility and bounded original-input vision |
| `src/effects/` | Invisibility, mask alignment, tracked-hand coverage and portal |
| `src/handframe/` | Automatic joint contours, saved shapes, frame/depth geometry, projective rendering, close/reopen world cycling, pinch timing and local filters |
| `src/recording.ts`, `src/recording-ui.ts` | Bounded canvas recording, local clip preview, explicit native sharing and download |
| `worker/` | Validated still endpoint, model call, durable idempotency and shared quota |
| `harness/` | Executable check graph, bounded commands, checkpoints and recovery |
| `tests/` | Pure effects, timing, lifecycle and real Worker logic with mocked AI |

The engineering harness is separate from the camera loop. It runs explicit commands and tracks operator-supplied external observations; it does not pretend to create agents. [Workflow, diagram and runnable recovery example](docs/WORKFLOW.md). [Ownership and acceptance contract](docs/OWNERSHIP.md). [Independent review](docs/REVIEW.md). [Verification evidence](docs/VERIFICATION.md). [First responsiveness correction](docs/HANDFRAME-RESPONSIVENESS.md). [Current 3D perspective and response update](docs/HANDFRAME-3D.md).

## Deploy

`wrangler.jsonc` defines a Worker with static assets, a Workers AI binding and one small SQLite-backed Durable Object for the shared preview budget. No external database, authentication service or secret API key is needed.

From a fresh checkout, use Node 24 or newer and a Cloudflare account with Workers AI access. Run these commands from the repository's `jedi-mindtrick` directory:

```sh
npm ci
npm run assets
npm run types
npm test
npm run test:harness
npm run build
npm run check:deploy
npx wrangler login
npm run deploy
```

`npm run deploy` publishes the built `dist` folder and Worker together. Wrangler prints the deployed HTTPS URL; use that URL from a phone or another computer. Rebuild before each later deployment. The repository's Jedi workflow validates changes but does not automatically publish them. See [Cloudflare's Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/) for authentication and deployment options.

Before claiming a release, verify the GitHub source, deployed assets, both real-camera modes and an actual returned AI still. Passing a synthetic test is evidence only for the behavior it exercises. The harness keeps unobserved external gates pending.

## Model and runtime sources

MediaPipe Tasks Vision is provided by Google under its package license. The model preparation script downloads fixed version-1 hand-landmarker and landscape selfie-segmenter assets from Google's model hosting, checks their pinned SHA-256 and sizes, and serves the reviewed assets from the same origin. See [model provenance](public/models/README.md).

- [MediaPipe hand landmarks](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [MediaPipe image segmentation](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js)
- [Cloudflare FLUX.2 klein model](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/)

Built by Cruz G. The supplied reference video and its images are not included in this repository, public demo or training data.
