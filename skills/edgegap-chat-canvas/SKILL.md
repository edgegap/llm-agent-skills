---
name: edgegap-chat-canvas
description: 'Chat canvases + Edgegap: make a browser game written in a chat app as one HTML file (a Claude artifact on claude.ai, a ChatGPT game on chatgpt.com) online multiplayer on Edgegap, one authoritative server per match with an optional matchmaker, while the file still plays in the chat preview. Load this when someone made, or wants to make, a game with Claude or ChatGPT in the chat (artifact, canvas, "single HTML file it wrote") and wants online play, friends joining, Find Match or real servers, or asks how to prompt so the game can go online later. Has the prompt that keeps every rule between /* RULES:BEGIN */ and /* RULES:END */ markers, the checks and fix prompts for what the chat gets wrong, getting the file out, a split script (block to the server's ES module, CI sync check), the online page, a direct ?server= path, CI image build, tests. Verified samples: netcode-sample-claude-star-snatch, netcode-sample-chatgpt-turf-painters. Other AI tools: edgegap-vibe-coded.'
metadata:
  version: "0.2.0"
---

# Edgegap for chat-canvas games: the chat writes one HTML file, Edgegap runs the matches

A chat app (a **Claude artifact** on claude.ai, a **ChatGPT** file or canvas on chatgpt.com) produces a game as **one HTML file** that plays in the chat's preview. That shape is the whole problem: the server needs the rules as a module of their own, and the preview needs everything in one file. The answer is to ask for the rules between two exact marker lines and copy that block out with a script. The file keeps playing in the chat and can go back into the chat for more changes; the server runs the identical rules.

```
chat app ──writes──> artifact/<game>.html                  (one file, solo vs bots, plays in the preview)
                        │  /* RULES:BEGIN */ ... /* RULES:END */
   tools/split-artifact.mjs ──copies the block──> client/rules.js  (ES module, generated, checked in CI)
                                                     │
page ──?server= or Find match──> Edgegap ──> one Node.js server per match: runs rules.js at 60 Hz,
     <──────────── wss://<id>.pr.edgegap.net:<port> ── fills seats with bots, stops itself after the match
```

**Verified on Edgegap** with [netcode-sample-claude-star-snatch](https://github.com/edgegap/netcode-sample-claude-star-snatch) (2026-11-20; tags `before` = Claude's artifact unchanged, then the online work on `main`): Claude (Opus 5.5, default settings) wrote Star Snatch from one prompt as a published artifact that played in the preview; the split script produced the server's rules with no hand edits to the block; two browser tabs joined one Edgegap deployment through `?server=` and played a match, and the server stopped itself; through the matchmaker, two headless players and then two browser tabs clicking Find match were put on one deployment in about 15 s, and it stopped itself 11 s after the match. [references/star-snatch.md](references/star-snatch.md) has the run, file by file.

- ChatGPT, [netcode-sample-chatgpt-turf-painters](https://github.com/edgegap/netcode-sample-chatgpt-turf-painters) (2026-11-20, Free plan, default model): ChatGPT wrote Turf Painters as one HTML file with the markers on the first try, but its bots never moved and its `createWorld()` added the players itself; one follow-up prompt fixed both (tag `before` is the fixed file, the commit before it ChatGPT's first). The split needed no edits to the block. Direct `?server=` (two tabs, self-stop 96 s after start) and the shared matchmaker (end-to-end test PASS, two tabs with Find match on one deployment, self-stop within about 30 s of both leaving). [references/chatgpt.md](references/chatgpt.md).

Each chat has its own way of handing over the file; Phase 0 step 4 has both.

## Who you are talking to

Often someone who made a game by chatting and has never run a server. Speak in outcomes ("each match gets its own server near its players and shuts down when the match ends, so you pay only while people play"), do the engineering yourself, and hand over only the account steps (registry secrets in GitHub, creating the matchmaker). Keep the prompts in `PROMPTS.md`: they are how the game gets changed later in the chat.

## Phase 0: Get a game whose rules can leave the file

1. **Game fit** (`edgegap-vibe-coded` Phase 0 table): drift, pushing, collecting, slow projectiles and turn-based play feel fine with no client prediction; precise platforming, rhythm and instant-hit aiming do not. Change the idea before the chat writes it.
2. **New game: prompt with the markers.** Use the prompt in [references/prompts.md](references/prompts.md) §1 (§1b for ChatGPT). The gameplay sentences are the developer's; the architecture part stays word for word: every rule between the exact lines `/* RULES:BEGIN */` and `/* RULES:END */`, nothing from the browser inside, no `export`, a plain-data world, the six functions (`createWorld`, `addPlayer`, `removePlayer`, `setInput`, `step` returning events, `botInput` from positions only).
3. **Existing artifact without markers:** ask the chat to restructure it with prompt §2 (same file, same look, rules moved into the block). Check the game still plays in the preview before going on.
4. **Play it, then check three things before saving** (ChatGPT's first Turf Painters file failed two of them): the bots move in the preview; `createWorld()` returns a world with no players and `addPlayer()` gives each new player its own start spot, so a server can add any ids; `step()` either drives the bots itself or the page feeds them `botInput()` through a `setInput()` that accepts bots. If one fails, send prompt §3 in [references/prompts.md](references/prompts.md) rather than editing the block.
5. **Get the file out**, unchanged, as `artifact/<game>.html` in a new git repo; commit and tag `before` (commit the chat's first file before it if a fix prompt was needed, so the history shows both).
   - **Claude:** open the artifact, then download it or copy its code. If you drive claude.ai from a browser tool, reading the artifact through Claude's own artifact tools (when the agent has them) returns the exact file; copying from the rendered page does not.
   - **ChatGPT:** the answer is a file card (**Open** shows the preview, which has a download button) or a canvas. Ask for "the complete HTML file in one code block" in the same message and use **Copy code**: in the verified run, the download button of the fixed file did nothing and ChatGPT no longer had the file one message later (uploading the first file back and asking again worked). A browser tool's page-text read can be filtered; the clipboard after **Copy code** is exact.
   - Record the model and plan shown in the chat in `PROMPTS.md`, with every prompt verbatim.

✅ Check: the file plays solo in the chat preview with moving bots, and `grep -c "RULES:BEGIN\|RULES:END" artifact/<game>.html` prints `2`.

## Phase 1: Split, server, online page, local tests

1. **Split.** Copy [assets/split-artifact.mjs](assets/split-artifact.mjs) to `tools/`, then `node tools/split-artifact.mjs artifact/<game>.html --page`. It writes `client/rules.js` (the block + `export { ...every top-level name }`) and, once, `client/index.html` (the artifact with the block removed and its `<script>` turned into a module importing the rules). It refuses markers that are missing or doubled, a block using `window`, `document`, canvas, timers, `console`, `import`/`export` and other browser-only names (with the line), and a block missing one of the six functions: send that message back to the chat as a fix request rather than editing the block yourself. Add `"split"` and `"check:rules"` (`--check`) scripts to `package.json`.
2. **Server.** `edgegap-threejs` [server templates](../edgegap-threejs/assets/server/) (`main.js`, `room.js`, `edgegap.js`, `util.js`, `Dockerfile` copying `server/` and only `client/rules.js`), plus `server/game.js` from [assets/server-game.js](assets/server-game.js): it wraps the rules, accepts only the four booleans, copies each player's score from the world, ends on the rules' winner and sends the world itself as the snapshot. If the file's `step()` already drives bots (Claude's Star Snatch does), don't call `botInput` again in `update`; if it doesn't (ChatGPT's Turf Painters), call it for each bot before `step`, as in [assets/server-game-chatgpt.js](assets/server-game-chatgpt.js). Scores come from the world (stars, owned tiles); a round timer inside the rules ends the match through `result()`, so set `matchSeconds` above it as a backstop.
3. **Online page.** In `client/index.html`, keep Claude's renderer and solo loop and add [assets/page-online.js](assets/page-online.js) (about 120 lines): Play vs bots / Find match / Local server buttons, joining by `?server=`, drawing the server's world with Claude's own `draw()`, easing ships toward each update, waiting / countdown / results screens, closing the socket on `pagehide`. Add `client/online.js`, `client/net.js`, `client/config.js` from `edgegap-threejs` (`@edgegap/sdk` through an import map with the SRI hash). Things the artifact gets wrong for online play, fix them every time:
   - The human's id is a constant (`'human'`, `"player"`): make it a variable set to the server's player id, and label only that player YOU (ChatGPT's page labelled every non-bot YOU).
   - Restart keys or buttons start a solo game from any screen: guard them to solo mode, or a waiting screen starts a solo game.
   - The solo loop steps the world every frame: skip it in online mode, where the world comes from the server.
   - Names go into `innerHTML` unescaped: harmless solo, an injection online. Escape them.
4. **Tests.** `edgegap-threejs` `tests/headless-player.mjs`, `local-match.mjs`, `e2e.mjs`; `playLikeABot()` feeds the snapshot straight to the rules' `botInput` (the snapshot is the world). Run `check:rules` before the local match in `test:local` and in CI.

✅ Check: `npm run test:local` prints `PASS`, and two tabs on `http://localhost:8080/?autoplay=local` (with `npm run server` running) see the same match with two bots.

## Phase 2: Image, app version, a direct match

1. **Image from GitHub Actions**: `edgegap-threejs` [`server-image.yml`](../edgegap-threejs/assets/ci/server-image.yml) with `IMAGE` set, `artifact/**` and `tools/**` in its `paths`, and a `npm run check:rules` step before the local match test. Keep `provenance: false` and `sbom: false`. The developer sets the registry secrets; the `EDGEGAP_REGISTRY_PROJECT` variable is not a secret.
2. **App version**: `edgegap_create_app_version` with port 7777 WS `gameport`, `tls_upgrade: true`, 256 vCPU units / 512 MB, restart `never`, max 30 minutes, env `EMPTY_TIMEOUT_S=15`, `FIRST_JOIN_TIMEOUT_S=60`, `RESULTS_SECONDS=8`. Without an API token, the same fields in the dashboard ([references/edgegap-setup.md](../edgegap-fal/references/edgegap-setup.md) in `edgegap-fal` lists each one).
3. **Direct match, no matchmaker**: `edgegap_deploy` near the players, `edgegap_wait_for_deployment`, then everyone opens `<page>?server=wss://<fqdn>:<external port>`. This is enough for playing with friends; the matchmaker is optional.

✅ Check: two windows on the `?server=` URL play one match; the deployment logs show both joins, `phase playing`, `match over`, `self-stop`, and the deployment leaves the list by itself.

## Phase 3: Optional matchmaker, end to end, clean-up

1. **Matchmaker** (for Find match): `matchmaker/<game>.json` from a sample (one profile named after the game, so several games can share one matchmaker: add a profile per game; both samples were verified on one shared matchmaker. Editing a running matchmaker's configuration in the dashboard asks for a quick restart, which drops queued tickets) (2 to 4 players, a lone player matched after 20 s with bots, `ticket_expiration_period` 30s) with the version name and every page origin in `allowed_cors_origins`. The developer creates and starts it in the dashboard; give them the file's full path. Its API URL and Auth Token go in `client/config.local.js` (git-ignored) or `client/config.js` (client-safe; never the Edgegap API token).
2. `MM_URL=... MM_TOKEN=... node tests/e2e.mjs <profile> 2` (or the repo's **Matchmaker e2e** workflow), then two browser tabs click **Find match** within 20 s and land in one match.
3. **Clean up**: stop any direct deployment nobody joined; stop or delete the matchmaker when testing is over (the free tier stops it about 3 hours after each start); list deployments and confirm none of yours are running. Nothing in a sample runs non-stop.

## Phase 4: Changing the game later

The artifact stays the source of the rules. To change gameplay: paste `artifact/<game>.html` back into the chat (or continue the same conversation), ask for the change "keeping every rule between the markers", save the new file over `artifact/<game>.html`, run `npm run split`, and commit both files. CI fails if `client/rules.js` no longer matches the artifact. If the chat also changed drawing or input code, carry those changes into `client/index.html` by hand (diff the artifact's script against the page's); the online block stays as it is. A new server build means a new tag on the app version (`edgegap_update_app_version`); the matchmaker keeps working.

## Phase 5: Hand-off

Tell the developer: the prompt and model used, what the split script checks, what was added to the page, the app, version and matchmaker names, how to play without the matchmaker (`?server=`), how to change the game later (Phase 4), what was tested, and what keeps costing money (only a running matchmaker, and any deployment that didn't stop). If the repo becomes a public example, blank the matchmaker URL and token in `client/config.js` and write the steps with placeholders.

## Reference files

- [references/prompts.md](references/prompts.md): the game prompt with markers, the restructure prompt for an existing artifact, follow-up prompts, the prompt that starts the Edgegap work.
- [references/star-snatch.md](references/star-snatch.md): Star Snatch from the claude.ai chat to a verified Edgegap match, with what Claude produced and every change made for online play.
- [references/chatgpt.md](references/chatgpt.md): Turf Painters from chatgpt.com to a verified Edgegap match: what ChatGPT got wrong, the fix prompt, getting the file out, the page and server changes.
- [assets/split-artifact.mjs](assets/split-artifact.mjs): the split script (`--page`, `--check`, `--out`).
- [assets/server-game.js](assets/server-game.js): `server/game.js` for a rules block whose world is plain data and whose `step()` drives the bots (Star Snatch).
- [assets/server-game-chatgpt.js](assets/server-game-chatgpt.js): the same for a `step()` that doesn't drive bots, with tile scores and a round timer in the rules (Turf Painters).
- [assets/page-online.js](assets/page-online.js): the online block for the artifact's page.
- `edgegap-threejs`: server, client, CI and test templates, troubleshooting. `edgegap-vibe-coded`: game fit, public demo.
