# Troubleshooting FishNet on Edgegap

Contents
1. Unity before 2022.3: every matchmaker ticket gets HTTP 400
2. Server
3. Connection
4. Matchmaker
5. Build and Docker

Get evidence first: the Unity build log, `docker logs`, `edgegap_get_deployment_logs` (only while the deployment runs), the browser console, the client Player.log.

## 1. Unity before 2022.3: every matchmaker ticket gets HTTP 400

SDK 3.5.5 and older send tickets with `UnityWebRequest.Post(url, string)`. Before Unity 2022.3 that overload form-encodes the string, so the JSON ticket arrives URL-encoded and the matchmaker answers 400 to every `POST /groups`, whatever the profile. The monitor call (a GET) still works, which makes it look like a config problem.

Fix: SDK **3.5.6** (released 2026-10-15) sends the body as raw bytes on older Unity versions. Set `"com.edgegap.unity-sdk": "https://github.com/edgegap/edgegap-unity-sdk.git"` (no `#tag`, so the latest SDK) in `Packages/manifest.json`.
- If the project embedded and hand-patched an older SDK (a `Packages/com.edgegap.unity-sdk` folder), delete that folder and use the git package instead, so later SDK updates apply.
- Hand-written ticket code has the same bug if it calls `UnityWebRequest.Post(url, jsonString)` on Unity before 2022.3: send `new UploadHandlerRaw(Encoding.UTF8.GetBytes(json))` with `Content-Type: application/json` instead.

The verified FishNet run used 3.5.5 with this exact change patched in; 3.5.6 ships the same change (checked in the SDK source) but has not been run end to end on Edgegap yet.

## 2. Server

| Symptom | Cause / fix |
|---|---|
| Server never listens, 100% CPU, clients time out | Start On Headless off and `AutoStartServer` off: nothing starts the server (`fishnet.md` §3) |
| "already started" / second start fails | Start On Headless on **and** `AutoStartServer` on, or a NetworkHudCanvas auto-starting in batch mode. Keep one starter |
| High CPU on an idle server | ServerManager **Frame Rate** set high (e.g. 500): lower it to 30-60 |
| Server never stops after players leave | The `Edgegap` object was destroyed by a scene change: add `EdgegapPersistence` (`fishnet.md` §4). Or a WebSocket probe or bot keeps a connection open |
| Self-stop fails with an SSL/certificate error | Base image without CA certificates: use the plugin's Dockerfile, which installs them |
| `NullReferenceException` in `DeploymentEnvironmentDTO` locally | Parsed without Edgegap variables; the template checks `ARBITRIUM_REQUEST_ID` first |
| Stops after 120 s during manual testing | `FirstPlayerTimeoutSeconds`: connect sooner, or raise it while debugging |
| Ready, then restarts or OOM | Crash in server code (read the logs before stopping), missing scene in Build Settings, memory too low |

## 3. Connection

In order:
1. Logs show `Starting server on 0.0.0.0:7770` and no crash.
2. App version internal port = `ListenPort` = transport port; protocol WS for Bayou, UDP for Tugboat.
3. Client uses the **external** port. Bayou: the `fqdn` with WSS on. Tugboat: `public_ip`.
4. Bayou + `wss` needs **TLS Upgrade** on the port; without it the TLS handshake bytes reach the server and it logs that the first bytes weren't `GET`.
5. Local tests: `ws://localhost:7770` with WSS **off**; a WSS client against a local plain server fails.
6. `Assignment has no port named 'gameport'`: the version's port name and `PortName` differ.
7. The client template retries 10 times, 2 s apart: a fresh deployment can need up to ~1 minute.
8. WebGL page served over HTTPS must use `wss`; mixed content blocks `ws`.

## 4. Matchmaker

| Symptom | Cause / fix |
|---|---|
| 400 on every ticket, Unity < 2022.3 | SDK older than 3.5.6 (§1) |
| 400 on tickets, Unity 2022.3+ | Profile name or attributes don't match the config (`matchmaker.md` §5) |
| 401 | Wrong Auth Token, or a `Bearer`/`token` prefix was added |
| CORS error in the browser | Origin missing from `allowed_cors_origins` |
| Two players stay `SEARCHING` until their tickets expire, then match | `ticket_expiration_period` is long (e.g. `5m`), so the partial match waits until expiry (`matchmaker.md` §3). Set it to `30s`; don't add an expansion for this (expansions cost the matchmaker a lot of performance) |
| A lone player waits ~5 minutes | `ticket_expiration_period` is `5m`: a lone ticket may only match near expiry on matchmaker 3.3.2 (`matchmaker.md` §3). Set it to `30s`, or test with two clients |
| Flips MATCH_FOUND ↔ SEARCHING | Free tier's one deployment is taken: stop leftover test deployments; check the version with a direct deploy |
| New build not used | `application.version` not updated in the matchmaker (Stop → Edit → Start) |
| OFFLINE | Free-tier 3-hour shutdown: restart it |
| Client calls the matchmaker although the game uses direct connection | `EdgegapMatchmakingClient` still enabled: the example bridge disables it in its `Awake` when the matchmaker toggle is off |

## 5. Build and Docker

| Symptom | Cause / fix |
|---|---|
| Batch build: licensing error with Hub signed in | Old 2021.3 patch: use a current 2021.3 LTS patch, or build from the Editor menu |
| `type or namespace 'Edgegap'` / `'FishNet'` not found | asmdef missing references to `Edgegap.SDK` or FishNet's runtime asmdef |
| WebGL `CS0234 ... Ping` | SDK older than 3.5.5 |
| WebGL page stuck loading from a static host | Enable Decompression Fallback (Gzip) |
| `COPY failed ... Builds/EdgegapServer` | Build the server first; run `docker build` from the project root |
| `exec format error` on Edgegap | Rebuild with `--platform linux/amd64` |
| `Unable to pull image from registry` | No registry credentials on the app version |
