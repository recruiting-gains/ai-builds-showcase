# Verification

## Automated checks

Run `bash scripts/test-local.sh` from the project folder. It compiles a standalone fixture runner and checks **20 model cases and 19 response-parser cases**.

Coverage includes weekly-only and two-window accounts, actual duration labels, remaining-percentage clamping, missing allowances, unknown reset times, stale readings after read failures/age/reset, preferred versus legacy allowance data, authentication errors, and malformed responses. The fixtures are synthetic and require no sign-in.

These are not 39 hardware tests or a claim of exhaustive security testing. GitHub Actions runs the same checks, builds ARM64, and verifies the resulting app bundle without account credentials.

## Real-device verification — September 5, 2026

- ARM64 release compiled with Swift 6.3.3 on macOS 26.6.2.
- macOS 14 minimum deployment target verified in both app metadata and executable.
- Ad-hoc signature verified before and after local installation.
- Read-only live allowance retrieval succeeded with the signed-in account.
- Cruz confirmed the red Touch Bar display worked and supplied the [real hardware photograph](../../docs/assets/showcase/codex-usage-bar-red.jpg).

The photo's percentage and reset time represent that moment only. They are not hard-coded application outputs.

## Not yet established

- Intel hardware, other macOS versions, every subscription/account configuration, and future private-API compatibility have not been validated for this edition.
- The download is not Developer ID signed or Apple-notarized.
- CI does not have a physical Touch Bar and cannot establish real hardware behavior.

Release checksums are provided alongside the downloadable ZIP. This is an experimental portfolio utility with transparent limits, not a commercial reliability or security guarantee.
