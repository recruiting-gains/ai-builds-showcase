# Orb

Original two-hand light for the GhostFrame phone app. A still from a hand-tracked orb film was the visual reference. The motion in that film was not available to verify, so this is not presented as a recreation of it.

## What it does

- Phones open on Orb. Invisible, HandFrame and Cube remain in the mode switch.
- With the camera off, illustrated hands move the orb. The preview is labelled simulated.
- With the camera on, MediaPipe hand landmarks stay in the local vision worker. No camera frame is uploaded for this effect.
- The orb sits at the midpoint of the two palms in the image you see. Its diameter follows the separation, relative to the shorter side, so a portrait gap and a landscape gap of the same pixel length agree.
- The pose eases over about 55 ms. A jump larger than 30% of the shorter side is ignored. One hand does not drag or resize it.
- After both hands leave, the last pose holds for 420 ms, fades for 280 ms, then clears. Bringing both hands back starts it again.
- Green links and red dots are the 21-point hand graph. Turn the skeleton off if you only want the light. Turn **Follow my hands** off to place it with sliders, dragging or arrow keys.
- Front and rear cameras use the existing picker. A declined, missing or busy camera shows the existing message and leaves Start enabled.
- **Add to Home Screen** uses the browser install prompt when one exists. Otherwise it explains Share → Add to Home Screen. The manifest is `standalone` and allows either orientation.
- The service worker caches same-origin built assets after a successful fetch. It does not cache `/api/` and does not handle uploads. Automated browsers skip registering it so tests can substitute the vision worker.

## What it does not do

- It does not load a body-pose model. Hands already occupy the vision worker. A second model on that worker can miss the camera timeout on a phone, so body tracking was left out on purpose. Invisible still uses the existing person mask.
- It does not claim a frame rate, a physical distance, or reliable tracking in low light, at the edge of the image, or when the hands cross.
- It does not upload the camera. HandFrame’s separate **Send still to AI** control is unchanged and still requires an explicit click. Orb never calls it.
- Installing from a browser cannot silently save video into the phone’s photo library. Recording still uses the existing local recorder.

## Architecture

| Path | Role |
| --- | --- |
| `src/orb/controller.ts` | Pure pose: midpoint, size, smoothing, hold, fade |
| `src/orb/demo-hands.ts` | Illustrated 21-point hands for the camera-off preview |
| `src/orb/draw.ts` | Translucent orb, green links, red landmarks |
| `src/pwa.ts`, `public/manifest.webmanifest`, `public/sw.js` | Install metadata and app-shell cache |
| `src/main.ts` | Orb mode beside the existing effects. The older effect modules are still the ones Invisible, HandFrame and Cube call |
| `src/vision/camera.ts`, `public/vision-worker.js` | Unchanged hand and person models |

Display mapping matches the cube: camera landmarks are mirrored only for the front camera, into the image already drawn on the canvas.

## Checks

- `npm test` includes `tests/orb.test.ts` and `tests/pwa.test.ts`.
- `npm run test:orb` builds nothing by itself. Run `npm run build` first. It serves `dist` and checks the simulated orb, slider override, synthetic two-hand tracking, loss and recovery, a declined camera, portrait and landscape layout, the manifest and icons, the service worker text, and WCAG A/AA via axe.
- The phone check now starts on Orb, then opens HandFrame and continues the photo checks. Camera-view checks still cover front, rear, fullscreen and local recording.
- This change re-ran `npm test`, `npm run test:harness`, `npm run build`, `npm run test:orb`, `npm run test:phone` and `npm run test:camera` in Chromium, plus a desktop 1440×900 overflow and axe pass. It did not re-run the cube, panel or general AI-still browser suites, WebKit, or a physical phone. See `docs/VERIFICATION.md`.

## Deploy later

Do not treat a green local check as a production release. From `ghostframe`, with Node 24 or newer:

```sh
npm ci
npm run assets
npm run types
npm test
npm run test:harness
npm run build
npm run test:orb
npm run check:deploy
npx wrangler login
npm run deploy
```

`npm run deploy` publishes the existing `jedi-mindtrick` Worker. The GitHub workflow runs the checks, including `test:orb`, and does not deploy. Roll back by reverting this commit; Invisible, HandFrame and Cube were not replaced.
