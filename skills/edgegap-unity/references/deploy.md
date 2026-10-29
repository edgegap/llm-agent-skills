# Build, containerize, register and deploy on Edgegap

Contents
1. Edgegap access: account, API token, MCP connection
2. Prerequisites check
3. Build the Linux dedicated server
4. Docker image and registry push
5. App and app version
6. Direct test deployment
7. MCP tool caveats
8. Free tier limits

## 1. Edgegap access

**Account:** free at https://app.edgegap.com/auth/register (verify the email, or registry/plugin steps fail). No credit card for testing.

**API token** (needed for creating the app/version, deploying, logs): Dashboard → User Settings → Tokens, https://app.edgegap.com/user-settings?tab=tokens. It is organization-wide and can't be scoped, so treat it like a password:
- Never write it into project files, scripts, Dockerfiles, git, or the game client.
- Never echo it back in chat or logs.
- It is *not* the matchmaker Auth Token (that one is client-safe).

**Connect the Edgegap MCP server** (hosted, `https://mcp.edgegap.dev/mcp`). First check whether tools named like `edgegap_list_apps` are already available and work; if so, skip this.

If this skill was installed through the `edgegap` Claude Code plugin, the plugin already declares the MCP server. Its token is a sensitive plugin setting that Claude Code asks for when the plugin is enabled, and keeps in the system credential store. If the tools fail with a missing or invalid token, ask the developer to re-enter it: `/plugin` → edgegap → configure, or disable and re-enable the plugin. Paste only the UUID.

Otherwise ask the developer to run this in their own terminal, so the token never passes through the conversation:

```bash
claude mcp add --transport http edgegap https://mcp.edgegap.dev/mcp -H "Authorization: token <YOUR_EDGEGAP_API_TOKEN>" --scope user
```

Then restart the Claude Code session (or `/mcp` to reconnect) so the tools load. `Bearer <token>` also works as the header value.

Checks if the tools fail:
- "does not contain an Edgegap API token": the header is malformed. Most often it's `token token <uuid>`, because the copied value already had the prefix. Fix it with `claude mcp remove edgegap --scope user` and add it again.
- Tools named `edgegap_*` that come from a claude.ai/desktop **connector** (no header) fail the same way. Make sure the configured `edgegap` server is the one in use.
- In the Claude desktop app, a newly added user-scope server may only appear after the app or session fully restarts.

If the developer prefers to paste the token to you, run that command for them with the Bash tool, and don't repeat the token in your messages.

Other clients:
- **Claude Desktop / claude.ai custom connectors can't send the Authorization header**, so the hosted URL shows "connected" but every tool fails. For Claude Desktop use the local server instead: Settings → Developer → Edit Config:
  ```json
  { "mcpServers": { "edgegap": { "command": "npx", "args": ["-y", "@edgegap/mcp"] } } }
  ```
  It asks for the token on first use (or set `"env": {"EDGEGAP_API_TOKEN": "..."}`). Needs Node 18+.
- Cursor/VS Code: same URL + header in their MCP config.

If MCP is impossible, everything below can be done in the dashboard (apps at https://app.edgegap.com/application-management/applications/list, deploy button on the version). Guide the developer click by click and ask them to paste results (deployment URL, external port, logs).

## 2. Prerequisites check

Verify instead of asking where possible:
- **Unity version**: `ProjectSettings/ProjectVersion.txt` (`m_EditorVersion`). SDK needs 2021.3+.
- **Unity Linux modules**: Unity Hub → Installs → (version) → Add Modules → **Linux Build Support (Mono and/or IL2CPP)** + **Linux Dedicated Server Build Support**, then restart Unity. Check on disk: the editor folder contains `PlaybackEngines/LinuxStandaloneSupport` (Windows: `<Editor>\Data\PlaybackEngines\LinuxStandaloneSupport`; macOS: `/Applications/Unity/Hub/Editor/<ver>/PlaybackEngines/LinuxStandaloneSupport`), and its `Variations` folder has `*server*` entries for Dedicated Server. On Windows, Unity 6 projects also need the `com.unity.toolchain.win-x86_64-linux` toolchain package. Unity usually prompts, or add it if the build complains about the Linux toolchain/sysroot.
- **Docker**: `docker version` (client and server both answer). If the server part fails, start Docker Desktop.
- **git** (for UPM git packages): `git --version`.

## 3. Build the Linux dedicated server and clients

Prerequisites: Unity Hub modules **Linux Build Support (Mono)** and **Linux Dedicated Server Build Support** (the plugin's **Linux Server Build Requirements → Install** adds them), plus the client platform's module; Docker Desktop running; git. Every scene the game loads must be enabled in Build Settings.

**Plugin (Editor open):** **Tools → Edgegap Server Hosting → Build server** → `Builds/EdgegapServer/ServerBuild` (Linux, Dedicated Server subtarget, enabled scenes; Addressables rebuilt when present).

**Command line (Editor closed):** copy `assets/unity/Editor/EdgegapPluginBuild.cs` to an `Editor/` folder; it calls the plugin's build (the plugin's `EdgegapBuildUtils` is internal, so it uses reflection) and exits Unity itself:
```bash
"<Unity>" -batchmode -projectPath "<project>" -executeMethod EdgegapPluginBuild.BuildServer -logFile build-server.log
"<Unity>" -batchmode -projectPath "<project>" -executeMethod EdgegapClientBuild.Build -edgegapClientTarget webgl -logFile build-client.log
```
Don't replace it with `-standaloneBuildSubtarget Server -buildLinux64Player`: on Unity 6000.0 that produced a regular player twice the size of the Dedicated Server build. The first import takes minutes: run it in the background and read the log for `error CS`. Builds switch the active build target and can re-serialize settings assets; don't commit that churn.

Unity editor paths: Windows `C:\Program Files\Unity\Hub\Editor\<ver>\Editor\Unity.exe`, macOS `/Applications/Unity/Hub/Editor/<ver>/Unity.app/Contents/MacOS/Unity`, Linux `~/Unity/Hub/Editor/<ver>/Editor/Unity`.

## 4. Docker image, local test and registry push

The plugin's Dockerfile is `Library/PackageCache/com.edgegap.unity-servers-plugin@<hash>/Editor/Dockerfile`: Ubuntu 22.04 with CA certificates (for the HTTPS self-stop call), copies `Builds/EdgegapServer` and runs `ServerBuild -batchmode -nographics $UNITY_COMMANDLINE_ARGS`. It runs `env` first, so the deployment logs show the injected variables, the self-stop token included; only the account sees them. Its context is the project root: `assets/docker/.dockerignore` keeps it to `Builds/EdgegapServer`.

**Plugin:** **Containerize with Docker** (Image Name; empty Image Tag = `yy.MM.dd-HH.mm.ss-UTC`), then **Test Your Server Locally** with Optional Docker Run Parameters `-p <port>:<port>/udp` → **Deploy local container** (the default `-p 7777/udp` maps a random host port). It passes `EdgegapMock.env` (fake `ARBITRIUM_*` values, `gameport` 7777/UDP), so the self-stop timers run: the server quits 120 s after start with nobody connected, or 30 s after the last player leaves. **Terminate** removes the container before the next run. **Upload image and Create app version** pushes with the account's own registry login.

**Command line:**
```bash
docker build --platform linux/amd64 -f "<plugin>/Editor/Dockerfile" -t registry.edgegap.com/<project>/<image>:<tag> .
docker run --rm -p <port>:<port>/udp --env-file "<plugin>/Editor/EdgegapMock.env" registry.edgegap.com/<project>/<image>:<tag>
```
The developer runs `docker login registry.edgegap.com -u '<username>'` (Container Registry page) before you `docker push`. Tags: never `latest`, never reused; UTC `YYYYMMDD-HHMM` (`date -u +%Y%m%d-%H%M`), the same string as the app version name. Confirm with `edgegap_list_registry_tags` (image name only). `edgegap_get_registry_credentials` only answers plugin quick-start tokens: with an API token it returns `manual_steps_required`, which is expected; don't call it again.

## 5. App and app version

**Plugin (preferred):** **Upload image and Create app version** creates the application if needed and opens the dashboard's version form with the version name, image and tag filled in. The developer replaces the default port with `gameport` and the game's port and protocol, adds the registry credentials if the form asks, and saves. **Rebuild from Source** later does build, image, push and opens the form again. Registry tokens get rotated: if saving or `verify_image` fails with `Unable to login with the given credentials`, the stored login is stale; re-enter it from the Container Registry page.

**MCP:** `edgegap_list_apps` first (avoid duplicates; free tier allows 2 apps and 2 versions). Then `edgegap_create_app` (`name`, e.g. the game name in kebab-case) if needed.

`edgegap_create_app_version`:
| Field | Value |
|---|---|
| application | the app |
| name | the image tag, e.g. `20261022-1430` |
| docker_repository | `registry.edgegap.com` (host only, no scheme) |
| docker_image | `<project>/<image>` |
| docker_tag | the pushed tag |
| cpu_units / memory_mb | start with `1024` / `2048` (1 vCPU, 2 GB). Free tier max 1536 / 3072. memory ≤ 2 × cpu |
| ports | `[{"port": <internal listen port>, "protocol": "UDP"|"TCP"|"WS", "name": "gameport"}]`; add `"tls_upgrade": true` on WS ports for WebGL/wss clients |
| registry_username / registry_token | **required even for registry.edgegap.com**: Edgegap pulls with the version's credentials, not the API token. Without them deployments fail to pull (424 / image pull error) |
| max_duration_minutes | leave default (60 on hosted MCP) |
| verify_image | `true` once credentials are set |

Registry credentials are a secret. Two acceptable ways:
1. Developer pastes username/token for this call (they only grant registry access). Don't repeat them in chat or write them anywhere.
2. Create the version without them, then the developer opens the version in the dashboard → Edit → **Private registry** "Username Token"/"Password Token", saves.

Either way, verify with `edgegap_list_app_versions`: it reports `registry_credentials_set` (presence only) and `tls_upgrade` per port. `edgegap_create_app_version` also returns `notes` warning when a registry.edgegap.com image has no login. Read them. In the real end-to-end test the developer was asked for the credentials and still skipped the field, and the first deploy failed with `Unable to pull image from registry`.

**WebGL / WebSocket transport**: the port must be `WS` with `"tls_upgrade": true` (Edgegap terminates TLS for `*.pr.edgegap.net`, so the server stays plain ws). `edgegap_generate_dockerfile` with a WS netcode already returns `ports_for_create_app_version` with it set. If the connected MCP is older than 0.3.3 and has no `tls_upgrade` field, the developer ticks **TLS Upgrade** on the port in the dashboard instead.

Dashboard version settings worth knowing: **Restart policy** "Never" is recommended (process exit stops the deployment); env vars (mark secrets hidden); Duplicate button to change ports/resources without rebuilding.

## 6. Direct test deployment

Do this before the matchmaker. It proves image, ports, and netcode work, and isolates later matchmaker issues.

1. `edgegap_deploy` with `application`, `version`, `users: {"ip_addresses": ["<developer public IP>"]}` (ask, or get it from `curl -s https://api.ipify.org`), `tags: ["mcp-test"]`. Costs a little (free tier: free, 1 at a time).
2. `edgegap_wait_for_deployment` → `fqdn`, `public_ip`, `ports[].external`.
3. `edgegap_get_deployment_logs`: expect the server startup lines, transport listening, and `Edgegap Server | Deployment '...' started`. A crash loop or OOM shows here.
4. Connect a client to it directly: Editor play mode with the transport address/port set to `public_ip`/`fqdn` + external port (WS + TLS: `wss://fqdn:external`). The server may need up to ~1 min after Ready before it accepts connections. Optionally write a temporary "Direct Connect" field in the client for this.
5. `edgegap_stop_deployment` when done. **Free tier allows one deployment at a time; a leftover test deployment blocks matchmaker deployments.**

With `FirstPlayerTimeoutSeconds = 120`, the lifecycle script stops a direct deployment that nobody joins within 2 minutes. Raise it temporarily while debugging, or connect quickly.

## 7. MCP tool caveats (@edgegap/mcp 0.3.3+, hosted and npm)

- `edgegap_get_registry_credentials`: `status: "manual_steps_required"` with normal API tokens (only plugin quick-start tokens get credentials). Use the dashboard Container Registry page, or Docker Hub/GHCR with that registry's pull login on the version.
- `edgegap_list_registry_tags`: image name only.
- `edgegap_create_app_version`: accepts `tls_upgrade` per WS/HTTP port; still creates a version without registry credentials if you omit them, but says so in `notes`.
- `edgegap_list_app_versions`: shows `registry_credentials_set` and per-port `tls_upgrade`. Use it to verify the version before deploying.
- `edgegap_build_matchmaker_config`: accepts `allowed_cors_origins` (origins only, no path or trailing slash).
- Error texts carry per-tool hints (404/400/429). An unknown `request_id` is a 400 on the live API.
- Older servers (0.3.2 and earlier) lack `tls_upgrade`/`allowed_cors_origins`. If the tool schema doesn't list them, set TLS Upgrade in the dashboard and add `allowed_cors_origins` to the JSON by hand.
- Logs exist only while a deployment runs (unless Endpoint Storage is configured). Read them before stopping a failed deployment.
- Deployments cost money outside the free tier. Tag test deployments, and stop every deployment you started before ending.
- Don't enumerate or modify apps the developer didn't mention. The token is org-wide.

## 8. Free tier limits

1 concurrent deployment; deployments stop after 60 min; 2 apps; 2 app versions; 10 GB registry; 1.5 vCPU / 3 GB per deployment; matchmaker stops 3 h after each start (restart from dashboard). Errors: `You have reached you Application limit of 2`, `... Application Version limit of 2` → delete or reuse an old version (dashboard), or upgrade.
