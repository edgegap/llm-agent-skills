# The game server contract

What a dedicated server must do when Nakama starts it through the Fleet Manager. Engine-agnostic: it is plain HTTP and JSON. `assets/game-server/godot/nakama_edgegap_server.gd` implements it for Godot 4 (verified on Edgegap in Fish Game); `assets/game-server/node/nakamaEdgegap.ts` is the same logic for Node.js (checked against a mock Nakama). Both were run against the same mock and sent identical requests. Port either to C#, C++ or Rust by following this page.

**Unity server builds**: use [backend-nakama-unity-template-model](https://github.com/edgegap/backend-nakama-unity-template-model), which does all of this (READY with `game_server`, batched connection events, STOP). Load `edgegap-unity` (or the netcode's skill) for the server build itself. **Unreal**: no plugin; port the contract to C++ with `FHttpModule` and use `edgegap-unreal` for the build.

## 1. Environment

| Variable | From | Use |
|---|---|---|
| `ARBITRIUM_REQUEST_ID` | Edgegap | the deployment ID, which is also the Nakama **instance ID** in every event |
| `ARBITRIUM_PUBLIC_IP` | Edgegap | the server's public IP (for READY) |
| `ARBITRIUM_PORTS_MAPPING` | Edgegap | JSON: `{"ports": {"gameport": {"internal": 7777, "external": 31500, "protocol": "UDP", ...}}}` (for READY) |
| `NAKAMA_INSTANCE_EVENT_URL` | Fleet Manager | `https://<nakama>/v2/rpc/edgegap_instance?http_key=<key>&unwrap` |
| `NAKAMA_CONNECTION_EVENT_URL` | Fleet Manager | `https://<nakama>/v2/rpc/edgegap_connection?http_key=<key>&unwrap` |
| `NAKAMA_INSTANCE_METADATA` | Fleet Manager | JSON: the `metadata` the module passed to `Create`, e.g. `{"user_ids": ["..."]}` |

The two URLs are hidden env vars on the deployment (they carry the http_key). Don't log them. Nothing needs to be set on the app version.

**Reuse the http_key that is already in the URLs.** Split `NAKAMA_INSTANCE_EVENT_URL` at `/v2/rpc/`: the part before is Nakama's base URL, and the query string (`?http_key=...&unwrap`) is what any S2S RPC call needs. That is how the server calls `report_match_result` (§6) without a second secret in the image or the app version.

Local runs have none of these: the templates then let anyone in, skip all events and quit at match end, so the netcode can be tested without Nakama or Edgegap. `NAKAMA_URL` points a local server at a local Nakama for token checks.

## 2. READY, with the server's own address

Once the game port is listening, POST to `NAKAMA_INSTANCE_EVENT_URL`:

```json
{
  "instance_id": "<ARBITRIUM_REQUEST_ID>",
  "action": "READY",
  "message": "Game server is listening",
  "metadata": {
    "game_server": {
      "ARBITRIUM_REQUEST_ID": "<id>",
      "ARBITRIUM_PUBLIC_IP": "<ip>",
      "ARBITRIUM_PORTS_MAPPING": { "ports": { "gameport": { "external": 31500, "internal": 7777 } } }
    }
  }
}
```

READY is what makes Nakama run the module's callback and notify the players (111). Without READY, players wait until their client gives up: Edgegap's own "deployment ready" webhook only stores the address, it doesn't notify anyone.

The `game_server` metadata is merged into the instance before the callback runs. Send it: in the verified run the READY event could arrive before Edgegap's ready webhook had set `ConnectionInfo`, and the module's `connectionInfo()` then reads the address from `game_server` (`nakama-module.md` §3). The Unity plugin sends the same keys.

Response 200 `ok`. A non-200 usually means a wrong instance ID (local test) or Nakama unreachable from Edgegap (`infra.md` §3).

## 3. ERROR

If the server can't start (port in use, missing map), POST the same body with `"action": "ERROR"` and a `message`, then exit with a non-zero code. Nakama marks the instance in error but does **not** notify the players, so clients need their own timeout.

## 4. Accept only matched players

Clients connect with the game's protocol and send their **Nakama session token** first (Fish Game: an ENet RPC `_hello(token, client_version)`). The server checks it with Nakama itself:

```
GET <nakama base URL>/v2/account
Authorization: Bearer <session token>
```

200 → `{"user": {"id": "...", "username": "..."}, ...}`. Any other status: reject. Then reject the user if `NAKAMA_INSTANCE_METADATA.user_ids` doesn't contain `user.id`, and reject a second connection with the same user ID. This needs no shared secret and works for any auth method. The token is the player's own session, so the check also proves the player owns that account.

Keep the version check (Fish Game rejects a client whose `client_version` differs) and a "match already started" rule if the game has one.

## 5. Connection events, batched

POST the **full list** of connected Nakama user IDs to `NAKAMA_CONNECTION_EVENT_URL`:

```json
{ "instance_id": "<id>", "connections": ["<user_id>", "<user_id>"] }
```

Each call replaces the previous list and turns matching seat reservations into connections. Don't post on every join/leave: collect changes and send at most every ~5 s, only when the list changed (the templates do this), plus once just before STOP.

## 6. Results, then STOP

At match end, report results through the module's S2S RPC with the reused key:

```
POST <nakama base URL>/v2/rpc/report_match_result?http_key=<key>&unwrap
{"instance_id": "<id>", "winner_user_id": "<user_id>", "user_ids": ["..."]}
```

`unwrap` means the body is the RPC payload as is (no `"\"...\""` string wrapping). Then send STOP:

```json
{ "instance_id": "<id>", "action": "STOP", "message": "Match finished", "metadata": {} }
```

STOP makes Nakama call Edgegap's stop endpoint; the deployment then gets SIGTERM and the instance is removed when Edgegap confirms termination. Keep running a few seconds so the final messages reach the players, and quit by yourself after a grace period (30 s in the templates) in case STOP didn't arrive.

## 7. When to stop

The verified rules from Fish Game (all in the templates, timings configurable):
- match won → report the result → STOP;
- everyone left → STOP;
- fewer players than the game needs left mid-match → STOP (game-specific, Fish Game does it at < 2);
- nobody joined within 60 s of READY → STOP;
- hard cap (20 min), below the app version's max duration.

A deployment nobody stops runs until its max duration and is billed. More on server lifecycle: `edgegap-server-design`.

## 8. What the server should decide

The point of a dedicated server is that it owns the game state. In Fish Game the server decides hits, deaths, pickups, spawns, rounds and the winner; each client still owns its fish's movement and sends its position, as upstream did, so a modified client can move faster. Tell the developer which decisions stay on clients. Moving movement to the server (with client prediction) is the next step for a competitive game.

## 9. Transport

Use whatever the game's netcode uses and declare that protocol on the app version port: ENet is UDP (Fish Game, port 7777). Browsers can't use UDP: a web build needs a WebSocket server and a WS port with TLS Upgrade, and clients then connect with `wss://<DnsName>:<Port>` (not run with Nakama; the Colyseus and Manus skills cover WS on Edgegap).
