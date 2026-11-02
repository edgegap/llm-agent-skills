# Troubleshooting a Nakama + Edgegap game

Find the layer first: Nakama module → Edgegap deployment → game server events → client connection. The Nakama log (`docker compose logs -f nakama`) and the deployment log (`edgegap_get_deployment_logs`) together show almost everything.

## Nakama and the module

| Symptom | Cause / fix |
|---|---|
| `go get github.com/edgegap/nakama-edgegap@0.4.0` fails, or `invalid version` | tags have no `v` prefix: pin the commit, `go get github.com/edgegap/nakama-edgegap@cd9022a` (`infra.md` §3) |
| `plugin was built with a different version of package ...` at Nakama start | pluginbuilder tag ≠ Nakama tag, or `nakama-common` not the version of that Nakama release. Change all three together |
| `not enough arguments in call to ...Create` / `assignment mismatch` | README sample: `Create` takes 6 arguments and returns 2 values (`nakama-module.md` §3) |
| Module fails to load: `NAKAMA_ACCESS_URL not found` | the value is in the container env but not passed with `--runtime.env` |
| Edgegap API token or http_key visible in `docker logs` | entrypoint uses `sh -x`: switch to `-ec`, then rotate the token (User Settings → Tokens) and the http_key |
| Clients are sent to a Nakama match / "match not found" after matchmaking | the MatchmakerMatched hook returns something other than `""` |
| Every match → 113 at once, log `failed to extract client IP` or `metadata does not contain PlayerIp` | no AfterAuthenticate hook for the method the client uses, or sessions from before the hook: register it (`nakama-module.md` §2), sign in again |
| Servers start far from the players | Nakama stored a private IP (clients connect through `localhost`/Docker network): use the public URL in clients too |
| Nakama panics in the matchmaker callback (`nil pointer dereference`) | callback reads `instanceInfo.ConnectionInfo` directly: use the template's `connectionInfo()` |
| `Edgegap instance ... is ready but has no address` → 113 | the server's READY has no `game_server` metadata, or `EDGEGAP_PORT_NAME` doesn't match the port name on the app version |
| A second, duplicate 113 | the hook notifies on `Create` error too; the plugin already invoked the callback |

## Deployment

| Symptom | Cause / fix |
|---|---|
| Deployment fails to pull the image → 113 | registry credentials missing on the app version (`registry_credentials_set`), or wrong tag |
| `exec format error` | image built for ARM: `--platform linux/amd64` |
| Deployment never created; Nakama log shows an Edgegap 4xx | `EDGEGAP_API_TOKEN` without `token ` prefix (401), wrong application or version name (404/422), free tier already running a deployment |
| `update_edgegap_version` → version does not exist | the version name must exist in `EDGEGAP_APPLICATION` |

## Game server ↔ Nakama

| Symptom | Cause / fix |
|---|---|
| Players stuck on "starting a server" forever, deployment running | the server never sent READY (or it failed): check the deployment log for the READY response. READY is required; Edgegap's ready webhook alone notifies nobody |
| READY/connection events fail: timeout or connection refused | `NAKAMA_ACCESS_URL` not reachable from the internet (localhost, LAN, a stopped tunnel, a tunnel URL that changed) |
| READY returns an error `no instance found` | wrong `instance_id`: it must be `ARBITRIUM_REQUEST_ID` |
| Server sent ERROR, players still waiting | expected: ERROR notifies nobody. Clients need a timeout; the server should exit |
| `report_match_result` → 401 | the server built the URL without the `?http_key=...&unwrap` query: reuse the one from the event URL |
| `report_match_result` → "only game servers may report results" | called with a player session (correct refusal), or the server sent an `Authorization` header with a session |
| `report_match_result` → "result already reported" | second report for the instance (retry): expected, the win counted once |
| Deployment keeps running after the match | STOP never sent (or failed), or the server waits for players who left: add the stop rules (`game-server.md` §7) and the quit-after-grace fallback |

## Client ↔ game server

| Symptom | Cause / fix |
|---|---|
| Connection times out to `IpAddress:Port` | client used the internal port; or the app version protocol doesn't match the transport (ENet needs UDP) |
| Every player rejected: "reserved for other players" | the server checks tokens against the wrong Nakama URL, `/v2/account` unreachable from the server, or `user_ids` missing in the metadata (module didn't pass it) |
| One player rejected: Nakama returned 401 | the client sent an expired or empty session token; refresh the session before connecting |
| Works locally, both clients on one PC get "already connected" | both signed in with the same account: use two accounts (e.g. `--email=<unique>`) |
| Web build can't connect | UDP from a browser: needs a WebSocket server and a WS port with TLS Upgrade (`game-server.md` §9) |
