---
name: edgegap-fal
description: 'fal.ai + Edgegap: make a browser game built with fal.ai online multiplayer on Edgegap (matchmaker, one authoritative server per match), keeping solo play. Load this when someone makes, or wants to make, a game with fal, fal.ai, the fal MCP, the genmedia CLI, fal game skills or fal Agent and wants Find Match, online play or real servers, or asks how to build a fal game that can go online. Two paths: a coding agent (Claude Code, Codex, Cursor, ChatGPT) writes a Three.js or canvas game and fal generates the assets (rigged 3D characters, props, sprites, textures, sounds); or fal Agent writes the code in a chat. Has the prompts that keep the rules in one DOM-free file the server runs, the fal asset pipeline (image to rigged GLB, clips, sizes, loader pitfalls, nothing in the server image), edgegap-threejs templates, CI image build, tests, clean-up. Verified samples: netcode-sample-fal-relic-rumble (3D, fal assets), netcode-sample-fal-orb-arena (fal Agent). Other AI tools: edgegap-vibe-coded.'
metadata:
  version: "0.2.1"
---

# Edgegap for fal.ai games: fal makes the game's media, Edgegap runs the matches

fal.ai is used when the game is **built**; Edgegap is used when people **play**. A match makes no call to fal, and the server never loads a fal asset:

```
build time                                              play time
coding agent ──writes──> client/rules.js  render.js     page ──Find match──> Edgegap matchmaker
fal.ai ──generates──> client/assets/ (GLB, images,           <── wss://<id>.pr.edgegap.net:<port> ──
        through the fal MCP or genmedia CLI)   sounds)   one Node.js server per match near the players:
                 │                                       runs the same rules.js at 60 Hz, fills seats
                 └─ rules.js is shared unchanged ──────> with bots, stops itself when the match ends
solo mode still runs rules.js in the page, offline
```

Pick the path by how the game is (or will be) made:

| Path | The developer says | Start at |
|---|---|---|
| **A. Coding agent + fal assets** (most fal game makers) | "I'm building a game with Claude Code / Codex / Cursor / ChatGPT and fal", "fal MCP", "genmedia", fal's game tutorials, a Three.js game with fal 3D models or sprites | Phase 0A |
| **B. fal Agent wrote the code** | "I made a game in fal Agent", code blocks in a fal chat | Phase 0B |

Both paths meet at Phase 1. Interactive world models on fal (worlds generated as live video) are a different thing: there is no game server to host, so this skill doesn't apply; say so.

**Verified on Edgegap:**
- Path A, 2026-11-17, [netcode-sample-fal-relic-rumble](https://github.com/edgegap/netcode-sample-fal-relic-rumble) (Relic Rumble, 3D, 4 players carry relics and shove each other): four rigged characters with walk and run clips, three props, a floor texture and five sounds from fal (about $6.30 at list prices); two headless players and two browser tabs matched through the matchmaker onto one deployment, a full match, self-stop 20 s after it. [references/relic-rumble.md](references/relic-rumble.md).
- Path B, 2026-11-09, [netcode-sample-fal-orb-arena](https://github.com/edgegap/netcode-sample-fal-orb-arena) (Orb Arena, 2D): fal Agent wrote rules, renderer and page in one answer on its free models; same tests, on a GitHub Pages page. [references/walkthrough.md](references/walkthrough.md).

Relic Rumble's assets were generated with the `genmedia` CLI; the fal MCP server exposes the same models.

## Who you are talking to

Often a creator who knows fal for images, video and 3D, not servers. Speak in outcomes ("each match gets its own server near its players and shuts down when the match ends, so you pay only while people play"), do the engineering yourself, and hand over only the account steps (fal credit, registry secrets, creating the matchmaker). Keep a record of the fal prompts (`PROMPTS.md`): they are how one asset gets regenerated in the same style later.

## Phase 0A: A coding agent builds the game, fal makes the assets

1. **Graybox first, rules in their own file.** Build (or reshape) the game with plain shapes and no fal call, using the game prompt in [references/prompts.md](references/prompts.md) §1: every rule in `client/rules.js` (no `window`, `document`, WebGL, audio or timers), `setInput(world, id, input)` with plain values, `step(world, dt)` returning events, `botInput(world, id)` reading only positions, collisions as circles and boxes, never meshes. If the game already exists with rules inside the render loop, move them out first (`edgegap-vibe-coded` Phase 1).
2. **Check the game fits the network** (`edgegap-vibe-coded` Phase 0 table): pushing, carrying, drift, slow projectiles and turn-based play feel fine with no client prediction; precise platforming, rhythm and instant-hit aiming do not. Change the design now, not after the assets are made.
3. **Make every asset optional.** One `client/assets.js` lists the files; the renderer draws a plain shape for an empty or failed entry. The game is then playable and testable (Phase 1 included) before any fal credit is spent, and the server work never waits on art.
4. **Generate with fal** following [references/assets.md](references/assets.md): concept image, then image-to-3D (with rigging for characters), then shrink for the web. It has the models and prices used, the prompt rules that make auto-rigging work, the loader pitfalls (a rigged GLB's bounding box is 100 times off; clips come as separate files) and what stays out of the server image. Tell the developer the estimated cost before running; a fal account with no balance answers `403 User is locked. Reason: Exhausted balance` and only they can top it up.

✅ Check: the solo game plays against bots from `http://localhost:8080` with the fal assets, still plays with `client/assets.js` emptied, and `grep -nE "window|document|canvas|setTimeout|setInterval|requestAnimationFrame" client/rules.js` prints nothing.

## Phase 0B: fal Agent writes the game

1. **Prompt fal Agent** with the template in [references/prompts.md](references/prompts.md) §2: the gameplay paragraph is theirs, the architecture paragraph stays as written. It asks for the same `rules.js` shape as above and the full content of each file.
2. **Check the game fits the network** (same table). If the idea is in the wrong column, change the design in the prompt before fal writes it.
3. **Copy the code out.** fal answers in code blocks in the chat; copy each block into `client/` of a git repo (`rules.js`, `main.js`, `index.html`). If you drive the fal page from a browser tool, page scripts that read the blocks may be blocked: read the page text instead and re-indent, then diff the logic against the chat before committing. Images fal generated go in `client/assets/` with their prompts noted.
4. **Run it locally** (`npx http-server client -p 8080`): ES modules don't load from `file://`.

✅ Check: the solo game plays against bots from `http://localhost:8080`, and the `grep` above prints nothing. If fal put the rules inside `main.js` anyway, move them into `rules.js` yourself (`edgegap-vibe-coded` Phase 1); asking fal again with "all rules stay in rules.js" also works.

## Phase 1: The server, Find Match and local tests

Follow `edgegap-vibe-coded` Phases 1 and 2 with the `edgegap-threejs` templates. For a fal game:
- `server/` = `main.js`, `room.js`, `edgegap.js`, `util.js` from [`edgegap-threejs`'s server templates](../edgegap-threejs/assets/server/) unchanged, plus `server/game.js` that wraps `../client/rules.js` (about 70 lines in both samples): `addPlayer`/`removePlayer` call the rules with the room's player ids, `input` clamps every field, `start` builds a fresh world with the room's players (bots included), `update` runs `botInput` for bots then `step` and copies scores into the room, `result` ends on the rules' winner, `snapshot` sends rounded positions and the events.
- The page keeps its renderer: make it draw a plain view (`{players, relics, ...}`) built either from the solo world or from the server's snapshot, so one draw path serves both. Online, ease each character toward the latest server position and let the animation follow the eased speed. Add Find match, Cancel and Play vs bots (`client/online.js`, `client/net.js`, `client/config.js` from the templates; `@edgegap/sdk` through an import map with the SRI hash).
- A tap (shove, fire) must survive input throttling: keep it queued until an input message has actually been sent.
- `tests/headless-player.mjs`: `playLikeABot()` rebuilds `{players, ...}` from the snapshot and calls the rules' `botInput`, so test matches end on score.
- `server/Dockerfile` copies `server/` and only `client/rules.js`. No asset goes into the image: Relic Rumble's 7 MB of models stay with the page.

✅ Check: `node tests/local-match.mjs` prints `PASS` (two headless players, full match), and two tabs on the local page with **Local server :7777** see the same match.

## Phase 2: Image, app version, matchmaker

Read [references/edgegap-setup.md](references/edgegap-setup.md). In short:
1. **Image from GitHub Actions** ([`server-image.yml`](../edgegap-threejs/assets/ci/server-image.yml) from `edgegap-threejs`): it runs the local match test, then pushes `registry.edgegap.com/<project>/<game>:<YYYYMMDD-HHMM>`. Keep `provenance: false` and `sbom: false` on `docker/build-push-action`: with the defaults, Orb Arena's first image failed every deployment with `Unable to pull image from registry`. The developer sets the registry secrets in GitHub; you can set the `EDGEGAP_REGISTRY_PROJECT` variable. A Docker login on the developer's machine may belong to another registry project (a push then answers 401): CI with the repo's own secrets avoids guessing.
2. **App version**: with an Edgegap API token, `edgegap_create_app_version` (port 7777 WS `gameport`, `tls_upgrade: true`, 256 vCPU units, restart `never`, max 30 minutes, quick-stop env vars). Without one, the same settings in the dashboard: the setup reference lists every field. Before the matchmaker exists you can already prove the server: `edgegap_deploy`, then `SERVER_URL=wss://<fqdn>:<port> node tests/e2e.mjs 2`.
3. **Matchmaker**: `matchmaker/<profile>.json` (2 to 4 players, a lone player after 20 s with bots) with the version name and every page origin in `allowed_cors_origins`. The developer creates and starts it in the dashboard; give them the file's full path. Its API URL and Auth Token go in `client/config.local.js` (git-ignored) or `client/config.js` (client-safe; never the Edgegap API token).

To ship a new server build (the rules changed), point the version at the new tag with `edgegap_update_app_version`; the matchmaker keeps working. Asset-only changes need no server build at all.

✅ Check: the Actions summary shows the pushed tag, the version shows `7777 WS gameport` with TLS Upgrade on, and the matchmaker is ONLINE.

## Phase 3: Prove it, then clean up

1. `MM_URL=... MM_TOKEN=... node tests/e2e.mjs <profile> 2`, or the repo's **Matchmaker e2e** workflow when the agent's sandbox can't reach the matchmaker: both players on one deployment, a result, and the deployment stops itself. If deployments come and go in seconds, read the deployment log in the dashboard before anything else.
2. Two browser tabs on the served page click **Find match** within 20 s and land in the same match. The page must be served from an origin in the CORS list. GitHub Pages works for public repos on free plans ([`pages.yml`](../edgegap-threejs/assets/ci/pages.yml) from `edgegap-threejs`); check the total size of `client/assets/` first.
3. **Clean up, so nothing runs non-stop**: every match server stops itself; stop or delete the matchmaker when testing is over (the free tier stops it about 3 hours after each start anyway); unpublish the page if it should not stay up; list deployments and confirm none of yours are running. For a demo that must stay up, read [the public-demo reference of `edgegap-vibe-coded`](../edgegap-vibe-coded/references/public-demo.md) and say what it costs first.

## Phase 4: Hand-off

Tell the developer: the prompts and where each file came from, what fal cost, what was added for online play, the app, version and matchmaker names, how to ship a new server build (new tag on the version) and that new art needs none, what was tested, and what keeps costing money (only the matchmaker while it runs, and any deployment that didn't stop). If the repo becomes a public example, blank the matchmaker URL and token in `client/config.js` and write the steps with placeholders.

## Reference files

- [references/prompts.md](references/prompts.md): the game prompt for a coding agent, the fal Agent prompt template, follow-ups, and the prompt that starts the Edgegap work.
- [references/assets.md](references/assets.md): the fal asset pipeline for a game that goes online: models and prices, concept prompts that rig, loading rigged GLBs in Three.js, sizes, sounds, what the server never sees.
- [references/edgegap-setup.md](references/edgegap-setup.md): image build, app version fields (MCP and dashboard), matchmaker config, GitHub Pages, and the pitfalls hit on the way.
- [references/relic-rumble.md](references/relic-rumble.md): Relic Rumble from graybox to fal assets to a verified online match.
- [references/walkthrough.md](references/walkthrough.md): Orb Arena from the fal Agent chat to a verified online match, file by file.
- `edgegap-vibe-coded`: game fit, shared rules file, public demo. `edgegap-threejs`: server, client, CI and test templates, troubleshooting.
