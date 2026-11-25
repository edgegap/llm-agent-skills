# Path A: Manus Game Dev without a Cloud Computer

Verified on 2026-11-20 with Manus 2.0 Lite (free plan) and Edgegap: the game below went from a Manus prompt to two browser tabs playing one match on an Edgegap server that stopped itself afterwards.

Contents
1. Why this path exists
2. Ask Manus for a self-hostable server
3. Get the code out of Manus
4. Check the server before Edgegap
5. Add the Edgegap self-stop
6. Image and app version
7. Test deployment with the Manus client
8. Optional: Find Match through the Edgegap matchmaker
9. What Manus suggests next, and the answer

## 1. Why this path exists

When a Manus Game Dev prompt asks for online multiplayer, Manus stops before writing any code (26 s in, in our run):

> Online multiplayer requires a ready cloud computer to host the authoritative game server. None is currently available. Please create or start one in Manus Settings, then choose "Continue" here so I can initialize and build the game.

The Manus sandbox can't host the server, so multiplayer needs a Manus Cloud Computer, a monthly subscription for one machine in one place. On the free plan that means no multiplayer game at all. Manus will instead build a server you host yourself, and Edgegap can host that server: one server per match, started near the players, stopped when the match ends, free tier to start.

Present this as a choice, not a criticism of Manus: the Cloud Computer is one always-on machine; Edgegap is a server per match near the players.

## 2. Ask Manus for a self-hostable server

Answer the Cloud Computer question in the chat (not the "Continue" button). The prompt that worked, verbatim:

```
can you build the game server binary so i can host it locally on my machine instead
```

Manus (about 4 minutes) built `orb-arena-server/`: `src/server.js` (Node.js + `ws`, authoritative rooms, 2-4 seats, 3-minute matches, reconnect), `package.json`, `README.md`, `PROTOCOL.md`, WebSocket on `/ws`, JSON health check on `/health`, port from `PORT` (default 8787), host `0.0.0.0`, plus standalone `pkg` binaries for Linux, macOS and Windows (Node 18 target, because `pkg` has no Node 22). It tested two WebSocket clients itself. It did **not** build the browser client in that turn; ask for it next:

```
can you also build the browser client so i can test it against my server? Let me set the server address in the page (a ?server= URL parameter like ws://localhost:8787/ws or wss://myhost:port/ws), so the same client works with my local server or a server I host somewhere else.
```

That gave `client/index.html`, `client.js`, `styles.css`: a lobby with a room code and a name, and `?server=` / `?room=` URL parameters.

For a developer starting fresh, one prompt that asks for everything Edgegap needs up front (the two prompts above are the ones used for the sample):

```
Don't use a Cloud Computer. Build the multiplayer server as a self-hostable Node.js WebSocket server I will host on Edgegap (one server per match): read the port from PORT, listen on 0.0.0.0, keep all game rules on the server, send state snapshots at a steady rate (test that they keep arriving for 5 seconds, not just that players can join), and add a Dockerfile (node:22-slim). Build the browser client too and let me set the server address with a ?server= URL parameter (ws:// or wss://).
```

## 3. Get the code out of Manus

- Each file Manus links in the chat opens in a preview with a **Code** tab; the whole folder is in the `.tar.gz` it links ("local server package", about 49 MB because of the binaries), or under "View all files in this task".
- A Manus web-app project can sync to GitHub (Manus → GitHub integration); a Game Dev task's sandbox files are only in the chat. `package.json` was not linked in our chat: take it from the archive, or recreate it (`ws` is the only dependency).
- Put it in a git repo and tag the untouched export (`git tag manus-original`) so every change after it is visible.

## 4. Check the server before Edgegap

Read `src/server.js` against this list (all held in our run except the snapshot rate):
- Port from `PORT`, host `0.0.0.0`, one WebSocket port. Note the path (`/ws`): the client URL needs it.
- Game rules on the server; the browser sends inputs only.
- **Snapshots keep coming.** Manus's server sent snapshots only when `room.revision % 2 === 0`, but sending bumps `revision`, so after the first one nothing followed: 3 snapshots in 3 s, players looked frozen. Its own test only checked join and match start. Run `assets/self-host/ws-check.cjs` locally first: `node ws-check.cjs ws://127.0.0.1:8787/ws '{"type":"join","room":"TEST1","name":"BOT"}'` should show the snapshot type at about rate × seconds per client. The fix there was one line: send every `TICK_RATE / SNAPSHOT_RATE`-th tick from a tick counter.
- On close, don't clear state that a newer socket of the same player owns (Manus's reconnect replaced the socket, then the old socket's close handler nulled the new one): `if (ws.player.ws === ws) ws.player.ws = null`.

## 5. Add the Edgegap self-stop

Copy `assets/self-host/edgegap.js` into the server's `src/`. It does nothing off Edgegap (no `ARBITRIUM_REQUEST_ID`), so the self-hosted server and its binaries keep working. On Edgegap it calls `DELETE $ARBITRIUM_DELETE_URL` with `$ARBITRIUM_DELETE_TOKEN` when: nobody joined within 120 s, everyone left 30 s ago, or the match ended 60 s ago (rematch window); each is an env var (`EDGEGAP_NO_JOIN_SEC`, `EDGEGAP_EMPTY_SEC`, `EDGEGAP_RESULTS_SEC`). No dependency (Node 18+ `fetch`).

Five one-line hooks in the server (names from the Manus server; find the equivalents):

```js
const edgegap = require('./edgegap');                     // top
function playersOnline() { let n = 0; for (const ws of connections) if (ws.player) n++; return n; }
edgegap.connectedChanged(playersOnline());                // after a player joins or rejoins, and in ws.on('close')
edgegap.matchStarted();                                   // where a match (re)starts
edgegap.matchEnded();                                     // where the results are sent
edgegap.started();                                        // in the listen callback
```

Or ask Manus to do it: "Add the attached edgegap.js to src/ and call its started, connectedChanged, matchStarted and matchEnded hooks as its comments say."

Local parity check (no Edgegap needed): run the server with `ARBITRIUM_REQUEST_ID=local1 ARBITRIUM_DELETE_URL=http://127.0.0.1:9999/stop ARBITRIUM_DELETE_TOKEN=x EDGEGAP_EMPTY_SEC=3` and any HTTP listener on 9999; connect two clients, close them, and expect `[edgegap] self-stop: all players left 3 s ago` and a `DELETE /stop`.

## 6. Image and app version

`assets/self-host/Dockerfile` (node:22-slim, port 8787, `node src/server.js`) next to the server's `package.json`. Use it rather than the `pkg` binary. Build `linux/amd64`, tag with the UTC build time, push to the Edgegap registry (`references/deploy.md` §2; a 401 means Docker is logged in to another registry project). Our image: 80 MB.

App version (MCP `edgegap_create_app_version`, or the dashboard):

| Field | Value |
|---|---|
| Port | the server's port (8787), name `gameport`, protocol **WS**, **TLS Upgrade on** |
| CPU / memory | 256 units / 512 MB was plenty for 2-4 players at 30 Hz |
| Restart policy | `never` (the server stops itself; a crash shouldn't restart a half-played match) |
| Max duration | the longest match plus margin; 15 min for tests |

## 7. Test deployment with the Manus client

1. Deploy one server near you (`edgegap_deploy`, tag `agent-test`), then `edgegap_wait_for_deployment`: ours was READY in about 3 s.
2. `node ws-check.cjs wss://<fqdn>:<external port>/ws '<join JSON>'`: we got 75 snapshots per client in 5 s (15/s).
3. Serve the Manus client folder (`python -m http.server 8091` in `client/`) and open two tabs on `http://127.0.0.1:8091/?server=wss://<fqdn>:<external port>/ws&room=EDGE1`, Enter in both: both connected, both LIVE, timer running, movement and dash visible.
4. Close both tabs: the deployment was TERMINATED about 36 s later (30 s empty rule). Clients that vanish without a close frame are only noticed by the server's ping (30 s in Manus's server), so that case takes longer.
5. `edgegap_list_deployments` with `only_agent_deployments: true` is empty.

Always `wss://` with the fqdn and the **external** port, plus the server's path. A Manus page is served over https, so plain `ws://` is blocked there.

## 8. Optional: Find Match through the Edgegap matchmaker

Verified on Edgegap 2026-11-20 with the public sample [netcode-sample-manus-orb-arena](https://github.com/edgegap/netcode-sample-manus-orb-arena) (copy its files): two browser tabs clicked FIND MATCH, were matched onto one deployment (`HOST_ASSIGNED` in under 20 s with the image not cached) and played; a client without a ticket was refused; the deployment stopped itself within 40 s of both leaving. Keep it optional: with no matchmaker configured, the page and server behave exactly as Manus built them.

**Server** (`assets/self-host/edgegap.js` already has it): `MM_TICKET_IDS` (a JSON array) exists only on matchmaker deployments.
- `edgegap.ticketAllowed(message.ticket)` in the join handler, after the reconnect check: anyone else gets `NOT_MATCHED`. Off the matchmaker it always allows, so direct deploys and self-hosting keep working.
- Start rule: when every matched player is in (`edgegap.expectedPlayers`), or 15 s after the second one; a solo match when the matchmaker sent one ticket (the config's 20 s expansion). Off the matchmaker, Manus's rule (2 players) stays.
- A new server image means a new app version, then matchmaker Stop, edit `application.version`, Start.

**Client** (the sample's `client/config.js` and `client/client.js`):
- `config.js` with `matchmakerUrl` and `matchmakerToken` (empty by default), overridable by a git-ignored `config.local.js` or `?mm=&token=`. The token is the matchmaker's client token (made to ship in clients), never the Edgegap API token.
- An import map for `@edgegap/sdk@1.1.0` (jsDelivr, with its integrity hash, as in `edgegap-threejs`), loaded with a dynamic `import()` only when a matchmaker is configured.
- FIND MATCH: `matchmaking.GroupAgent` group of one, `profile: 'arena'`, `is_ready: true`; `await nextAssignment()`; keep `group.current.ticket_id`; `dispose()`; connect to `getConnectionUrl(assignment, 'gameport') + '/ws'` (add the server's path) with about 10 one-second retries, since a fresh server can refuse connections or answer 502 for a few seconds; send the ticket in the join message. Cancel calls `stopMatchmaking()`, as does `pagehide`.
- Close the game socket on `pagehide`. Without it the server only noticed closed tabs at its 30 s ping, and the empty server ran longer (seen on Edgegap: about 2.5 min to stop instead of about 40 s).

**Matchmaker** (`matchmaker/arena.json` in the sample): one profile, `player_count` 1 team of 2-4, expansion at 20 s to `min_team_size: 1`, `ticket_expiration_period` 30 s, `inspect` true for testing, `allowed_cors_origins` listing every page origin (`http://localhost:8091`, `http://127.0.0.1:8091`, the hosting origin). Dashboard: Matchmakers, Create Matchmaker, name, upload, **Create And Start**. A "Docker image ... is not cached" warning only means slower starts: Continue. The free tier allows a limited number of matchmakers per organization ("You've reached the free matchmaker limit": delete or reuse one) and stops each 3 hours after a start; `GET <API URL>/monitor` with the Auth Token answers 200 when it's up.

Other ways in: Steam sign-in and a backend that owns the tickets (path B in SKILL.md), or friends joining by link (a small backend creates the deployment and puts its address in the link).

## 9. What Manus suggests next, and the answer

After the server, Manus offered follow-ups such as "How do I configure port forwarding or use a tunneling tool like ngrok to let my friends connect remotely?" and "Create a Dockerfile and docker-compose.yml so I can easily containerize and deploy this server". Both are this path: the Dockerfile above, hosted on Edgegap, needs no port forwarding, tunnel or machine left on at home.

