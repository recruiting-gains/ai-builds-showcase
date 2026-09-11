# Close, reopen, change worlds

HandFrame keeps the selected world when the hands first open. After that, bring both palms close together, pause briefly, then open them again: the next world appears once. The cycle wraps through all eleven local worlds. Keep both hands visible beside one another; crossing or hiding a hand cancels the pending change. Touching just the fingertips to draw a triangle, rounded opening or heart does not request a new world.

Follow my hands must be on and mouse controls off. Ordinary shape and depth motion remains independent. Saved-shape mode retains its existing pinch shortcuts. Just camera pauses the new world-cycle gesture; return to Show effects and open both hands to resume. World buttons still select a look directly and cancel a partly completed gesture. The close/reopen gesture never prepares or submits an AI still.

## Interaction contract

- First stable opening keeps the current look and arms the cycle.
- A confirmed close followed by a confirmed reopen advances one world. Holding either pose cannot repeat it.
- Brief threshold jitter, touching fingertips and depth-only movement must not advance the world.
- Lost, weak, malformed, crossing or stale tracking cancels a pending change. A fresh opening re-arms without advancing.
- Mode, camera, mouse/follow controls, camera-only viewing and explicit world selection reset pending gesture state.
- Changing the world updates the selected button, camera caption and rendered local colors while preserving the current shape and camera stream.

The small local state machine uses normalized palm and wrist separation with hysteresis, brief dwell and observed wrist-span motion. It does not classify the opening as a named shape. Its input is the same tracked landmarks already used by HandFrame; it adds no model, network request or frame queue. Closing requires both palm and wrist gaps within 1.45 palm lengths for 140 ms; reopening requires both above 2.3 palm lengths for 100 ms. Separate hold bands tolerate small boundary jitter. The wrist gap must also contract at least 22% from the latest clear opening, then expand at least 25% from the closed span. Nearly coincident or crossed wrists cancel the cycle. These are heuristic thresholds, not a claim of physical-camera recognition accuracy.

## Wider working view

HandFrame now uses the full studio row. The original camera buttons and status move above the picture; the world, shape, depth and still controls sit below. Switching to Invisible restores its prior layout using the same controls and canvas. The desktop camera image fits the available width and height; on a small screen it follows the available width. The source image is not cropped by this change.

Full screen starts with the complete camera image fitted inside the browser view. Fill view remains optional and can crop the displayed edges; leave it off to keep both sides visible. Enlarging the preview does not increase the camera lens's field of view. For more physical hand room, move farther from the camera while keeping both hands in the picture.

## Verification

The update passes **131 application tests and 77 local browser checks**: 25 existing behavior checks, 11 optional shape/editor cases, 19 fullscreen cases, ten automatic-outline cases and 12 new world-cycle/wide-layout checks. The 13 focused state-machine cases cover first opening, held states, exact dwell boundaries, hysteresis, fingertip contact, depth changes, scale/translation, reordered detections, malformed/lost/crossed tracking, timestamps and reset.

The new browser suite passed on its first attempt in 33.4 seconds. Two close/reopen cycles produced exactly two world transitions and three distinct interior pixel colors. Source-edge colors verified the entire mirrored camera image; at a 1440×1050 viewport, the displayed camera grew from 954 to 1350.4 pixels wide, about 42%. Manual pointer placement reached (0.62044, 0.55093) against the normalized target (0.62, 0.55). Camera/canvas identity, mode restoration, explicit world selection, camera-only viewing, fullscreen Fit and 390/760/1440-pixel layouts passed. No uncaught page errors, uploads or still preparation occurred.

The executable harness passed all six command nodes on attempt 1. Run `1789102213266-9211449d-ddac-488b-89fb-142e12dee636`, source fingerprint `3bad6d1bfa0fdabd2a55e113d252ed68a77b217d817f6d2aa64af4c4c9c88456`. The new test file changed the command graph, so this is an explicit new run with the same 30-step, 90-active-minute and three-attempt limits.

Cloudflare version `d88b2e83-b971-425e-8040-b3163dfc1cf9` is deployed. HTML and health returned HTTP 200; HTML, JavaScript, CSS and the vision worker match the tested production build. Source remains on the draft PR branch. Automated cases use generated camera streams and articulated landmark fixtures; they cannot establish physical-camera gesture recognition, latency or a wider lens field of view. The physical-camera and current-source real-provider workflow gates remain unobserved.

Run the focused integration checks after starting the local Worker:

```sh
node --import tsx scripts/world-cycle-browser-check.mjs http://127.0.0.1:8798
```

Independent review checked gesture reset paths, depth-only false triggers, existing AI/pinch separation, control identity and fullscreen behavior. Review narrowed an overbroad documentation statement: the new close/reopen gesture never prepares a still, while the retained long pinch in saved-shape mode still can.
