# The authoritative game server

Contents
1. What moves to the server
2. Protocol
3. Lifecycle on Edgegap
4. Local testing
5. Match results and the backend
6. Porting notes by browser engine

## 1. What moves to the server

A Manus game usually runs everything in the browser: one loop that reads input, updates state and draws. Split it:

| Server (`game-server/src/game.mjs`) | Browser |
|---|---|
| positions, physics, collisions | input capture, sent as intents (`{x, y}`, `"jump"`, `"fire"`) |
| scores, health, timers, win/lose | rendering and interpolation of snapshots |
| spawns, pickups, randomness | prediction of the local player (optional) |
| who is in the match | menus, sound, effects |

Rules of thumb:
- Inputs are intents, never results. "I pressed right", not "I'm at x=500". Clamp every number, as the example does.
- Randomness that matters (loot, spawns) comes from the server.
- If the game logic is already a pure function of state and input, import it in both: copy it into `game-server/src/shared/` (the Docker build context is `game-server/`) and import it from the browser too, or move it to a shared package.
- Keep `game.mjs` free of networking, so it can be tested with plain function calls.

Single-player can keep a local copy of the same simulation, so the game still works offline in the menu or practice mode.

## 2. Protocol

JSON text frames, defined at the top of `server.mjs`:
- Client → server: `join {token}` first (5 s limit), then `input {seq, ...}`, `ping {c}`.
- Server → client: `welcome {you, tickRate}`, `state {time, remaining, players[]}` 20 times per second, `pong`, `over {reason, results}`, `error {code}`.
- Close codes: `4001` join timeout, `4002` message before join, `4003` token rejected (reason = error code), `4004` replaced by a newer connection (reconnect from another tab).

Limits in the template: 4 KB per message, 60 messages per second per socket, one live socket per Steam ID. Snapshots carry every player; for large matches send deltas or only nearby entities.

JSON at 20 Hz is fine for small matches. For many entities, switch to binary (`ArrayBuffer`) frames later; the transport stays the same.

## 3. Lifecycle on Edgegap

`lifecycle.mjs`:
- Binds `0.0.0.0:7777` (`PORT` env). The port is fixed inside the container; Edgegap maps it to a random external port.
- **Self-stop** with `DELETE $ARBITRIUM_DELETE_URL` and header `Authorization: $ARBITRIUM_DELETE_TOKEN`:
  - nobody joined within 120 s (matched players gave up);
  - everyone left and nobody came back within 30 s (reconnect grace);
  - 10 s after the game reports it's over.
- **SIGTERM** (Edgegap stop, max duration reached, `docker stop`): tells clients `over`, closes sockets, exits.
- Only sockets that sent a valid token count as players, so Edgegap's port checks and probes on the WS port never keep an empty server alive.

Env vars the server reads: `PORT`, `JOIN_TOKEN_PUBLIC_KEY` (app version), and Edgegap's injected `ARBITRIUM_REQUEST_ID`, `ARBITRIUM_DELETE_URL`, `ARBITRIUM_DELETE_TOKEN`, `MM_TICKET_IDS`, `MM_MATCH_PROFILE`. `MM_TICKET_IDS`' length is the expected player count; start the match early when everyone is in if the game has a countdown.

Logs go to stdout; Edgegap shows them per deployment (`edgegap_get_deployment_logs`) until it stops.

## 4. Local testing

```bash
cd game-server && npm install
node ../path/to/assets/scripts/gen-join-keys.mjs          # test keys, not the production pair
JOIN_TOKEN_PUBLIC_KEY=<public> npm start                  # ws://localhost:7777, expects rid "local"
JOIN_TOKEN_PRIVATE_KEY=<private> node dev-token.mjs 76561197960287930    # a token for player 1
```

In the browser console of the game page (or a small test page):
```js
const ws = new WebSocket("ws://localhost:7777");
ws.onopen = () => ws.send(JSON.stringify({ t: "join", token: "<token>" }));
ws.onmessage = (e) => console.log(e.data);
```
Two tabs with two tokens (two Steam IDs) should see each other in `state`. Also check: an expired token, a token used twice, and a token minted for another request ID are all rejected with `4003`.

Docker parity: `docker build --platform linux/amd64 -t game-server:dev game-server` then `docker run --rm -p 7777:7777 -e JOIN_TOKEN_PUBLIC_KEY=<public> game-server:dev`.

## 5. Match results and the backend

If the game keeps ratings, stats or rewards, the server reports results; the browser never does.
- Put a backend URL and a dedicated results token on the app version as env vars (mark the token hidden). It is a separate token that only allows `POST /api/matches/results`, so it can be rotated without touching anything else. Never the Edgegap API token or the join-token private key.
- The server posts `{ request_id: ARBITRIUM_REQUEST_ID, results }` when the game is over, before self-stop, with a few retries.
- The backend accepts results once per `request_id`, and only for Steam IDs whose queue row had that `request_id` in its assignment. Keep assignments (or a match history table) long enough for that check.

## 6. Porting notes by browser engine

- **Phaser**: keep scenes and sprites in the browser; move arcade physics decisions to the server or run a headless simulation of your own on the server (Phaser itself needs a DOM). Draw sprites from snapshots, tween between them.
- **Three.js / Babylon.js**: the server needs only the game state (positions, rotations as numbers). Physics with a Node-compatible engine (Rapier `@dimforge/rapier3d-compat`, cannon-es) runs on the server as is.
- **PixiJS / plain canvas**: the loop's update step becomes `game.tick`, its draw step stays in the browser.
- **Frame-rate-dependent code** (`x += 5` per frame): convert to per-second speeds times `dt` before moving it; the server ticks at 20 Hz, not 60.
