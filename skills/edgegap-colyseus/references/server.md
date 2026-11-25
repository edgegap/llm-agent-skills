# The Colyseus server on Edgegap

One Edgegap deployment runs one Colyseus process for one match. Players reach it at `wss://<request_id>.pr.edgegap.net:<external port>`, and both halves of a Colyseus join go through that one address: the matchmake HTTP request (`POST /matchmake/joinOrCreate/<room>`) and the room WebSocket. Measured on Edgegap with Colyseus 0.17 and a WS port with TLS Upgrade.

## 1. What changes, and what doesn't

Gameplay code doesn't change. Colyseus rooms are already authoritative: state lives in the room's schema, clients send messages. Add:

| File | Change |
|---|---|
| `src/edgegap.ts` | Copy from `assets/server/src/edgegap.ts`. Runs only when `ARBITRIUM_REQUEST_ID` is set, so local dev is untouched |
| the entry point (`src/index.ts`, `app.config.ts`) | `startLifecycle()` after listening; playground and monitor off on Edgegap |
| every room that players join | `playerJoined()` in `onJoin`, `playerLeft()` when a seat is really gone, `selfStop()` at match end |
| `Dockerfile`, `.dockerignore` | From `assets/server/` |
| `scripts/edgegap-deploy.mjs` | From `assets/server/scripts/`; add `"edgegap:deploy": "node scripts/edgegap-deploy.mjs"` to `package.json` |

## 2. Entry point

Colyseus 0.17 (`defineServer`), as verified:

```ts
import { defineRoom, defineServer, playground, monitor } from "colyseus";
import { BattleRoom } from "./rooms/BattleRoom";
import { onEdgegap, startLifecycle } from "./edgegap";

const port = parseInt(process.env.PORT || "2567");

const server = defineServer({
  rooms: { battle: defineRoom(BattleRoom) },
  express: (app) => {
    // A match server only needs the matchmake route and the WebSocket.
    if (onEdgegap) return;
    app.use("/", playground());
    app.use("/monitor", monitor());
  },
});

server.listen(port).then(() => startLifecycle());
```

Colyseus 0.15/0.16 with `@colyseus/tools` (`app.config.ts` + `listen(appConfig)`): put the same `if (onEdgegap) return;` at the top of `initializeExpress`, and call `startLifecycle()` in `beforeListen` or after `listen()` resolves. With a hand-built `new Server(...)`: call it after `gameServer.listen(port)`. These older shapes follow the same rules but weren't run on Edgegap.

Why playground and monitor go: the playground lets anyone with the URL create rooms and send messages, and the monitor lists and disposes rooms. On a public deployment they are an open admin panel. Keep them for local dev.

Port: listen on a fixed port (`PORT`, default 2567) on all interfaces. `server.listen(port)` already does; don't pass `localhost`. The container port must equal the app version's internal port.

One process per container: no PM2, no `cluster`, no Redis presence or driver. The upstream `ecosystem.config.cjs` is for running several processes on one VM; on Edgegap each match is its own deployment, so a single process with the default local presence is right.

## 3. Rooms: counting players and ending the match

```ts
import { playerJoined, playerLeft, selfStop } from "../edgegap";

onJoin(client: Client, options: any) {
  playerJoined();
  // ...existing code
}

onLeave(client: Client) {                         // 0.17: (client, code?: number); 0.15/0.16: (client, consented: boolean)
  playerLeft();
  // ...existing code
}
```

Keep the room's existing `onLeave` signature: on 0.17 a `consented: boolean` second parameter doesn't typecheck (it's the close `code`, `CloseCode.CONSENTED` = 4000).

With several room types, call them in each one: the counter is per process, which is per deployment.

**Reconnection.** If a room keeps seats with `allowReconnection`, a player who drops and comes back gets no second `onJoin`. Call `playerLeft()` only when the seat is really gone, never when the connection merely drops; otherwise the empty timer (30 s) can stop the deployment of a match whose player is inside a longer reconnection window, and the reconnect fails with "room not found".

```ts
// 0.17: onDrop fires on an unconsented drop, onLeave only when the seat is gone
onDrop(client: Client) {
  this.allowReconnection(client, 20);            // no playerLeft() here
}
onReconnect(client: Client) {}                   // no playerJoined() here either: the seat never left
onLeave(client: Client) {
  playerLeft();
  // ...remove the player from the state
}

// 0.15/0.16: one onLeave
async onLeave(client: Client, consented: boolean) {
  if (!consented) {
    try { await this.allowReconnection(client, 20); return; } catch {}
  }
  playerLeft();
  // ...remove the player from the state
}
```

Clients that resume after a page reload with `client.reconnect(token)` must reconnect to the same deployment: store the endpoint with the token (`clients.md`, "Reconnection after a drop or reload"). This pattern typechecks on 0.16 and 0.17; check it in a local test (drop a client, rejoin within the window, the log shows no self-stop).

**Match end.** An arena that never ends stops when it empties. A game with a real end calls `selfStop()` after showing the result. From the verified tanks room (`MATCH_ROUNDS` won rounds, then end):

```ts
if (MATCH_ROUNDS > 0 && ++this.roundsPlayed >= MATCH_ROUNDS) {
  this.lock();                                   // no new joins into a finished match
  this.clock.setTimeout(async () => {
    await this.disconnect();                     // clients get onLeave and show "match over"
    selfStop(`match over after ${this.roundsPlayed} round(s)`);
  }, 5000);                                      // let clients read the winner first
  return;
}
```

Make the end condition an env var with "endless" as the default if the game is also played locally without matches.

## 4. The lifecycle module

`assets/server/src/edgegap.ts` stops the deployment when:
- nobody joined within `FIRST_JOIN_TIMEOUT_S` (default 120): the matchmaker started a server, then players gave up;
- everyone left and nobody came back within `EMPTY_TIMEOUT_S` (default 30);
- the game calls `selfStop(reason)`.

Self-stop is `DELETE $ARBITRIUM_DELETE_URL` with header `authorization: $ARBITRIUM_DELETE_TOKEN`, both injected by Edgegap. Edgegap then sends SIGTERM; Colyseus's graceful shutdown disconnects rooms and exits. If the call fails, the process exits, which also ends the deployment under the default restart policy. The app version's max duration is the backstop for anything else.

It logs one line at boot with the request ID, public IP, host, `MM_MATCH_ID` and `MM_TICKET_IDS` (`match=direct` without a matchmaker), and one line per self-stop. It never logs the delete token or the environment.

## 5. Local checks

```bash
npm run dev                                                        # unchanged: playground and monitor still there
docker build --platform linux/amd64 -t my-game:local .
docker run --rm -p 2567:2567 -e ARBITRIUM_REQUEST_ID=local -e EMPTY_TIMEOUT_S=10 my-game:local
```

With `ARBITRIUM_REQUEST_ID` set, the container acts as on Edgegap: `/` returns 404 instead of the playground, a client on `ws://localhost:2567` joins, and 10 s after it leaves the log shows `[edgegap] self-stop: empty for 10s` then `ARBITRIUM_DELETE_URL/TOKEN missing, exiting instead`, and the container exits.

## 6. Only matched players (optional)

Matchmaker deployments get `MM_TICKET_IDS`, a JSON array of the matched tickets. To keep strangers who learn the address out, have the client send its ticket ID in the join options and check it:

```ts
const allowed = new Set<string>(JSON.parse(process.env.MM_TICKET_IDS ?? "[]"));

onAuth(client: Client, options: { ticketId?: string }) {
  if (allowed.size === 0) return true;           // direct deployment or local dev
  return !!options.ticketId && allowed.has(options.ticketId);
}
```

On 0.17 `onAuth` may be a static method with a different signature; follow the project's version. The client templates return only the URL, so return the ticket ID too when adding this.
