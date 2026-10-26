# Build, containerize, register and deploy a FishNet server

Contents
1. Edgegap access and the MCP connection
2. Build the Linux dedicated server (and clients)
3. Docker image and registry push
4. App and app version
5. Direct test deployment
6. Free tier limits

## 1. Edgegap access and the MCP connection

- **Account**: free at https://app.edgegap.com/auth/register. Verify the email.
- **API token**: dashboard → User Settings → Tokens. Organization-wide and unscopable, so it is a password: never in project files, Dockerfiles, git, the game client, or chat. It is not the matchmaker Auth Token.
- **MCP**: if `edgegap_list_apps` already works, skip this. With the `edgegap` Claude Code plugin, Claude Code prompts for the token when the plugin is enabled (re-enter it via `/plugin` → edgegap → configure). Otherwise the developer runs, in their own terminal:
  ```bash
  claude mcp add --transport http edgegap https://mcp.edgegap.dev/mcp -H "Authorization: token <YOUR_EDGEGAP_API_TOKEN>" --scope user
  ```
  and restarts the session. "does not contain an Edgegap API token" almost always means the header became `token token <uuid>`. Claude Desktop and claude.ai custom connectors can't send the header; use the local server `npx -y @edgegap/mcp` there.
- Without MCP, guide the developer through the dashboard click by click and ask them to paste results.

## 2. Build the Linux dedicated server (and clients)

Prerequisites, checked on disk where possible: Unity Hub modules **Linux Build Support (Mono)** and **Linux Dedicated Server Build Support** (`<Editor>/Data/PlaybackEngines/LinuxStandaloneSupport`), **WebGL Build Support** for browser clients, Docker (`docker version`), git.

The project must be **closed** in the Editor for batch mode. The NetworkManager scene with the `Edgegap` object must be enabled in Build Settings.

```bash
"<Unity>" -batchmode -quit -projectPath "<project>" -executeMethod EdgegapServerBuild.Build -logFile build-server.log
```
Success: `EdgegapServerBuild | Succeeded` and `Builds/EdgegapServer/ServerBuild`. The first import takes minutes, so run it in the background and read the log for `error CS`. Or the developer clicks **Tools → Edgegap → Build Linux Dedicated Server**.

Clients: `-executeMethod EdgegapServerBuild.BuildClient -edgegapClientTarget webgl|win64|mac|linux` → `Builds/Client/<target>`.

Unity editor paths: Windows `C:\Program Files\Unity\Hub\Editor\<ver>\Editor\Unity.exe`, macOS `/Applications/Unity/Hub/Editor/<ver>/Unity.app/Contents/MacOS/Unity`, Linux `~/Unity/Hub/Editor/<ver>/Editor/Unity`.

Batch mode on old 2021.3 patch releases can fail to license even with Unity Hub signed in (the old licensing client can't read the current entitlement license). Use a current 2021.3 LTS patch (the sample uses 2021.3.45f2), or build from the Editor menu.

## 3. Docker image and registry push

Copy `assets/docker/Dockerfile` and `.dockerignore` to the project root (the build context is only `Builds/EdgegapServer`). Set `EXPOSE` to `7770/tcp` for Bayou or `7770/udp` for Tugboat (documentation only). The Dockerfile installs CA certificates (needed for the HTTPS self-stop call) and doesn't print the environment, which would leak the self-stop token into logs.

Tags: never `latest`, never reuse a tag (Edgegap caches by tag). Use a UTC timestamp `YYYYMMDD-HHMM` (e.g. `20261022-1430`, from `date -u +%Y%m%d-%H%M`), the same string for the image tag and the app version name, so anyone can see when the server was last updated.

The developer logs in themselves (credentials on the dashboard's Container Registry page):
```bash
docker login registry.edgegap.com -u '<username>'
```
Then:
```bash
docker build --platform linux/amd64 -t registry.edgegap.com/<project>/<image>:<tag> .
docker push registry.edgegap.com/<project>/<image>:<tag>
```
Confirm with `edgegap_list_registry_tags` (image name only). `edgegap_get_registry_credentials` hands credentials only to plugin quick-start tokens: with a normal API token it returns `status: "manual_steps_required"` and no credentials, which is expected, not a failure. Do not call it again; use the dashboard page, or push to Docker Hub, GHCR or another registry and pass that registry and its pull login to `edgegap_create_app_version`.

Local smoke test: `docker run --rm -p 7770:7770 <image>` (Tugboat: `-p 7770:7770/udp`), then a client on `localhost:7770` with WSS off.

## 4. App and app version

`edgegap_list_apps` first; the free tier allows 2 apps and 2 versions. `edgegap_create_app` if needed, then `edgegap_create_app_version`:

| Field | Value |
|---|---|
| docker_repository | `registry.edgegap.com` |
| docker_image / docker_tag | `<project>/<image>` / the pushed tag |
| cpu_units / memory_mb | `1024` / `2048` to start (free tier max 1536 / 3072) |
| ports | Bayou: `[{"port": 7770, "protocol": "WS", "name": "gameport", "tls_upgrade": true}]`. Tugboat: `[{"port": 7770, "protocol": "UDP", "name": "gameport"}]` |
| registry_username / registry_token | **required**, even for registry.edgegap.com. The developer pastes them for this call or sets them in the dashboard afterwards (version → Edit → Private registry) |

Verify with `edgegap_list_app_versions`: `registry_credentials_set: true`, and `tls_upgrade: true` on the WS port. Without credentials the deployment fails with `Unable to pull image from registry`. MCP servers older than 0.3.3 have no `tls_upgrade` field; tick **TLS Upgrade** on the port in the dashboard. Restart policy "Never" is recommended.

## 5. Direct test deployment

1. `edgegap_deploy` with the app, version, the developer's public IP (`curl -s https://api.ipify.org`) and `tags: ["mcp-test"]`.
2. `edgegap_wait_for_deployment` → `fqdn`, `public_ip`, external port. `edgegap_get_deployment_logs`: expect `Edgegap Server | Starting server on 0.0.0.0:7770.` and `Deployment '<id>' started ... 0 matched player(s)`.
3. Bayou port check:
   ```bash
   curl --http1.1 -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" --max-time 5 https://<fqdn>:<external>/
   ```
   HTTP 101 proves the port and TLS Upgrade. FishNet counts each successful probe as a client connection, so probes reset the empty-server timer: probe once, then don't use probes to judge self-stop.
4. Connect a real client: `<fqdn>` + external port with Use WSS on (Bayou), or `public_ip` + external port (Tugboat). The example bridge's direct mode does this.
5. `edgegap_stop_deployment`. With the defaults, the lifecycle stops a deployment nobody joins within 120 s by itself.

## 6. Free tier limits

One deployment at a time, 60-minute deployments, 2 apps, 2 versions, 10 GB registry, 1.5 vCPU / 3 GB per deployment, and the matchmaker stops 3 hours after each start.
