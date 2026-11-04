# Server: shape, lifecycle, image, local checks

Contents
1. What the server is in a Cocos game
2. The shape Edgegap needs
3. Lifecycle module (self-stop)
4. Wiring an existing ws server
5. Only matched players in
6. Image
7. Other server languages
8. Local checks

## 1. What the server is in a Cocos game

Cocos Creator has no headless server build: the editor builds clients (web, native, mini-games). The multiplayer server is a separate program, usually a Node.js app in a folder of the project (`Server/`, `server/`), sometimes in its own repo. The Edgegap Cocos extension's README says the same and containerizes that folder. So "host my Cocos game on Edgegap" means: containerize that server, not the Cocos project.

Find out which server it is before anything else:
- `colyseus` or `@colyseus/*` in its `package.json` → stop, use `edgegap-colyseus` (it has Colyseus lifecycle hooks, the 0.14 → 0.17 Cocos client port and a verified Cocos sample).
- Nakama runtime → `edgegap-nakama`.
- Plain `ws`, `socket.io`, `uWebSockets.js`, a custom TCP/UDP server, Go/C#/Rust... → this skill.
- No server at all (rules run in one player's client, or peer to peer) → write one: move the rules into the server (`edgegap-server-design`), the Cocos client only sends inputs and draws state. A browser JavaScript game's rules can also be shared with the server as a DOM-free module, as `edgegap-threejs` shows; Cocos scripts that import `cc` can't run in Node, so only the parts free of `cc` move.

## 2. The shape Edgegap needs

| Need | Why |
|---|---|
| Linux x86-64 container | Edgegap runs `linux/amd64` images; build with `--platform linux/amd64`, also on Apple Silicon (the extension always does). |
| Listen on a fixed port, on `0.0.0.0`, read from `PORT` | The app version maps that internal port to a random external one. The extension's **Run locally** passes `PORT`. |
| WebSocket on that port, app version protocol **WS** with **TLS Upgrade** | Web and mini-game builds can only open `wss://` from secure contexts (mini-game platforms require it, section `platforms.md`). Edgegap terminates TLS, so the server stays plain `ws`. |
| Config from env vars | One image for local, test and production; Edgegap injects `ARBITRIUM_*` (and `MM_*` from the matchmaker). |
| One match per deployment, self-stop at match end | Only the game knows the match is over; an idle deployment bills until its max duration. Design rules: `edgegap-server-design`. |
| Node as PID 1 (`CMD ["node", ...]`) | Edgegap's SIGTERM then reaches the server; `npm start` or a shell wrapper can swallow it. |
| `restart_policy: "never"` on the version | A crash ends the deployment instead of restarting a half-played, empty match. The API default is `always`, and the extension doesn't set it (see `extension.md`). |

Native-only games (desktop/mobile, no web or mini-game build) may use TCP or UDP instead of WS. Everything here still applies except TLS Upgrade (WS and HTTP ports only), and the client connects to `<fqdn>:<external>` with its own socket library.

## 3. Lifecycle module (self-stop)

`assets/server/edgegap.mjs`: no dependencies, Node 18+ (global `fetch`). It is the framework-agnostic lifecycle from `edgegap-colyseus` in plain JavaScript. On Edgegap (`ARBITRIUM_REQUEST_ID` set) it stops the deployment when:
- nobody joined within `FIRST_JOIN_TIMEOUT_S` (120 s): matched players who never connected;
- the server has been empty for `EMPTY_TIMEOUT_S` (30 s);
- the game calls `selfStop("match over")`.

Self-stop is `DELETE $ARBITRIUM_DELETE_URL` with `Authorization: $ARBITRIUM_DELETE_TOKEN`; if that fails it exits (with restart policy `never` that also ends the deployment). It logs one line at boot (request ID, public IP, host, `MM_MATCH_ID`, number of tickets) and one per self-stop; it never logs the delete token or the environment. Off Edgegap nothing runs, so local development and the extension's **Run locally** behave as before.

A TypeScript server can use it as is (`allowJs`) or rename it to `.ts` and add types. A server that already uses `@edgegap/sdk` on Node 22+ can read the same variables with `DeploymentEnvironment.fromEnv(process.env)` and `MatchEnvironment.fromEnv(process.env)` instead, as `edgegap-threejs` does.

## 4. Wiring an existing ws server

`assets/server/server.mjs` is a skeleton showing every hook in place (protocol `hello` → `welcome`, `input`, `state`, `over`, `error`). For an existing server:

1. Import `edgegap.mjs`; call `startLifecycle()` once the server is listening.
2. `playerJoined()` when a player is admitted (after its first message, not on TCP connect: a health check or a stranger isn't a player).
3. `playerLeft()` when a seat is really gone. With reconnection, call it after the grace period, not on the drop.
4. At match end: lock the match (refuse new joins), send the result, wait a few seconds so clients can show it, close the sockets, `selfStop("match over")`. Locally, reset instead so the next test can start.
5. `process.on("SIGTERM", ...)`: close sockets with code 1001 and exit within a couple of seconds.
6. Bound what clients can send (`maxPayload`, rate of inputs) and validate every input on the server: Cocos web builds are JavaScript anyone can modify.

## 5. Only matched players in

Matchmaker deployments get `MM_TICKET_IDS`, a JSON array of the matched ticket IDs (`edgegap-matchmaking` lists all `MM_*` variables). The client template sends its `ticketId` in `hello`; with `REQUIRE_TICKET=1` the skeleton refuses a `hello` whose ticket isn't in the list, so someone who learns the address can't take a seat. Direct deployments have no `MM_TICKET_IDS`, and the check is skipped.

## 6. Image

`assets/server/Dockerfile`: `node:22-slim`, `npm ci --omit=dev`, copies only the server, `USER node`, `EXPOSE 7777`, `CMD ["node", "server.mjs"]`. Adjust the `COPY` lines and `CMD` to the real entry point. TypeScript: run with `tsx` kept in `dependencies` (`node --import tsx src/index.ts`), or compile in a build stage. Add `.dockerignore` (`node_modules`, `.env`).

The extension's **Create Dockerfile** writes a generic starter (`npm ci`, `CMD ["npm", "start"]`) only when the folder has none; its own comment recommends the exec form with node as PID 1. Prefer this template.

Tag every image with a UTC timestamp `YYYYMMDD-HHMM` (also the app version name), never `latest`. The extension defaults to that too.

## 7. Other server languages

Any language works if it builds a Linux x86-64 container that listens on one port and can send one HTTP DELETE. Go, C#, Rust or Java WebSocket servers follow the same table in §2; port the ~60 lines of `edgegap.mjs` (two timers, a counter, one request). The extension builds any `Dockerfile` in the server folder; its starter Dockerfile is Node-only. `edgegap-containerize` covers images for other stacks.

## 8. Local checks

```bash
cd Server && npm i ws && PORT=7777 node server.mjs          # "[edgegap] local run ... no self-stop"
docker build --platform linux/amd64 -t <game>-server:test Server
docker run --rm -p 7777:7777 <game>-server:test
curl -i http://localhost:7777/                              # 426 Upgrade Required: the ws server answers
docker run --rm -p 7777:7777 -e ARBITRIUM_REQUEST_ID=local -e EMPTY_TIMEOUT_S=10 <game>-server:test
# connect a client, leave: "[edgegap] self-stop: empty for 10s", then
# "ARBITRIUM_DELETE_URL/TOKEN missing, exiting instead" and the container exits
```

The extension's headless check (`scripts/e2e.mjs`) treats any HTTP answer on the port as "local container answered", so the `426` is enough. `edgegap-local-testing` has a parity script for the container checks.

What was run for this skill (2026-11-04, Node 22, Docker Desktop on Windows): `server.mjs` + `edgegap.mjs` with Edgegap env vars faked and a mock delete endpoint, two `GameSocket` clients (Node's built-in WebSocket) with tickets, a third with an unknown ticket: retry until the server was up, both welcomed, the stranger refused, state and `over` received, self-stop `DELETE` sent with the token header. The image built for `linux/amd64`, answered `426` to HTTP and exited 0 on `docker stop` (SIGTERM). Not run on Edgegap.
