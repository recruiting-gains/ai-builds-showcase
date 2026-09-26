#!/usr/bin/env python3
"""Offline checks for map_action. No network, no credentials.

  python3 router/test_map_action.py
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from usage_router import SAFE_DEFAULT, map_action, to_ns  # noqa: E402

CONF = {
    "reuse_cache": 0.85,
    "escalate_human": 0.70,
    "research": 0.75,
    "browser": 0.80,
    "subagent": 0.80,
    "stop_retry": 0.85,
    "complexity_high": 0.67,
}


def answers(intent="answer_inline", intent_conf=0.9, complexity=None, cx_conf=None):
    raw = {
        "intent": {"type": "choice", "choice": intent, "confidence": intent_conf},
        "reuse_cache": {"type": "noul", "noul": 0.1},
        "need_subagent": {"type": "noul", "noul": 0.1},
        "stop_retry": {"type": "noul", "noul": 0.1},
    }
    if complexity is not None:
        raw["complexity"] = {"type": "score", "score": complexity, "confidence": cx_conf}
    return to_ns(raw)


class MapActionTests(unittest.TestCase):
    def test_low_confidence_browser_falls_back(self):
        self.assertEqual(map_action(answers("browser", 0.40), CONF), SAFE_DEFAULT)

    def test_low_confidence_account_falls_back(self):
        self.assertEqual(map_action(answers("account", 0.30), CONF), SAFE_DEFAULT)

    def test_confident_browser_is_honored(self):
        self.assertEqual(map_action(answers("browser", 0.90), CONF), "browser")

    def test_confident_escalation(self):
        self.assertEqual(map_action(answers("escalate_human", 0.80), CONF), "escalate_human")

    def test_high_complexity_score_routes_to_subagent(self):
        self.assertEqual(map_action(answers(complexity=0.80, cx_conf=0.80), CONF), "subagent")

    def test_low_complexity_score_stays_inline(self):
        self.assertEqual(map_action(answers(complexity=0.37, cx_conf=0.80), CONF), SAFE_DEFAULT)

    def test_unsure_complexity_stays_inline(self):
        self.assertEqual(map_action(answers(complexity=0.90, cx_conf=0.44), CONF), SAFE_DEFAULT)


if __name__ == "__main__":
    unittest.main()
