---
name: edgegap-browser-wasm
description: 'Browser / WebAssembly game multiplayer on Edgegap: a three.js (or other web) game with WASM physics (Rapier, Box2D, Jolt, ammo.js) taken to an authoritative Node.js server over secure WebSockets, with client-side prediction and the client on a CDN, not in the server image. Load this for "make my browser/WASM game multiplayer", "three.js + Rapier multiplayer", "authoritative physics server for my web game", "client prediction / reconciliation with Rapier", "wss:// from my https page fails", "mixed content", "ERR_CERT_COMMON_NAME_INVALID", "ERR_SSL_PROTOCOL_ERROR", "WASM init fails in Docker", or a server image bloated with the client bundle. Has the shared physics module, predictor, connection error messages, slim multi-stage Dockerfile and the WS + TLS Upgrade setup, from netcode-sample-threejs-rapier. Matchmaker and Find Match: edgegap-threejs; vibe-coded games: edgegap-vibe-coded; Unity WebGL: edgegap-unity; Godot web: edgegap-godot.'
metadata:
  version: "0.1.1"
---

# Edgegap for browser and WebAssembly games: authoritative physics over wss://

Goal: a browser game whose physics runs in WebAssembly becomes authoritative multiplayer. The same WASM physics engine runs on a Node.js game server (the truth) and in the browser (prediction of the local player only). Browsers reach the server with `wss://`; the client is static files on a CDN; the server image holds only the compiled server. Done means two browsers on a deployment see each other move, not that the image builds.

```
Browser (static files: CDN, GitHub Pages, any static host)
  renderer (three.js...) + WASM physics for prediction of the local player
        |  wss://<deployment host>:<external port>      (TLS terminated by Edgegap: WS port + TLS Upgrade)
        v
Edgegap deployment (slim Node.js image)
  Node.js 22 LTS, ws, fixed tick (30 Hz), WASM physics = authoritative world
```

Worked example: [netcode-sample-threejs-rapier](https://github.com/edgegap/netcode-sample-threejs-rapier) (three.js 0.187, Rapier `@dimforge/rapier3d-compat` 0.21, ws 8.22, Vite 8, Node 22.23 Alpine image of 63.5 MB compressed). The docs page "Make Your Browser (WebAssembly) Game Multiplayer" is the same guide for humans. Verified on 2026-11-18 on a laptop: two headless players and two browser windows on one server, the container started with `docker run --network none`, `SIGTERM` exit, the empty-server stop, and every browser error in `references/troubleshooting.md` reproduced in Chrome 157 and Edge 157. The WS + TLS Upgrade port, `wss://` to the deployment host and the self-stop are verified on Edgegap with the `edgegap-threejs` samples, which use the same server shape.

Why this shape, so you can defend it:
- **Authoritative server.** Clients send inputs only. Positions decided in the browser can be edited in devtools.
- **Same physics code on both sides.** One module builds the world and applies an input; the server and the client's predictor both import it, so prediction matches the server unless something the client can't see got in the way.
- **WebSockets with TLS Upgrade.** Browsers can't send UDP, and `https` pages can only open `wss://`. Edgegap terminates TLS on a `WS` port with **TLS Upgrade**, with a certificate for the deployment's host name; the Node server stays plain `ws`.
- **Client and server ship apart.** A client bundle (renderer, textures, WASM build) in the server image makes every deployment pull more, start slower, and trips container scanners. Static hosting caches the client worldwide.
- **WASM embedded in JavaScript.** Compat builds (Rapier `-compat`) carry the binary inside the JS: no `.wasm` path in the container, no MIME type on the static host, nothing downloaded at startup.

## How to work

- **Be the engineer**: write the server, the shared module and the client changes; run Node, Docker and the Edgegap MCP tools; read logs. Hand the developer only account steps (registry login, playtesting on two networks).
- **Secrets and money** (rules: [agent-rules](../edgegap/references/agent-rules.md)): the Edgegap API token never goes in a page, an image or an env var. Ask before deploying; stop what you deployed.
- **One layer at a time**: local server → container → one deployment → hosted client. Each phase has a check.

## Phase 0: Understand the game

Read, don't ask: renderer, bundler (Vite, none...), the physics engine and its package (Rapier compat or not, Box2D/planck, Jolt, ammo.js, cannon-es which is plain JS), where the game loop, input and world setup live, whether any networking exists. Ask only what you can't infer: players per server, where the page is hosted, Docker and Edgegap account.

## Phase 1: Shared physics module and authoritative server

Read `references/architecture.md`.
1. Split the code into `shared/` (constants, tick rate, message types, and a DOM-free physics module: `createWorld`, `buildArena`, `createPlayerBody`, `applyInput`), `server/` and `client/`, as npm workspaces. Template: `assets/shared/physics.ts` and `assets/shared/index.ts`.
2. Server (`assets/server/`): `await RAPIER.init()` once, fixed 30 Hz tick with an accumulator, one queued input per player per tick (cap the queue at ~4), `world.step()`, a snapshot per client with `ack` (last applied input seq) and its own ball's full state (pose, linear and angular velocity). Clamp every input field in `applyInput`, the one place inputs touch the world. Port from `PORT` (default 7777), `GET /health`, `SIGTERM` closes sockets and exits, a WebSocket ping every 15 s drops dead connections, and the deployment stops itself after `EMPTY_SHUTDOWN_MINUTES` without players (`assets/server/edgegap.ts`: `DELETE $ARBITRIUM_DELETE_URL` with `$ARBITRIUM_DELETE_TOKEN`).

✅ Check: the sample's `scripts/smoke-test.mjs` (two headless players roll for 4 s): both moved, both see two players, `ack` > 0.

## Phase 2: Client with prediction and interpolation

Read `references/prediction.md`. Template: `assets/client/prediction.ts`, `assets/client/net.ts`.
- Fixed 30 Hz input steps in the render loop: read input, send it with a `seq`, apply it to a client-side world (static arena + own body only), remember it.
- On each snapshot: reset the own body to the server state, drop inputs `≤ ack`, replay the rest; ease the visible correction out over a few frames.
- Everyone else (other players, crates): draw ~100 ms in the past, interpolating between two snapshots by server tick.
- Connect with `wss://` unless the page is `http` and the host is local; retry the first connection ~5 times (a fresh deployment refuses for a few seconds); heartbeat every 5 s from a timer (hidden tabs run no animation frames); `?server=host:port` for testing.
- Explain failures: the browser gives scripts only close code `1006`, so print the console's `net::ERR_*` meanings (`references/troubleshooting.md`).

✅ Check: two browser windows on `?server=localhost:7777` see each other; toggling prediction off shows the raw delay.

## Phase 3: Server image

Read `references/wasm-in-containers.md`. Template: `assets/server/Dockerfile` and `assets/.dockerignore` (build context = repo root, allowlist).
- Multi-stage: build stage compiles TypeScript; runtime stage `npm ci --omit=dev` for server + shared only, copies `dist/`, `USER node`, `CMD ["node", "server/dist/index.js"]` (Node as PID 1 gets `SIGTERM`).
- Pin the base image by tag and digest, dependencies by exact version (published at least two weeks earlier).
- Drop what the server never loads (Rapier compat: `rapier.cjs`, source maps, loose `.wasm`; ~10 MB).
- `docker build --platform linux/amd64 --provenance=false --sbom=false -f server/Dockerfile -t <image>:<YYYYMMDD-HHMM> .`: without the two flags Docker Desktop pushes an attestation index Edgegap can't pull.

✅ Check: `docker run --network none <image>` logs `listening on 0.0.0.0:7777` (no runtime download), the smoke test passes against `-p 7778:7777`, `docker stop` exits 0. Then `edgegap_validate_server_config` with the Dockerfile, `netcode: "websocket"`, ports `[{port: 7777, protocol: "WS", tls_upgrade: true}]`.

## Phase 4: Deploy on Edgegap

Same as `edgegap-threejs` Phase 3 ([its deploy reference](../edgegap-threejs/references/deploy.md)). In short:
1. Push to `registry.edgegap.com/<project>/<image>:<tag>`. The developer logs in (`echo "<token>" | docker login registry.edgegap.com -u "<username>" --password-stdin`); `edgegap_get_registry_credentials` returns nothing with a regular API token. A `401` on push means a stale login or another project. CI: the sample's `.github/workflows/server-image.yml` with repo secrets.
2. `edgegap_create_app` + `edgegap_create_app_version`: port `7777`, protocol `WS`, `tls_upgrade: true`, name `gameport`; 256 CPU units / 512 MB; `max_duration_minutes` 30-60; `restart_policy: "never"`.
3. Ask, then `edgegap_deploy` (player IP, test tag) → `edgegap_wait_for_deployment` → `wss://<fqdn>:<external>`. The API equivalent is `GET /v1/status/{request_id}`: `fqdn`, `ports.gameport.external`, `ports.gameport.link`.

✅ Check: `SERVER_URL=wss://<fqdn>:<external> node scripts/smoke-test.mjs`, then the hosted page with `?server=<fqdn>:<external>` from two networks. Read `edgegap_get_deployment_logs` while players are on; stop the deployment when done (or let it stop itself after the empty timeout).

## Phase 5: Host the client

`npm run build -w client` → upload `client/dist/` anywhere static. Vite `base: "./"` keeps paths relative (GitHub Pages subfolders). The sample's `.github/workflows/pages.yml` publishes it on every push (public repo on a free GitHub plan).

## Next steps to offer

- Find Match instead of a server field: `edgegap-threejs` (Edgegap JS SDK `GroupAgent`, matchmaker config, CORS origins) and `edgegap-matchmaking`.
- Region selection: ping Edgegap beacons from the browser (`edgegap_list_ping_beacons`, `edgegap-matchmaking`).
- Unity WebGL: `edgegap-unity`; Godot web exports: `edgegap-godot`.

## Reference files

- `references/architecture.md`: repo layout, the wire protocol, tick and input queue, what each side owns.
- `references/prediction.md`: prediction, reconciliation, visual smoothing, snapshot interpolation by server tick.
- `references/wasm-in-containers.md`: compat vs separate `.wasm`, other WASM physics engines, image size, scanners.
- `references/troubleshooting.md`: exact browser messages (Chrome 157, Edge 157) → cause → fix.
- `assets/`: `shared/` (constants + physics module), `server/` (index, edgegap self-stop, Dockerfile), `client/` (predictor, connection), `.dockerignore`.

Related skills in this pack, if installed: `edgegap` (platform, safety rules), `edgegap-threejs` (matchmaker, Find Match, rooms with phases and bots), `edgegap-vibe-coded`, `edgegap-containerize`, `edgegap-local-testing`, `edgegap-troubleshoot`, `edgegap-launch`.

Sources of truth: https://docs.edgegap.com/web-games, https://docs.edgegap.com/learn/orchestration/application-and-versions, https://rapier.rs/docs/user_guides/javascript/getting_started_js, https://github.com/edgegap/netcode-sample-threejs-rapier.
