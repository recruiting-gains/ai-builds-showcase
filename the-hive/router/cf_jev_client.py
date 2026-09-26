#!/usr/bin/env python3
"""Minimal Cloudflare Workers AI client for typesafe/jev."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


def system_one(
    state: Any,
    questions: dict,
    *,
    account_id: str | None = None,
    token: str | None = None,
    model: str = "typesafe/jev",
    timeout: float = 60.0,
) -> dict:
    account_id = account_id or os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    token = token or os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not account_id or not token:
        raise RuntimeError("MISSING_CLOUDFLARE_CREDS")

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run"
    body = json.dumps({"model": model, "input": {"state": state, "questions": questions}}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:800]
        raise RuntimeError(f"HTTP_{e.code}: {detail}") from e

    # Workers AI / Unified Billing wraps; Jev often nests as result.result.answers
    def peel(obj: Any, depth: int = 0) -> dict:
        if not isinstance(obj, dict) or depth > 5:
            return obj if isinstance(obj, dict) else {"raw": obj}
        if "answers" in obj:
            return obj
        for key in ("result", "response", "output"):
            if key in obj and isinstance(obj[key], (dict, str)):
                inner = obj[key]
                if isinstance(inner, str):
                    try:
                        inner = json.loads(inner)
                    except Exception:
                        continue
                found = peel(inner, depth + 1)
                if isinstance(found, dict) and "answers" in found:
                    return found
        return obj

    return peel(raw)


if __name__ == "__main__":
    import sys

    out = system_one(
        "Smoke test for Jev wiring via Cloudflare Workers AI",
        {
            "next_worker": {
                "type": "choice",
                "instructions": "Which worker should act next on this smoke test?",
                "criteria": {
                    "research": "Evidence still missing",
                    "write": "Enough evidence to draft",
                    "review": "Done or unclear",
                },
            }
        },
    )
    print(json.dumps(out, indent=2)[:2000])
    sys.exit(0)
