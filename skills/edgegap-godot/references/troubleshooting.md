# Troubleshooting Godot on Edgegap

Contents
1. Server
2. Connection
3. Matchmaker
4. Export and Docker

Get evidence first: `docker logs`, `edgegap_get_deployment_logs` (only while the deployment runs), the client's output (run it from a terminal with the console build, or read `user://logs/godot.log`).

## 1. Server

| Symptom | Cause / fix |
|---|---|
| `docker logs` / deployment logs are empty, not even the Godot banner | stdout is buffered: `application/run/flush_stdout_on_print=true` in `project.godot` (`godot.md` §5). The `.dedicated_server` override alone doesn't cover servers run from the editor binary |
| `Identifier "EdgegapSettings" not declared in the current scope` (or `EdgegapMatchmaker`) only in the export | Export allowlist: the autoload was exported, the `class_name` scripts it uses weren't. With `export_filter="resources"`, add `res://edgegap/*.gd` to `export_files`; with `"scenes"`, listing scripts does nothing: switch to `"resources"` or `all_resources` (`godot.md` §6). Same for client presets: a Find Match button that does nothing only in the export is this |
| `Identifier not found: EdgegapServer` | Autoload missing or named differently; `--check-only` never knows autoloads, run the project instead |
| `EDGEGAP server_error port=... error=...` | Port in use or not bindable; another server instance, or a port below 1024 as non-root |
| Server waits forever, never starts the match | `match_ready` not connected to the game's start, or `count_registered_only` on without `player_registered()` calls |
| Match starts with fewer players than matched | `START_GRACE` (30 s) elapsed: a client failed to join (§2), or raise `EDGEGAP_START_GRACE` |
| Deployment never stops | `match_ended()` never called and a client still connected, or the game replaced the `MultiplayerAPI` after `begin()` (call `begin()` with the final one) |
| `self_stop result=0 http=401` | Header altered: the delete token goes raw (`Authorization: <token>`) |
| Stopped after 120 s while testing by hand | `JOIN_TIMEOUT`: connect sooner or raise `EDGEGAP_JOIN_TIMEOUT` |
| `docker stop` takes the full timeout, exit 137 | No tini as PID 1: Godot ignores SIGTERM there. Use `assets/docker/Dockerfile` |
| A player spawned for peer 1, or the server shows a HUD | Host code path still runs on the dedicated server (`godot.md` §3) |
| Ready, then restarts | Crash in server code (read logs before stopping), memory too low, a missing resource that the Dedicated Server export stripped (mark it Keep) |

## 2. Connection

In order:
1. Logs show `EDGEGAP listening transport=<expected> port=<PORT>` and no script errors.
2. App version internal port = `EdgegapSettings.PORT` = Dockerfile `EXPOSE`; protocol **UDP** for ENet, **WS** for WebSocket.
3. Client uses the **external** port, and `public_ip` (ENet) or `wss://<fqdn>` (WebSocket).
4. WebSocket: TLS Upgrade on ↔ `USE_TLS = true` (`wss://`). TLS Upgrade off ↔ `ws://`. A web build on an https page needs `wss://`. Mismatch: the handshake fails and the client goes back to disconnected.
5. **Matched client looks stuck "searching" or "joining", server never sees it**: the game's own join code refused to start (empty display name, a field that only accepts IP addresses, a password or version check) and showed nothing. Fill every field before calling it, log `multiplayer.multiplayer_peer.get_connection_status()` after, or use `EdgegapMatchmaker.join()` (`godot.md` §4).
6. A fresh deployment can take several seconds before the port answers: `join()` retries 10 times; custom join code must retry too.
7. `Assignment has no port named 'gameport'`: `PORT_NAME` ≠ the app version's port name.
8. Networks that block UDP (some corporate or school networks, VPNs): test from another network, or use WebSocket.

## 3. Matchmaker

| Symptom | Cause / fix |
|---|---|
| 401 | Wrong Auth Token, or a `Bearer`/`token` prefix |
| 400 on tickets | Profile name or attributes don't match the config |
| Web build: every call fails with result code 0, desktop works | `allowed_cors_origins` misses the page's origin (`matchmaker.md` §2) |
| Matchmaker deploys another game's server | The wrong `matchmaker-config.json` was uploaded: give the full path, check `application.name` |
| Two players stay `SEARCHING` until their tickets expire, then match | `ticket_expiration_period` is long (e.g. `5m`), so the partial match waits until expiry (`matchmaker.md` §6). Set it to `30s`; don't add an expansion for this (expansions cost the matchmaker a lot of performance) |
| A lone player waits ~5 minutes | `ticket_expiration_period` is `5m`: a lone ticket may only match near expiry on the free tier. Set it to `30s`, or test with two clients |
| Flips MATCH_FOUND ↔ SEARCHING | Free tier's one deployment is busy (stop test deployments), or the version can't deploy (registry credentials; do a direct deploy) |
| New build not used | `application.version` not updated (Stop → Edit → Start) |
| OFFLINE | Free-tier 3-hour shutdown: restart |

## 4. Export and Docker

| Symptom | Cause / fix |
|---|---|
| `No export template found at the expected path` | Templates for this exact version missing (`godot.md` §6) |
| `Invalid export preset name` | `--export-release` takes the preset `name=` exactly |
| `COPY failed ... build/server` | Export first; run `docker build` from the project root with the `.dockerignore` from `assets/docker/` |
| `Error: Couldn't load project data at path ".". Is the .pck file missing?` | `embed_pck` off and the `.pck` not copied, or renamed apart from the binary |
| `exec format error` on Edgegap | Rebuild with `--platform linux/amd64` (and the `x86_64` export, not `arm64`) |
| `Unable to pull image from registry` | No registry credentials on the app version |
