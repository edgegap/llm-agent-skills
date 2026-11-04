# Package, containerize, register and deploy on Edgegap

Contents
1. Edgegap access and the MCP connection
2. Package the Linux server
3. Dockerfile and local container test
4. Registry push
5. App and app version
6. Direct test deployment
7. MCP tool caveats
8. Free tier limits

## 1. Edgegap access and the MCP connection

- **Account:** free at https://app.edgegap.com/auth/register (verify the email).
- **API token:** https://app.edgegap.com/user-settings?tab=tokens. Organization-wide and unscoped: never in files, code, git, the game or chat output. It is not the matchmaker auth token.
- **MCP:** first check whether `edgegap_*` tools already work (`edgegap_list_apps`). If this skill came with the `edgegap` Claude Code plugin, the plugin asks for the token. Otherwise the developer runs, in their own terminal:
  ```bash
  claude mcp add --transport http edgegap https://mcp.edgegap.dev/mcp -H "Authorization: token <YOUR_EDGEGAP_API_TOKEN>" --scope user
  ```
  and restarts the session. "does not contain an Edgegap API token" almost always means `token token <uuid>` (the pasted value already had the prefix).

## 2. Package the Linux server

```bash
C:\UE5\Engine\Build\BatchFiles\RunUAT.bat BuildCookRun -project="<path>\<Project>.uproject" -noP4 -utf8output -unattended -nocompileeditor -server -noclient -serverplatform=Linux -serverconfig=Development -build -cook -stage -pak -archive -archivedirectory="<repo>\Packaged"
```

- Output: `Packaged/LinuxServer/` with `<Project>/Binaries/Linux/<Module>Server`, the generated `<Module>Server.sh`, and `.debug`/`.sym` files (~1.6 GB) that don't belong in the image.
- `Development` keeps useful logs; use `Shipping` only for release builds.
- `-nocompileeditor` assumes the project's editor target is already built (Phase 1 check). The Visual Studio compiler pin isn't needed here: the Linux server compiles with the clang toolchain.
- Success ends with `BUILD SUCCESSFUL` / `AutomationTool exiting with ExitCode=0`. Failures: search the log for `error:` (clang) or `Error:` (cook).
- Repackage when server code or server maps change; client-only changes (the matchmaker subsystem) don't need a new server image.

## 3. Dockerfile and local container test

Copy `assets/docker/Dockerfile` and `assets/docker/.dockerignore` to the repo root and replace `<Project>` and `<Module>`. What it encodes, each learned the hard way:

| Line | Why |
|---|---|
| `FROM ubuntu:22.04` + `ca-certificates` | HTTPS for the self-stop call. |
| non-root `useradd` + `USER server` | Unreal refuses to run as root. |
| `CMD ["/app/<Project>/Binaries/Linux/<Module>Server", "<Project>", …]` | Run the binary directly. The generated `<Module>Server.sh` doesn't `exec`, so the shell stays PID 1 and swallows the SIGTERM Edgegap sends on stop. |
| `-log -port=7777` | Fixed internal port matching the app version. |
| `-stdout -FullStdOutLogOutput` | Without them stdout is block-buffered in a container and Edgegap deployment logs stay empty or stale. |
| `.dockerignore` keeps only `Packaged/LinuxServer`, minus `*.debug`/`*.sym` | Small build context and image (~480 MB compressed instead of 2 GB+). |

Build and test locally:

```bash
docker build --platform linux/amd64 -t registry.edgegap.com/<registry-project>/<image>:<tag> .
docker run -d --name ue-test -p 7777:7777/udp registry.edgegap.com/<registry-project>/<image>:<tag>
docker logs ue-test          # expect "IpNetDriver listening on port 7777" and "Not started by the Edgegap matchmaker"
docker stop ue-test          # must return within ~1 s (SIGTERM handled); then docker rm ue-test
```

To check the self-stop path without Edgegap, run with `-e MM_MATCH_ID=test`: the log shows `Started by the Edgegap matchmaker`.

From Git Bash on Windows, prefix `docker run` commands that pass a container path with `MSYS_NO_PATHCONV=1`, or `/app/...` is rewritten into a Windows path.

## 4. Registry push

- The developer runs `docker login registry.edgegap.com` with the username and token from the dashboard **Container Registry** page (or you use `edgegap_get_registry_credentials` when it returns them). Never put that token in files.
- The registry project name is on the same page; images are `registry.edgegap.com/<registry-project>/<image>:<tag>`.
- **A new tag for every build**, with a new app version pointing at it: a UTC timestamp `YYYYMMDD-HHMM` (e.g. `20261022-1430`, from `date -u +%Y%m%d-%H%M`), the same string for the image tag and the app version name, so anyone can see when the server was last updated. Don't re-push a tag a version already uses: a host that already pulled that tag may keep running its cached image, and you can't tell which build ran.
- `edgegap_list_registry_tags` with the image name only (no project prefix) confirms the push.

## 5. App and app version

`edgegap_list_apps` first; `edgegap_create_app` only if none fits. Then `edgegap_create_app_version`:

| Field | Value |
|---|---|
| `docker_repository` / `docker_image` / `docker_tag` | `registry.edgegap.com` / `<registry-project>/<image>` / the new tag |
| `ports` | `[{ "name": "gameport", "port": 7777, "protocol": "UDP" }]` (Unreal's IpNetDriver is UDP) |
| `cpu_units` / `memory_mb` | `1024` / `2048` for a small map; raise for large worlds or many players |
| `max_duration_minutes` | e.g. `60` for tests, so a forgotten server ends on its own |

The **registry credentials** must be on the version, or deploys fail with "Unable to pull image". For registry.edgegap.com you add none: `edgegap_create_app_version` sends `registry_profile: "Edgegap"` when you leave `registry_username`/`registry_token` out (MCP 0.17.0+), and Edgegap pulls with the organization's own registry login. `edgegap_list_app_versions` must show `registry_credentials_set: true`.

`edgegap_validate_server_config` checks the Dockerfile text against the planned ports and resources before you build. Use it.

## 6. Direct test deployment

1. `edgegap_deploy` (near the developer) → `edgegap_wait_for_deployment` → note `public_ip` and the external port of `gameport`.
2. `edgegap_get_deployment_logs`: `listening on port 7777`, then `Not started by the Edgegap matchmaker` (correct for a direct deploy).
3. Client console: `open <public_ip>:<external port>` → `Welcomed by server`.
4. `edgegap_stop_deployment` with the exact request ID.

## 7. MCP tool caveats

- `edgegap_generate_dockerfile` for Unreal launches the generated `.sh` script and accepts only a plain file name as executable. Prefer `assets/docker/Dockerfile`; still run `edgegap_validate_server_config` on it.
- `edgegap_get_deployment_logs` over ~50k characters is saved to a file; search it for `LogEdgegap`, `Join succeeded`, `listening on port`.
- Deployment logs disappear when the deployment stops unless the version has endpoint storage configured.

## 8. Free tier limits

One deployment at a time, 60-minute max duration, and the free matchmaker runs on a shared cluster that restarts every few hours (its URL can stop resolving; recreate or restart it from the dashboard). A forgotten test deployment blocks the matchmaker from starting another.
