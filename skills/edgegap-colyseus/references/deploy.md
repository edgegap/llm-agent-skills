# Image, app version, direct deployments, matchmaker

## 1. Build and push

```bash
cd server
docker build --platform linux/amd64 -t registry.edgegap.com/<project>/<game>:<tag> .
docker login registry.edgegap.com          # the developer runs this: registry username and token from the dashboard's Container Registry page
docker push registry.edgegap.com/<project>/<game>:<tag>
```

Use a new tag for every build, never `latest`: app versions point at a tag, and reusing one makes deployments unreproducible. Tag with a UTC timestamp `YYYYMMDD-HHMM` (e.g. `20261022-1430`, from `date -u +%Y%m%d-%H%M`), the same string for the image tag and the app version name, so anyone can see when the server was last updated. `--platform linux/amd64` matters on Apple Silicon and ARM machines; Edgegap runs amd64.

The image from `assets/server/Dockerfile` is `node:22-slim` plus production dependencies. Keep `node_modules` out of the build context (`.dockerignore`).

## 2. Application and version

Edgegap MCP: `edgegap_create_app` once, then `edgegap_create_app_version`:

| Field | Value |
|---|---|
| `docker_repository` / `docker_image` / `docker_tag` | `registry.edgegap.com` / `<project>/<game>` / the tag |
| `ports` | `[{ "port": 2567, "protocol": "WS", "name": "gameport", "tls_upgrade": true }]` |
| `cpu_units` / `memory_mb` | 256 / 512 to start (plenty for the verified tanks demo; measure your own game) |
| `max_duration_minutes` | 60 while testing; raise to fit real matches |
| `env` (optional) | `EMPTY_TIMEOUT_S`, `FIRST_JOIN_TIMEOUT_S`, the game's own settings |

Registry login: the developer adds the registry username and token on the version in the dashboard (or passes them to the tool once); `edgegap_list_app_versions` shows `registry_credentials_set: true`. Without it, deployments fail to pull.

Dashboard instead: Applications → Create → version with the same values; the port row is `2567`, **WS**, name `gameport`, **TLS Upgrade** on.

**Why WS with TLS Upgrade.** Edgegap terminates TLS on the port and forwards plain HTTP and WebSocket to 2567, so the Node server needs no certificate and every client, browser builds on `https` pages included, uses `wss://<fqdn>:<port>`. The Colyseus matchmake HTTP route goes through the same port: verified. Connect by FQDN, not the IP: the certificate is for `*.pr.edgegap.net`.

## 3. Direct deployments

```bash
EDGEGAP_API_TOKEN=<token> npm run edgegap:deploy -- <app> <version> [player IP ...]
```

It deploys near the given IPs (default: your own public IP), waits until running and prints `wss://<request_id>.pr.edgegap.net:<port>`. `--stop <request_id>` stops one. The developer runs it in their own terminal, so the API token stays on their machine. As the agent, use `edgegap_deploy` → `edgegap_wait_for_deployment` instead, with the players' IPs and a test tag, after asking.

In a real game without the Edgegap matchmaker, the developer's backend (or their Colyseus lobby server elsewhere) calls the same `POST /v2/deployments` when a group is ready and sends the URL to its players: `edgegap-deployments-api`. The API token never goes into a client or the server image.

✅ Check: the deployment log shows `[edgegap] deployment <id> ... match=direct`; a client joins; after it leaves, `[edgegap] self-stop: empty for 30s` and `self-stop request: HTTP 200`, and the deployment disappears from `edgegap_list_deployments`.

## 4. Matchmaker

1. Start from `assets/matchmaker/casual.json` (or `edgegap_build_matchmaker_config`, then add the origins). Set `application.name` and `version`. The `casual` profile matches 2 to 8 players and has no expansion stage: `min_team_size` 2 below `max_team_size` 8 already lets a partial match start with whoever is waiting, at the latest when the tickets expire. Keep `ticket_expiration_period` at `30s` so that wait stays short (and a developer testing alone isn't left waiting 5 minutes) instead of adding an expansion: expansions cost the matchmaker a lot of performance. To prefer fuller matches, raise the initial `min_team_size` (say 4) and add a `15` s expansion that lowers it to 2.
2. `allowed_cors_origins`: every origin that serves a browser build, scheme + host + port, no path. The template lists local dev servers (Vite `:5173`, Godot web `:8060`, `:8080`); add the real domains before going live. Desktop and mobile builds don't need it.
3. Dashboard: Matchmaker → Create Matchmaker → upload → **Create and Start**. When it shows **Online**, copy the **API URL** and **Auth Token**. The Auth Token ships in clients by design: it only creates and reads tickets. It is not the Edgegap API token.
4. Two clients (they can be different engines) with the URL and token: both show searching, then connect to the same `wss://` address. The server logs both ticket IDs in `tickets=[...]`.

Ticket API used by the client templates (matchmaker 3.x): `POST {url}/tickets` with `{ "profile": "casual", "attributes": {} }`, then poll `GET {url}/tickets/{id}` every 2 s until `HOST_ASSIGNED`; `DELETE {url}/tickets/{id}` to leave the queue. Header `Authorization: <Auth Token>`, raw, no `Bearer`. Edgegap MCP before 0.6.2 told agents to poll `/memberships/{id}`; the working path is `/tickets/{id}`.

Latency placement: desktop clients can add a `latencies` rule with beacon pings (see the Unity skill's matchmaker reference). Leave it out of profiles browser clients use: browsers can't ping beacons.

## 5. Shipping a new server build

Build → push a new tag → new app version (duplicate the old one in the dashboard and change the tag, or create it with `edgegap_create_app_version` from the old one's non-secret settings plus the registry login from the dashboard: the API reads it back as `This value is set and encrypted`, never the real value) → matchmaker: Stop → Edit `application.version` → Start. Direct mode: deploy the new version name. Free tier: the matchmaker stops 3 hours after each start, one deployment at a time, two app versions.
