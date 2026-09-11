# Continuous palm visibility

Invisible now follows hand closure continuously: **open palm = fully visible; close the hand = fade toward hidden; reopen = visible again**. A clearly open palm first arms the controlling hand. The former 850 ms held-palm toggle is retired from the interface.

Status: the current local build passes 118 application tests and 74 browser checks, including nine focused palm checks and 19 fullscreen cases. Eight print-flow scenarios also pass. The deployed HTML, JavaScript, CSS and vision worker match the tested build. Generated-camera checks and the separate [actual-model benchmark](HANDFRAME-RESPONSIVENESS.md) do not establish physical-hand accuracy or latency.

## Use it

1. Start the camera, select Invisible, and keep the camera still.
2. Select Capture empty background and step completely out for five seconds. A saved empty room is required before hiding anything.
3. Return and show a clearly open palm toward the camera. Close that hand slowly to fade, then reopen it to restore visibility.
4. Keep the same hand in view. If tracking is lost, show a clearly open palm again to re-arm. A reacquired fist cannot immediately take control.

The Visible/Ghost/Hidden buttons and slider remain available. The framed portal uses manual visibility and does not follow palm closure; leaving portal mode requires a new open palm. Background capture requires fresh tracking and a fresh person mask, and resets palm control. Stopping the camera restores visibility and returns to the labelled preview.

## How it behaves

The controller combines finger-joint bend with fingertip reach relative to the palm. Relative geometry handles changes in hand size and orientation within the accepted viewing range. Weak, malformed, collapsed and edge-on hands are rejected. Wrist proximity and known handedness help maintain the controlling hand when detector order changes.

An open hand returns fade 0 and a sufficiently closed fist returns fade 1. Partial closure is smoothed. The early response starts gently rather than mapping hand closure to an identical percentage of invisibility. Tracking loss returns no new target, preserving the current setting while disarming the gesture. Backward/stale timestamps, ambiguous hand ownership and large wrist jumps also require re-arming.

The person mask is supplemented with approximate coverage around measured finger segments, the palm and a short wrist/forearm extension. This helps hide hands that the person segmenter misses. Invalid hands or implausibly long finger segments add no coverage; the person mask remains available. Supplemental coverage is rebuilt from current landmarks, without retaining the previous hand geometry. It is a geometric approximation and can include nearby background or miss skin edges.

## Scheduling and recovery

Hand detection prefers GPU when supported. Initialization can fall back to CPU; a GPU detection failure has one concrete CPU recovery attempt. A further failure stops tracking and exposes recovery controls. GPU availability and speed depend on the browser/device.

Both effects schedule fresh hand input with a 16 ms minimum interval and one job in flight. Person segmentation has a 50 ms minimum within the same worker. It therefore runs at most 20 times per second and still delays the hand result on frames where it runs. The inference metric includes combined worker processing; it is not end-to-end camera latency. No fixed frame rate or latency improvement is guaranteed.

## Verification

The nine focused browser checks use generated camera colors, articulated synthetic hands, and a person mask deliberately missing the hand. They verify the saved-room prerequisite; refusal to capture a background with a stale person mask even when hand tracking is fresh; continuous body/hand blending; reopening; partial pixel blends; loss and malformed-hand recovery; separation from portal controls; camera stop; and no uploads or uncaught errors.

The recorded browser sequence was **0%, 3%, 43%, 94%, 100%, 94%, 43%, 3%, 0%** for open, quarter, half, mostly closed, fist, and reopening. The unit suite separately checks early closure, exact endpoints, scale/rotation, noise, detector reordering, input validation, ownership and timestamps. These measurements describe those fixtures, not a universal calibration for every hand.

```sh
npx tsx --test tests/palm-visibility.test.ts
node --import tsx scripts/palm-browser-check.mjs http://127.0.0.1:8798
```

The browser command expects the local Worker to be running and makes no provider call. Broader regression results, performance measurements and verified deployment receipts belong in the separate [verification record](VERIFICATION.md).
