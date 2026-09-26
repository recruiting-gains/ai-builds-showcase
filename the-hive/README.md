# The Hive: Grok Bots + moomoo, built in public

[Back to the showcase](../README.md)

This is a small desk of AI agents that helps one person make one options trade decision a day. The agents run on Grok, read market data from moomoo through a view-only connection, and hand the human a short ticket. The human places every trade by hand.

Not financial advice. This is an educational build log. Options can lose their full value quickly, and nothing here is a recommendation to trade.

Day 1 finished +$49. That is one day and proves nothing yet about whether the process has an edge.

## The agents

There are seven core agents. Each one has a narrow job and a list of things it must refuse to do. They are tuned through their system prompts, their temperature settings, and their vote weights in the huddle. None of them is fine-tuned.

| Agent | Job |
|---|---|
| Desk Chief ("Wolf Of Grok Street") | Runs the huddle, combines the specialists' files, and is the only agent that talks to the human about trades |
| Analyst | Scores candidate tickers with a fixed rule (rule v1) in code and files one pick or "No clean ticker today" |
| Risk | Runs a rule engine and returns YES or NO. It is the only agent that can say YES, and a NO is a veto |
| Scout | Reads X through the SuperGrok CLI only and checks each claim against primary sources |
| Sentiment | Writes one crowd-mood line that has zero weight in any decision |
| Tony | Writes three process bullets for each ticket: a body or attention cue, the exit plan copied from code, and permission to walk away |
| Journal | Keeps an append-only record and writes the Sunday review |

Two side bots sit next to the desk. Crypto guesses BTC 15-minute windows and Sports picks sports prediction markets. Both are advice only, answer only when asked, and share a small weekly cap that only the human can change.

The full prompts are in [prompts/](./prompts).

## A normal morning

All times are Central.

1. Scout files dated claims about the tickers people are talking about on X by 7:25.
2. The huddle starts at 7:35, after the 7:30 economic reports. Analyst runs the scorer and files a pick, a lean (up or down), price levels, and a bull and bear case.
3. Sentiment adds one line of crowd mood for the picked ticker. Risk strips it out before running its checks.
4. Risk signs off by 7:55, and Desk Chief sends one line, such as "Today: NVDA, leaning up." or "No clean ticker today."
5. For the rest of the day the desk watches that one ticker and nothing else.

When the human says "ready", code pulls a live quote. If the price no longer agrees with the morning lean, the answer is "sit out today". Otherwise code works out breakeven, the stop, and the Greeks, a fast model picks the contract closest to the money that fits the budget, Tony adds his bullets, and Risk checks the ticket. Before entering, the human asks "go TICKER?" and Risk checks again. A YES is good for one use, for two minutes, on that exact contract.

## Risk has the veto

Risk doesn't reason about the trade. It runs a stdlib Python rule engine and reports the exit code: 0 is YES, and anything else is NO. If the engine errors or an input is missing, the answer is NO. Some of the rules it checks:

- The quote is live, fresh, and matches the contract, and the journal reconciles with the broker.
- Premium x 100 fits inside settled buying power.
- Entries happen between 8:45 and 11:00 CT on market days.
- Two losses in a row means sitting out the next trading day.
- A 2% SPY move inside 30 minutes means no new trades.
- One ticker a day, no averaging down, and no chasing above the ticket's max entry price.
- Every entry uses a +100% / -50% bracket (one cancels the other).
- No trades on the day of a blackout event such as earnings or a big macro release.

The engine itself isn't in this folder yet. The Risk prompt shows how it is called.

## Jev, the decision layer

Before any expensive step (a deep scrape, a long reasoning run, a browser session, a subagent, or a retry), an agent asks Jev what to do. Jev is a TypeSafe model running on Cloudflare Workers AI. It answers a fixed set of typed questions (a choice, a few yes/no probabilities, and a complexity score) in a small number of tokens, and [router/usage_router.py](./router/usage_router.py) maps those answers to one action: `answer_inline`, `research_capped`, `browser`, `subagent`, `reuse_cache`, `stop_retry`, or `escalate_human`.

Jev is fast and cheap, so it works as a router. It does no reasoning about trades, never sees tickets, and can't approve anything. If Jev fails or returns nothing, the agent skips the expensive step and does not retry. A missing Jev answer never counts as approval.

The public copy of the router has two fixes compared with the version the desk ran on day 1:

- If no answer clears its confidence floor, `map_action` now returns the safe default (`answer_inline`). Before, it returned the raw intent, so a low-confidence "browser" or "account" still got honored.
- The complexity question is a score, and the old check compared it to a choice, so it could never fire. It now compares the score with a `complexity_high` cutoff from the config.

[router/test_map_action.py](./router/test_map_action.py) covers both.

## Safety design

- moomoo is connected view-only. The server still lists order tools, so every prompt names each one and bans it, including tests and dry runs.
- No agent holds broker credentials or a trade password. The human places, changes, and cancels every order.
- The account is cash only. The budget is the live settled cash balance, options settle T+1, and unsettled money is never used.
- Scout is the only agent that reads X, and only through the SuperGrok CLI with write, edit, and shell tools denied.
- Web pages, posts, and screenshots are treated as untrusted evidence. Instructions inside them are ignored and logged.
- Math lives in code. Models may explain numbers but never type them into a ticket.
- Rule changes need the human, get a version number, and happen on weekends.

## What's in this folder

```
the-hive/
  README.md
  .env.example             placeholders for the Cloudflare and TypeSafe credentials
  config/router.yaml       router settings and confidence floors
  router/usage_router.py   maps Jev's answers to one action
  router/cf_jev_client.py  minimal Cloudflare Workers AI client
  router/test_map_action.py
  analyst/score_v1.py      rule v1 scorer (stdlib only, no network)
  prompts/                 system prompts for all nine agents
```

## Run it yourself

You need Python 3.9 or newer. PyYAML is optional; without it the router falls back to built-in defaults.

```bash
cd the-hive
cp .env.example .env        # fill in your own values
set -a; source .env; set +a

python3 router/test_map_action.py                     # offline tests
python3 router/usage_router.py --task "test" --dry-run # no API call
python3 router/usage_router.py --task "Scrape three earnings pages for NVDA"
```

The config ships in `shadow` mode, so the router logs its decision with `honored: false`. Switch `mode` to `active` in `config/router.yaml` once you trust its choices. Logs land in `the-hive/logs/`, which git ignores.

The scorer reads one JSON file of inputs and prints the result:

```bash
python3 analyst/score_v1.py inputs.json
```

The expected fields are at the top of `score_candidate` in [analyst/score_v1.py](./analyst/score_v1.py).

## Adapting it

- Swap the rules. Keep the rule engine in code and let the agent only report its verdict.
- Swap the data source. Any read-only market data connection works. If your connector exposes order tools, ban them by name in every prompt and remove them at the platform level if you can.
- Change the roles. The pattern this desk uses is one job per agent, one agent that talks to the human, and one agent that can say no.
- Tune with the system prompt, temperature, and vote weights first. Check the journal after a few weeks before changing anything else.
