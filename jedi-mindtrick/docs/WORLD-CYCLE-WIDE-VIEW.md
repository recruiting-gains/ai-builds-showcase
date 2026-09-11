# Close, reopen, change worlds

HandFrame keeps the selected world when the hands first open. After that, bring both palms together and pause for **“Hands together · reopen for the next color.”** Open them again: the next world appears once, with its name confirming the change. The cycle wraps through all eleven local worlds. Palms can overlap or turn edge-on at contact; touching just the fingertips to draw a triangle, rounded opening or heart does not request a new world.

The cue appears over the camera in both the studio and fullscreen. If one palm briefly hides the other after a recognized close, **“Reopen both hands now for the next color.”** signals a short recovery window. Before a close is recognized, a lost hand receives a neutral reacquisition cue rather than permission to change colors. Keep both hands inside the camera picture. If recovery expires or both hands disappear, open both hands to re-arm, then bring the palms together again. Holding them together does not repeatedly change colors; reopening completes the gesture.

Follow my hands must be on and mouse controls off. Ordinary shape and depth motion remains independent. Saved-shape mode retains its existing pinch shortcuts. Just camera pauses the new world-cycle gesture; return to Show effects and open both hands to resume. World buttons still select a look directly and cancel a partly completed gesture. The close/reopen gesture never prepares or submits an AI still.

## Interaction contract

- First stable opening keeps the current look and arms the cycle.
- A confirmed close followed by a confirmed reopen advances one world. Holding either pose cannot repeat it.
- Brief threshold jitter, touching fingertips and depth-only movement must not advance the world.
- Side-on palms, overlapping wrists and unstable left/right labels must not by themselves cancel a valid close. Exact duplicate detections, malformed geometry, implausible spatial jumps and stale timestamps remain invalid.
- A local one-hand gap before contact may preserve an already armed opening for at most 300 ms. It clears any close candidate; a newly measured two-hand close must start its own dwell after reacquisition. The gap cannot invent or complete a close.
- A local one-hand gap at observed contact may preserve a pending change for at most 700 ms. Completing an unfinished close during that gap requires measured near-overlapping contact and prior contraction. Zero hands, an unrelated remaining hand or an expired gap cancels the pending change. A fresh opening re-arms without advancing.
- Mode, camera, mouse/follow controls, camera-only viewing and explicit world selection reset pending gesture state.
- Changing the world updates the selected button, camera caption and rendered local colors while preserving the current shape and camera stream.

The small local state machine uses normalized palm and wrist separation with hysteresis, brief dwell and observed wrist-span motion. It does not classify the opening as a named shape. Its input is the same tracked landmarks already used by HandFrame; it adds no model, network request or frame queue. Ordinary closing starts with both palm and wrist gaps within 1.45 palm lengths and takes 140 ms; reopening starts with both above 2.3 palm lengths and takes 100 ms. Separate hold bands tolerate small boundary jitter. The wrist gap must also contract at least 22% from the latest clear opening, then expand at least 25% from the closed span.

The palm-contact correction checks projected palm width together with available depth geometry, and matches hands by spatial continuity rather than left/right labels. The worker's score is handedness-label confidence, not hand-presence confidence; values down to 0.5 are accepted only with valid landmarks. Nearly coincident wrists are allowed, while two copies of the same full landmark set are rejected.

Both recovery deadlines are anchored to the last measured pair, including when two hands return. Repeated single-hand samples cannot extend them or move their spatial anchor. Before contact, the 300 ms grace retains only the armed opening and its span; no missing time counts toward closing. At contact, inferred completion of a close requires both last measured gaps within 0.7 palm lengths, observed contraction and a plausible remaining hand near that contact. A close whose 140 ms dwell already completed can survive the ordinary close hold band. The 700 ms grace does not support indefinitely hidden palms or recognize a different person with indistinguishable hand geometry. These are heuristic controls, not a guarantee of physical-camera recognition.

## Observable acceptance criteria for the palm-contact correction

- Starting open, starting with palms together or starting with an occluded palm keeps the selected world through the first stable opening. Each later complete close/reopen advances once; sustained poses never repeat it.
- Valid edge-on palms and nearly coincident or slightly crossed wrists can reach the close cue, including ambiguous or reordered handedness labels. The cue must not invite reopening before the close dwell completes.
- Brief, local pre-contact loss followed by a new measured close and reopen succeeds. Loss followed only by opening, or by less than 140 ms of measured close, produces no change.
- Local contact occlusion can recover within its 700 ms bound. Ordinary brief proximity followed by loss cannot supply an inferred close. Missing both hands, distant or drifting single hands, duplicate detections and expired gaps require re-arming.
- Fingertip-only designs, depth-only palm-size changes, ordinary translations, malformed landmarks and duplicate/backward timestamps do not manufacture color changes.
- The studio and fullscreen display matching gesture cues. A completed change updates the selected world, its visible name and local colors while preserving the camera stream and current design; no AI still or upload is initiated.
- Camera, mode, follow/mouse, camera-only and explicit world-selection resets discard pending gesture work. Existing fullscreen Fit behavior and the wider layout remain usable at desktop and phone widths.

## Wider working view

HandFrame now uses the full studio row. The original camera buttons and status move above the picture; the world, shape, depth and still controls sit below. Switching to Invisible restores its prior layout using the same controls and canvas. The desktop camera image fits the available width and height; on a small screen it follows the available width. The source image is not cropped by this change.

Full screen starts with the complete camera image fitted inside the browser view. Fill view remains optional and can crop the displayed edges; leave it off to keep both sides visible. Enlarging the preview does not increase the camera lens's field of view. For more physical hand room, move farther from the camera while keeping both hands in the picture.

## Verification

### Palm-contact correction — September 11, 2026

The final integrated source passes **146 application tests, 14 harness tests and 81 local browser checks**, including **28 focused gesture tests** independently rerun by a reviewer. The browser checks comprise 25 general behavior, 19 fullscreen, 11 saved-shape/editor, ten automatic-outline and 16 world-cycle/layout cases. They verify the new cue on phone-sized and fullscreen views, expiry/recovery, single advances, actual rendered color changes, and control resets. No uncaught browser errors occurred. Gesture-only cases prepared no still and made no upload. The dependency audit found no vulnerabilities. These results do not establish physical iPhone gesture accuracy.

All six command nodes passed on their first attempt in harness run `1789108279749-da71f874-9ac0-4e50-82eb-125c54bf4cde`, source fingerprint `da4923064b6378d3380eebe900c8c010c0518b01abd9641c451de490860477f4`. Its external observation gates are recorded separately; no synthetic test is used to claim a physical-camera or live-AI result.

A local replay of 484 landmark samples extracted from an owner-provided screen recording produced three completed cycles with the corrected controller, compared with one using the preceding controller on the same samples. One additional recovery followed a brief one-hand detection gap before a newly measured close; another came from accepting valid depth geometry in edge-on palms. The recording already displayed effects and was sampled at 8 fps, so this is limited replay evidence, not a raw-camera benchmark, iPhone trial or measured tracking frame rate. The source recording and extracted landmarks are not bundled with the public app or fixtures.

```sh
node --import tsx --test tests/world-cycle.test.ts
```

### Previous world-cycle and wide-view release

The preceding release passed **131 application tests and 77 local browser checks**: 25 existing behavior checks, 11 optional shape/editor cases, 19 fullscreen cases, ten automatic-outline cases and 12 world-cycle/wide-layout checks. Its 13 focused state-machine cases covered first opening, held states, exact dwell boundaries, hysteresis, fingertip contact, depth changes, scale/translation, reordered detections, malformed/lost/crossed tracking, timestamps and reset. Its former immediate-reset behavior at overlapping palms or any missing hand is superseded by the correction above.

That release's new browser suite passed on its first attempt in 33.4 seconds. Two close/reopen cycles produced exactly two world transitions and three distinct interior pixel colors. Source-edge colors verified the entire mirrored camera image; at a 1440×1050 viewport, the displayed camera grew from 954 to 1350.4 pixels wide, about 42%. Manual pointer placement reached (0.62044, 0.55093) against the normalized target (0.62, 0.55). Camera/canvas identity, mode restoration, explicit world selection, camera-only viewing, fullscreen Fit and 390/760/1440-pixel layouts passed. No uncaught page errors, uploads or still preparation occurred.

The preceding release's executable harness passed all six command nodes on attempt 1. Run `1789102213266-9211449d-ddac-488b-89fb-142e12dee636`, source fingerprint `3bad6d1bfa0fdabd2a55e113d252ed68a77b217d817f6d2aa64af4c4c9c88456`. That new test file changed the command graph, so it was an explicit new run with the same 30-step, 90-active-minute and three-attempt limits.

Cloudflare version `d88b2e83-b971-425e-8040-b3163dfc1cf9` was deployed for that release. HTML and health returned HTTP 200; HTML, JavaScript, CSS and the vision worker matched its tested production build. Its source was on the draft PR branch. Automated cases used generated camera streams and articulated landmark fixtures; they could not establish physical-camera gesture recognition, latency or a wider lens field of view. The physical-camera and then-current-source real-provider workflow gates were unobserved. This historical deployment record does not certify the palm-contact correction as deployed.

Run the focused integration checks after starting the local Worker:

```sh
node --import tsx scripts/world-cycle-browser-check.mjs http://127.0.0.1:8798
```

Independent review checked gesture reset paths, depth-only false triggers, existing AI/pinch separation, control identity and fullscreen behavior. Review narrowed an overbroad documentation statement: the new close/reopen gesture never prepares a still, while the retained long pinch in saved-shape mode still can.
