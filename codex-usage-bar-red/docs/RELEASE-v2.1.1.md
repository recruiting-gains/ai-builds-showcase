# Codex Usage Bar Red v2.1.1

See your remaining Codex allowance on a red Touch Bar and matching menu-bar display. This release is an independent MIT-licensed adaptation of [yizhigou's Codex Usage Bar](https://github.com/yizhigou/codex-usage-bar), with original license and notices preserved.

## Download

- **Codex-Usage-Bar-Red-v2.1.1-arm64.zip** — Apple Silicon Macs, macOS 14 or newer.
- **SHA256SUMS.txt** — checksum for verifying that ZIP.

A physical Touch Bar is required for the keyboard display. An installed, signed-in compatible ChatGPT/Codex client is required for usage retrieval. No API key, BetterTouchTool purchase, or web deployment is needed.

**Experimental prerelease:** the app is ad-hoc signed, not Developer ID signed or Apple-notarized. macOS may block it as unidentified. Review the source and the [installation/security notice](https://github.com/recruiting-gains/ai-builds-showcase/tree/main/codex-usage-bar-red#install-and-use) before deciding whether to open it. Do not disable your Mac's security protections or override malware warnings. Intel is not included in this download.

## Red-edition improvements

- Red progress bars and clearly labeled percentages remaining.
- Allowance labels based on actual returned durations; weekly-only accounts do not get a fabricated five-hour bar.
- Automatic five-minute refresh, manual refresh, and reported reset times.
- Explicit low-allowance and stale-reading warnings.
- Bounded read-only usage connection, documented initialization handshake, and process cleanup.

## Verification

39 deterministic model/parser checks passed locally. The ARM64 app compiled, its bundle signature verified, and read-only allowance retrieval succeeded. The real red Touch Bar display was confirmed on a Mac running macOS 26.6.2; a user-supplied photograph is in the showcase. This is not an exhaustive compatibility or security certification.

[Project page and source](https://github.com/recruiting-gains/ai-builds-showcase/tree/main/codex-usage-bar-red) · [Privacy](https://github.com/recruiting-gains/ai-builds-showcase/blob/main/codex-usage-bar-red/docs/PRIVACY.md) · [Attribution](https://github.com/recruiting-gains/ai-builds-showcase/blob/main/codex-usage-bar-red/docs/ATTRIBUTION.md)
