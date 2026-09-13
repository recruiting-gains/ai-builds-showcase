# Cube mode

Cube adds a luminous blue 3D form with a translucent core and layered wireframe to GhostFrame. Two hands position and resize it. Move one hand out of view to hold its size and carry it with the remaining hand; bring the second hand back to resize. A brief pinch and release changes between blue and violet/cyan appearances. This is a local camera effect; hand landmarks control an image-plane pose, not a measured 3D scan.

## Use it

1. Open GhostFrame and choose **Cube**. The labelled simulated preview works without a camera.
2. Select the front or back camera and tap **Start your camera**. Keep both hands fully visible, initially open.
3. Move both hands to position the cube and spread them apart to enlarge it. Move either hand out of view to hold that size and carry it with your remaining hand. Bring your other hand back to resize again. Pinch one thumb and index finger briefly, then open again to change the appearance once. After losing both hands, show two hands to create a fresh cube.
4. For manual control, select **Move it myself**. Drag, use the position/size sliders, or focus the camera canvas and use arrow keys. **Appearance** changes the look directly.
5. Tap **Record**, then **Stop recording**. Replay the clip and explicitly choose **Save video** or **Download**. The existing one-minute/48 MiB limit and silent recording apply. Keep the page open until saved.

The normal Cube view and fitted fullscreen preserve the selected camera's proportions. **Fill view** can crop the sides. Changing orientation or leaving Cube for a differently sized view finishes an active clip before the recording canvas changes dimensions. A normal stop releases Cube graphics; start the camera or tap **Reset effect** to resume the preview. No clip survives a page refresh unless it has been saved.

## Small implementation, existing services

```mermaid
flowchart LR
  C[Existing camera] --> V[Original pixels to existing MediaPipe worker]
  V --> G[Cube-only sizing and carry controller]
  G --> P[Bounded pose and one appearance event]
  P --> W[Transparent 3D cube renderer]
  C --> F[Final camera canvas]
  W --> F
  F --> R[Existing local recorder]
  R --> S[Explicit save or share]
```

The frontend lazily loads Three.js only when Cube is selected. One orthographic scene shares a box geometry between a translucent grain core and two separated edge cages. A fixed buffer of 192 light points adds slow internal movement. Edge width uses screen-space derivatives, with a narrow glow on the same geometry; no blur buffers or postprocessing framework are needed. The complete projected cage fits the requested size, including rotation. One transparent WebGL2 context is capped at 768 pixels on the longest edge with pixel ratio 1. The renderer copies into the final Canvas2D scene synchronously in the same paint. Reduced-motion preference freezes decorative animation.

The camera, worker, MediaPipe model, backend, Cloudflare Worker name, Workers AI binding and quota store are reused. Cube requests hand landmarks without person segmentation. No second camera, vision worker or cloud inference is created. Camera frames, local photos and recordings remain in the tab. **Send still to AI** remains an explicit separate HandFrame action; Cube cannot invoke it.

## Gesture and lifecycle contract

- Cube takes raw image landmarks, applying the selected camera mirror exactly once. Palm-center midpoint controls position. Separation is `hypot(aspect × dx, dy) / min(1, aspect)`, scaled by 0.75 and clamped to 0.15–0.65 of the shorter canvas dimension. This is image-plane control, not physical distance.
- Position and scale use time-based smoothing with a 45 ms constant. After a valid pair, either continuously identified remaining hand carries the cube. The transition preserves its current position, records an offset to the remaining palm and locks its size. Subsequent hand movement moves the cube with that offset. Returning the pair resumes smooth midpoint/separation sizing. One hand alone cannot create a new cube. No pose predicts future hand motion.
- Thumb/index distance is normalized by wrist-to-middle-knuckle length, accounting for image aspect. Open ratio is at least 0.55; close ratio is at most 0.30. All currently tracked hands must open to arm. One hand pinches for at least 120 ms and releases for one appearance event, either while sizing or carrying. Pair/single transitions cancel pending gestures and require fresh arming. A long hold never prepares a still or repeats a change. Overlapping pinches cancel the gesture and require both hands open again.
- Missing/invalid landmarks, ambiguous handedness, crossing/order reversal, large jumps, reversed/repeated timestamps, camera/aspect changes and mode/manual transitions cancel pending gestures. MediaPipe's handedness score is not treated as positional accuracy.
- On missing or invalid input, the last valid visual pose lasts at most 150 ms; the paint loop also checks expiry when inference stalls. This grace is separate from active one-hand carrying, which requires fresh samples. Loss breaks carry acquisition immediately: a single returning hand cannot revive the cube, even inside the visual grace. A pair can reacquire it, with open hands required to re-arm appearance changes. Camera-session stale-result protection remains in the existing pipeline, and Cube ignores results captured before its latest input boundary.
- Mode exit, stop, pagehide and hidden-camera release dispose owned geometry, materials, context and listeners. A renderer import finishing after disposal cannot create an obsolete graphics context. Camera-only view resets Cube gestures.
- Tracking-loss and graphics-error cues remain visible in fullscreen. Graphics failure leaves other modes available. One deliberate **Retry cube graphics once** action is allowed per page session. A second failure leaves Cube unavailable; no render-loop restart storm runs.

## Verification and boundaries

Focused controller fixtures verify ten gestures produce ten events in each front/rear × portrait/landscape combination, plus smoothing/clamps, hold, loss, stalls, hysteresis, timestamp changes, identity ambiguity, crossing and reset behavior. The full unit suite and existing harness still cover other effects, camera lifecycle and the explicit still backend.

`npm run test:cube` starts a bounded local production preview. The browser suite uses generated camera pixels and injected landmarks while exercising actual WebGL, Canvas2D, MediaRecorder, file download and replay of the downloaded bytes. It checks the translucent core, white edges, retained camera pixels and changing frames, plus a saved two-hand sizing → one-hand carry → two-hand return sequence. Bright-background and small-cube decoded frames are inspected separately for appearance. The suite also checks four coordinate cases, no media uploads, mode isolation and cleanup. Reports and synthetic clips are ignored under `test-results/`. See [independent review](CUBE-REVIEW.md) for the observed results and [recording](RECORDING.md) for existing save behavior.

The user supplied a real-camera clip of the earlier appearance showing visible cube composition and scaling. It did not verify this new appearance or one-hand carry. Physical iPhone acceptance of this update is **pending**. It requires observed front/back and portrait/landscape sessions, ten real pinch/release attempts, tracking loss and mode transitions, a 60-second Cube run compared with HandFrame on the same phone, and actual native saving/replay. Measure achieved cadence, stalls and heat; 30 fps is a target, not a verified phone claim. Desktop WebKit and Chromium fixtures do not establish iPhone performance, real tracking accuracy or Photos/share-sheet behavior.
