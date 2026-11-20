# Star Snatch: from a claude.ai artifact to a match on Edgegap

Sample: [netcode-sample-claude-star-snatch](https://github.com/edgegap/netcode-sample-claude-star-snatch).
Tag `before` = Claude's artifact, unchanged; `main` = the online version. Run on 2026-11-20.

## 1. What Claude produced

One message (prompt §1 in [prompts.md](prompts.md)) in a new claude.ai chat, Opus 5.5 with the
default (Medium) effort. Claude thought for about a minute, wrote the file, then ran 8 commands
against its own rules block before answering: it checked the block for browser names, classes and
`export`, checked the world survives `JSON.stringify`, and ran 30 bot-only matches (none stalled,
about two minutes each). The answer was a **published artifact** (private, "Only you"), 747 lines.

What the file looked like, and what that meant for the online work:

| In the artifact | Consequence |
|---|---|
| One classic `<script>`: the rules block (`var RULES = {...}` and plain `function`s), then the client inside an IIFE | The split script can turn the script into a module with one import line; nothing in the client relied on globals. |
| `createWorld(seed)` with its own seeded random numbers in `world.seed` | The server passes `Date.now()`; nothing else to do. |
| `step()` calls `botInput()` for every `isBot` player itself | `server/game.js` must not drive bots again. Check this in every artifact: `edgegap-fal`'s adapter calls `botInput` itself because fal's `step()` didn't. |
| The world: `players` array (`id, name, isBot, slot, x, y, vx, vy, r, stars, cooldown, input`), `stars` array, `phase`, `winner`, `time` | The snapshot is the world itself, rounded to 0.1, and the page draws it with Claude's `draw()` unchanged. |
| Human id `'human'` as a constant; Enter/Space restart from any overlay; names written into `innerHTML` | The three fixes in SKILL.md Phase 1.3. |
| Touch steering (hold a finger on the arena) | Works online unchanged: it only produces the four booleans. |

It played solo in the artifact preview (Start, steering, bots collecting and ramming).

Getting the file: the artifact's own download or copy; this run read the published artifact
through Claude's artifact tools, which return the stored file exactly. Saved as
`artifact/star-snatch.html`, committed, tagged `before`.

## 2. Split

`node tools/split-artifact.mjs artifact/star-snatch.html --page` exported 12 names (`RULES`,
`rulesRand`, `rulesFind`, `createWorld`, `addPlayer`, `removePlayer`, `setInput`, `rulesClamp`,
`rulesSpawnStar`, `rulesWalls`, `step`, `botInput`) and wrote the module page. No edits to the
block were needed. A test block calling `document` was refused with its line.

## 3. Online changes

| File | Lines | Notes |
|---|---|---|
| `server/game.js` | 78 | Four booleans in, `step()`, scores copied from `stars`, result from `world.winner`, time-up ranking, the world as snapshot. |
| `client/index.html` | about +120 | Import map, the online block ([assets/page-online.js](../assets/page-online.js)), start screen buttons, CSS for them, the three fixes. |
| `tests/headless-player.mjs` | `playLikeABot()` = `botInput({arena, ...snapshot}, me.id)` | |
| `server/util.js` | `ranking()` only | |
| everything else | template | `edgegap-threejs` server, `net.js`, `online.js`, `config.js`, tests, CI. |

Local checks: `npm run test:local` PASS (two headless players, two bots); two browser tabs with
`?autoplay=local` in one match on a local server, scores and bump effects in sync.

Observed: a headless player driven by `botInput` at 20 Hz on 20 Hz snapshots sometimes circles a
star without catching it (Claude's bots steer every tick with exact positions). Matches still end;
it only affects test scores.

## 4. Edgegap

- Image: GitHub Actions (`check:rules`, local match, push), 80.6 MB, tag `20261120-1850`.
- App `star-snatch`, version `20261120-1850`: 256 CPU units / 512 MB, WS 7777 `gameport` with TLS
  Upgrade, restart never, 30 min, `EMPTY_TIMEOUT_S=15`, `FIRST_JOIN_TIMEOUT_S=60`, `RESULTS_SECONDS=8`.
- Direct path: one deployment near Montreal (placed in Toronto), two browser tabs on
  `http://localhost:8080/?server=wss://<fqdn>:<port>`. Both joined, countdown, playing; the match
  ran to the 240 s cap (two idle players in corners and two bots), both tabs showed the results
  and went back to the menu, and the deployment stopped itself within about 15 s.
