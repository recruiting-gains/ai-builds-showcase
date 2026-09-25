#!/usr/bin/env python3
"""Jev usage router: Cloudflare Workers AI or TypeSafe SDK.

Jev is a small typed decision model. It answers a fixed set of questions about
the next step (intent, reuse, subagent, stop retrying, complexity) and this
script maps those answers to one action. It decides routing only. It never
approves a trade and never touches a broker.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "router.yaml"
LOG_DIR = ROOT / "logs"


def load_config() -> dict:
    text = CONFIG_PATH.read_text()
    try:
        import yaml  # type: ignore

        return yaml.safe_load(text) or {}
    except Exception:
        cfg = {
            "enabled": True,
            "mode": "shadow",
            "bypass": False,
            "provider": "cloudflare",
            "model": "typesafe/jev",
            "cloudflare_account_id": "",
            "confidence_min": {
                "reuse_cache": 0.85,
                "escalate_human": 0.70,
                "research": 0.75,
                "browser": 0.80,
                "subagent": 0.80,
                "stop_retry": 0.85,
                "complexity_high": 0.67,
            },
        }
        for line in text.splitlines():
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if s.startswith("enabled:"):
                cfg["enabled"] = "true" in s.lower()
            elif s.startswith("mode:"):
                cfg["mode"] = s.split(":", 1)[1].strip().split()[0]
            elif s.startswith("bypass:"):
                cfg["bypass"] = "true" in s.lower()
            elif s.startswith("provider:"):
                cfg["provider"] = s.split(":", 1)[1].strip().split()[0]
            elif s.startswith("model:"):
                cfg["model"] = s.split(":", 1)[1].strip().split()[0]
            elif s.startswith("cloudflare_account_id:"):
                val = s.split(":", 1)[1].strip().strip('"')
                cfg["cloudflare_account_id"] = val
        return cfg


SAFE_DEFAULT = "answer_inline"


def map_action(answers: dict, conf_min: dict) -> str:
    def conf(a):
        return getattr(a, "confidence", None) if a is not None else None

    def choice(a):
        return getattr(a, "choice", None) if a is not None else None

    def noul(a):
        return getattr(a, "noul", None) if a is not None else None

    intent = answers.get("intent")
    reuse = answers.get("reuse_cache")
    need_sub = answers.get("need_subagent")
    stop = answers.get("stop_retry")
    complexity = answers.get("complexity")

    if stop is not None and noul(stop) is not None and noul(stop) >= conf_min.get("stop_retry", 0.85):
        return "stop_retry"
    if reuse is not None and noul(reuse) is not None and noul(reuse) >= conf_min.get("reuse_cache", 0.85):
        return "reuse_cache"

    intent_c = choice(intent) or "answer_inline"
    intent_conf = conf(intent) or 0.0

    if intent_c in ("escalate_human", "account") and intent_conf >= conf_min.get("escalate_human", 0.70):
        return "escalate_human"
    if need_sub is not None and noul(need_sub) is not None and noul(need_sub) >= conf_min.get("subagent", 0.80):
        return "subagent"
    if intent_c == "browser" and intent_conf >= conf_min.get("browser", 0.80):
        return "browser"
    if intent_c == "research":
        return "research_capped" if intent_conf >= conf_min.get("research", 0.75) else "answer_inline"
    # complexity is a score question (0..1 over low/medium/high), so it has no
    # .choice. Compare the score against the "high" cutoff instead.
    cx_score = getattr(complexity, "score", None) if complexity is not None else None
    if (
        cx_score is not None
        and cx_score >= conf_min.get("complexity_high", 0.67)
        and (conf(complexity) or 0) >= 0.75
    ):
        return "subagent"
    # Anything that did not clear its confidence floor above falls back to the
    # safe default. Never return the raw intent here.
    return SAFE_DEFAULT


def to_ns(answers: dict) -> dict:
    out = {}
    for k, v in (answers or {}).items():
        if isinstance(v, dict):
            out[k] = SimpleNamespace(
                type=v.get("type"),
                choice=v.get("choice"),
                noul=v.get("noul"),
                score=v.get("score"),
                confidence=v.get("confidence"),
            )
        else:
            out[k] = v
    return out


def dry_run(task: str, kind: str) -> int:
    print(
        json.dumps(
            {
                "status": "dry_run",
                "task": task,
                "kind": kind,
                "action": "answer_inline",
                "note": "No API call; kill-switch / offline path",
            }
        )
    )
    return 0


def call_cloudflare(state: dict, cfg: dict) -> dict:
    sys.path.insert(0, str(ROOT / "router"))
    from cf_jev_client import system_one

    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or cfg.get("cloudflare_account_id") or ""
    questions = {
        "intent": {
            "type": "choice",
            "instructions": "What kind of work does this task primarily need next?",
            "criteria": {
                "answer_inline": "Can be answered from current context without tools.",
                "research": "Needs web or doc lookup before acting.",
                "browser": "Needs interactive website / GUI steps.",
                "account": "Touches credentials, payments, deletes, or permissions.",
                "escalate_human": "Needs the human owner before any further action.",
            },
        },
        "reuse_cache": {
            "type": "noul",
            "instructions": "A fresh reusable artifact already exists that fully satisfies this task.",
        },
        "need_subagent": {
            "type": "noul",
            "instructions": "This task needs a separate subagent or long background worker.",
        },
        "stop_retry": {
            "type": "noul",
            "instructions": "Prior attempts are failing in a loop and should stop retrying now.",
        },
        "complexity": {
            "type": "score",
            "instructions": "How complex is finishing this task?",
            "criteria": ["low", "medium", "high"],
        },
    }
    return system_one(
        state,
        questions,
        account_id=account,
        model=cfg.get("model") or "typesafe/jev",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", default="")
    parser.add_argument("--kind", default="general")
    parser.add_argument("--prior-error", default="")
    parser.add_argument("--artifact", default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()


    if not args.task:
        print(json.dumps({"status": "error", "reason": "--task required"}))
        return 1

    cfg = load_config()
    if args.dry_run or cfg.get("bypass") or not cfg.get("enabled", True):
        return dry_run(args.task, args.kind)

    state = {
        "task": args.task,
        "kind_hint": args.kind,
        "prior_error": (args.prior_error or "")[:500],
        "artifact_path": args.artifact,
        "has_fresh_artifact": bool(args.artifact and Path(args.artifact).exists()),
    }

    provider = (cfg.get("provider") or "cloudflare").lower()
    if provider == "cloudflare":
        if not (os.environ.get("CLOUDFLARE_API_TOKEN") and (os.environ.get("CLOUDFLARE_ACCOUNT_ID") or cfg.get("cloudflare_account_id"))):
            print(json.dumps({"status": "MISSING_CLOUDFLARE_CREDS", "action": "escalate_human"}))
            return 2
        try:
            payload_raw = call_cloudflare(state, cfg)
        except Exception as e:  # safe fallback: rule-based default, never honored
            payload = {
                "status": "error",
                "provider": provider,
                "mode": cfg.get("mode", "shadow"),
                "action": "answer_inline",
                "honored": False,
                "fallback": True,
                "error": str(e)[:400],
                "task": args.task[:300],
                "ts": datetime.now(timezone.utc).isoformat(),
            }
            LOG_DIR.mkdir(parents=True, exist_ok=True)
            log_path = LOG_DIR / f"route-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
            log_path.write_text(json.dumps(payload, indent=2))
            print(json.dumps(payload))
            print(f"ERROR fallback action=answer_inline honored=False; log={log_path}", file=sys.stderr)
            return 1
        answers = to_ns(payload_raw.get("answers") or {})
    else:
        if not os.environ.get("TYPESAFE_API_KEY"):
            print(json.dumps({"status": "MISSING_KEY", "action": "escalate_human"}))
            return 2
        from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

        with TypeSafeClient() as client:
            response = client.system_one(
                state=state,
                model="jev-1.13.0",
                questions={
                    "intent": Choice(
                        instructions="What kind of work does this task primarily need next?",
                        criteria={
                            "answer_inline": "Can be answered from current context without tools.",
                            "research": "Needs web or doc lookup before acting.",
                            "browser": "Needs interactive website / GUI steps.",
                            "account": "Touches credentials, payments, deletes, or permissions.",
                            "escalate_human": "Needs the human owner before any further action.",
                        },
                    ),
                    "reuse_cache": Noul(
                        instructions="A fresh reusable artifact already exists that fully satisfies this task.",
                    ),
                    "need_subagent": Noul(
                        instructions="This task needs a separate subagent or long background worker.",
                    ),
                    "stop_retry": Noul(
                        instructions="Prior attempts are failing in a loop and should stop retrying now.",
                    ),
                    "complexity": Score(
                        instructions="How complex is finishing this task?",
                        criteria=["low", "medium", "high"],
                    ),
                },
            )
        answers = response.answers
        payload_raw = {"answers": {k: vars(v) if hasattr(v, "__dict__") else str(v) for k, v in answers.items()}}

    action = map_action(answers, cfg.get("confidence_min") or {})
    mode = cfg.get("mode", "shadow")
    # Empty answers fall back to the rule-based default (answer_inline), never honored.
    fallback = not answers
    payload = {
        "status": "ok",
        "provider": provider,
        "mode": mode,
        "action": action,
        "honored": mode == "active" and not fallback,
        "fallback": fallback,
        "answers": {
            k: {
                "type": getattr(v, "type", None),
                "choice": getattr(v, "choice", None),
                "noul": getattr(v, "noul", None),
                "score": getattr(v, "score", None),
                "confidence": getattr(v, "confidence", None),
            }
            for k, v in answers.items()
        },
        "task": args.task[:300],
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"route-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    log_path.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload))
    print(f"{mode.upper()} action={action} honored={payload['honored']}; log={log_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
