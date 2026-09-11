# Fullscreen camera and custom shapes

The Full screen button expands the camera canvas and hides the green page controls. It preserves the current camera session, world, frame position and shape. The view has a small toolbar that fades after inactivity and returns with pointer movement, a tap or keyboard focus. Exit full screen or Esc returns to the page. Fit preserves the whole camera image with black margins when needed; Fill view crops the edges to cover the available screen. Just camera temporarily hides the effect and restores it without resetting the selected design.

The browser's native Fullscreen API is requested directly from the button click. If it is unavailable or rejected, the same canvas fills the tab. Native application chrome outside the browser document is controlled by the host. Camera failure or stopping returns to visible status and controls; explicitly opening the simulated preview keeps a camera-off label visible.

## Shape design

HandFrame supports Rectangle, Triangle, Oval, Diamond, Hexagon and Star. Draw a custom shape opens a local polygon editor. Click to add points, drag a point to move it, or select a point and use the arrow buttons. Add point inserts another vertex; Remove deletes the selected vertex. Start over clears the draft. Use shape applies a valid draft, while Cancel preserves the approved design. Switching to a preset does not erase the approved custom outline.

Custom outlines use 3–12 vertices and may be concave. Crossed or touching edges, repeated vertices, collapsed shapes and out-of-bounds coordinates are rejected. The editor keeps an invalid draft separate from the active design. The oval uses a bounded 64-segment outline. These are flat cutouts moved in perspective, not reconstructed 3D objects or a freehand brush.

Example: choose Cyanotype, choose Triangle, then bring one hand closer while lifting the other. To create an asymmetric shape, open the custom editor, start over, place five points around your desired outline, and select Use shape. The same controls and print worlds work with that outline.

## Rendering and data

The texture and its border share a projectively mapped outer clip. Concave notches remain transparent to the unmodified camera behind the shape. The renderer retains its bounded 8×6 mesh and single-draw affine path, existing 768×432 canvas, 384×256 texture and tracking schedule. Fullscreen CSS scales the actual canvas bounds without changing input coordinates or requesting another stream.

Shape editing and fullscreen controls make no uploads. Preparing an AI still continues to show the entire rectangular source crop before explicit submission; the shape clips the displayed result, not the uploaded source pixels. The preparation message states this distinction. No private reference or camera media is included in source or test fixtures.

## Verification

Acceptance requires correct clipping in neutral and both perspective directions, usable draft editing and cancellation, working fullscreen entry/exit and rejection recovery, aligned pointer input, preserved camera identity and no unintended uploads. Browser checks use the original procedural preview and explicitly labelled mocks; they do not establish physical-hand latency.

Verified checks: 88 application tests, the existing 25 browser checks, 11 shape browser checks and nine fullscreen cases pass. The shape suite compares rendered pixels in 18 preset/perspective combinations and checks concave custom outlines, border clipping, keyboard editing, invalid drafts, point limits, drag cancellation and responsive layouts. Its automated WCAG A/AA scan reports no violations. The fullscreen suite verifies native Chrome entry, absent/rejected API fallbacks, fit/fill pointer alignment in landscape and portrait, keyboard navigation, a single generated camera stream through entry/exit, camera disconnection, and delayed request ownership in both completion orders. All eight existing print-flow scenarios still pass.

Independent review found and corrected two lifecycle edges: an older fullscreen completion must not close a newer desired entry, and closing the editor must release an active point drag. Browser regressions cover both. These tests use generated streams and a stub tracker for fullscreen lifecycle coverage; the existing integration suite separately exercises MediaPipe with generated camera input. No physical camera or paid AI request was used for this update.

Run after starting the local Worker:

```sh
node scripts/browser-check.mjs http://127.0.0.1:8798
node --import tsx scripts/shapes-browser-check.mjs http://127.0.0.1:8798
node scripts/fullscreen-browser-check.mjs http://127.0.0.1:8798
```

Fullscreen behavior follows the browser's [requestFullscreen API and events](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen). A fallback expands the web document; it cannot promise control over the surrounding app window.
