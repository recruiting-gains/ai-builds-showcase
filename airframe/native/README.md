# Airframe Mac — experimental desktop companion

The website moves panels inside a browser. This separate native app is intended to let a consenting user move the **actual Mac pointer** using a camera and hand gestures. It is a local Swift/AppKit application using Apple's Vision framework—not a browser permission bypass, network daemon, or remote-control service.

This is an experimental local build for **Apple silicon Macs running macOS 14 or later**. The camera and computer control must be enabled separately. Start with preview only and keep a physical mouse or trackpad available.

## Build without starting the camera

Install Apple's Xcode or Command Line Tools, then run from this directory:

```sh
bash scripts/build-app.sh
```

The script runs the dependency-free deterministic core harness, compiles the Apple silicon executable, assembles `dist/Airframe Mac.app`, checks its ad-hoc signature, and creates `dist/Airframe-Mac-apple-silicon.zip`. It does **not** open the app, install it in Applications, ask for permissions, start the camera, or move the pointer.

Recognized previous generated builds are moved into timestamped `dist/archive-*` folders, not deleted. Unrecognized output apps and symlinks are refused. Failed staging folders are left available for inspection. No existing installed application is overwritten.

To run only the local deterministic harness:

```sh
swift run AirframeChecks
```

The separate XCTest suite requires a full Xcode installation; Apple Command Line Tools alone may not include XCTest. The macOS CI workflow runs it with:

```sh
swift test
```

Both test forms use simulated observations and do not establish real-camera tracking quality, macOS permission behavior, or safe interaction with other applications. Report their results separately: a passing local harness is not evidence that XCTest ran.

## Before using computer control

1. Read [Safety and limitations](docs/SAFETY.md). Use a harmless, empty workspace—not a payment page, terminal, unsaved document, or sensitive account.
2. Open the app yourself. Its initial state must leave the camera and computer control off.
3. Enable camera preview explicitly and approve the Camera request if you choose. Confirm that your hand is detected and that the preview direction feels correct before enabling control.
4. Grant Accessibility permission only if you want the app to control the Mac pointer. Camera permission alone is not consent to computer control. If the app cannot establish its emergency-stop monitors, do not enable control.
5. Start in pointer-only mode. Computer control uses an explicit countdown; clicking is a separate opt-in. Keep your other hand near Escape or the physical mouse/trackpad.
6. Use Stop when finished. Escape is available inside the Airframe window, and the app installs a system-wide Escape monitor while Mac control is armed. Do not assume a protected macOS context will deliver every key event. Stop the camera separately if it is still in preview mode, and confirm its indicator is off before assuming capture has ended.

### Pointer-only recovery in v0.1.1

A brief missed hand detection now **freezes the cursor**, instead of immediately ending pointer-only control. The app shows **POINTER FROZEN · FINDING HAND**. Within a fixed **1.25-second** window, return your open hand near its previous position and keep it open for **500 milliseconds**. Reliable tracking can then continue the same explicitly started session. No movement is guessed during the freeze; a returning hand too far from the last pointer position cannot resume it.

If recovery takes too long, press **Start Mac control** again. Clicking/dragging mode still stops immediately on any missing hand reading and releases a button the app owns. Camera/inference errors, stale data, manual mouse/keyboard takeover, permission changes, and explicit Stop remain hard stops in both modes. They never automatically resume.

This improves the handling of short detection misses; it is not a claim that all cameras or lighting conditions track reliably. Keep the full hand and wrist visible, use front lighting, and start with small movements. Read [v0.1.1 release notes](docs/RELEASE-0.1.1.md) for the remaining live-device checks.

The exact tested feature set and remaining acceptance checks are recorded in [SAFETY.md](docs/SAFETY.md). Do not describe the app as unattended, perfectly accurate, or production-ready.

## Permissions and privacy

Apple requires an explanatory camera usage string and explicit user consent for camera access. Airframe declares the camera entitlement; this declaration does not grant access. The build has no microphone entitlement or microphone usage request. [Apple: requesting camera authorization](https://developer.apple.com/documentation/avfoundation/requesting-authorization-to-capture-and-save-media)

Accessibility is powerful: it can allow an app to control other software on your Mac. The user must enable or revoke it in **System Settings → Privacy & Security → Accessibility**. Airframe must not enable it automatically. [Apple: accessibility access](https://support.apple.com/guide/mac-help/allow-accessibility-apps-to-access-your-mac-mh43185/mac)

The intended native architecture processes camera frames locally, has no server or browser bridge, does not record video, and does not upload frames. This build is **not App Sandbox-constrained**; absence of networking in the implementation is not an operating-system network sandbox guarantee.

## Signing and distribution limits

The build script applies an **ad-hoc local signature** using `codesign --sign -`. This is **not Developer ID signing and not notarization**. A successful signature verification confirms the local bundle is internally consistent; it does not prove Apple reviewed it, establish a trusted publisher, or guarantee that Gatekeeper will allow a downloaded copy to open.

The ZIP is useful as a development artifact, not a polished public installer. AirDrop/downloaded copies may receive additional macOS checks. Do not strip quarantine attributes, disable Gatekeeper, or modify privacy databases to make it run. Rebuilding an ad-hoc-signed app can also change the identity macOS uses for remembered permissions; permission behavior must be checked on the actual build.

If Accessibility is ON in Settings but Airframe still says not approved after a quit/reopen, macOS may have retained an earlier development build's identity. With the app closed, remove only **Airframe Mac** from the Accessibility list, use **+** to add the exact installed copy, and approve it again. Do not reset other apps' permissions. If clicking the row does not select it, focus the app list with Tab and use the arrow keys; verify Airframe Mac is selected before using **−**. Reopen the app and check its own approved status before starting the camera or control.

A customer-ready release needs a Developer ID certificate, an appropriately tested hardened-runtime configuration, notarization, and testing on a clean Mac. Apple explicitly excludes ad-hoc signatures from the normal notarization requirements. [Apple: preparing software for notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

## Source structure

- `Sources/AirframeCore`: deterministic gesture and safety logic; no real camera or pointer effects in its tests.
- `Sources/AirframeChecks`: dependency-free local synthetic-check executable.
- `Sources/AirframeMac`: native interface, camera lifecycle, and the guarded OS-input boundary.
- `Info.plist`: bundle identity and the camera explanation.
- `entitlements.plist`: camera capability declaration only.
- `scripts/build-app.sh`: local packaging; no automatic installation or launch.

The Cloudflare website remains a browser-only demonstration. Installing or granting access to this native companion is a separate, explicit user decision.
