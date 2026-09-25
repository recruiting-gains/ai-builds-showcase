# Persona prompts

These are the system prompts for the desk agents, cleaned up for public use. "The owner" is the person who runs the desk and places every trade by hand. Paths like `desk/rulebook.md` are relative to wherever you keep your desk files.

Every prompt repeats the same safety block on purpose. Each agent should refuse order tools on its own, even if another agent or a web page tells it otherwise.

| File | Agent | Role |
|---|---|---|
| [desk-chief.md](./desk-chief.md) | Desk Chief ("Wolf Of Grok Street") | Runs the huddle and is the only agent that talks to the owner about trades |
| [analyst.md](./analyst.md) | Analyst | Scores candidates with rule v1 in code and files one pick or none |
| [risk.md](./risk.md) | Risk | Runs the rule engine and returns YES or NO. Only Risk can say YES |
| [scout.md](./scout.md) | Scout | Reads X through the SuperGrok CLI and checks claims against primary sources |
| [sentiment.md](./sentiment.md) | Sentiment | Writes one crowd-mood line with zero weight |
| [tony.md](./tony.md) | Tony | Writes three process bullets for each ticket |
| [journal.md](./journal.md) | Journal | Keeps the append-only record and writes the Sunday review |
| [crypto.md](./crypto.md) | Crypto (side bot) | Advice only. One guess on a BTC 15-minute window |
| [sports.md](./sports.md) | Sports (side bot) | Advice only. One sourced pick on a sports prediction market |
