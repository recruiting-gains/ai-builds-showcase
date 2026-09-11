# Automatic hand outlines

HandFrame follows the opening formed by both thumbs and index fingers. **Follow my hands** is on by default. The window comes from the detected finger joints, without selecting a preset or classifying the pose as a named shape.

Status: published on the live site, with matching production assets. All 102 application tests, 55 browser checks and eight controlled motion scenarios pass. Physical-camera accuracy remains unverified.

## Use it

1. Select HandFrame and start the camera. Keep Follow my hands on and Mouse & keyboard controls off.
2. Hold both hands in view, palms toward the camera, with an open space between the thumbs and index fingers. Join the tips, bend the fingers or spread them apart to change the opening.
3. Hold your hands at a similar distance and select Center depth. Move one hand closer to stretch that side of the picture. Lifting or turning your hands also changes the measured outline.
4. Choose a world with the buttons. Use Prepare a still when wanted; pinch shortcuts are disabled while Follow my hands is on.
5. Select Full screen for a clean view. Move or tap to reveal its toolbar. Fill view crops the camera to fill the screen; Fit shows the whole image. Just camera temporarily hides the effect. Esc returns to the controls.

Saved shapes & drawing remains optional. Selecting a preset or applying a custom draft turns off Follow my hands; opening or cancelling the editor does not replace the active design. Turn Follow my hands back on to return to direct shaping. With it off, a quick pinch changes the world and a 0.6-second pinch prepares a still. Mouse controls can position, resize and tilt a saved outline without live hand tracking.

## What the contour represents

The tracker connects seven thumb/index landmarks on each hand in anatomical order. It mirrors camera coordinates for the display, merges nearby adjacent joined tips, and keeps valid inward bends. It uses all those joints to fit the opening, including when joined fingertips alone would give a zero-width rectangle. A rounded opening is still a short polygonal approximation of the detected joints.

Small landmark fluctuations are smoothed; deliberate changes follow promptly. Smoothing always uses the same anatomical indices before joined points are merged. Both the incoming and smoothed contours are checked for crossings and negligible area. Missing hands, malformed tracking, crossed contours, tiny openings, time discontinuities and large tracking jumps hide the window and reset its state. A valid opening must be reacquired; there is no automatic square replacement.

This does not trace exact skin edges, segment every finger, or reproduce every arbitrary shape a hand could make. Occlusion, crossed fingers, camera angle and low light can prevent a usable contour. Depth comes from relative apparent palm size, not measured distance; palm rotation can affect it. The outline already includes visible screen tilt, so automatic rendering applies the additional depth treatment without adding that tilt twice.

## Local processing and stills

Outline tracking, worlds, print textures and fullscreen operate locally. Preparing a still shows the entire selected rectangular crop; the contour clips its display, not the source pixels submitted to AI. Only Send still to AI uploads that reviewed crop. No reference media or physical-camera recordings are included in the synthetic fixtures.

## Verification

The 24 focused tests cover direct rectangle-like, triangular, rounded and concave openings; joined-tip merging; bounds and mirroring; detector reordering; asymmetric joining/separation; deformation and jitter; invalid tracking; timestamp handling; teleport recovery; and the optional joined-tip perspective reference. Existing perspective behavior remains covered.

On synthetic joint input, a deliberate 1.5% image translation and a rectangle-to-concave deformation followed in one update. Stationary translation noise with RMS 0.001 normalized units produced contour RMS 0.000139. These are geometry/filter measurements, not measured webcam latency or proof of physical-hand accuracy.

```sh
npx tsx --test tests/hand-outline.test.ts tests/perspective.test.ts
```

Ten automatic-outline browser checks use a generated gray camera stream and deterministic landmarks. They verify four changing outlines without preset selection, actual heart-notch/triangle pixels, movement, missing/weak/crossed tracking and recovery, pinch suppression, both depth directions, all layouts, an explicitly submitted mocked still, saved-shape/mode transitions and camera restart. The other 45 browser checks cover existing behavior, optional shape editing and fullscreen. The live build matches the tested assets; see the [verification record](VERIFICATION.md).

```sh
node --import tsx scripts/hand-outline-browser-check.mjs http://127.0.0.1:8798
```

The browser run is bounded to two minutes with six-second action waits. Its first run caught a test-driver restart race: the fixture was sent before the replacement camera worker was ready. Waiting for the camera-on state corrected the driver; the successful run and original failed report are retained separately. An independent source review also found a missing-palm validation hole; the corrected runtime and regression now reject it safely and reacquire at neutral.
