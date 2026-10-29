# Build, containerize, register and deploy an NGO server

Contents
1. Edgegap access and the MCP connection
2. Build the Linux dedicated server and clients (plugin or command line)
3. Docker image, local test and registry push
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

Prerequisites: Unity Hub modules **Linux Build Support (Mono)** and **Linux Dedicated Server Build Support** (the plugin's **Linux Server Build Requirements → Install** adds them), plus the client platform's module; Docker Desktop running; git (the plugin and SDK are git packages). Every scene the game loads (including the one with the `NetworkManager`) must be enabled in Build Settings.

**Plugin (Editor open):** **Tools → Edgegap Server Hosting → Build server** → `Builds/EdgegapServer/ServerBuild` (Linux, Dedicated Server subtarget, enabled scenes). It switches the active build target to Linux.

**Command line (Editor closed):** `assets/unity/Editor/EdgegapPluginBuild.cs` in `Assets/Edgegap/Editor/` calls the plugin's build (its `EdgegapBuildUtils` is internal, so the wrapper uses reflection). Clients use Unity's built-in flags:
```bash
"<Unity>" -batchmode -projectPath "<project>" -executeMethod EdgegapPluginBuild.BuildServer -logFile build-server.log
"<Unity>" -batchmode -quit -projectPath "<project>" -buildTarget Win64 -buildWindows64Player Builds/Client/win64/Game.exe -logFile build-client.log
```
The wrapper exits Unity itself (no `-quit`) with code 1 on failure. Unity's `-standaloneBuildSubtarget Server -buildLinux64Player` is not a substitute: on Unity 6000.0.54f1 it produced a regular player (196 MB vs 103 MB for the Dedicated Server build).
Success: `Build Finished, Result: Success.` in the log; read it for `error CS` otherwise. The first import takes minutes: run in the background. Unity can't open one project twice, so run builds one after the other.

Unity editor paths: Windows `C:\Program Files\Unity\Hub\Editor\<ver>\Editor\Unity.exe`, macOS `/Applications/Unity/Hub/Editor/<ver>/Unity.app/Contents/MacOS/Unity`, Linux `~/Unity/Hub/Editor/<ver>/Editor/Unity`. On Windows, Unity 6 Linux builds may need the `com.unity.toolchain.win-x86_64-linux-x86_64` package.

Builds switch the active build target and can re-serialize URP and package settings assets. Don't commit that churn with the Edgegap changes; opening the project in a newer Unity does the same.

## 3. Docker image and registry push

The plugin's Dockerfile lives at `Library/PackageCache/com.edgegap.unity-servers-plugin@<hash>/Editor/Dockerfile`: Ubuntu 22.04 with CA certificates (for the HTTPS self-stop call), copies `Builds/EdgegapServer` and runs `ServerBuild -batchmode -nographics $UNITY_COMMANDLINE_ARGS`. It runs `env` first, so deployment logs show the injected variables, including the self-stop token for that deployment; only the account sees those logs. The build context is the project root: copy `assets/docker/.dockerignore` there so only `Builds/EdgegapServer` (minus `*_DoNotShip`) is sent.

**Plugin:** **Containerize with Docker** (Image Name; empty Image Tag = UTC timestamp `yy.MM.dd-HH.mm.ss-UTC`), then **Test Your Server Locally** with Optional Docker Run Parameters `-p 7777:7777/udp` → **Deploy local container**. The plugin's default `-p 7777/udp` maps a random host port; set it explicitly. It passes `EdgegapMock.env` (`gameport` 7777/UDP and fake self-stop values), so the server behaves as on Edgegap: it quits 120 s after start with no player, or 30 s after the last one leaves (the self-stop call to the mock URL fails). **Terminate** removes the test container before the next run.

**Command line:**
```bash
docker build --platform linux/amd64 -f "<plugin>/Editor/Dockerfile" -t registry.edgegap.com/<project>/<image>:<tag> .
docker run --rm -p 7777:7777/udp --env-file "<plugin>/Editor/EdgegapMock.env" registry.edgegap.com/<project>/<image>:<tag>
```
Tags: never `latest`, never reuse a tag (Edgegap caches by tag). Use a UTC timestamp `YYYYMMDD-HHMM` (`date -u +%Y%m%d-%H%M`), the same string for the image tag and the app version name.

**Push:** the plugin's **Upload image and Create app version** logs in to the registry with the plugin's own credentials and pushes. From the command line the developer runs `docker login registry.edgegap.com -u '<username>'` (Container Registry page), then you `docker push`. Confirm with `edgegap_list_registry_tags` (image name only). `edgegap_get_registry_credentials` hands credentials only to plugin quick-start tokens: with a normal API token it returns `status: "manual_steps_required"`, which is expected. Don't call it again.

To push without the plugin, the developer runs `docker login` once (above). Building and pushing yourself, add `assets/unity/Editor/EdgegapPluginBuild.cs` to `Assets/Edgegap/Editor/` for §2.

## 4. App and app version

**Plugin (preferred):** after the push, **Upload image and Create app version** creates the application if needed and opens the dashboard's version form with the version name, image and tag filled in. The developer replaces the default port with `gameport` / `7777` / **UDP**, adds the registry credentials if the form asks, and saves. Later builds: **Rebuild from Source** does build, image, push and opens the form again.

**MCP:** `edgegap_list_apps` first (free tier: 2 apps, 2 versions). `edgegap_create_app` if needed, then `edgegap_create_app_version`. It needs the registry username and token in the call, which only the developer has; if they won't paste them, use the plugin's form:

| Field | Value |
|---|---|
| docker_repository | `registry.edgegap.com` |
| docker_image / docker_tag | `<project>/<image>` / the pushed tag (push first: the dashboard checks the tag exists) |
| cpu_units / memory_mb | `1024` / `2048` to start (free tier max 1536 / 3072) |
| ports | `[{"port": 7777, "protocol": "UDP", "name": "gameport"}]` (the server reads `ARBITRIUM_PORT_GAMEPORT_INTERNAL`, so the name must be `gameport` or match `PortName`) |
| registry_username / registry_token | **required**, even for registry.edgegap.com. The developer pastes them for this call or sets them in the dashboard (version → Edit → Private registry) |

Verify with `edgegap_list_app_versions`: `registry_credentials_set: true`. A version without credentials fails every deploy with `Unable to pull image from registry`. A duplicated version keeps its own registry fields; check them on the copy too. Registry tokens get rotated: pointing an old version at a new tag with `verify_image` can fail with `Unable to login with the given credentials`, meaning its stored login is stale; the developer re-enters it (version → Edit → Private registry).

## 5. Direct test deployment

1. The plugin's **Deploy to cloud** (deploys near the developer's IP, tag `quickstart`; **Stop last deployment** stops it), or `edgegap_deploy` with the app, version, the developer's public IP (`curl -s https://api.ipify.org`) and `tags: ["mcp-test"]`.
2. `edgegap_wait_for_deployment` → `fqdn`, `public_ip`, external port of `gameport`. `edgegap_get_deployment_logs`: `Edgegap Server | Starting server on 0.0.0.0:7777.` and `Deployment '<id>' started ... 0 matched player(s)`.
3. Two clients connect to `<public_ip>:<external>` (the game's own connect UI, or the flags in §6). UnityTransport over UDP needs the IP, not the fqdn. Logs: `Edgegap Server | 2 player(s) connected.`
4. `edgegap_stop_deployment`, or close both clients and watch the server stop itself 30 s later. Nobody joining within 120 s also stops it.

UDP has no handshake you can probe with curl: prove the port with a real client.

## 6. Command-line test flags

Read by `EdgegapBootstrap` in builds; they override the settings asset. Useful for scripted two-client tests and for Edgegap's `UNITY_COMMANDLINE_ARGS` variable.

| Flag | Effect |
|---|---|
| `-edgegapConnect -edgegapAddress <ip> -edgegapPort <port>` | Connect directly on startup (plain `NetworkManager.StartClient`) |
| `-edgegapMatchmaker true\|false` | Matchmaker mode |
| `-edgegapMatchmakerUrl <url> -edgegapAuthToken <token>` | Matchmaker URL and Auth Token |
| `-edgegapProfile <name>` | Matchmaker profile |
| `-edgegapFindMatch` | Find a match as soon as the matchmaker is healthy |
| `-edgegapListenPort <port>` | Server listen port when not on Edgegap |
| `-edgegapQuitAfter <seconds>` | Quit after this long |

Example, two clients through the matchmaker with no clicks:
```bash
Game.exe -screen-fullscreen 0 -logFile c1.log -edgegapMatchmaker true -edgegapMatchmakerUrl <url> -edgegapAuthToken <token> -edgegapFindMatch -edgegapQuitAfter 150
```
Run it twice (games that key players on a saved id need a per-instance profile, `ngo.md` §6). Grep the logs for `Group.changed`, `Connecting to` and the game's connected state. Games with their own connection flow need the connect step in their terms; Boss Room's `Examples/BossRoom/EdgegapTestDriver.cs` adds `-edgegapConnect` through `ConnectionManager`, `-edgegapAutoReady <seat>` (pick a hero and lock in) and `-edgegapScreenshots <folder>` (a PNG every 10 s, which you can read to check the game really renders the match).

## 7. Free tier limits

One deployment at a time, 60-minute deployments, 2 apps, 2 versions, 10 GB registry, 1.5 vCPU / 3 GB per deployment, and the matchmaker stops 3 hours after each start.
