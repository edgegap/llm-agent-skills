# Export, containerize, register and deploy a Godot server

Contents
1. Edgegap access and the MCP connection
2. The server build: plugin dock or command line
3. Local test and registry push
4. App and app version
5. Direct test deployment
6. Environment variables
7. Free tier limits

## 1. Edgegap access and the MCP connection

- **Account**: free at https://app.edgegap.com/auth/register.
- **API token**: dashboard → User Settings → Tokens. Organization-wide, so it is a password: never in project files, `export_presets.cfg`, Dockerfiles, git, the game client or chat. It is not the matchmaker Auth Token.
- **MCP**: if `edgegap_list_apps` already works, skip this. With the `edgegap` Claude Code plugin, Claude Code prompts for the token when the plugin is enabled (`/plugin` → edgegap → configure to re-enter it). Otherwise the developer runs, in their own terminal:
  ```bash
  claude mcp add --transport http edgegap https://mcp.edgegap.dev/mcp -H "Authorization: token <YOUR_EDGEGAP_API_TOKEN>" --scope user
  ```
  and restarts the session. "does not contain an Edgegap API token" usually means the header became `token token <uuid>`. Claude Desktop and claude.ai custom connectors can't send the header; use `npx -y @edgegap/mcp` there.
- Without MCP, guide the developer through the dashboard and ask them to paste results.

## 2. The server build: plugin dock or command line

Prerequisites: the Godot editor of the project's exact version (4.3+ for the plugin), its Linux x86_64 export templates (plus each client platform), Docker, the plugin in `res://addons/edgegap/` and `assets/docker/.dockerignore` at the project root.

The dock's steps, each with a status line and details in Output (Docker build and push logs go to `<OS cache dir>/edgegap-godot/docker-*.log`, path printed there):

| Dock step | What it does |
|---|---|
| Connect Account | Checks the API token (`POST /v1/wizard/init-quick-start`) and stores registry credentials in editor settings |
| Validate export templates / Export server | Creates the `Edgegap Linux Server` preset if missing (never edits an existing one), then `--headless --export-debug` to `build/edgegap-linux-server.x86_64` + `.pck` |
| Containerize | `docker build -f addons/edgegap/defaults/Dockerfile --build-arg SERVER_BUILD_PATH=build/edgegap-linux-server -t <image>:<tag> <project root>`; `--platform linux/amd64` added on ARM. Image name defaults to `application/config/name` in kebab case |
| Deploy locally / Stop | `docker run` with the run parameters (default `-p 7777/udp`: change it to the game's port and protocol) |
| Upload | Logs in to the registry, tags and pushes, then opens the dashboard's create-version page |
| Deploy to cloud | `POST /v2/deployments` near your public IP, tagged `quickstart`; polls until ready; Stop ends it |
| Rebuild from source | Export + Containerize in one click |

The default Dockerfile (`ubuntu:22.04` + `ca-certificates`) copies the binary and `.pck` and runs `./server.x86_64 -- ${GODOT_COMMANDLINE_ARGS}`. It needs nothing per game:
- a Dedicated Server export starts headless, and `EdgegapServer.is_server_launch()` is true from the `dedicated_server` feature, so no `--server` argument. A game that needs arguments reads them from `GODOT_COMMANDLINE_ARGS`, set as an app version env var;
- Godot runs as PID 1 and ignores SIGTERM: `docker stop` waits out its timeout. On Edgegap it doesn't matter, because `EdgegapServer` quits by itself after its self-stop call;
- it prints the environment at start, so deployment logs show `ARBITRIUM_DELETE_TOKEN`. Don't paste those logs anywhere public. A game that can't accept that gets its own Dockerfile (same `SERVER_BUILD_PATH` contract) in the dock's Dockerfile path field, which resets to the default each time the editor starts.

Command line, same artifacts (CI, or no editor open):
```bash
godot --headless --path . --import          # first run on a fresh clone
godot --headless --path . --export-release "Edgegap Linux Server" build/edgegap-linux-server.x86_64
docker build --platform linux/amd64 -f addons/edgegap/defaults/Dockerfile --build-arg SERVER_BUILD_PATH=build/edgegap-linux-server -t <game>-server:<tag> .
```
The preset must exist (the plugin's Export button, or `assets/godot/export_presets.server.cfg`), the `build/` folder too, and the output path is project-relative. Use the console build on Windows (`Godot_v<ver>_win64_console.exe`) so output shows. `ERROR: Cannot export project with preset ... due to configuration errors` lists what's missing (often the templates). Exports don't fail on script errors: run the exported server once (§3) before pushing.

Quick checks without exporting: `godot --headless --path . -- --server` runs the server from the project, and `godot --headless --path . --check-only --script res://edgegap/edgegap_matchmaker.gd` parses a script (autoload names aren't known in `--check-only`, so scripts that use `EdgegapServer` report it missing there; run the project instead).

## 3. Local test and registry push

Tags: never `latest`, never reuse a tag (Edgegap caches by tag). Use a UTC timestamp `YYYYMMDD-HHMM` (e.g. `20261022-1430`, from `date -u +%Y%m%d-%H%M`) in the dock's Image tag field, the same string for the app version name. The plugin's own default (`yy.MM.dd-HH.mm.ss-UTC`) is only used when the field is empty.

Local test with simulated Edgegap variables, before uploading (the dock's Deploy locally runs the same image without them):
```bash
docker run --rm -p 7777:7777/udp -e ARBITRIUM_REQUEST_ID=localtest -e 'MM_TICKET_IDS=["a","b"]' <game>-server:<tag>
```
(`-p 7777:7777` without `/udp` for WebSocket.) Logs must show `EDGEGAP listening ...` and `EDGEGAP ready edgegap=true ...` right away; empty logs mean `flush_stdout_on_print` is off (`godot.md` §5). Connect two clients to `127.0.0.1:7777` (or `ws://127.0.0.1:7777`): `player_joined` ×2, then `match_ready players=2`. With `ARBITRIUM_REQUEST_ID` set and no delete URL, the server quits by itself when it would self-stop. To exercise the self-stop call too, point `ARBITRIUM_DELETE_URL` at any local HTTP endpoint (`http://host.docker.internal:<port>/...`) with `ARBITRIUM_DELETE_TOKEN`; the server sends `DELETE` with `Authorization: <token>` raw.

Push: the dock's **Upload** (no `docker login` needed). From the command line, the developer logs in first (Container Registry page in the dashboard):
```bash
docker login registry.edgegap.com -u '<username>'
docker tag <game>-server:<tag> registry.edgegap.com/<project>/<game>:<tag>
docker push registry.edgegap.com/<project>/<game>:<tag>
```
Confirm with `edgegap_list_registry_tags` (image name only). `edgegap_get_registry_credentials` hands credentials only to plugin quick-start tokens: with a normal API token it returns `status: "manual_steps_required"` and no credentials, which is expected, not a failure. Do not call it again; use the dashboard page, or push to Docker Hub, GHCR or another registry and pass that registry and its pull login to `edgegap_create_app_version`.

## 4. App and app version

`edgegap_list_apps` first (free tier: 2 apps, 2 versions). `edgegap_create_app` if needed, then `edgegap_create_app_version`:

| Field | Value |
|---|---|
| docker_repository | `registry.edgegap.com` |
| docker_image / docker_tag | `<project>/<game>` / the pushed tag (push first) |
| cpu_units / memory_mb | `512` / `1024` is enough for most Godot servers (the sample ran at 0.5 vCPU / 1 GB); raise for heavy physics |
| ports, ENet | `[{"port": 7777, "protocol": "UDP", "name": "gameport"}]` |
| ports, WebSocket | `[{"port": 7777, "protocol": "WS", "name": "gameport", "tls_upgrade": true}]` |
| registry_username / registry_token | **required**, even for registry.edgegap.com. The developer pastes them for this call or sets them in the dashboard (version → Edit → Private registry) |

Verify with `edgegap_list_app_versions`: `registry_credentials_set: true`, and `tls_upgrade: true` on a WS port. Without credentials every deploy fails with `Unable to pull image from registry`. MCP servers older than 0.3.3 have no `tls_upgrade` field; tick **TLS Upgrade** on the port in the dashboard. A duplicated version keeps its own registry fields; check them on the copy too.

## 5. Direct test deployment

1. `edgegap_deploy` with the app, version, the developer's public IP (`curl -s https://api.ipify.org`) and `tags: ["mcp-test"]`.
2. `edgegap_wait_for_deployment` → `fqdn`, `public_ip`, external port of `gameport`. `edgegap_get_deployment_logs`: `EDGEGAP listening transport=... port=7777` and `EDGEGAP ready edgegap=true request_id=<id> ... expected_players=0`.
3. WebSocket: `curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" https://<fqdn>:<external>/` answers `101` (proves the port and TLS Upgrade; it counts as a peer for a moment). ENet has no handshake curl can do: prove it with a client.
4. Two clients join (`TEST_CONNECT`-style env var, a debug field, or `EdgegapMatchmaker.create_client_peer({"host": ..., "port": ..., "url": ...})`). Logs: `player_joined` ×2, `match_ready players=2` after the 10 s grace (no tickets on a direct deploy).
5. Let the match end, or close both clients: `stopping reason=...`, `self_stop result=0 http=200`, and the deployment disappears. `edgegap_stop_deployment` if anything is left.

## 6. Environment variables

Injected by Edgegap: `ARBITRIUM_REQUEST_ID`, `ARBITRIUM_PUBLIC_IP`, `ARBITRIUM_PORT_GAMEPORT_INTERNAL` / `_EXTERNAL` / `_PROTOCOL`, `ARBITRIUM_DELETE_URL` + `ARBITRIUM_DELETE_TOKEN`; from the matchmaker: `MM_MATCH_ID`, `MM_MATCH_PROFILE`, `MM_TICKET_IDS`, `MM_TICKET_<id>`, `MM_GROUPS`, `MM_TEAMS`, `MM_EXPANSION`. Read them with `OS.get_environment()`.

Read by the templates (set on the app version, or when launching a test client):

| Variable | Effect |
|---|---|
| `EDGEGAP_TRANSPORT` (`enet` / `websocket`), `EDGEGAP_PORT` | Override `TRANSPORT` / `PORT` |
| `EDGEGAP_START_GRACE`, `EDGEGAP_JOIN_TIMEOUT`, `EDGEGAP_EMPTY_GRACE`, `EDGEGAP_END_GRACE` | Lifecycle timings, seconds |
| `EDGEGAP_QUIT_LOCALLY=1` | Quit locally where the server would self-stop on Edgegap |
| `EDGEGAP_MATCHMAKER_URL`, `EDGEGAP_MATCHMAKER_TOKEN`, `EDGEGAP_MATCHMAKER_PROFILE` | Client matchmaker settings |
| `EDGEGAP_FIND_MATCH=1` | `EdgegapFindMatchButton` presses itself at launch (scripted two-client tests) |

## 7. Free tier limits

One deployment at a time, 60-minute deployments, 2 apps, 2 versions, 10 GB registry, 1.5 vCPU / 3 GB per deployment, and the matchmaker stops 3 hours after each start.
