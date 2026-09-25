#!/usr/bin/env python3
"""Analyst ticker-scoring rule v1.

Stdlib only. Reads one inputs JSON, prints (and optionally writes) the scored result.
It never calls moomoo, a broker, or any MCP tool. It places no orders.

  python3 score_v1.py <inputs.json>                 # print result JSON
  python3 score_v1.py <inputs.json> --write         # also write $DESK_HANDOFFS_DIR/analyst-YYYYMMDD.json
  python3 score_v1.py <inputs.json> --out PATH      # write to PATH instead
Exit 0 = a ticker was picked, 3 = "No clean ticker today", 2 = malformed input.
"""
import json, sys, os
from datetime import datetime

RULE = "analyst_scoring_v1"
THRESHOLD = 60.0
W = {"trend": 35, "momentum": 25, "relative": 15, "liquidity": 15, "fit": 10}
MAX_SPREAD = 0.15      # (ask-bid)/mid
MIN_OI = 100
HANDOFFS = os.environ.get("DESK_HANDOFFS_DIR", "handoffs")


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def req(obj, key, typ=(int, float)):
    if key not in obj or obj[key] is None or isinstance(obj[key], bool) or not isinstance(obj[key], typ):
        raise ValueError(f"missing or bad field: {key}")
    return obj[key]


def blackout_hit(ticker, date, blackout):
    for b in blackout or []:
        if b.get("date") == date and ("*" in b.get("tickers", []) or ticker in b.get("tickers", [])):
            return b.get("event", "blackout")
    return None


def score_candidate(c, date, budget, spy_pct, blackout):
    t = c.get("ticker", "?")
    out = {"ticker": t, "gates": {}, "components": None, "score": None, "lean": None, "contract": None}
    try:
        p = req(c, "price"); s5 = req(c, "sma5"); s20 = req(c, "sma20"); atr = req(c, "atr14")
        pct1d = req(c, "pct_1d"); closes = req(c, "closes_9", list)
        if len(closes) != 9 or atr <= 0:
            raise ValueError("closes_9 must have 9 closes and atr14 > 0")
        req(c, "as_of", str)
    except ValueError as e:
        out["gates"]["G1_data"] = f"fail: {e}"; return out
    out["gates"]["G1_data"] = "pass"

    ev = blackout_hit(t, date, blackout) or (c.get("scout_event_today") and "Scout verified event today")
    if ev:
        out["gates"]["G2_event"] = f"fail: {ev}"; return out
    out["gates"]["G2_event"] = "pass"

    if p > s5 > s20:
        d, lean, side = 1, "up", "call"
    elif p < s5 < s20:
        d, lean, side = -1, "down", "put"
    else:
        out["gates"]["G3_lean"] = "fail: no clean trend (need price>SMA5>SMA20 or price<SMA5<SMA20)"; return out
    out["gates"]["G3_lean"] = "pass"; out["lean"] = lean

    k = (c.get("contracts") or {}).get(side)
    try:
        if not k:
            raise ValueError(f"no {side} candidate")
        bid = req(k, "bid"); ask = req(k, "ask"); oi = req(k, "open_interest"); dte = req(k, "dte", int)
        if not (0 <= dte <= 30) or ask <= 0 or bid < 0 or bid > ask:
            raise ValueError("dte must be 0-30 and 0 <= bid <= ask, ask > 0")
    except ValueError as e:
        out["gates"]["G4_fit"] = f"fail: {e}"; return out
    cost = round(ask * 100, 2)
    if cost > budget:
        out["gates"]["G4_fit"] = f"fail: cost {cost} > budget {budget}"; return out
    out["gates"]["G4_fit"] = "pass"
    mid = (bid + ask) / 2
    spread = (ask - bid) / mid
    if spread > MAX_SPREAD or oi < MIN_OI:
        out["gates"]["G5_liquid"] = f"fail: spread {spread:.3f} (max {MAX_SPREAD}) / OI {oi} (min {MIN_OI})"; return out
    out["gates"]["G5_liquid"] = "pass"

    moves = [closes[i + 1] - closes[i] for i in range(8)]
    comp = {
        "trend": clamp(d * (p - s20) / atr / 3),
        "momentum": sum(1 for m in moves if d * m > 0) / 8,
        "relative": clamp(d * (pct1d - spy_pct) / 3),
        "liquidity": 0.5 * clamp(1 - spread / MAX_SPREAD) + 0.5 * clamp(oi / 1000),
        "fit": 1.0 if cost <= 0.8 * budget else 0.5,
    }
    out["components"] = {k2: round(v, 4) for k2, v in comp.items()}
    out["score"] = round(sum(W[k2] * comp[k2] for k2 in W), 1)
    out["contract"] = {**k, "call_put": side, "cost": cost, "spread_pct": round(spread, 4)}
    return out


def run(data):
    date = req(data, "date", str)
    budget = req(data.get("budget", {}), "settled_buying_power")
    spy_pct = req(data.get("spy", {}), "pct_1d")
    cands = data.get("candidates")
    if not isinstance(cands, list):
        raise ValueError("candidates must be a list")
    rows = [score_candidate(c, date, budget, spy_pct, data.get("blackout", [])) for c in cands]
    scored = [r for r in rows if r["score"] is not None]
    # sort: score desc, then liquidity desc, then spread asc, then ticker A-Z
    scored.sort(key=lambda r: (-r["score"], -r["components"]["liquidity"], r["contract"]["spread_pct"], r["ticker"]))
    top = scored[0] if scored and scored[0]["score"] >= THRESHOLD else None
    tie = bool(top and len(scored) > 1 and scored[1]["score"] == top["score"])
    if top:
        msg = f"Today: {top['ticker']}, leaning {top['lean']}."
        reason = "top score >= threshold" + (" (tie broken: liquidity, then spread, then A-Z)" if tie else "")
    else:
        msg = "No clean ticker today."
        reason = ("no candidates" if not cands else "no candidate passed all gates" if not scored
                  else f"top score {scored[0]['score']} < {THRESHOLD}")
    return {
        "rule": RULE, "date": date, "threshold": THRESHOLD,
        "budget": data["budget"], "pick": top["ticker"] if top else None,
        "lean": top["lean"] if top else None, "score": top["score"] if top else None,
        "contract_candidate": top["contract"] if top else None,
        "message": msg, "reason": reason, "tie_break_used": tie,
        "scores": rows, "sentiment_weight": 0,
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }


def main(argv):
    if len(argv) < 2:
        print(__doc__); return 2
    try:
        with open(argv[1]) as f:
            data = json.load(f)
        res = run(data)
    except (ValueError, json.JSONDecodeError, OSError, TypeError, AttributeError) as e:
        print(json.dumps({"rule": RULE, "error": str(e), "message": "No clean ticker today."}))
        return 2
    txt = json.dumps(res, indent=1)
    print(txt)
    path = None
    if "--out" in argv:
        path = argv[argv.index("--out") + 1]
    elif "--write" in argv:
        path = os.path.join(HANDOFFS, f"analyst-{res['date'].replace('-', '')}.json")
    if path:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            f.write(txt + "\n")
    return 0 if res["pick"] else 3


if __name__ == "__main__":
    sys.exit(main(sys.argv))
