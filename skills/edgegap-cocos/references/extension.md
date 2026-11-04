# Deploying: the Edgegap Cocos extension, or MCP / dashboard

Contents
1. Which path
2. The extension: install and preset
3. The panel flow
4. Tokens
5. Headless run (same code)
6. What the extension does and doesn't set
7. Without the extension: MCP tools or dashboard
8. Shipping updates

## 1. Which path

Both end with the same thing: an image in `registry.edgegap.com`, an application, a version (port WS + TLS Upgrade, named `gameport`), and one test deployment whose `wss://` URL a client can join.

- **The extension** ([edgegap/edgegap-cocos-plugin](https://github.com/edgegap/edgegap-cocos-plugin) 2.0.0, Cocos Creator 3.8+, Windows and macOS, needs Docker Desktop): for developers who want buttons in the editor. It does sign-in, build, local run, push + version, deploy near me, stop.
- **MCP tools or the dashboard**: when you (the agent) do the work, in CI, or when the developer prefers no editor extension. Same API calls.

Ask which the developer prefers when it isn't obvious; default to setting up the extension for them (install + preset) and checking the result with the MCP tools, because the developer then owns a repeatable button flow.

## 2. The extension: install and preset

From its README:
1. Download the repository (ZIP or clone) and copy it into the project as `extensions/edgegap-extension/` (the folder holds `package.json`, `dist/`, `static/`, `i18n/`, `assets/`). `dist/` is prebuilt: no `npm install`.
2. Cocos Creator: **Extension → Extension Manager → Project**, enable **edgegap-extension** (refresh if it isn't listed).
3. **Extension → Edgegap → Open Panel**.

Its `package.json` declares `"editor": ">=3.8.0"`. The 2022 version for Cocos Creator 3.6 is kept at the `v1` tag; this skill covers 2.0 only.

Preset the panel so the developer only signs in and clicks: copy `assets/settings/edgegap-extension.json` to `settings/v2/packages/edgegap-extension.json` in the Cocos project and fill in `serverDir` (relative to the project), `imageName`, `app`, `tag` (UTC `YYYYMMDD-HHMM`) and the port the server listens on. The panel saves the same file (`Editor.Profile.setProject`), so the team shares the settings through git. It holds no secrets. The extension's defaults if no file exists: `serverDir: "Server"`, image `<project>-server`, app `<project>`, port `gameport` 2567 WS + TLS Upgrade, 256 CPU units, 512 MB, 60 minutes (`src/core/workflow.ts`, `defaultConfig`).

Validation the panel applies before building (`validate()` in `workflow.ts`): the server folder and its `Dockerfile` exist; image name lowercase; tag not `latest`; app name at least 3 characters; port 1 to 59999; TLS Upgrade only on WS or HTTP; memory at least 256 MB and at most 2× the CPU units.

## 3. The panel flow

| Panel step | What it runs (from `src/core/`) |
|---|---|
| 1. Sign in | Token → registry login (§4). Stored in the Cocos Creator **user** profile, never the project. |
| 2. Server | Folder, image name, tag (**Now** = new UTC timestamp), port, protocol (WS, TCP, UDP, TCP/UDP, HTTP), TLS Upgrade, port name. **Create Dockerfile** writes a Node starter only if none exists. |
| 3. Build and test locally | `docker build --platform linux/amd64 -f <dir>/Dockerfile -t registry.edgegap.com/<project>/<image>:<tag> <dir>`; **Run locally** = `docker run -d --rm -p <port>:<port> -e PORT=<port>` (container `edgegap-local-<image>`); **Stop local**. |
| 4. Upload | `docker login` (password through stdin), `docker push`, `POST /v1/app` if the app is missing (409 = exists), `POST /v1/app/<app>/version` (or `PATCH` when the tag already exists as a version) with the registry login, port, CPU, memory, max duration. |
| 5. Deploy a test server | `GET /v1/ip`, `POST /v2/deployments` near that IP with tag `cocos-plugin`, polls `GET /v1/status/<id>` every 2 s up to 5 minutes, shows `wss://<fqdn>:<external>`; **Stop server** = `DELETE /v1/stop/<id>` (404/410 = already gone). The last deployment ID is kept in the project-local profile. |

The panel's Log shows every command and API call; passwords are never logged.

The test server is for the developer. Players go through the matchmaker (or a backend that deploys): point the matchmaker profile's `application.version` at the tag the panel uploaded.

## 4. Tokens

- **Get a token** opens the dashboard's one-click sign-in, which shows a **quick-start token**. With it, the extension calls `POST /v1/wizard/init-quick-start` and `GET /v1/wizard/registry-credentials` and gets the registry login automatically.
- A **regular API token** (User Settings → Tokens) is valid but those wizard endpoints answer `403 ... not a quick start token`; the extension then checks the token with `GET /v1/apps` and asks for **Project, Username and Token** from the dashboard's Container Registry page.
- The token is the developer's to paste. Never type it into the panel, a settings file, the client or chat yourself; full rules in [the edgegap skill's agent rules](../../edgegap/references/agent-rules.md). The same token controls the whole organization.

## 5. Headless run (same code)

`scripts/e2e.mjs` in the extension runs steps 1 to 5 with `dist/core` and the project's saved settings:

```bash
EDGEGAP_API_TOKEN=<token> node extensions/edgegap-extension/scripts/e2e.mjs --project . --deploy --check "node <bot client> --server={url}"
```

With a regular API token also set `EDGEGAP_REGISTRY_PROJECT`, `EDGEGAP_REGISTRY_USERNAME`, `EDGEGAP_REGISTRY_TOKEN`. It builds, runs the container locally until any HTTP answer on the port (15 s), pushes, creates/updates the version, and with `--deploy` starts one server, runs `--check` with `{url}` replaced, and stops the deployment either way. The tag defaults to a fresh timestamp (`--tag` to override). The developer runs it with their token in their shell; you run it only with their go-ahead, since it deploys (and stops) a billed server. For CI that only ships builds, `edgegap/deploy-action` (`edgegap-launch`) is simpler, as the extension's README says.

## 6. What the extension does and doesn't set

Read from `upsertVersion` in `src/core/api.ts`:
- Sets: image, registry login (`private_username`/`private_token`), `req_cpu`, `req_memory`, `max_duration`, `time_to_deploy: 120`, one port with `to_check: true` and `tls_upgrade`.
- Doesn't set `restart_policy`, env vars, or more than one port. After the first upload, set `restart_policy: "never"` with `edgegap_update_app_version` (or in the dashboard) so a crash doesn't restart an empty match, and add env vars (timeouts, `REQUIRE_TICKET`) the same way. A later upload with the same tag `PATCH`es the version with the panel's fields; check afterwards that the policy and env are still there (not verified).
- `POST /v1/app` requires `image` (an app icon URL); the extension sends an empty string.
- `/v1/status` reports a WebSocket port's protocol as `WEBSOCKET` (the version API takes `WS`); the extension's `connectionUrl` handles both. Scripts of your own that build the URL from status should too.

## 7. Without the extension: MCP tools or dashboard

Follow the Edgegap golden path (the MCP server's instructions and `edgegap` skill):
1. `edgegap_validate_server_config` on the Dockerfile (or `edgegap_generate_dockerfile` if none; then prefer `assets/server/Dockerfile`).
2. `docker build --platform linux/amd64 -t registry.edgegap.com/<project>/<image>:<YYYYMMDD-HHMM> Server`. The developer runs `docker login registry.edgegap.com` (`edgegap_get_registry_credentials` returns nothing for a regular API token; check whether docker is already logged in before asking). Push; `edgegap_list_registry_tags` confirms it.
3. `edgegap_list_apps`, `edgegap_create_app` if none fits; `edgegap_create_app_version`: port = the server's `PORT`, protocol `WS`, name `gameport`, `tls_upgrade: true`, 256 CPU units / 512 MB, `max_duration_minutes` 30–60, `restart_policy: "never"`. The developer adds the registry credentials to the version; check `registry_credentials_set: true` in `edgegap_list_app_versions`.
4. Ask before deploying (it bills). `edgegap_deploy` with the tester's public IP and a test tag → `edgegap_wait_for_deployment` → `wss://<fqdn>:<external>`.
5. Join it from a client (`client.md`), read `edgegap_get_deployment_logs` while the match runs (`[edgegap] deployment <id> ... match=direct`), then confirm it stopped itself (`edgegap_list_deployments`). Stop only deployments you started, by exact ID.

Dashboard: the same fields under Applications → version (port WS, TLS Upgrade on, name `gameport`), then Deploy.

## 8. Shipping updates

New server build → new tag. With the extension: **Now** (new tag), Build, Push image and create version; then point the matchmaker at it (Matchmaker → Stop → Edit `application.version` → Start). Without: push the tag, then `edgegap_update_app_version` with the new `docker_tag` on the existing version (running matches keep the old build), or a new version + matchmaker edit when ports, env or resources change.
