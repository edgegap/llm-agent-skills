# Build, containerize, register and deploy a PurrNet server

Contents
1. Edgegap access and the MCP connection
2. Build the Linux dedicated server and clients
3. Docker image and registry push
4. App and app version
5. Direct test deployment
6. Command-line test flags
7. Free tier limits

## 1. Edgegap access and the MCP connection

- **Account**: free at https://app.edgegap.com/auth/register.
- **API token**: dashboard → User Settings → Tokens. Organization-wide, so it is a password: never in project files, Dockerfiles, git, the game client or chat. It is not the matchmaker Auth Token.
- **MCP**: if `edgegap_list_apps` already works, skip this. With the `edgegap` Claude Code plugin, Claude Code prompts for the token when the plugin is enabled (`/plugin` → edgegap → configure to re-enter it). Otherwise the developer runs, in their own terminal:
  ```bash
  claude mcp add --transport http edgegap https://mcp.edgegap.dev/mcp -H "Authorization: token <YOUR_EDGEGAP_API_TOKEN>" --scope user
  ```
  and restarts the session. "does not contain an Edgegap API token" usually means the header became `token token <uuid>`. Claude Desktop and claude.ai custom connectors can't send the header; use `npx -y @edgegap/mcp` there.
- Without MCP, guide the developer through the dashboard and ask them to paste results.

## 2. Build the Linux dedicated server and clients

Prerequisites: Unity Hub modules **Linux Build Support (Mono)** and **Linux Dedicated Server Build Support**, plus the client platform's module; Docker (`docker version`); git (PurrNet and the SDK are git packages).

The project must be **closed** in the Editor for batch mode, and the game scene enabled in Build Settings.

```bash
"<Unity>" -batchmode -quit -projectPath "<project>" -executeMethod EdgegapServerBuild.Build -logFile build-server.log
"<Unity>" -batchmode -quit -projectPath "<project>" -executeMethod EdgegapServerBuild.BuildClient -edgegapClientTarget win64 -logFile build-client.log
```
Outputs: `Builds/EdgegapServer/ServerBuild`, `Builds/Client/<target>`. Menu equivalents: **Tools → Edgegap → Build Linux Dedicated Server**. The first import takes minutes: run in the background and read the log for `error CS`.

Unity editor paths: Windows `C:\Program Files\Unity\Hub\Editor\<ver>\Editor\Unity.exe`, macOS `/Applications/Unity/Hub/Editor/<ver>/Unity.app/Contents/MacOS/Unity`, Linux `~/Unity/Hub/Editor/<ver>/Editor/Unity`. On Windows, Unity 6 Linux builds may need the `com.unity.toolchain.win-x86_64-linux` package.

Opening the project in a newer Unity re-serializes assets and bumps packages. Don't commit that churn with the Edgegap changes unless the developer wants the upgrade.

## 3. Docker image and registry push

Copy `assets/docker/Dockerfile` and `.dockerignore` to the project root. The build context is only `Builds/EdgegapServer` (minus `*_DoNotShip`). The Dockerfile installs CA certificates (for the HTTPS self-stop call), passes `$UNITY_COMMANDLINE_ARGS` to the server, and doesn't print the environment, which would leak the self-stop token.

Tags: never `latest`, never reuse a tag (Edgegap caches by tag). Use a UTC timestamp `YYYYMMDD-HHMM` (e.g. `20261022-1430`, from `date -u +%Y%m%d-%H%M`), the same string for the image tag and the app version name, so anyone can see when the server was last updated.

The developer logs in (Container Registry page in the dashboard):
```bash
docker login registry.edgegap.com -u '<username>'
```
Then:
```bash
docker build --platform linux/amd64 -t registry.edgegap.com/<project>/<image>:<tag> .
docker push registry.edgegap.com/<project>/<image>:<tag>
```
Confirm with `edgegap_list_registry_tags` (image name only). `edgegap_get_registry_credentials` hands credentials only to plugin quick-start tokens: with a normal API token it returns `status: "manual_steps_required"` and no credentials, which is expected, not a failure. Do not call it again; use the dashboard page, or push to Docker Hub, GHCR or another registry and pass that registry and its pull login to `edgegap_create_app_version`.

Local test: `docker run --rm -p 5000:5000/udp <image>`, two clients on `127.0.0.1:5000`.

## 4. App and app version

`edgegap_list_apps` first (free tier: 2 apps, 2 versions). `edgegap_create_app` if needed, then `edgegap_create_app_version`:

| Field | Value |
|---|---|
| docker_repository | `registry.edgegap.com` |
| docker_image / docker_tag | `<project>/<image>` / the pushed tag (push first: the dashboard checks the tag exists) |
| cpu_units / memory_mb | `1024` / `2048` to start (free tier max 1536 / 3072) |
| ports | `[{"port": 5000, "protocol": "UDP", "name": "gameport"}]` |
| registry_username / registry_token | **required**, even for registry.edgegap.com. The developer pastes them for this call or sets them in the dashboard (version → Edit → Private registry) |

Verify with `edgegap_list_app_versions`: `registry_credentials_set: true`. A version without credentials fails every deploy with `Unable to pull image from registry`. A duplicated version keeps its own registry fields; check them on the copy too.

## 5. Direct test deployment

1. `edgegap_deploy` with the app, version, the developer's public IP (`curl -s https://api.ipify.org`) and `tags: ["mcp-test"]`.
2. `edgegap_wait_for_deployment` → `fqdn`, `public_ip`, external port of `gameport`. `edgegap_get_deployment_logs`: `Edgegap Server | Starting server on 0.0.0.0:5000.` and `Deployment '<id>' started ... 0 matched player(s)`.
3. Two clients connect to `<fqdn or public_ip>:<external>` (panel, or the flags in §6). Logs: `Edgegap Server | 2 player(s) connected.`
4. `edgegap_stop_deployment`, or close both clients and watch the server stop itself 30 s later. Nobody joining within 120 s also stops it.

UDP has no handshake you can probe with curl: prove the port with a real client.

## 6. Command-line test flags

Read by `EdgegapBootstrap` in builds; they override the settings asset. Useful for scripted two-client tests and for Edgegap's `UNITY_COMMANDLINE_ARGS` variable.

| Flag | Effect |
|---|---|
| `-edgegapAddress <host> -edgegapPort <port>` | Direct connection target |
| `-edgegapConnect` | Connect directly on startup |
| `-edgegapMatchmaker true\|false` | Matchmaker mode |
| `-edgegapMatchmakerUrl <url> -edgegapAuthToken <token>` | Matchmaker URL and Auth Token |
| `-edgegapFindMatch` | Find a match on startup |
| `-edgegapListenPort <port>` | Server listen port |

Example: `Game.exe -screen-fullscreen 0 -edgegapAddress <fqdn> -edgegapPort <external> -edgegapConnect`.

## 7. Free tier limits

One deployment at a time, 60-minute deployments, 2 apps, 2 versions, 10 GB registry, 1.5 vCPU / 3 GB per deployment, and the matchmaker stops 3 hours after each start.
