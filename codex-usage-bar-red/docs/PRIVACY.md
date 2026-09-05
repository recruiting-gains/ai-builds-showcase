# Privacy and boundaries

- The utility starts the installed Codex executable with a standard-input/output connection, completes initialization, and requests `account/rateLimits/read`.
- The existing Codex client handles its own sign-in and contacts OpenAI to retrieve account allowance. **Local UI does not mean an offline usage source.**
- The utility does not directly read authentication files, API keys, cookies, conversations, or other project files. It has no third-party network SDK or telemetry code.
- It does not send AI prompts, start model conversations, redeem allowance resets, purchase credits, change billing, or request camera/Accessibility permissions.
- Account allowance data stays in the running app's memory. Settings use the app-specific preference domain `com.recruitinggains.codexusagebar.red`. Server diagnostic output is discarded rather than saved.
- The optional live self-test prints remaining allowances to the terminal. Fixture tests and CI use synthetic data only.
- The Official Usage button opens OpenAI's usage page in your browser when clicked. OpenAI and the existing Codex client's normal service/privacy policies still apply.
- Launch at login is opt-in. Automatic refresh happens approximately every five minutes while the app is running and the Mac is awake.
- Displayed usage on a keyboard or in a screenshot can be seen by people nearby. Do not include private account information when reporting issues publicly.

This source review is not a security certification. The published app is not Apple-notarized, and its automatic Touch Bar presentation depends on private macOS APIs. Review the code and platform limitations before using it.
