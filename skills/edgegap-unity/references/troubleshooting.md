# Troubleshooting: symptom → cause → fix

Work from the layer that failed. Always get evidence first (Unity build log, `docker logs`, `edgegap_get_deployment_logs`, browser console, client Player.log) before changing things.

## Unity / build
| Symptom | Cause / fix |
|---|---|
| `CS0234 ... Ping does not exist` in WebGL build | Edgegap SDK < 3.5.5. Use `https://github.com/edgegap/edgegap-unity-sdk.git` with no `#tag` (the latest SDK) |
| Unity before 2022.3: every matchmaker ticket (`POST /groups`) gets HTTP 400, the monitor GET works | SDK 3.5.5 or older sends the JSON through `UnityWebRequest.Post(url, string)`, which form-encodes it on old Unity. Drop the `#tag` from the SDK URL to get the latest (3.5.6+ sends it raw). If the project embedded and hand-patched an older SDK (`Packages/com.edgegap.unity-sdk`), delete that folder and use the git package so later updates apply. Hand-written ticket code with `UnityWebRequest.Post(url, json)` has the same bug: use `UploadHandlerRaw` with `Content-Type: application/json` |
| `The type or namespace 'UnityEditor' could not be found` in player build | an imported SDK sample (DeploymentAgent, MatchmakingServerHandler, RegionPicker, ServerBrowser) has unguarded `using UnityEditor;`. Wrap it in `#if UNITY_EDITOR`, or delete samples you don't use |
| `type or namespace 'Edgegap' could not be found` | SDK not installed, or your scripts are in an asmdef that doesn't reference `Edgegap.SDK`. IDE-only: Preferences → External Tools → enable Git packages → Regenerate project files |
| "Edgegap requires Json.NET" warning, JSON silently empty | install `com.unity.nuget.newtonsoft-json` |
| `Linux Build Support is missing` / build target unsupported | add Linux Build Support + Linux Dedicated Server modules in Unity Hub; restart Unity |
| Linux toolchain/sysroot errors on Windows | add `com.unity.toolchain.win-x86_64-linux` (and `com.unity.sdk.linux-x86_64`) packages; Unity 6000.0 had a duplicate-toolchain bug, so try 6000.3+ if stuck |
| batchmode build exits "another Unity instance is running" | project open in the Editor: close it or build from the menu |
| Build "succeeds" but server does nothing | no/wrong scenes in Build Settings, or network manager scene not first |
| OpenXR error on server build | disable OpenXR for the Linux/server target |

## Docker / registry
| Symptom | Cause / fix |
|---|---|
| `docker: command not found` / daemon not running | install/start Docker Desktop |
| `COPY failed ... Builds/EdgegapServer not found` | build the server first; run docker build from the project root; `.dockerignore` must not exclude `Builds/EdgegapServer` |
| `docker build requires exactly 1 argument` | whitespace in tag/path |
| push `401 Unauthorized` / `denied` | not logged in to registry.edgegap.com, or wrong project in the image path |
| `exceed the configured upper limit` | registry full (10 GB free): delete old tags in the dashboard |
| Local container exits immediately | `docker logs <id>`: missing `chmod +x`, wrong executable name (must match Dockerfile), crash on startup (often headless-unsafe code) |
| `exec format error` / segfault / "not found" | image built for ARM: rebuild with `--platform linux/amd64` |

## Edgegap deployment
| Symptom | Cause / fix |
|---|---|
| `Unable to pull image from registry` / 424 | app version has no registry credentials (needed even for registry.edgegap.com), wrong image path/tag |
| `verify_image` 400 "Unable to login with the given credentials" | registry credentials missing/wrong on the version |
| 422 can't allocate | resources too high for tier (free: 1.5 vCPU/3 GB) or location issue |
| Ready, then restarts repeatedly / OOM | crash in server code (read logs before stopping), memory too low, missing scene. Set restart policy Never to see the real exit |
| 100% CPU forever | server never started its netcode (auto-start off), or no `targetFrameRate` |
| Stopped after 60 min | free tier limit |
| No logs after stop | logs are deleted when the deployment stops: read them while it runs |
| `NullReferenceException` in `DeploymentEnvironmentDTO` | constructed without `ARBITRIUM_PORTS_MAPPING` (local run). Check `ARBITRIUM_REQUEST_ID` first, as the template does |

## Connection (client → server)
Checklist, in order:
1. Deployment is Ready and logs show the transport listening (not crashed).
2. Server listens on `0.0.0.0` (not 127.0.0.1/localhost IP binding) on the port in the app version's **internal** field. Fix a mismatch by editing/duplicating the version, with no rebuild needed.
3. App version protocol matches the transport (UDP for KCP/UTP/Tugboat, TCP for Telepathy, WS for web transports).
4. Client uses the **external** port and the right host (`public_ip` for UDP with UnityTransport; `fqdn` for WSS).
5. WSS client needs **TLS Upgrade** on the WS port; server log `First bytes from client was not 'GET' for handshake, instead was 16-03-01` = TLS Upgrade off.
6. Retry for up to ~1 min after Ready: Unity may still be initializing (the client template retries 10×).
7. VPN/firewall/corporate network blocking UDP: test from another network.
8. Server timed out and self-stopped before you connected (`FirstPlayerTimeoutSeconds`).
9. `Assignment has no port named 'gameport'`: port name mismatch between app version and `PortName`.

## Matchmaker
See `matchmaker.md` section 8. Most common: profile/attribute mismatch (400), a long `ticket_expiration_period` (two players wait until their tickets expire; use `30s`, not an expansion), CORS for WebGL, free-tier single deployment blocking matches (MATCH_FOUND ↔ SEARCHING), forgot to update `application.version` after a new build, matchmaker offline after 3 h.

## SDK behaviors that look like bugs
- First `CreateGroup` fails with "conflict, abandon and restart" → pass `abandon: true` (template does).
- Cancel right as a match is found → DELETE returns 409; resume polling with `ResumeMatchmaking(current, abandon: true)` or the player is stranded (template does).
- Assignment disappears ~30 s after HOST_ASSIGNED → SDK clears the group; read it in the callback.
- WebGL: every beacon reports 0 ms (no ICMP), so don't use latency rules for WebGL profiles.
- Matchmaker token header is raw (`Authorization: <token>`); adding "Bearer"/"token " gives 401.
