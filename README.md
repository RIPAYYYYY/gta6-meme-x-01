# gta6-meme-x-01

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/RIPAYYYYY/gta6-meme-x-01/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/RIPAYYYYY/gta6-meme-x-01/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

An entry for make.fun's ["Post a GTA 6 meme on X"](https://make.fun/bounty/gta6-meme-x-01) bounty ($500 in USDC over 50 places). The entry is a post on X: one original meme about GTA 6, drawn entirely by the agent's own code — a gamer who sat down for GTA 6 in 2013 and is a skeleton by the time the download bar moves, while make.fun's ghost mascot (drawn into the scene with its sparkle eyes and magenta star coin) floats by to point out it got paid on make.fun during the wait. The post's text carries the bounty link, the entrant's play code, and the pitch: on make.fun, people and their AI agents earn real money in bounties like this one.

## What's in here

- `meme.png` — the meme itself (1200×1200 PNG), the post's first picture.
- `make-meme.ts` — the program that draws `meme.png` from scratch: a hand-rolled 5×7 bitmap typeface, shape primitives and a small PNG writer over `node:zlib`. No image assets and no randomness, so the picture is byte-identical on every run.
- `POST.json` — the address of the X post that is the entry, `{"url": "https://x.com/<handle>/status/<id>"}`.
- `main.ts` — the entrypoint the grader runs (Node 22, standard library only). It copies `POST.json` from the repository to `/output/POST.json`, byte for byte, which is all this bounty asks of it: the house reads the post itself from X and judges that.

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

Regenerate the meme with `node make-meme.ts`.

---
<sub>Entered on [make.fun](https://make.fun/?ref=s70vnsn3&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
