# Image, Edgegap app version, matchmaker

Contents
1. Acting on Edgegap from Manus or another agent
2. Building and pushing the image
3. App and app version
4. A test deployment
5. The matchmaker
6. Shipping a new server build

## 1. Acting on Edgegap from Manus or another agent

The game's own code never calls the Edgegap API: the backend talks only to the matchmaker, and the server only to its self-stop URL. The Edgegap API token is needed only for setup, by whoever does it:
- **Claude Code, Cursor, Codex and other MCP clients**: the Edgegap MCP server (`https://mcp.edgegap.dev/mcp`, or `npx @edgegap/mcp` locally) gives you `edgegap_*` tools. Check with `edgegap_list_apps`.
- **Manus**: if the workspace has a custom MCP connector for Edgegap, use it. Otherwise guide the developer through the dashboard (https://app.edgegap.com) step by step and ask them to paste back non-secret results: app and version names, the deployment URL and external port, log lines. Don't ask for the API token to call the API from the Manus sandbox, and never store it in the project.

## 2. Building and pushing the image

The image must be `linux/amd64`.

**GitHub Actions (default for Manus projects).** Manus syncs the project to a GitHub repository (Manus → GitHub integration; the sync breaks if the repository is renamed or moved on GitHub). Then:
1. Edgegap dashboard → **Container Registry**: note the project's registry path and its credentials.
2. GitHub repository → Settings → Secrets and variables → Actions: secrets `EDGEGAP_REGISTRY_USERNAME`, `EDGEGAP_REGISTRY_TOKEN`; variable `EDGEGAP_IMAGE` = `registry.edgegap.com/<project>/<image>`.
3. Copy `assets/github/edgegap-game-server.yml` to `.github/workflows/`. Each push that touches `game-server/` builds and pushes `<yyyymmdd>-<sha7>`, shown in the run summary.

**Docker on the developer's machine**:
```bash
docker login registry.edgegap.com          # the developer types the credentials
docker build --platform linux/amd64 -t registry.edgegap.com/<project>/<image>:<tag> game-server
docker push registry.edgegap.com/<project>/<image>:<tag>
```

Never `latest`: a version must point at an exact build.

## 3. App and app version

Create the application once (e.g. `my-game`), then one version per server build (MCP `edgegap_create_app` / `edgegap_create_app_version`, or dashboard → Applications):

| Field | Value |
|---|---|
| Image | `registry.edgegap.com` / `<project>/<image>` / `<tag>` |
| Registry credentials | the registry username and token (Edgegap pulls with them) |
| vCPU / memory | 0.25 vCPU (256 units) / 512 MB to start; raise if the tick loop lags |
| Port | `7777`, name `gameport`, protocol **WS**, **TLS Upgrade on** |
| Env | `JOIN_TOKEN_PUBLIC_KEY` = the public key (not secret) |
| Max duration | the longest match plus margin, e.g. 60 minutes |

**TLS Upgrade is required.** The Manus site is served over https, and browsers block plain `ws://` from an https page. With TLS Upgrade, Edgegap terminates TLS and the browser connects to `wss://<request_id>.pr.edgegap.net:<external port>`; the server inside keeps serving plain ws. Always connect with the fqdn, not the IP: the certificate is for the fqdn.

With the MCP: `ports: [{ name: "gameport", port: 7777, protocol: "WS", tls_upgrade: true }]`, `verify_image: true` on the first version.

The port name must equal `gamePortName` in the backend config (`gameport`), because the backend reads `assignment.ports.gameport.external`.

## 4. A test deployment

Ask the developer first (free tier: one deployment at a time, and it's free; paid: billed per minute).
1. `edgegap_deploy` (tag `agent-test`) → `edgegap_wait_for_deployment` → note `request_id`, fqdn and the external port of `gameport`.
2. `JOIN_TOKEN_PRIVATE_KEY=<private> node dev-token.mjs 76561197960287930 <request_id>` (the test key pair must match the public key on the version).
3. In the browser console of the published site: `new WebSocket("wss://<fqdn>:<external>")`, send `{t:"join", token}`, expect `welcome`.
4. Logs: `edgegap_get_deployment_logs`. Close the socket: after 30 s the server stops itself; otherwise `edgegap_stop_deployment` with that exact `request_id`.

## 5. The matchmaker

1. Copy `assets/matchmaker/manus-modes-regions.json` to `matchmaker-config.json` in the project root. Set `application.name` and `application.version` in every profile. One profile per mode, named like the `modes` keys' `profile` in the backend config. Keep the `regions` rule in every profile, since the backend always sends `regions`.
2. Player counts: `team_count` and `min/max_team_size` per profile. The `casual` profile drops to 1 player after 30 s, so one person can test; remove that expansion for production if solo matches make no sense.
3. No `allowed_cors_origins`: only the backend calls the matchmaker.
4. Check: `python -m json.tool matchmaker-config.json`. The MCP's `edgegap_build_matchmaker_config` makes single-profile configs without custom rules, so edit this template by hand.
5. Dashboard → **Matchmaker** → Create Matchmaker → name → upload the file → **Create and Start**. "The application configuration is not valid for profile X" means the app name or version doesn't exist or isn't active.
6. When it's **ONLINE**, the developer copies the **API URL** and **Auth Token** into the Manus backend secrets `EDGEGAP_MATCHMAKER_URL` and `EDGEGAP_MATCHMAKER_TOKEN`.
7. `curl -s -H "Authorization: <auth token>" <API URL>/monitor` answers (DNS can take ~5 minutes after the first start).

Free tier: the matchmaker stops 3 hours after each start; restart it from the list (URL and token stay the same). Paid tiers keep it running and raise rate limits.

## 6. Shipping a new server build

1. Push changes to `game-server/` → the workflow pushes a new tag, the UTC time `YYYYMMDD-HHMM` (e.g. `20261022-1430`).
2. New app version named with that same tag (Duplicate the previous version in the dashboard and change the name and tag), so anyone can see when the server was last updated. To have the workflow do it, add Edgegap's GitHub Action `edgegap/deploy-action@v0` after the push step, with `api-token: ${{ secrets.EDGEGAP_API_TOKEN }}`, `image: ${{ vars.EDGEGAP_IMAGE }}`, `tag` and `version` both set to `${{ steps.tag.outputs.tag }}`, `registry-username`/`registry-token` from the registry secrets, and `smoke-test: true`. It copies the previous version's settings into the new one. Creating it through the API or MCP instead, copy only the previous version's non-secret settings: its registry login and secret env values read back as `This value is set and encrypted`, so they come from the dashboard's Container Registry page and the developer.
3. Matchmaker: **Stop → Edit** `application.version` in every profile **→ Start**. Forgetting this keeps deploying the old build.
4. If the protocol changed, ship the browser change together with the matchmaker switch, or make the server accept both for a while.
