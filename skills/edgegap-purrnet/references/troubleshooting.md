# Troubleshooting PurrNet on Edgegap

Contents
1. Server
2. Connection
3. Matchmaker
4. Build, SDK and Docker

Get evidence first: the Unity build log, `docker logs`, `edgegap_get_deployment_logs` (only while the deployment runs), the client Player.log.

## 1. Server

| Symptom | Cause / fix |
|---|---|
| Players connect but the world is empty (no spawned resources, enemies, timers) | Server setup lives in an `[ObserversRpc]` without `runLocally: true`, so it never runs on a dedicated server (`purrnet.md` §3) |
| Server starts twice, or a build client connects to `127.0.0.1` by itself | PurrNet auto start still on: `EdgegapBootstrap` must be in the project (it calls `NetworkManager.DisableFlags()` in builds) |
| `No PurrNet NetworkManager in the scene` | The first scene has no NetworkManager, or the server build's scene list is wrong |
| `Transport is X, not UDPTransport: port not set` | Another transport: adapt the `NETCODE ADAPTER` regions (`purrnet.md` §2) |
| Never stops after players leave | A connection is still open (a client in the background), or the `Edgegap` object was destroyed; it must be `DontDestroyOnLoad` (the bootstrap does this) |
| Stops after 120 s during manual testing | `FirstPlayerTimeoutSeconds`: connect sooner or raise it on `EdgegapSettings` |
| Self-stop fails with a certificate error | Base image without CA certificates: use the plugin's Dockerfile, which installs them |
| High CPU on an idle server | Something raises `Application.targetFrameRate` after the lifecycle sets 60 |
| Ready, then restarts or OOM | Crash in server code (read logs before stopping), scene missing from Build Settings, memory too low |

## 2. Connection

In order:
1. Logs show `Starting server on 0.0.0.0:7777` and no crash.
2. App version internal port = `ListenPort` = `UDPTransport.serverPort`; protocol **UDP**.
3. Client uses the **external** port and `public_ip` (or the `fqdn`).
4. A connect loop that gives up instantly: PurrNet's `StartClient` is async and `clientState` reads `Disconnected` for a few frames (`purrnet.md` §4). The templates handle it; custom code must too.
5. `Assignment has no port named 'gameport'`: port name mismatch.
6. A fresh deployment can need up to ~1 minute; the matchmaking client retries 10 times, 2 s apart.
7. Networks that block UDP (some corporate or school networks, VPNs): test from another network.
8. Client builds still running PurrNet's Editor-style host flow: only the Editor keeps it, and only when **Apply In Editor** is off.

## 3. Matchmaker

| Symptom | Cause / fix |
|---|---|
| 400 on every ticket, Unity before 2022.3 | SDK older than 3.5.6 (§4) |
| 400 on tickets, Unity 2022.3+ | Profile name or attributes don't match the config |
| 401 | Wrong Auth Token, or a `Bearer`/`token` prefix |
| Matchmaker deploys another game's server | The wrong `matchmaker-config.json` was uploaded: give the full path, check `application.name` |
| Two players stay `SEARCHING` until their tickets expire, then match | `ticket_expiration_period` is long (e.g. `5m`), so the partial match waits until expiry (`matchmaker.md` §6). Set it to `30s`; don't add an expansion for this (expansions cost the matchmaker a lot of performance) |
| A lone player waits ~5 minutes | `ticket_expiration_period` is `5m`: a lone ticket may only match near expiry on matchmaker 3.3.2. Set it to `30s`, or test with two clients |
| Flips MATCH_FOUND ↔ SEARCHING | Free tier's one deployment is busy (stop test deployments), or the version can't deploy (registry credentials; do a direct deploy) |
| New build not used | `application.version` not updated (Stop → Edit → Start) |
| OFFLINE | Free-tier 3-hour shutdown: restart |

## 4. Build, SDK and Docker

| Symptom | Cause / fix |
|---|---|
| Unity before 2022.3: every matchmaker POST gets HTTP 400 | SDK 3.5.5 and older send JSON through `UnityWebRequest.Post(url, string)`, which form-encodes it on old Unity. Use `https://github.com/edgegap/edgegap-unity-sdk.git` with no `#tag` (the latest SDK; 3.5.6+ sends it raw). If the project embedded and hand-patched an older SDK (`Packages/com.edgegap.unity-sdk`), delete that folder and use the git package so later updates apply |
| `type or namespace 'Edgegap'` / `'PurrNet'` not found | asmdef missing references to `Edgegap.SDK` or PurrNet's runtime asmdef |
| Settings asset shows "missing script" | `EdgegapSettings.cs.meta` wasn't copied with the script; copy it, or recreate the asset with **Assets → Create → Edgegap → Settings** in `Assets/Edgegap/Resources/` |
| `No Resources/EdgegapSettings asset, using defaults` | The asset isn't in a `Resources` folder or isn't named `EdgegapSettings` |
| Linux toolchain/sysroot errors on Windows | Add `com.unity.toolchain.win-x86_64-linux` |
| Batch build refuses to start | Project open in the Editor: close it or build from the menu |
| `COPY failed ... Builds/EdgegapServer` | Build the server first; run `docker build` from the project root |
| `exec format error` on Edgegap | Rebuild with `--platform linux/amd64` |
| `Unable to pull image from registry` | No registry credentials on the app version |
