# Fullscreen camera and hand shapes

HandFrame now defaults to **Follow my hands**: the window follows the opening between both thumb/index-finger chains. Joined tips and inward bends can make triangular, rounded or concave openings without choosing a preset. This is an approximate joint contour, not exact skin-edge tracing. [Automatic hand outlines and their limits](AUTOMATIC-HAND-SHAPES.md).

The Full screen button expands the camera canvas and hides the green page controls. It preserves the current camera session, world, frame position and shape. The view has a small toolbar that fades after inactivity and returns with pointer movement, a tap or keyboard focus. Exit full screen or Esc returns to the page. Fit preserves the whole camera image with black margins when needed; Fill view crops the edges to cover the available screen. Just camera temporarily hides the effect and restores it without resetting the selected design.

The browser's native Fullscreen API is requested directly from the button click. If it is unavailable or rejected, the same canvas fills the tab. Native application chrome outside the browser document is controlled by the host. Camera failure or stopping returns to visible status and controls; explicitly opening the simulated preview keeps a camera-off label visible.

## Optional saved shapes and drawing

Open **Saved shapes & drawing** for Rectangle, Triangle, Oval, Diamond, Hexagon or Star. Selecting one turns off Follow my hands. **Draw a custom shape** opens the local editor: click to add points, drag to move them, or use the arrow buttons. **Use shape** applies a valid draft and turns off automatic following; **Cancel** preserves the active design. Opening the editor alone does not change the active outline. Switching to a preset does not erase the approved custom outline. Turn Follow my hands back on to return to the measured opening.

Custom outlines use 3–12 vertices and may be concave. Crossed or touching edges, repeated vertices, collapsed shapes and out-of-bounds coordinates are rejected. The editor keeps an invalid draft separate from the active design. The oval uses a bounded 64-segment outline. These are flat cutouts moved in perspective, not reconstructed 3D objects or a freehand brush.

Choose a world before entering fullscreen. With Follow my hands on, form the opening directly and use the world buttons or Prepare a still; pinch shortcuts are disabled so joining fingers cannot accidentally change the world or prepare a crop. With it off, two-hand position/depth controls move the saved outline and the quick/0.6-second pinch shortcuts remain available. Mouse controls provide a separate fallback. Center depth establishes a neutral palm-size reference; depth remains an estimate affected by palm orientation.

## Rendering and data

The texture and its border share a projectively mapped outer clip. Concave notches remain transparent to the unmodified camera behind the shape. The renderer retains its bounded 8×6 mesh and single-draw affine path, 768×432 canvas and 384×256 texture. Fullscreen scales the same canvas without requesting another stream. Automatic contours already contain the hands' visible tilt, so the extra perspective treatment applies depth without rotating that tilt a second time.

Shape editing and fullscreen controls make no uploads. Preparing an AI still continues to show the entire rectangular source crop before explicit submission; the shape clips the displayed result, not the uploaded source pixels. The preparation message states this distinction. No private reference or camera media is included in source or test fixtures.

## Verification

Acceptance requires correct clipping in neutral and both perspective directions, usable draft editing and cancellation, working fullscreen entry/exit and rejection recovery, aligned pointer input, preserved camera identity and no unintended uploads. Browser checks use the original procedural preview and explicitly labelled mocks; they do not establish physical-hand latency.

The preceding fullscreen/saved-shape update passed 88 application tests, 25 existing browser checks, 11 shape browser checks, nine fullscreen cases and eight print-flow scenarios. Those checks cover preset and custom clipping, editor recovery, native Chrome fullscreen, fallbacks, fit/fill pointer alignment, keyboard navigation, generated-stream identity and delayed fullscreen requests. They are the prior baseline, not verification of the new automatic-outline integration.

The published automatic-outline update passes **102 application tests (including 24 focused contour/perspective tests), 55 browser checks and eight controlled motion scenarios**. Live HTML and health return HTTP 200, and JavaScript/CSS match the tested build. [Current automatic-outline acceptance scope](AUTOMATIC-HAND-SHAPES.md#verification).

Independent review found and corrected two lifecycle edges: an older fullscreen completion must not close a newer desired entry, and closing the editor must release an active point drag. Browser regressions cover both. These tests use generated streams and a stub tracker for fullscreen lifecycle coverage; the existing integration suite separately exercises MediaPipe with generated camera input. No physical camera or paid AI request was used for this update.

Run after starting the local Worker:

```sh
node scripts/browser-check.mjs http://127.0.0.1:8798
node --import tsx scripts/hand-outline-browser-check.mjs http://127.0.0.1:8798
node --import tsx scripts/shapes-browser-check.mjs http://127.0.0.1:8798
node scripts/fullscreen-browser-check.mjs http://127.0.0.1:8798
```

Fullscreen behavior follows the browser's [requestFullscreen API and events](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen). A fallback expands the web document; it cannot promise control over the surrounding app window.
