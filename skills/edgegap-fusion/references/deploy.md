# Build, package and deploy

## 1. Unity modules and toolchain

- Unity Hub modules: **Linux Build Support (IL2CPP)** and **Linux Dedicated Server Build Support**. Add **Windows Build Support (IL2CPP)** for test clients, which also needs Visual Studio's C++ workload.
- The IL2CPP Linux build cross-compiles with Unity's toolchain packages (**Window > Package Manager > + > Add package by name**, or `Packages/manifest.json`):
  - Unity 6000.3 on Windows: `com.unity.toolchain.win-x86_64-linux` (1.1.0) **and** `com.unity.sdk.linux-x86_64` (1.1.0, the sysroot). With only the toolchain, the build fails with `No Linux sysroot found for x64`. If you add the older `com.unity.toolchain.win-x86_64-linux-x86_64` 2.0.x, Unity 6000.3 replaces it with `com.unity.toolchain.win-x86_64-linux`, but still needs the SDK package.
  - Older Unity versions on Windows: `com.unity.toolchain.win-x86_64-linux-x86_64`.
  - macOS hosts: the macOS toolchain for Linux x86_64. Not tested.
- The kit's preflight reports a missing `com.unity.toolchain.*` entry, but it doesn't check for the SDK package: watch for `No Linux sysroot found` in the build log.

## 2. Server build

```bash
scripts/build-server.sh
```

From Git Bash at the project root, it finds the editor from `ProjectVersion.txt` (or pass its path) and runs `Edgegap.BR200.Editor.BR200ServerBuilder.BuildFromCommandLine` with the log in `Builds/server-build.log`. The editor must be closed on that project. Run it in the background and watch for `[Edgegap BR200]` lines:
- `Succeeded: Builds/EdgegapServer/ServerBuild (Server, IL2CPP, 55.8 min)`.
- A preflight problem (scenes, backend, toolchain, App ID, Peer Mode) prints the fix and exits 1 before building.

The same build runs from **Tools > Edgegap BR200 > Build Linux Server**. The output folder is where the Edgegap Unity plugin's Containerize step looks. To build from the plugin instead, set its **Path To Dockerfile** to `edgegap/Dockerfile`.

## 3. Image

```bash
scripts/package.sh
```

This builds `br200-edgegap:local` for `linux/amd64` from `edgegap/Dockerfile`, which uses Ubuntu 22.04 and a non-root user. The image is about 430 MB with IL2CPP. The kit's `.dockerignore` sends only `Builds/EdgegapServer` and the start script to Docker, not the whole Unity project. With an argument, the script also tags and pushes:

```bash
scripts/package.sh registry.edgegap.com/<project>/br200
```

Without a tag argument the script uses the UTC time, `YYYYMMDD-HHMM` (e.g. `20261022-1430`). Use a new tag per build and the same string as the app version name, so anyone can see when the server was last updated. The developer logs in first (`docker login registry.edgegap.com`) with the Container Registry credentials from the dashboard.

## 4. Local test

```bash
docker run -d --name br200-local -p 7777:7777/udp -e ARBITRIUM_REQUEST_ID=f68e011bfb01 -e ARBITRIUM_PUBLIC_IP=127.0.0.1 -e ARBITRIUM_PORT_GAMEPORT_INTERNAL=7777 -e ARBITRIUM_PORT_GAMEPORT_EXTERNAL=7777 -e 'ARBITRIUM_DEPLOYMENT_LOCATION={"city": "Amsterdam", "latitude": 52.37, "longitude": 4.9}' -e BR200_MAX_PLAYERS=4 br200-edgegap:local
```

`scripts/run-local.sh` does the same interactively. Check the log for the `[edgegap-br200]` boot lines, then `StartGame() Result: ... Ok:True` and `Server#0 started`. Join two clients with session `f68e011bfb01.pr.edgegap.net` and region `eu` (§5). Expect `players=2`, no exceptions, and CT **Relayed**, a local-only artifact (`fusion.md` §2).

## 5. Test clients

```bash
"<Unity>" -batchmode -nographics -quit -projectPath "<project>" -executeMethod FusionTestClientBuild.Build -logFile client-build.log
```

This produces a Windows IL2CPP client in `Builds/TestClient/Client.exe` in about 6 minutes. Check that `GameAssembly.dll` is next to it. A `MonoBleedingEdge` folder means a Mono or server-subtarget build, and Mono clients hit the RPC error. Run two clients with the flags in `br200.md` §4.

## 6. Edgegap

1. `edgegap_create_app` (once) and `edgegap_create_app_version`:
   - image `registry.edgegap.com` / `<project>/br200` / the new tag, 1024 CPU units and 2048 MB to start.
   - port `{"name": "gameport", "port": 7777, "protocol": "UDP", "to_check": false}`, max duration 60 for tests.
   - optional `BR200_*` env vars, such as `BR200_MAX_PLAYERS`.
   - No registry login: leave it out and the tool sends `registry_profile: "Edgegap"`, so Edgegap pulls with the organization's registry login. Same for every new version.
   - Restart policy `never` (dashboard or API: `restart_policy`) lets the deployment end when BR200 exits. The kit also calls the self-stop URL.
2. `edgegap_deploy` with the players' public IPs, a test tag, and per-match env (`BR200_MODE=battleRoyale`, `BR200_REGION`, ...).
3. `edgegap_wait_for_deployment` gives the FQDN (the session name), the public IP and the external port.
4. `edgegap_get_deployment_logs`: the first lines are `[edgegap-br200] deployment=… bind=0.0.0.0:7777/udp public=…` and `photon_region=…`, then BR200's `StartGame() Result: … Ok:True`.
5. Clients: §5 with that FQDN and region. Pass: CT Direct, `players=2`, no exceptions.
6. Logs disappear when the deployment stops unless Endpoint Storage is set on the version, so read them before stopping.
7. `edgegap_stop_deployment` for anything still running. Check `edgegap_list_deployments` with `only_agent_deployments: true`.
