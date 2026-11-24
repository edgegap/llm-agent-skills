# The Nakama Go module

`assets/nakama/main.go` is the verified module from edgegap/backend-game-sample-godot-nakama-fishgame with the game-specific parts removed, updated for Nakama 3.42.0 and nakama-edgegap `902c9aa`. This file explains each piece and what to adapt.

Facts below about the plugin were read in nakama-edgegap's code at commit `902c9aa` (edgegap/backend-nakama-edgegap-plugin#13, Nakama 3.42.0). Earlier pins: `20d849e` (the tagged `0.4.0` content, Nakama 3.39) and `cd9022a` (Nakama 3.41). If the pinned commit changes, re-read `pkg/fleetmanager/` before trusting them.

## 1. Configure and register the Fleet Manager

Since `902c9aa` (Nakama 3.42) the constructor takes an `EdgegapConfig` instead of the `initializer`, and the plugin no longer reads any env var itself:

```go
cfg, err := edgegapConfigFromEnv(ctx)  // in the template's main.go
efm, err := fleetmanager.NewEdgegapFleetManager(ctx, logger, db, nk, cfg)
initializer.RegisterFleetManager(efm)
```

Code written for `cd9022a` or older (`NewEdgegapFleetManager(ctx, logger, db, nk, initializer)`) no longer compiles: `cannot use initializer (variable of interface type runtime.Initializer) as fleetmanager.EdgegapConfig value`. Copy `edgegapConfigFromEnv` from the template (same as the plugin's own `main.go`) and pass `cfg`.

`fleetmanager.NewEdgegapConfig(apiUrl, apiToken, application, portName, nakamaAccessUrl)` takes the required values and sets the defaults; the optional fields can then be set on the struct:

| Field | Runtime env read by `edgegapConfigFromEnv` | Default |
|---|---|---|
| `ApiUrl` | `EDGEGAP_API_URL` | required |
| `ApiToken` | `EDGEGAP_API_TOKEN` (with its `token ` prefix) | required |
| `Application` | `EDGEGAP_APPLICATION` | required |
| `PortName` | `EDGEGAP_PORT_NAME` | required |
| `NakamaAccessUrl` | `NAKAMA_ACCESS_URL` (`https://`) | required |
| `InitialVersion` | `INITIAL_EDGEGAP_VERSION` (falls back to `EDGEGAP_VERSION`) | empty |
| `PollingInterval` | `EDGEGAP_POLLING_INTERVAL` (re-sync with Edgegap; empty disables) | 15m |
| `CleanupInterval` | `NAKAMA_CLEANUP_INTERVAL` (reservation expiry; empty disables) | 1m |
| `ReservationMaxDuration` | `NAKAMA_RESERVATION_MAX_DURATION` (seat reservations for `instance_join`) | 30s |

The values still come from Nakama's **runtime env** (`--runtime.env` or `runtime.env` in the YAML config), not the container environment, because `edgegapConfigFromEnv` reads `RUNTIME_CTX_ENV`. Any missing required key fails module load (`<KEY> not found in environment`). Nakama's `runtime.http_key` is read by the plugin from Nakama's config. `NewEdgegapFleetManager` validates the config, including a call to Edgegap checking that the application exists, so a wrong token or application name stops Nakama at startup.

Registering also registers RPCs: the event endpoints the game server and Edgegap's webhooks call (`edgegap_instance`, `edgegap_connection`, `edgegap_deployment_ready/_error/_terminated`), S2S version RPCs (`update_edgegap_version`, `get_edgegap_version`), and client RPCs (`instance_create`, `instance_get`, `instance_list`, `instance_join`, §7). With `RegisterFleetManager` (the template) these IDs and the storage names (`_edgegap_instances`, `system/edgegap_version`) are unchanged from earlier versions, so an existing Nakama database keeps its instances and stored version.

**Several Edgegap applications (Nakama 3.42+).** Create one `EdgegapConfig` per application and register each with `initializer.RegisterFleetManagerByName("<name>", efm)`; get it back with `nk.GetFleetManagerByName("<name>")`. The name (case-insensitive, lowercased) becomes a namespace: RPCs become `edgegap_<name>_instance_create`, `edgegap_<name>_update_version`, `edgegap_<name>_instance`..., storage `edgegap_<name>_instances` and version key `edgegap_<name>_version`. Each deployment gets `NAKAMA_EDGEGAP_NAMESPACE` and event URLs for its own namespace, so game servers need no change. Keep one default `RegisterFleetManager` unless the game really deploys more than one application.

## 2. The AfterAuthenticate hook: the game's real sign-in method

The plugin places servers from each matched player's public IP, stored in the account metadata as `PlayerIp` (the README says `PlayerIP`; the code uses `PlayerIp`). Only an AfterAuthenticate hook stores it. The plugin's own `main.go` and README register only **Custom**:

```go
initializer.RegisterAfterAuthenticateCustom(fleetmanager.OnAuthenticateUpdateCustom)
```

Register the hook for each method the game actually uses (Fish Game signs in with email):

| Client calls | Register |
|---|---|
| `authenticate_email` | `RegisterAfterAuthenticateEmail(fleetmanager.OnAuthenticateUpdateEmail)` |
| `authenticate_device` | `RegisterAfterAuthenticateDevice(fleetmanager.OnAuthenticateUpdateDevice)` |
| `authenticate_custom` | `RegisterAfterAuthenticateCustom(fleetmanager.OnAuthenticateUpdateCustom)` |
| `authenticate_steam` | `RegisterAfterAuthenticateSteam(fleetmanager.OnAuthenticateUpdateSteam)` |
| `authenticate_google` / `_apple` / `_facebook` | `...Google` / `...Apple` / `...Facebook` with the matching `OnAuthenticateUpdate...` |
| `authenticate_facebook_instant_game` | `RegisterAfterAuthenticateFacebookInstantGame(fleetmanager.OnAuthenticateUpdateFacebookInstantInstance)` |
| `authenticate_game_center` | `RegisterAfterAuthenticateGameCenter(fleetmanager.OnAuthenticateUpdateInstanceCenter)` (the plugin's name for it) |

Only email was run end to end; the others have the same body (store `RUNTIME_CTX_CLIENT_IP`).

Why it matters: `Create` looks up `PlayerIp` for each user. If none has one, it falls back to the caller's IP, and a matchmaker hook has no caller, so `Create` fails ("failed to extract client IP") and every player gets 113. A player whose session predates the hook has no `PlayerIp` until they sign in again.

The stored IP is what Nakama sees: if clients reach Nakama through `localhost` or a Docker network, it is a private address and Edgegap can't place the server well (`infra.md` §3).

## 3. The MatchmakerMatched hook

Don't copy the plugin README's matchmaker sample as is; the template fixes it.

1. **`Create` takes six arguments and returns two values**: `Create(ctx, maxPlayers, userIds, latencies, metadata, callback) (map[string]string, error)`. Pass `nil` for `latencies` (Edgegap then places the server from the players' IPs) and real `metadata` (at least `user_ids`). The README passes `nil` metadata, so the server can't tell who belongs on it, and writes `err := efm.Create(...)`, which doesn't compile with two return values.
2. **Return `""`**. The hook's string result is a Nakama match ID that Nakama sends to the clients as the match to join. The README returns a JSON reply as if it were a match ID. The game runs on Edgegap, so there is no Nakama match: return `"", nil`.

A third trap: the README's callback reads `instanceInfo.ConnectionInfo.IpAddress`. The callback runs when the game server sends READY, which can be before Edgegap's ready webhook has filled `ConnectionInfo`, so it can be nil (a nil-pointer panic) or empty. The template's `connectionInfo()` uses `ConnectionInfo` when it is set, else the `game_server` metadata that the server sent with READY (`game-server.md` §2): `ARBITRIUM_PUBLIC_IP` and `ARBITRIUM_PORTS_MAPPING.ports[EDGEGAP_PORT_NAME].external`. The Unity plugin sends the same object.

`metadata` passed to `Create` is stored on the instance and given to the server as `NAKAMA_INSTANCE_METADATA` (JSON). The template puts `user_ids` there, so the server can refuse anyone else. Other useful keys: game mode, map, a test flag (Fish Game passes `test_auto_hit` from a runtime env value for automated tests), and `edgegap_version`, which overrides the deployed app version for this one match.

When `Create` returns an error, the plugin has already invoked the callback with an error status (every failure path after the callback is registered does), so the template only logs; notifying again would send players a second 113.

Matchmaker properties: keep the client's ticket query (`+properties.client_version:...` in Fish Game) so different builds don't land on one server.

## 4. Notifications 111/112/113

The callback notifies every matched player with Nakama notifications (non-persistent, sender `""`):

| Code | Subject | Content | When |
|---|---|---|---|
| 111 | `connection-info` | `{IpAddress, DnsName, Port, InstanceId}` | the server sent READY and an address is known |
| 112 | `create-timeout` | `{}` | the callback reported a timeout |
| 113 | `create-failed` | `{}` | `Create` failed, the deployment errored (Edgegap error webhook), or READY came with no address |

The same codes are used by the plugin's `instance_create` RPC and the Unity plugin, so clients built for those work unchanged. `DnsName` is `<request_id>.pr.edgegap.net`; `Port` is the external port of `EDGEGAP_PORT_NAME`. A server that sends `ERROR` instead of `READY` only marks the instance in error: no notification, so players wait. Have the server quit after `ERROR`, and give clients a timeout (Fish Game: back to the menu).

## 5. Results only the server can write

```go
nk.LeaderboardCreate(ctx, "wins", true /* authoritative */, "desc", "incr", "", nil, true)
initializer.RegisterRpc("report_match_result", rpcReportMatchResult)
```

- **Authoritative leaderboard**: clients can't write records; only server code can. `LeaderboardCreate` does nothing when the ID already exists, so a game that had a client-writable board keeps it, cheated records included. Check with `nk.LeaderboardsGetId`: if it exists and isn't `Authoritative`, delete it (`nk.LeaderboardDelete`, which drops its records; ask the developer first, or gate it behind a one-time runtime env flag) and create it again, or use a new ID.
- **The RPC refuses player sessions**: a call made with a session has `RUNTIME_CTX_USER_ID`; a server-to-server call with `?http_key=...` doesn't. So `if userId != "" { return PERMISSION_DENIED }`. Verified: a player's call is refused.
- **The winner must be one of the instance's matched users** (`nk.GetFleetManager().Get(ctx, instanceId)` → `Metadata["user_ids"]`, which comes back from storage as `[]any`).
- **Each instance counts once**: write a storage object keyed by the instance ID with `Version: "*"` (create only if absent) and no client permissions before writing the record. A retry, or a second report, gets `ALREADY_EXISTS`.

The http_key is shared by every game server, so a compromised server image could still report results for other instances it knows about. The checks above limit that to real instances and their real players.

Adapt the payload to the game: scores per player, a match summary, XP. Use the same pattern (S2S only, instance check, once per instance) for wallet changes, stats or storage writes.

## 6. TypeScript or Lua modules

The Fleet Manager is a Go package, so the project needs a Go module, but Nakama loads Go, JavaScript and Lua modules side by side. Add `main.go` with the Fleet Manager, auth hooks, matchmaker hook and result RPC; keep the rest of the TS/Lua code. Register a given hook (MatchmakerMatched, one AfterAuthenticate) in one runtime only: remove the TS/Lua version, and check Nakama's startup log for duplicate registrations.

The Docker image then needs both: the Go plugin from the builder stage and the `build/index.js` or `.lua` files in `/nakama/data/modules/` (comment in `assets/nakama/Dockerfile`).

## 7. The plugin's client RPCs

`instance_create`, `instance_join`, `instance_list` and `instance_get` are registered with every Fleet Manager and callable by any signed-in player. `instance_create` starts an Edgegap deployment for the caller: anyone with an account can start servers that the developer pays for. The event RPCs (`edgegap_instance`, `edgegap_connection`) don't check for the http_key in the code at `20d849e`, `cd9022a` or `902c9aa`, so a player who knows an instance ID (it is in notification 111) may be able to send `STOP` for it. Not exploited in testing; tell the developer, don't hide it. Mitigations in the developer's control: keep matches on the matchmaker, rate-limit or monitor deployments (`edgegap-launch`), and raise it upstream (https://github.com/edgegap/backend-nakama-edgegap-plugin) before launch.

Private matches: Fish Game dropped its "match by ID" mode. `instance_create`/`instance_join`, or a custom RPC that calls `Create` for a party, could bring it back.
