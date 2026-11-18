# Architecture: layout, protocol, tick

Contents
1. Repository layout
2. What each side owns
3. Wire protocol
4. Tick, input queue, snapshots
5. Server lifecycle on Edgegap

## 1. Repository layout

npm workspaces, so the server and the client import one `shared` package:

```
package.json            workspaces: shared, server, client; scripts dev / test / typecheck
tsconfig.base.json
shared/src/index.ts     tick rate, arena, tuning, message types, clamp/round helpers
shared/src/physics.ts   createWorld, buildArena, createPlayerBody, isGrounded, applyInput (Rapier passed in)
server/src/index.ts     Rapier world, 30 Hz loop, ws server, /health, keep-alive, empty timer, SIGTERM
server/src/edgegap.ts   ARBITRIUM_* env, self-stop
server/Dockerfile       multi-stage, built from the repo root
client/src/main.ts      three.js scene, input, interpolation, HUD
client/src/prediction.ts  client-side Rapier world for the local player
client/src/net.ts       address → URL, connect + retry, error explanations
client/vite.config.ts   base "./", alias @sample/shared → shared/src for hot reload
.dockerignore           allowlist at the repo root (the build context)
```

`shared/physics.ts` takes the Rapier module as a parameter (`type Rapier = typeof import("@dimforge/rapier3d-compat")`) instead of importing it, so it has no side effects and each side passes the instance it initialised. The server compiles `shared` with TypeScript project references (`tsc -b server`); the client's Vite alias points at the TypeScript sources.

## 2. What each side owns

| | Server | Client |
| --- | --- | --- |
| Physics world | everything: arena, all players, all dynamic props | arena + own body only, for prediction |
| Inputs | applies one per player per tick, clamped | samples at the tick rate, sends, predicts |
| Positions | the only truth | own body: predicted then corrected; others: interpolated snapshots |
| Spawns, respawns, scoring | yes | never |

Anything the client can't simulate (other players, crates) is drawn from snapshots. Collisions with them show up as a correction of the predicted body, which the predictor eases in.

## 3. Wire protocol

JSON over one WebSocket, `t` = type. Types live in `shared/src/index.ts` so both sides compile against them.

| Direction | Message |
| --- | --- |
| C → S | `{t:"hello", name}` first; `{t:"input", seq, x, z, jump}` once per client tick; `{t:"ping"}` every 5 s from a timer |
| S → C | `{t:"welcome", id, tick, tickHz, players}`; `{t:"join", player}`; `{t:"leave", id}`; `{t:"snapshot", tick, ack, players:[[id, x,y,z, qx,qy,qz,qw]], crates:[pose], self:{pose, linvel, angvel}}`; `{t:"error", message}` |

Numbers are rounded to 3 decimals. At 30 Hz with 2 players and 10 crates a snapshot is about 700 bytes. Past ~16 bodies, switch to binary (`ArrayBuffer`, `Float32Array`) or send only bodies that moved.

## 4. Tick, input queue, snapshots

- `setInterval` at half the tick period plus an accumulator: run as many fixed steps as real time requires, capped at 5, so the simulation keeps real time without drifting.
- Each player has an input queue. Per tick: shift one input, `applyInput`, record its `seq` as `lastAppliedSeq`. Reject `seq ≤ lastReceivedSeq` (replays). Cap the queue at about 4: a client whose clock runs slightly fast otherwise builds up latency (measured locally: a cap of 6 gave ~80 ms input round trip on localhost).
- After `world.step()`: respawn bodies under `killY`, then send each client the shared snapshot plus its own `ack` and `self` (velocities are needed to replay inputs exactly).

## 5. Server lifecycle on Edgegap

- Listen on `0.0.0.0:$PORT` (default 7777): a server bound to localhost is unreachable in a container.
- `SIGTERM` (Edgegap's stop, after the self-stop or the max duration): close every socket with code `1001`, close the servers, exit 0 within 2 s. The version's termination grace period is 5 s by default.
- Empty timer: start at boot and whenever the player count drops to 0; cancel on join. On expiry, on Edgegap only, `DELETE $ARBITRIUM_DELETE_URL` with header `authorization: $ARBITRIUM_DELETE_TOKEN`. If those are missing, exit (with `restart_policy: "never"` that ends the deployment too).
- Keep-alive: `ws.ping()` every 15 s; a connection that answered neither a ping nor sent a message since the previous round is terminated. Browsers answer pings in hidden tabs, so only dead connections are dropped.
