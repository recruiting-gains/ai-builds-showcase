# Print filters and continuous rendering

Risograph, Cyanotype and Stippling bring HandFrame to eleven local worlds. The reference direction is layered colored ink, blue photographic printing, and red ink dots on ivory. These are original local image effects that update with the preview and move on the existing perspective surface. They are also supported as allowlisted looks for explicitly submitted AI stills.

## Acceptance and implementation

- Risograph separates the image into cyan and gold pigment, with a one-pixel registration offset and paper grain.
- Cyanotype uses Prussian-blue pigment and textured light paper.
- Stippling uses red dots whose coverage changes smoothly with image brightness.
- Grain and dot positions stay fixed in texture coordinates, with fractional edges instead of frame-time randomness. The filters preserve alpha and do not retain source images between calls.
- Processing stays at the existing 384×256 texture size. Rendering continues to warp that texture as the hands move.
- A generated image is rebuilt only when its identity, selected style or layout changes. Live textures also invalidate when the decoded video time or integer source crop changes. Stop/clear resets the cache. Pose changes alone never freeze the surface.

The existing tracking schedule and perspective mesh remain in use. The baseline already painted at about 60 updates per second in the controlled test, so this change reduces repeated image work and adds stable print textures rather than claiming a new measured physical-hand latency. All three effects use the existing single perspective surface.

## Verification

78 application tests and 25 browser checks pass. Tests cover real spatial texture, repeatability, dimensions, alpha, tone, ink offset, antialiased dots, brightness perturbations, all eleven rendered world choices, and validated selected-crop requests for all eleven backend styles. Provider responses are mocked for this update; the new AI prompt aesthetics have not been judged from paid provider outputs.

The flow check uses a procedural animated preview and a mocked returned still in isolated Chrome, with 120 changing perspective/tilt poses per scenario. It compares an existing Ocean style with all three print effects. These are renderer measurements, not physical webcam-to-display latency measurements.

In the baseline, a restyled frozen image required 120 texture readbacks across 120 poses. With caching, it requires one while the surface still paints all 120 poses. All eight final scenarios painted 120 frames in about two seconds, with 95th-percentile paint intervals of 17.0–17.6 ms and no gaps over 34 ms. These short controlled runs establish consistent renderer pacing on the test machine, not a device-wide latency guarantee. The final flow report and strong-perspective screenshots are kept locally in ignored test-results. No supplied video, extracted reference frames or camera media are included in public source.

At widths from 320 to 1440 pixels, the world controls have no clipping or midword name wrapping. Narrow screens use three columns; normal word-boundary wrapping is allowed for longer two-word names.

To reproduce after starting the local Worker:

```sh
node scripts/browser-check.mjs http://127.0.0.1:8798
node scripts/print-flow-check.mjs http://127.0.0.1:8798 prints
```
