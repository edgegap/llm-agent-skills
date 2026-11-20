# Turf Painters: from chatgpt.com to a match on Edgegap

Sample: [netcode-sample-chatgpt-turf-painters](https://github.com/edgegap/netcode-sample-chatgpt-turf-painters).
Commit 1 = ChatGPT's first file; tag `before` = ChatGPT's fixed file, unchanged; `main` = the online
version. Run on 2026-11-20, chatgpt.com Free plan, default model.

## 1. What ChatGPT produced

The prompt (§1b in [prompts.md](prompts.md)) asked for canvas. ChatGPT worked for about 36 s and
answered with a file card ("Open Turf Painters HTML", "Copy file path") and a description of the
rules API; it said it couldn't launch a playable canvas in that chat. **Open** shows the file in a
preview pane next to the chat, with a download button. The file: 63 lines, compact one-line
functions, a classic `<script>` whose first statement is `"use strict"`, the markers exactly as
asked.

What was wrong, and what it meant:

| In the first file | Effect | Fix |
|---|---|---|
| `setInput` returned early for bots (`if (p && !p.isBot)`), but the page fed bots through `setInput` | Bots never moved; only the human's painter could. Visible in the preview within seconds. | Fix prompt (§3) |
| `createWorld()` added the four painters itself (ids 0 to 3) | A server can't seat its own players | Same prompt |
| `addPlayer` put every new painter at the centre | Players added later all overlap | Same prompt |
| `step()` doesn't call `botInput` | Fine once `setInput` accepts bots: the server feeds them, as the page does | `server/game.js` |
| Colors and labels keyed by numeric id; tiles `-1` for empty | ChatGPT moved to string ids, `null` tiles and a per-player color on its own when fixing | none |

The fixed file (72 lines) is exactly the first file plus those changes. Bot-only rounds in Node:
the round ends at 60 s with a winner; the world is about 2.8 KB of JSON (400 tiles as owner ids).

Getting the file out took three tries: the download in the preview pane worked for the first file;
for the fixed file the "Download updated Turf Painters.html" button did nothing; asked to paste it,
ChatGPT said it no longer had the file; uploading the first file back with "apply the two fixes
and paste the complete updated HTML file in one code block" worked, and **Copy code** gave the
exact 9,843 characters. Reading the code block through a browser tool's page text or script output
was filtered; the clipboard was not.

## 2. Split

`split-artifact.mjs --page` exported 7 names (`createWorld`, `addPlayer`, `removePlayer`,
`setInput`, `paintAt`, `step`, `botInput`) with no edits to the block. The module page keeps the
`"use strict"` line after the import (harmless; modules are strict anyway).

## 3. Online changes

| File | Notes |
|---|---|
| `server/game.js` (81 lines, [assets/server-game-chatgpt.js](../assets/server-game-chatgpt.js)) | Four booleans in; bots get `botInput()` before each `step()`; scores = owned tiles; the rules' 60 s round ends the match through `result()` (kept win event), `matchSeconds: 90` as a backstop; the world as snapshot, tiles included. |
| `client/index.html` (about +60 lines) | Import map; Find match, Local server and Cancel buttons under ChatGPT's Start / Restart; online state in the side panel's timer and status; `HUMAN_ID` becomes a variable and only that painter says YOU; names escaped in the scoreboard; the solo loop skipped online; painters eased toward each update; socket closed on `pagehide`. |
| `tests/headless-player.mjs` | `playLikeABot()` = `botInput({size, grid, tileSize, ...snapshot}, me.id)` |

Local checks: `npm run test:local` PASS (two headless players and two bots, a full round), two tabs
on a local server in one round.

## 4. Edgegap

- Image from GitHub Actions (`check:rules`, local match, push), 80.6 MB, tag `20261120-1945`; app
  `turf-painters`, same version settings as Star Snatch (WS 7777 TLS Upgrade, 256/512, never,
  30 min, the three timeout env vars).
- Direct path: two browser tabs on `?server=`; a full round; the deployment stopped itself 96 s
  after it started (round, results, self-stop).
- Matchmaker: the `turf-painters` profile added to a matchmaker already serving `star-snatch`
  (saving the configuration in the dashboard quick-restarts it). `tests/e2e.mjs turf-painters 2`:
  MATCH_FOUND 13 s, HOST_ASSIGNED 15 s, a full round, self-stop 11 s after it, PASS. Two browser
  tabs with `?autoplay=1` landed on one deployment with two bots; leaving both stopped it within
  about 30 s.
