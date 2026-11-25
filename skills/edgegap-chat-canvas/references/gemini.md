# Bomb Tag: from Gemini Canvas to a match on Edgegap

Sample: [netcode-sample-gemini-bomb-tag](https://github.com/edgegap/netcode-sample-gemini-bomb-tag).
Tag `before` = Gemini's file, unchanged; `main` = the online version. Run on 2026-11-20,
gemini.google.com, free account, model picker on Auto.

## 1. What Gemini produced

**+ > Canvas**, then the §1c prompt. Gemini opened a Canvas (toolbar: **Code**, **Preview**,
**Export**, share, full screen) and wrote the game in about a minute: 1,198 lines, a classic
`<script>` with the rules block (`var`-style functions), then the page code in an IIFE with sounds
(Web Audio), particles, a touch d-pad and a results overlay. It played in the preview: the fuse
counted down on the holder and the bots ran from it. **Export > Download code** saved
`bomb_tag.html` in one click.

Against the four server requirements in the prompt:

| Asked | Gemini's code |
|---|---|
| `createWorld()` returns no players | yes |
| `addPlayer()` uses its own free start spot | yes, the first free corner (`spotIndex`) |
| `setInput()` works for every player | yes |
| `step()` drives the bots | yes, it calls `botInput()` for bots |

One quirk: `addPlayer()` hands the bomb to the first player added, so whoever is seated first always
starts with it. `server/game.js` seats the room's players in random order instead of changing the
rules. Bot-only matches in Node end with a winner in about 35 s (around 30 passes, 3 explosions);
the world is about 1 KB of JSON.

## 2. Split

`split-artifact.mjs --page` exported 6 names (`createWorld`, `addPlayer`, `removePlayer`,
`setInput`, `botInput`, `step`) with no edits to the block.

## 3. Online changes

| File | Notes |
|---|---|
| `server/game.js` (about 85 lines) | Four booleans in; random seating; `step()` as is (it moves the bots); score = finishing place (first out 0, winner 3) from the `boom` and `win` events; the world as snapshot. |
| `client/index.html` (about +80 lines) | Import map; Find match, Local server and Cancel buttons plus a status line in the header; `'p1'` (four places) becomes a variable; colors fall back to the start corner (`PLAYER_STYLES` was keyed by `p1`, `b1`...); both restart buttons and the solo loop skipped online; waiting and countdown on Gemini's own overlay; runners eased toward each update; socket closed on `pagehide`. Names are drawn on the canvas, so nothing to escape. |
| `tests/headless-player.mjs` | `playLikeABot()` = `botInput({...snapshot}, me.id)` |

## 4. Edgegap

- Image `20261120-2017` from GitHub Actions; app `bomb-tag`, same version settings as the other
  two samples.
- Direct path: two browser tabs on `?server=`; a full match; the deployment stopped itself 72 s
  after it started.
- Matchmaker: profile `bomb-tag` added to the matchmaker shared with the Claude and ChatGPT samples
  (three profiles, one matchmaker). `tests/e2e.mjs bomb-tag 2`: HOST_ASSIGNED at 15 to 17 s, a full
  match, self-stop 11 s after it, PASS. Two browser tabs with `?autoplay=1` landed on one
  deployment with two bots; leaving both stopped it about 20 s later.
