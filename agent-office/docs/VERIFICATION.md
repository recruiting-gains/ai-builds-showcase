# Verification

## Verified locally

- Production static export and TypeScript checking passed.
- Local native Swift build and ad-hoc signing passed.
- Eleven automated tests cover path/root scope, event projection, structured failure handling, immediate agent assignment, stale status, bounded history, interrupted uploads, missing configuration, and hook-to-server integration.
- HTTP tests cover missing tokens, foreign Origin, forged Host, unsupported operations, symlink traversal, and oversized events.
- Hook tests assert exactly empty JSON output and no stderr even when configuration is missing.
- Original artwork inspected; robot alpha verified.
- Dependency audit after targeted updates: zero reported vulnerabilities at the time of the check.

## Explicit limitations

- Real Codex desktop hook activation has not been verified. No current task is represented as live until a valid approved event arrives.
- The missing current-daemon control socket was not bypassed; the experimental polling proof was removed from the shipping code.
- No transcript scanning, task-message readback, invented agent conversations, automatic root discovery, or automated repairs.
- “Turn ended” is not project success. Silence is not completion.
- The hook knows a failure only when the supported payload supplies a structured failure flag.
- Browser interaction/screenshot QA and screen-reader testing were not requested or performed. Build and HTTP checks do not substitute for them.
- Two optional WebMCP tools are implemented with feature detection. No supported WebMCP validation context was available; their live registration/execution is unverified.
- Native binary is locally signed, not notarized; distribution Gatekeeper behavior on other Macs has not been tested.

## Loop used

Define the smallest observable behavior → implement → test with fixtures and real local HTTP → independent adversarial review → fix concrete findings → rerun checks.

The independent review caused explicit task allowlisting, preserved immediate parent links, request abort handling, single-flight timed polling, client-side stale expiry, and stable robot component identities. This is an engineering feedback loop, not a special model-training method.
