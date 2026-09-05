# Airframe Mac v0.1.2 — menu-bar tracking, hidden preview

Experimental local Apple silicon / macOS 14+ companion. Ad-hoc signed, not Developer ID signed or notarized.

## Changes

- Start pointer-only or explicitly opt into pinch clicks directly from the menu bar. Both actions disclose camera use and hide the window and optional face preview.
- Small colored status: gray OFF; amber CAM/WAIT/HOLD; green LIVE only for active control with a fresh detected hand. The existing three-second countdown is shown in the menu bar. Accessible text and menu status supplement color.
- Face preview is hidden by default; an optional setup checkbox reveals it. It is not necessary for hand detection. Camera frames still stay in the local AVFoundation/Vision pipeline; no recording, uploads, microphone, or browser connection.
- Closing the main window stops capture/control but keeps the menu item available. Show setup reopens it; Quit ends the app. No login item or automatic capture on launch.
- Explicit menu intent expires after 10 seconds. It waits for fresh camera delivery before arming, requires permissions already approved, and is canceled on faults, manual takeover, Stop, menu/setup opening, permission loss, sleep/session/display changes, or mode changes. Canceled hidden startup turns its camera off. Late callbacks never recreate the intent.
- Existing gesture logic, pointer-only bounded recovery, strict click-mode hand-loss cancellation, and native input boundary are unchanged.

## Verification boundary

Synthetic helper/gate tests and compilation do not prove live-camera tracking, menu interaction, or actual OS-event acceptance. UI-only checks must keep capture/control off. A separate user-led test should verify menu start with the preview hidden, countdown and indicator transitions, Escape/physical takeover, camera shutdown, window close/reopen, and pinch clicks in a harmless workspace.

The previous version's user-reported movement and pinch-to-click results are not a substitute for this new flow's hands-on acceptance. The camera remains necessary even when your face is not displayed, and Airframe must be running. Camera/control do not operate while Airframe is quit.

Development-build updates can invalidate macOS's remembered Accessibility approval. Reapprove only this exact installed app using the normal System Settings UI if required. Do not bypass privacy or signing controls.
