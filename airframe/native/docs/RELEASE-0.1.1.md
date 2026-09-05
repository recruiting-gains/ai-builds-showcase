# Airframe Mac v0.1.1 — pointer-only stability update

Experimental Apple silicon / macOS 14+ companion. **Ad-hoc signed, not Developer ID signed or notarized.** The original v0.1.0 release remains available; this is a separate development update.

## What changed

- A fresh missed hand detection in pointer-only mode freezes the pointer and displays **POINTER FROZEN · FINDING HAND**.
- A new 500 ms open-hand sequence near the previous pointer position can resume the same started session within a fixed 1.25-second window. Repeated misses never extend the window. A far-away or pinched hand does not qualify.
- No pointer/button events are emitted during recovery. Longer loss requires Start again.
- Click-and-drag mode retains immediate cancellation and owned-button release on any missing hand observation.
- Missing-hand observations now carry sample timing. Camera/inference faults and stale samples are distinct hard-stop events; pending faults cannot be replaced by a queued successful observation.
- Manual mouse/keyboard takeover, Escape, permission changes, camera stop, sleep/session/display changes, and explicit Stop still disarm control. No recovery after a hard stop.

## Installation and permission

Quit the old app before updating. Keep a backup of it. Launch begins with camera/control off and clicks unchecked. Because this update changes the ad-hoc signing identity, a previously ON Accessibility entry may still refer to the old build. Use System Settings to remove **only Airframe Mac** from Accessibility, then add the exact installed updated app and approve it. Do not alter privacy databases, other apps' permissions, Gatekeeper, or quarantine attributes. Check the approved label inside Airframe before testing.

## Verification limits

Local verification on September 4, 2026 (America/Chicago): **60 standalone synthetic groups / 642 assertions passed**, and the ARM64 release executable compiled. The separate full-Xcode suite contains **73 XCTest cases**; local Command Line Tools do not provide XCTest, so its execution is verified separately through macOS CI. Browser/Worker regression checks passed **67 unit tests and 25 browser check groups**, including the setup page at desktop and mobile sizes. Automated checks never opened a physical camera or emitted native OS input.

The deterministic tests exercise simulated dropouts, recovery deadlines, open-hand readiness, stale data, authorization loss, and click-mode cancellation. Passing tests do not establish real-camera reliability or safe interaction with other apps. The updated recovery behavior, camera timing, and physical stop routes still require a consenting hands-on trial. The previous version's user-led trial confirmed cursor movement but reported frequent hand-loss stops; it does not validate this new version.

No new network connection, website-to-Mac bridge, microphone, recording, or remote control is added. Read [Safety and limitations](SAFETY.md) and [setup instructions](../README.md) before use.
