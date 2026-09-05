# Airframe Mac v0.1.0 — experimental local gesture control

A separate native companion to the Airframe browser playground. Uses Apple Vision on your Mac to aim the system cursor, with optional left clicks and dragging. No browser bridge, control server, video upload, microphone, or recording.

**Apple silicon / macOS 14+. Ad-hoc signed, NOT Developer ID signed or notarized.** This is a development prerelease, not a production-ready public installer. A downloaded copy may be blocked by Gatekeeper. Review the source and signing limitations; do not disable macOS security controls or strip quarantine attributes.

Start with camera preview, then manually grant Accessibility if you choose to use system control. Leave clicks unchecked for the first trial. Explicit Start, a countdown, and a steady open hand are required. Escape stops inside Airframe and system-wide while control is armed; physical mouse/trackpad or keyboard input pauses control. Tracking loss, stale frames, sleep/session/display changes, and permission revocation disarm control. Stop before locking or leaving the computer.

Local evidence: ARM64 release build and strict ad-hoc signature checks passed; 33 standalone synthetic check groups / 325 assertions passed; real Apple Vision recognized a hand in a public still photograph without opening a camera or posting system input. Initial native UI was inspected with camera off, clicks unchecked, and control disabled. The repository also contains 44 XCTest cases and macOS CI.

**Not yet physically acceptance-tested:** real webcam gestures, Accessibility/Camera approval flows, global Escape delivery, cursor/click/drag effects, protected system screens, and cross-device ergonomics. A consenting hands-on test is required. Releasing an already held click may activate an item, and no software-only safety guarantee covers app/OS crashes.

No right-click or scrolling gestures, keyboard typing, screen reading, arbitrary app commands, Windows support, or remote access are included.

Read the [setup guide](https://airframe.recruiting-gains.workers.dev/mac/) and the [native safety checklist](https://github.com/recruiting-gains/ai-builds-showcase/blob/main/airframe/native/docs/SAFETY.md) before enabling control.
