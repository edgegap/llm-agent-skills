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

## 2. Build the Linux dedicated server and clients

Prerequisites: Unity Hub modules **Linux Build Support (Mono)** and **Linux Dedicated Server Build Support** (the plugin's **Linux Server Build Requirements → Install** adds them), plus the client platform's module; Docker Desktop running; git. Every scene the game loads must be enabled in Build Settings.

**Plugin (Editor open):** **Tools → Edgegap Server Hosting → Build server** → `Builds/EdgegapServer/ServerBuild` (Linux, Dedicated Server subtarget, enabled scenes; Addressables rebuilt when present).

**Command line (Editor closed):** copy `assets/unity/Editor/EdgegapPluginBuild.cs` to an `Editor/` folder; it calls the plugin's build (the plugin's `EdgegapBuildUtils` is internal, so it uses reflection) and exits Unity itself:
```bash
"<Unity>" -batchmode -projectPath "<project>" -executeMethod EdgegapPluginBuild.BuildServer -logFile build-server.log
"<Unity>" -batchmode -projectPath "<project>" -executeMethod EdgegapClientBuild.Build -edgegapClientTarget webgl -logFile build-client.log
```
Don't replace it with `-standaloneBuildSubtarget Server -buildLinux64Player`: on Unity 6000.0 that produced a regular player twice the size of the Dedicated Server build. The first import takes minutes: run it in the background and read the log for `error CS`. Builds switch the active build target and can re-serialize settings assets; don't commit that churn.

Unity editor paths: Windows `C:\Program Files\Unity\Hub\Editor\<ver>\Editor\Unity.exe`, macOS `/Applications/Unity/Hub/Editor/<ver>/Unity.app/Contents/MacOS/Unity`, Linux `~/Unity/Hub/Editor/<ver>/Editor/Unity`.

## 3. Docker image, local test and registry push

The plugin's Dockerfile is `Library/PackageCache/com.edgegap.unity-servers-plugin@<hash>/Editor/Dockerfile`: Ubuntu 22.04 with CA certificates (for the HTTPS self-stop call), copies `Builds/EdgegapServer` and runs `ServerBuild -batchmode -nographics $UNITY_COMMANDLINE_ARGS`. It runs `env` first, so the deployment logs show the injected variables, the self-stop token included; only the account sees them. Its context is the project root: `assets/docker/.dockerignore` keeps it to `Builds/EdgegapServer`.

**Plugin:** **Containerize with Docker** (Image Name; empty Image Tag = `yy.MM.dd-HH.mm.ss-UTC`), then **Test Your Server Locally** with Optional Docker Run Parameters `-p 7770:7770` → **Deploy local container** (the default `-p 7777/udp` maps a random host port). It passes `EdgegapMock.env` (fake `ARBITRIUM_*` values, `gameport` 7777/UDP), so the self-stop timers run: the server quits 120 s after start with nobody connected, or 30 s after the last player leaves. **Terminate** removes the container before the next run. **Upload image and Create app version** pushes with the account's own registry login.

**Command line:**
```bash
docker build --platform linux/amd64 -f "<plugin>/Editor/Dockerfile" -t registry.edgegap.com/<project>/<image>:<tag> .
docker run --rm -p 7770:7770 --env-file "<plugin>/Editor/EdgegapMock.env" registry.edgegap.com/<project>/<image>:<tag>
```
The developer runs `docker login registry.edgegap.com -u '<username>'` (Container Registry page) before you `docker push`. Tags: never `latest`, never reused; UTC `YYYYMMDD-HHMM` (`date -u +%Y%m%d-%H%M`), the same string as the app version name. Confirm with `edgegap_list_registry_tags` (image name only). `edgegap_get_registry_credentials` only answers plugin quick-start tokens: with an API token it returns `manual_steps_required`, which is expected; don't call it again.

## 4. App and app version

**Plugin (preferred):** **Upload image and Create app version** creates the application if needed and opens the dashboard's version form with the version name, image and tag filled in. The developer replaces the default port with `gameport` and the game's port and protocol, adds the registry credentials if the form asks, and saves. **Rebuild from Source** later does build, image, push and opens the form again. Registry tokens get rotated: if saving or `verify_image` fails with `Unable to login with the given credentials`, the stored login is stale; re-enter it from the Container Registry page.

**MCP:** `edgegap_list_apps` first; the free tier allows 2 apps and 2 versions. `edgegap_create_app` if needed, then `edgegap_create_app_version`:

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
