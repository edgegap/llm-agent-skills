# Troubleshooting NGO on Edgegap

Contents
1. Server
2. Connection
3. Matchmaker
4. Build, SDK and Docker

Get evidence first: the Unity build log, `docker logs`, `edgegap_get_deployment_logs` (only while the deployment runs; ask for a large `max_characters`, because shader warnings fill the start), the client Player.log or `-logFile`.

## 1. Server

| Symptom | Cause / fix |
|---|---|
| `Edgegap Server | Starting server` never appears | `AutoStartServer` is off and the game's own headless start didn't run, or no `NetworkManager` ever loads in the server's scenes |
| Server started twice / `StartServer failed` | The game also starts a server headless: keep one (`AutoStartServer = false`, or remove the game's call) |
| `The NetworkManager has no UnityTransport` | Another transport: adapt both `NETCODE ADAPTER` regions |
| Boss Room-style server throws `Could not find port mapping` locally | The original `EdgegapServerStarter` needs `ARBITRIUM_PORT_GAMEPORT_INTERNAL`; use `Examples/BossRoom/EdgegapServerStarter.cs`, which falls back to `ListenPort` |
| Hundreds of `Shader ... not supported on this GPU`, `No mesh data available` | Normal on a Dedicated Server build. Ignore |
| `NullReferenceException` in animation/visual code on the server | Client-only code on server objects (`ngo.md` §5). Harmless if play works; guard with `IsClient` when it spams |
| Never stops after players leave | A client is still connected (one in the background), or the `Edgegap` object was destroyed (it must be `DontDestroyOnLoad`; the bootstrap does this) |
| Stops after 120 s during manual testing | `FirstPlayerTimeoutSeconds`: connect sooner or raise it on `EdgegapSettings` |
| Self-stop fails with a certificate error | Base image without CA certificates: use the plugin's Dockerfile |

## 2. Connection

In order:
1. Server logs show `Starting server on 0.0.0.0:<port>` with the app version's internal port, and no crash.
2. App version port protocol is **UDP** and named `gameport` (or `PortName`).
3. The client uses the deployment's **public IP** and the **external** port. UnityTransport over UDP doesn't resolve `*.pr.edgegap.net` names.
4. Approval rejects the client: `ServerFull`, `LoggedInAgain` (two local copies share a player id, `ngo.md` §6), `IncompatibleBuildType` (debug client vs release server, `ngo.md` §2).
5. A game with a `ConnectionManager` that stays "offline" after a matchmaker connect: the adapter called `NetworkManager.StartClient()` directly. Use the game's connect method (`ngo.md` §4).
6. `Assignment has no port named 'gameport'`: port name mismatch.
7. A fresh deployment can need up to ~1 minute; the matchmaking client retries 10 times, 2 s apart.
8. Networks that block UDP (some corporate or school networks, VPNs): test from another network.

## 3. Matchmaker

| Symptom | Cause / fix |
|---|---|
| Two players stay `SEARCHING` until their tickets expire, then match | `ticket_expiration_period` is long (e.g. `5m`), so the partial match waits until expiry (`matchmaker.md` §6). Set it to `30s`; don't add an expansion for this (expansions cost the matchmaker a lot of performance) |
| 400 on tickets | Profile name or attributes don't match the config (or Unity before 2022.3 with SDK 3.5.5, §4) |
| 401 | Wrong Auth Token, or a `Bearer`/`token` prefix |
| `abandon failed (not found)` in the client log | The group expired or was removed before the client cancelled; harmless |
| Matchmaker deploys another game's server | The wrong `matchmaker-config.json` was uploaded: give the full path, check `application.name` |
| Flips MATCH_FOUND ↔ SEARCHING | Free tier's one deployment is busy (stop test deployments), or the version can't deploy (registry credentials; do a direct deploy) |
| New build not used | `application.version` not updated (Stop → Edit → Start) |
| OFFLINE | Free-tier 3-hour shutdown: restart |

## 4. Build, SDK and Docker

| Symptom | Cause / fix |
|---|---|
| `The type or namespace name 'Matchmaker' does not exist in the namespace 'Unity.Services'` | Leftover UGS Matchmaker code without `com.unity.services.matchmaker`. With Edgegap's matchmaker it isn't needed: remove that code |
| Unity before 2022.3: every matchmaker POST gets HTTP 400 | SDK 3.5.5 form-encodes JSON there. Use the SDK git URL with no `#tag` (the latest; 3.5.6+ fixes it) |
| `type or namespace 'Edgegap'` / `'Unity.Netcode'` not found | The scripts sit in an asmdef without references to `Edgegap.SDK`, `Unity.Netcode.Runtime` and `Unity.Networking.Transport`; or the SDK isn't in `Packages/manifest.json` |
| Settings asset shows "missing script" | `EdgegapSettings.cs.meta` wasn't copied with the script; copy it, or recreate the asset with **Assets → Create → Edgegap → Settings** in `Assets/Edgegap/Resources/` |
| `No Resources/EdgegapSettings asset, using defaults` | The asset isn't in a `Resources` folder or isn't named `EdgegapSettings` |
| `com.edgegap.unity-servers-plugin` and the SDK both installed | Expected: the plugin is the Editor build/push/deploy tool, the SDK holds matchmaking and self-stop. They coexist (verified on Unity 6000.0.54f1) |
| Plugin's **Containerize** step is very slow or the image is huge | No `.dockerignore` in the project root: Docker sends the whole project. Copy `assets/docker/.dockerignore` |
| Plugin's local container: clients can't reach `127.0.0.1:7777` | Default run parameters `-p 7777/udp` map a random host port: set `-p 7777:7777/udp` |
| Plugin's local container exits after 2 minutes | The mock env makes the server act as on Edgegap (120 s no-player self-stop): connect sooner, or **Terminate** and redeploy |
| `Unable to login with the given credentials` when saving a version | Stale registry login on that version: re-enter it from the Container Registry page |
| Linux toolchain/sysroot errors on Windows | Add `com.unity.toolchain.win-x86_64-linux-x86_64` |
| Batch build refuses to start | Project open in the Editor: close it or build from the menu |
| First batch import seems stuck at `Package Manager log level set to [2]` | Resolving git packages and importing: wait (10+ minutes on large projects), read the log for `error CS` |
| `COPY failed ... Builds/EdgegapServer` | Build the server first (plugin **Build server**); run `docker build` from the project root |
| `exec format error` on Edgegap | Rebuild with `--platform linux/amd64` |
| `Unable to pull image from registry` | No registry credentials on the app version |
