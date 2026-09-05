# Local observer connection

Status: adapter tested with synthetic lifecycle events; current desktop activation not yet verified.

## Scope and trust

The observer is opt-in per project and per root task. It does not scrape chat history, read transcripts, connect to private desktop internals, start agents, or alter approvals.

1. Build and launch the Mac app.
2. Create `office.local.json` inside your user's `Library/Application Support/Agent Office` folder, using `office.example.json`.
3. Add exact approved project directories and root task IDs. Do not add broad home-directory paths. Set short, non-sensitive project labels.
4. Restart the office after changing that configuration.
5. Add the reviewed command hook to that project's `.codex/hooks.json`, preserving existing hooks.
6. Review and trust the exact hook definition using the documented Codex CLI `/hooks` interface. Project-level configuration must also be trusted.
7. Observe one authorized real task event. Only then call the connection live.

The command structure is:

```text
/absolute/path/to/node /absolute/path/to/Agent Office.app/Contents/Resources/bridge/hook.mjs /absolute/path/to/office.local.json /absolute/path/to/runtime.local.json
```

Quote every argument that contains spaces. In the project hook file, use this structure, substituting that exact reviewed command:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "YOUR_REVIEWED_COMMAND",
            "timeout": 1
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "YOUR_REVIEWED_COMMAND",
            "timeout": 1
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "YOUR_REVIEWED_COMMAND",
            "timeout": 1
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "YOUR_REVIEWED_COMMAND",
            "timeout": 1
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "YOUR_REVIEWED_COMMAND",
            "timeout": 1
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "YOUR_REVIEWED_COMMAND",
            "timeout": 1
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "YOUR_REVIEWED_COMMAND",
            "timeout": 1
          }
        ]
      }
    ],
    "Interrupt": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "YOUR_REVIEWED_COMMAND",
            "timeout": 1
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "YOUR_REVIEWED_COMMAND",
            "timeout": 1
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "YOUR_REVIEWED_COMMAND",
            "timeout": 1
          }
        ]
      }
    ]
  }
}
```

This guide is not evidence that a currently running desktop task hot-reloads these hooks. If it does not, keep the display disconnected. Do not start another daemon and call its empty activity the current task.

## Data handling

The hook process receives Codex's hook payload, immediately selects only session/agent IDs, event name, exact allowed cwd, and a boolean structured failure indicator, and discards all other fields. It never opens a transcript. The local server checks approved task ancestry, hashes display IDs, and exposes only labels, statuses, immediate-parent relationships, and receive timestamps.

The runtime capability is random per app launch, stored with mode 0600 outside the served website. It is passed to the native page in a fragment and removed from the address after initialization. It is never placed in Git, public hosting, analytics, or printed logs.

Failure to connect is silent for the task: the hook emits `{}`, exits successfully, and never emits an approval, context injection, stop instruction, or continuation request.

## Safety boundaries

- Local server binds only to 127.0.0.1.
- API access requires the per-launch capability.
- Exact Host, Origin, and fetch-site checks prevent ordinary cross-site access.
- There is no CORS opt-in or tunnel.
- API operations are limited to status reads and sanitized event intake.
- Pausing animation does not pause an AI task.
- Quit the office to stop its local server. Remove only its specific project hook entries to disconnect; preserve all other hooks.

Sources: [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Codex App Server](https://learn.chatgpt.com/docs/app-server).
