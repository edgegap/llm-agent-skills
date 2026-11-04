# Deploy: image, app versions, direct test, matchmaker

Contents
1. Image
2. App versions (and one image for several games)
3. One direct deployment
4. Matchmaker: profiles, teams, ticket API, rate limits
5. Shipping a new build (CI, GitHub Pages)
6. Cleanup

## 1. Image

`assets/server/Dockerfile`: `node:22-slim`, `npm ci --omit=dev`, copies only the server, `USER node`, `CMD ["node", "server/main.js"]` (Node as PID 1 so SIGTERM arrives). Add a `.dockerignore` that drops `node_modules`, the client and tools.

```bash
docker build --platform linux/amd64 -t registry.edgegap.com/<project>/<image>:<tag> .
docker run --rm -p 7777:7777 registry.edgegap.com/<project>/<image>:<tag>    # local parity test
docker push registry.edgegap.com/<project>/<image>:<tag>
```

The developer runs `docker login registry.edgegap.com` with the Container Registry credentials from the dashboard (`edgegap_get_registry_credentials` can't return them for a regular API token; `docker` may already be logged in from an earlier project, so check before asking). Tag with a UTC timestamp `YYYYMMDD-HHMM` (e.g. `20261022-1430`, from `date -u +%Y%m%d-%H%M`), the same string as the app version name, so anyone can see when the server was last updated. Never `latest`. `edgegap_list_registry_tags` confirms the push.

## 2. App versions

`edgegap_create_app_version`:

| Field | Value |
|---|---|
| `docker_repository` / `docker_image` / `docker_tag` | `registry.edgegap.com` / `<project>/<image>` / `<tag>` |
| `ports` | `[{name: "gameport", port: 7777, protocol: "WS", tls_upgrade: true}]` |
| `cpu_units` / `memory_mb` | 256 / 512 (a Node game server with a few players uses a fraction of that) |
| `max_duration_minutes` | 30–60: a safety net, the server stops itself |
| `restart_policy` | `"never"`: the match ends with a self-stop; a crash ends the deployment instead of restarting an empty, half-played match. The API default is `always` |
| `env` | optional timers (`server.md` §3; for an always-on matchmaker: `EMPTY_TIMEOUT_S=10`, `FIRST_JOIN_TIMEOUT_S=45`, `IDLE_TIMEOUT_S=75`, `REQUIRE_TICKET=1`, §7); `GAME` for several games |

The version needs the registry login to pull from `registry.edgegap.com`: the developer adds the registry username and token to each version in the dashboard (Applications → version → edit), or passes them to `edgegap_update_app_version` themselves. Check `registry_credentials_set: true` in `edgegap_list_app_versions`; without it deployments fail to pull.

**One image, several games.** Put every game's `server.js` in the image and pick one with an env var: `main.js` does `await import(\`../games/${process.env.GAME}/server.js\`)` after checking `GAME` against a list. Then one version per game (`blaster-v1`, `kart-v1`...) on the same tag, each with its `GAME`. One build, one push, and the matchmaker gets one profile per version. The sample repo does exactly this for five games.

## 3. One direct deployment

Ask first, then:

1. `edgegap_deploy` with `application`, `version`, `users.ip_addresses: [<player public IP>]`, a test tag (`agent-test`).
2. `edgegap_wait_for_deployment` → `ports[].connect` = `wss://<request_id>.pr.edgegap.net:<external>`.
3. Play a match on it: `SERVER_URL=wss://<fqdn>:<external> node tools/e2e.mjs [players]` (direct mode: headless players without tickets, then it waits for the deployment to stop), or the page with `?server=`. Shorten the match for this test with deployment env vars (`MATCH_SECONDS=40`, `WAIT_SECONDS=5`) rather than a new version.
4. `edgegap_get_deployment_logs` **while the match runs**: `deployment <id> at <ip> (<host>), direct deploy`, the joins and phases. The deployment stops seconds after the results screen and its logs go with it, so a call after the test usually finds nothing; e2e's "stopped itself" line and `edgegap_get_deployment` showing `TERMINATED` are the proof of the self-stop.
5. The deployment leaves `edgegap_list_deployments`.

The developer's own scripts use the HTTP API instead: `assets/server/edgegap-deploy.mjs` (`EDGEGAP_API_TOKEN` from their shell, `POST /v2/deployments`, polls `GET /v1/status/{id}`, `--stop <id>`).

## 4. Matchmaker

Created in the dashboard only (no API): Matchmaker → Create Matchmaker → upload the JSON → **Create and Start** → copy **API URL** and **Auth Token**. Check: `curl -H "Authorization: <token>" <url>/monitor` → 200 (DNS can take a few minutes on a new one).

Templates: `assets/matchmaker/casual.json` (one game) and `several-games.json` (five profiles, one with teams). Per profile:

- `application: {name, version}` = an existing, active version with registry credentials.
- Free-for-all: `team_count: 1`, `min_team_size: 2`, `max_team_size: N`, and an expansion `"20": {"match_size": {"min_team_size": 1}}` so a lone player gets a server (with bots) after 20 s. Observed: 2 and 3 players on such a profile matched together in 12–16 s.
- **Teams**: `team_count: 2`, `min_team_size: 1`, `max_team_size: 2` (1v1 or 2v2). Observed on 2026-10-22: 4 tickets → 2v2 in 4–6 s, each ticket carrying its `team_id` to the server (`MM_TICKET_<id>`). But with `min_team_size: 2` plus a `"20"` expansion to 1, two or three tickets did **not** match at 20 s: a 1v1 formed only when the tickets reached their expiry (then 5 minutes; the templates now use `30s`). Start team profiles at the smallest size you accept instead of relying on the expansion. A team profile never matches a lone player: give solo players another mode.
- `allowed_cors_origins`: every page origin. `inspect: true` while testing (`GET /inspect/tickets` shows queued tickets), `false` before launch.

Matchmaker API: the client and `tools/e2e.mjs` call it through the Edgegap JS SDK's `GroupAgent`, which sends the auth token raw in `Authorization` and uses the group endpoints (a solo player is a group of one):

| SDK call | API | Result |
|---|---|---|
| `createGroup({profile, attributes: {}, is_ready: true})` | `POST /groups` | `{group_id, member_id, ticket_id, status: "SEARCHING"}`. Every rule except `player_count` needs a matching attribute; none here. |
| polling (automatic) | `GET /groups/{group_id}/members/{member_id}` | `SEARCHING` / `MATCH_FOUND` / `HOST_ASSIGNED` with `assignment: {fqdn, public_ip, ports: {gameport: {external, link, protocol}}}` / `CANCELLED` |
| `stopMatchmaking()` | `DELETE /groups/{group_id}` | leave the queue (refused once matched) |

The ticket ID in `MM_TICKET_IDS` on the server is the membership's `ticket_id`.

**Rate limits**: 14 tickets created in the same second got `429 Too many requests` on most of them. The SDK backs off and retries; test scripts space players by ~300 ms and games by a few seconds.

**Stale tickets**: tickets left by a crashed test (created, never polled again) stay `SEARCHING` until they expire and get matched with the next run's players, splitting them across deployments. Those deployments stop themselves (nobody joins → 120 s), but the test fails. Before a test run, `GET /inspect/tickets` should be empty; otherwise wait for expiry (5 min) or restart the matchmaker.

## 5. Shipping a new build

Push a new tag, then `edgegap_update_app_version` with `docker_tag` on each version: new matches use it, running ones keep the old build, and the matchmaker config doesn't change. For a change in ports, env or resources, create new versions and point the profiles at them (matchmaker Stop → Edit `application.version` → Start).

**CI.** `assets/ci/server-image.yml` (copy to `.github/workflows/`) runs a local headless match, then builds `linux/amd64` and pushes `registry.edgegap.com/<project>/<image>:<UTC timestamp>` on every push to `main` that touches the server. It needs the secrets `EDGEGAP_REGISTRY_USERNAME` and `EDGEGAP_REGISTRY_TOKEN` and the variable `EDGEGAP_REGISTRY_PROJECT`. The developer sets the secrets (`gh secret set EDGEGAP_REGISTRY_TOKEN -R <owner>/<repo>` prompts for the value); the project name is not secret, so you can set the variable. It only pushes: point a version at the new tag as above, or use `edgegap/deploy-action` (`edgegap-launch`) to create, smoke-test and promote versions from CI.

**GitHub Pages.** `assets/ci/pages.yml` publishes the client folder; turn Pages on with `gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow`. On a free GitHub plan Pages only works on a public repo (the API answers 422 "Your current plan does not support GitHub Pages for this repository"), so scan the history for secrets (`gitleaks git .`) before making it public: the matchmaker Auth Token in `config.js` is expected, nothing else is. Add `https://<owner>.github.io` to `allowed_cors_origins` (origin only, no repo path) and use relative paths in the page.

## 6. Cleanup

`edgegap_list_deployments` filtered on the application: stop only deployments you started, by exact `request_id`. Matchmaker deployments stop themselves; a leftover usually means a client never connected (it stops after `FIRST_JOIN_TIMEOUT_S`). A matchmaker (even stopped) blocks deleting the versions it references: delete it first, in the dashboard.
