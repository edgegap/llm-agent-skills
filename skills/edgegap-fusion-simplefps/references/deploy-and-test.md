# Setup, builds, deployment and the two-client test

Run the commands from the Simple FPS project root, in Git Bash on Windows, with the editor closed on the project.

## 1. Unity modules and packages

- Unity Hub modules: **Linux Build Support (IL2CPP)**, **Linux Dedicated Server Build Support**, and **Windows Build Support (IL2CPP)** for clients (which needs Visual Studio's C++ workload).
- Unity 6000.3 on Windows: `com.unity.toolchain.win-x86_64-linux` and `com.unity.sdk.linux-x86_64` (1.1.0). Without the SDK, the build stops with `No Linux sysroot found for x64`. Older Unity on Windows: `com.unity.toolchain.win-x86_64-linux-x86_64`.
- That error also showed up intermittently with both packages present: 2 builds out of 7 on the same project, with no change between a failed build and the next, successful one. Build again. `scripts/package.sh` refuses to package a build whose `edgegap-build.txt` doesn't say `result=Succeeded`, so a stale binary never gets pushed.
- Simple FPS 2.1.1 targets Unity 6000.3.18f1. It ran on 6000.3.11f1.

## 2. Setup and builds

```bash
scripts/build.sh setup      # swap components, Join card fields, build profile
scripts/build.sh server     # check + setup + Linux IL2CPP Server -> Builds/EdgegapServer/ServerBuild
scripts/build.sh client     # setup + Windows IL2CPP client -> Builds/Client/SimpleFPS.exe
```

Each run writes `Builds/<what>.log` and prints the `[Edgegap Simple FPS]` lines. A preflight problem prints the fix and exits 1 before building. Times measured: server about 13 minutes the first time, 1 to 2 minutes for an incremental build; client about 12 minutes the first time.

`edgegap-build.txt` next to each build records the target, subtarget, backend, scenes and result. The server must show `subtarget=Server`, `backend=IL2CPP` and `scenes=Assets/Scenes/Startup.unity,Assets/Scenes/Deathmatch.unity`. A client folder with `GameAssembly.dll` is IL2CPP. One with `MonoBleedingEdge` is Mono, or was built as a server.

Building the Server subtarget leaves the editor on it, which turns the next player build into a headless server. The kit's builder puts the previous subtarget back.

## 3. Image and local test

```bash
scripts/package.sh                 # simplefps-edgegap:local, linux/amd64, about 400 MB
scripts/run-local.sh               # ARBITRIUM_REQUEST_ID=f68e011bfb01, follows the log
scripts/test-clients.sh f68e011bfb01.pr.edgegap.net <region from the log>
```

Expected server log:

```
[edgegap-simplefps] deployment=f68e011bfb01 public=?:? internal=7777/udp
[edgegap-simplefps] server started: session=f68e011bfb01.pr.edgegap.net photon_region=cae bind=0.0.0.0:7777/udp
```

Expected clients: `CT=Relayed ... players=2 ... runnerScene=Deathmatch#1`, `exceptions=0`. Relayed is normal here. Fusion finds the host's NAT address, and a client on the same machine can't loop back through it.

## 4. Edgegap

1. `docker login registry.edgegap.com` (the developer, with the Container Registry credentials from the dashboard), then `scripts/package.sh registry.edgegap.com/<project>/simplefps`. It tags with the UTC time, `YYYYMMDD-HHMM` (e.g. `20261022-1430`); use the same string as the app version name, so anyone can see when the server was last updated. A new tag per build, never `latest`.
2. `edgegap_create_app` once, then `edgegap_create_app_version`:
   - image `registry.edgegap.com` / `<project>/simplefps` / the tag
   - `cpu_units` 1024, `memory_mb` 2048
   - ports `[{"name": "gameport", "port": 7777, "protocol": "UDP", "to_check": false}]`
   - `max_duration_minutes` 60 for tests
   - optional env `PHOTON_REGION` to fix the region for every deployment of the version
3. No registry login: leave it out and the tool sends `registry_profile: "Edgegap"` (MCP 0.17.0+). Same for every new version. Check `registry_credentials_set: true`.
4. `edgegap_deploy` with the players' public IPs and a tag such as `simplefps-e2e`, then `edgegap_wait_for_deployment` (FQDN, public IP, external port). The deployment was ready in about 5 seconds.
5. `edgegap_get_deployment_logs`: read the `server started` line for the session and region. Read logs before stopping: they disappear with the deployment unless Endpoint Storage is set on the version.

## 5. The two-client test

```bash
scripts/test-clients.sh <fqdn> <region>
```

It starts two headless clients (`SimpleFPS.exe -batchmode -nographics -edgegapJoin <fqdn> -edgegapRegion <region> -logFile ...`). `PartyJoinDriver` types into the Join card fields, applying the fields' own limit and validation, and presses Join, like a player would. The script waits 60 seconds, closes them and prints one line per client. It exits 0 only if every client reports `players=<count>` and no exception.

Measured on Edgegap with the kit (Newark, `us`):

```
client 1: [probe] mode=Client CT=Direct rtt=11ms players=2 session=<fqdn> region=us runnerScene=Deathmatch#1 loaded=Startup#0,Deathmatch#1 | exceptions=0
client 2: [probe] mode=Client CT=Direct rtt=29ms players=2 session=<fqdn> region=us runnerScene=Deathmatch#1 loaded=Startup#0,Deathmatch#1 | exceptions=0
```

The server log shows `[Player:2] connected.` and `[Player:3] connected.` from `SimpleFPS.Gameplay:SpawnPlayer`, the probe with `players=2`, and no `Exception`.

Then `edgegap_stop_deployment` and `edgegap_list_deployments` with `only_agent_deployments: true`.

## 6. Not tested yet

The `PHOTON_REGION` override, more than two players, a match played to its end, whether the server process exits after a match (if it does, the start script stops the deployment), the CPU and memory a full match needs, macOS hosts, and the Edgegap Unity plugin's build button. The kit builds with `BuildPipeline` and its own Dockerfile.
