# Gameplay demo

The Instagram export is a 30-second, 9:16 MP4 at 1080×1920 and 30 fps. The recording follows all five rooms, earns the three milestones through actual crossings, and reaches the goal pad. The final card credits Cruz Garza and the development tooling.

## Honest capture method

The exported footage comes from the working browser game. The automatic director sends movement vectors and nearby interaction actions into the same `Session` used by keyboard and touch play. There is no shortcut to set solved flags or declare a win.

The browser's recording mode advances the simulation deterministically, then captures its rendered frame. Four simulation steps per tenth of a second are exported as three video frames per tenth, slowing the default walkthrough slightly for legibility. The output is an authored gameplay demonstration, not evidence of a person's speed or an AI model independently operating the controls in real time.

The soundtrack is original synthesized ambience and short chimes. It contains no commercial recording or cloned voice. The silent export is also retained locally so a creator can add music in Instagram.

`?demo=1&reel=1&manual=1` exposes a narrow recording interface as `window.foldspaceDemo`: `advance(dt)`, `read()`, and `done()`. It is available only in demo mode, affects only that isolated walkthrough, and grants no account or server privileges.

## Caption

Foldspace: five floating rooms, three rules.

Choose a destination. Carry the matching key. Connect both ends of a portal. Then find your way home.

Created by Cruz Garza. Built with GPT-6 Astra in Codex, using Ultra reasoning.

## Posting

The MP4 is prepared for Cruz to upload. Creating this file does not publish it to Instagram. The game is publicly playable at https://foldspace-by-cruz.cg-stackd.chatgpt.site/ .
