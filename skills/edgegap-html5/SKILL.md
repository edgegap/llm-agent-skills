---
name: edgegap-html5
description: 'HTML5 multiplayer games on Edgegap: a 2D browser game (Phaser, plain canvas 2D, PixiJS, Kaplay) with an authoritative Node.js WebSocket server per match, Find Match from the page with the Edgegap JS SDK, wss with TLS Upgrade. Load this before using any Edgegap MCP tool on a Phaser or 2D canvas game that has or needs its own ws server. Templates from netcode-sample-html5-phaser (Splat Arena, Phaser 4): 2D server rules with movement, projectiles, hits, cooldowns and bots; a no-build Phaser client with interpolation and bullet extrapolation; a matchmaker profile; headless tests; a Windows script that builds, pushes, deploys and waits for the self-stop with tokens kept in the console. Use for "html5 multiplayer game", "make my Phaser game multiplayer", "host my canvas game server", "Find Match for a 2D web game". 3D web games (Three.js, Babylon.js, PlayCanvas): edgegap-threejs. Colyseus: edgegap-colyseus. Single-player games from an AI tool: edgegap-vibe-coded. One HTML file from a chat: edgegap-chat-canvas.'
metadata:
  version: "0.1.0"
---

# Edgegap for HTML5 games: Phaser or canvas 2D, one Node.js server per match

Goal: a 2D browser game where each match runs on its own authoritative Node.js server on Edgegap, near its players. Players click **Find match**, the page asks Edgegap's matchmaker for a ticket through the Edgegap JS SDK (`@edgegap/sdk`), the matchmaker starts a server and returns `wss://<id>.pr.edgegap.net:<port>`, everyone plays, and the server stops its own deployment when the match is over. Done means real clients played a whole match on one Edgegap deployment that then stopped itself, not that the image builds.

```
browser (Phaser / canvas) --GroupAgent: POST /groups {profile}--> Edgegap Matchmaker --deploys near the players--> Edgegap
browser <--HOST_ASSIGNED {fqdn, ports.gameport}, ticket_id--
browser --wss://<fqdn>:<port>  hello{name, ticket}, then inputs--> Node.js server (one per match) --20 snapshots/s--> browser
                                                                   match over --> DELETE $ARBITRIUM_DELETE_URL (self-stop)
```

This skill is the 2D, HTML5-first twin of `edgegap-threejs`. Both use the same room, lifecycle, protocol, Dockerfile and matchmaker; this one adds 2D server rules (pixels, projectiles, hits), a Phaser client and the pitfalls of 2D engines. Read `edgegap-threejs` references for the shared parts: [server.md](../edgegap-threejs/references/server.md), [client.md](../edgegap-threejs/references/client.md), [deploy.md](../edgegap-threejs/references/deploy.md), [troubleshooting.md](../edgegap-threejs/references/troubleshooting.md).

## What was verified

From [netcode-sample-html5-phaser](https://github.com/edgegap/netcode-sample-html5-phaser) (Splat Arena: top-down paintball, Phaser 4.2.1, `@edgegap/sdk` 1.1.0, Node 22), on 2026-11-24:

- Locally: `npm test` (two headless players and a bot) played a full match to a winner; two browser tabs on the local server played in the same match with bots and saw the same state; Phaser loaded from the CDN with its SRI hash, no console errors.
- On Edgegap: the image built with Docker Engine in WSL and was pushed to the Edgegap registry; an app version (WS port 7777, TLS Upgrade, 256 CPU units / 512 MB, restart never) deployed in about 10 s; two headless players played a full match over `wss://<fqdn>:<port>` (direct mode, `tools/e2e.mjs`), and the deployment stopped itself 25 s after the match.
- Through the matchmaker (profile `splat-arena`): two headless players were matched onto one deployment (`HOST_ASSIGNED` in about 23 s), played a full match and the deployment stopped itself 24 s after it; two Chrome tabs pressing Find Match landed on the same server, which stopped itself after both left.

Why this shape, so you can defend it:
- **Authoritative server, thin client.** The page sends intents (axes, aim angle, fire button) and draws snapshots; the server owns movement speed, fire rate, projectiles, hits and score. Anything decided in browser JavaScript can be changed in devtools.
- **One deployment = one match**, placed near its players and billed only while it runs.
- **The server stops itself.** Only the game knows the match is over.
- **WS + TLS Upgrade.** `https` pages can only open `wss://`; Edgegap terminates TLS on the port, so the Node server stays plain `ws`, and clients connect by FQDN so the certificate matches.
- **The browser calls the matchmaker, never the Deploy API.** The matchmaker Auth Token is made to ship in clients; the Edgegap API token controls the whole organization.

## How to work

- **Be the engineer.** Read the game, write the server and client changes, run Node, Docker and the Edgegap MCP tools, read logs. Hand the developer only account steps: registry login, creating the matchmaker in the dashboard, playtesting.
- **One layer at a time**: game on a local server, then container, then one direct deployment, then matchmaker, then browser. Each phase has a check.
- **Secrets** (full rules: [the edgegap skill's agent rules](../edgegap/references/agent-rules.md)): the Edgegap API token and registry token never go in a page, the image, git or chat. When the developer must type them, give them a script that reads them with hidden input into the current console only (`assets/tools/edgegap-env.ps1` on Windows) and run the next steps in that same console.
- **Money.** Ask before deploying. Tag test deployments and stop only the ones you started.

## Phase 0: Understand the game

Read, don't ask: the renderer (Phaser 3 or 4, canvas 2D, PixiJS, Kaplay), bundler or none, where the game loop and input live, what decides collisions and scores today, and whether there is any networking yet (none, PeerJS/WebRTC host-in-browser, socket.io, a hosted service). Where the page is served (localhost, itch.io, GitHub Pages, own domain): every origin goes into the matchmaker's CORS list.

Ask, in one message, only what you couldn't infer: players per match, teams, whether a lone player should get a match (bots), the page origins, their Edgegap account and Docker. Default: free-for-all, 2 to 8 players, a lone player gets a match after 20 s with bots.

## Phase 1: Authoritative server, local

1. Copy the shared server files from `edgegap-threejs`: [main.js](../edgegap-threejs/assets/server/main.js), [room.js](../edgegap-threejs/assets/server/room.js), [edgegap.js](../edgegap-threejs/assets/server/edgegap.js), the [Dockerfile](../edgegap-threejs/assets/server/Dockerfile) and [.dockerignore](../edgegap-threejs/assets/server/.dockerignore). Take `assets/server/util.js` from this skill instead of theirs: it works in `x, y` pixels, the space 2D engines draw in. `package.json` gets `"type": "module"`, `ws` and `@edgegap/sdk` (Node 22 or later).
2. Write `server/game.js` with the room contract (`addPlayer`, `removePlayer`, `input`, `start`, `update`, `result`, `timeUp`, `snapshot`, `info`). `assets/server/game.js` is a complete 2D example to copy from: movement with no faster diagonals, walls as boxes, projectiles with speed, lifetime and wall hits, a server-side fire cooldown, hits that score and respawn, a spawn shield that ends when the player fires, bots that chase, strafe and shoot with some inaccuracy, and paint-splat events drained into the next snapshot.
3. Use the same world size on both sides (Splat Arena: 960 x 600 px) and send it in `info()` with the walls, so the client draws the level from the server.
4. Keep snapshots small: rounded numbers, only what is drawn. Projectiles carry `vx, vy` so the client can move them between snapshots.

2D rules that matter online:
- **Validate every input**: clamp axes to [-1, 1], accept only finite angles, booleans as `=== true`. Never accept positions, hits or scores from a client.
- **Cooldowns, speed and damage live on the server.** A modified client that sends `fire: true` every frame still fires at the server's rate.
- **Hits are decided where the projectile is on the server**, not where the shooter saw the target. With 20 snapshots a second and easing, a moving target is drawn ~50–100 ms behind; keep projectiles fast enough and hitboxes forgiving (Splat Arena: 620 px/s, player radius 16 + bullet radius 5).

✅ Check: `node tools/local-test.mjs` (`assets/tools/local-test.mjs` with `assets/tools/headless-player.mjs`) starts the server with short timers and two headless players that aim at the nearest player and fire; it passes when the match reaches `over` with a winner and at least one hit.

## Phase 2: HTML5 client

`assets/client/` is a no-build Phaser 4 client: `index.html` (Phaser as a classic `<script>` with its SRI hash, the SDK through an import map with its own), `main.js` (menu, Find Match, local and `?server=` modes, HUD, input throttling), `scene.js` (the Phaser scene), `net.js` (hello handshake, first-connection retries, heartbeat), `config.js` (matchmaker URL and token, profile name), `style.css`.

The scene's contract with `main.js`: `startMatch({ myId, info, send })` builds the level from `info`, `applyState(msg)` takes every state message, `clearMatch()` empties the level, and `update()` eases sprites and calls `send(input)`. Only `scene.js` depends on Phaser.

Rendering from snapshots:
- Ease each player toward its latest server position every frame (`1 - exp(-16 dt)`); snap instead on respawn, or players slide across the map.
- Move projectiles with their velocity between snapshots and correct on each snapshot; easing them looks like lag.
- Show the local player's own aim at once (barrel follows the mouse) and send the angle; the server still decides where shots go.

Phaser pitfalls:
- Read the keyboard from `window` listeners that skip `INPUT` targets (as `scene.js` does), not Phaser's keyboard plugin: Phaser captures keys globally, so the name field in the menu stops working or typing moves the player.
- Aim with `pointer.worldX/worldY`. With `Phaser.Scale.FIT` the canvas is scaled, and `pointer.x/y` are in screen pixels.
- Hidden tabs get no `requestAnimationFrame`, so no `update()` and no input. The heartbeat in `net.js` runs on a timer to keep idle-timeout logic honest, and `window.__game` (phase, players, result) is fed by WebSocket messages for browser automation.
- Pin Phaser and keep its `integrity` hash in `index.html`; regenerate it when you change the version: `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`.

Other renderers: keep `main.js`, `net.js`, the protocol and the server, and rewrite `scene.js` with the same four methods: a canvas 2D `requestAnimationFrame` loop (`ctx.arc`, `ctx.fillRect`), PixiJS `Graphics` and `Container`, or Kaplay. The scene was run with Phaser 4.2.1 only; on Phaser 3, check `add.circle`, `setStrokeStyle` and containers in the version you load.

✅ Check: two browser tabs on **Local server** play in the same match and see the same state.

## Phase 3: Image, app version, one direct deployment

Follow `edgegap-threejs` Phase 3 and [deploy.md](../edgegap-threejs/references/deploy.md) §1 to §3: `docker build --platform linux/amd64`, push a unique tag (UTC `YYYYMMDD-HHMM`), app version with port `7777`, protocol **WS**, name `gameport`, `tls_upgrade: true`, 256 CPU units / 512 MB, max duration 30, `restart_policy: "never"`, then one deployment near the player.

On Windows, `assets/tools/edgegap-test.ps1 all` does it in one console: it dot-sources `assets/tools/edgegap-env.ps1` (Edgegap API token and registry token read as hidden input, kept in that console's environment only), logs Docker in with `--password-stdin`, builds and pushes, creates the app (first time) and the version through the v1 API, deploys near the developer's public IP, prints `READY wss://...`, then polls until the deployment stops itself and stops it after 15 minutes otherwise. It uses `docker.exe`, or Docker Engine inside WSL (`wsl -e docker`) when Docker Desktop isn't installed; Docker's apt install in WSL needs the developer's Ubuntu password, so they type it in the console. Windows blocks scripts by default: run it after `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force`, which lasts for that console only.

✅ Check: while the deployment is up, `SERVER_URL=wss://<fqdn>:<port> node tools/e2e.mjs 2` ([e2e.mjs](../edgegap-threejs/assets/tools/e2e.mjs) with `splatInput`-style test input from `assets/tools/headless-player.mjs`) plays a whole match and sees the deployment stop itself.

## Phase 4: Matchmaker

Start from `assets/matchmaker/splat-arena.json`: one free-for-all profile, 2 to 8 players, a 20 s expansion that lets a lone player in (bots fill), 30 s ticket expiry. Set `application.version`, rename the profile to match `config.profile` in the client, and list every page origin in `allowed_cors_origins` (scheme + host + port; itch.io embeds are `https://html-classic.itch.zone`). The developer creates it in the dashboard (Matchmaker, Create, upload, **Create and Start**) and pastes the **API URL** and **Auth Token**. Teams, parties and rate limits: [deploy.md](../edgegap-threejs/references/deploy.md) §4.

## Phase 5: End-to-end test and hand-off

1. `MM_URL=... MM_TOKEN=... node tools/e2e.mjs <profile> 2`: both players on one deployment, the server saw both tickets, a result, then self-stop.
2. Two real browser tabs click **Find match** within 20 s and land in the same match; then the hosted page's origin.
3. Nothing of yours left running (`edgegap_list_deployments`).

Shipping the page: it is static files. GitHub Pages ([pages.yml](../edgegap-threejs/assets/ci/pages.yml)) or itch.io as an HTML5 game (zip `client/`). The server image can be built by GitHub Actions ([server-image.yml](../edgegap-threejs/assets/ci/server-image.yml)) when the developer has no local Docker.

Hand-off: what changed where; app, version and matchmaker names; how to ship a new build (new tag, then point the version at it); what was tested and what wasn't; before launch: `inspect: false`, real origins only, `REQUIRE_TICKET=1`, `edgegap-launch`.

## Files

- `assets/client/`: `index.html`, `main.js`, `scene.js`, `net.js`, `config.js`, `style.css` (Phaser 4 client, Find Match, local and direct modes).
- `assets/server/game.js`: Splat Arena's rules, a 2D example of the room contract. `assets/server/util.js`: 2D helpers (clamp, box push-out, ranking).
- `assets/tools/`: `headless-player.mjs` (test player with 2D aim-and-fire input), `local-test.mjs` (one local match, CI-ready), `edgegap-env.ps1` and `edgegap-test.ps1` (Windows: credentials in the console, build, push, version, deploy, wait for self-stop).
- `assets/matchmaker/splat-arena.json`: a free-for-all profile with bots for a lone player.

Related skills in this pack, if installed: `edgegap` (platform and safety rules), `edgegap-threejs` (shared server, deploy and matchmaker references; 3D clients), `edgegap-browser-wasm` (client prediction, WASM physics, `wss://` errors), `edgegap-vibe-coded`, `edgegap-chat-canvas`, `edgegap-colyseus`, `edgegap-matchmaking`, `edgegap-troubleshoot`, `edgegap-launch`.

Sources of truth: https://docs.edgegap.com/docs/sample-projects/web-games, https://docs.edgegap.com/learn/matchmaking, https://docs.phaser.io, https://github.com/edgegap/netcode-sample-html5-phaser.
