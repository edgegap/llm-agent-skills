# Troubleshooting: symptom → fix

| Symptom | Cause and fix |
|---|---|
| The server is Colyseus | Wrong skill: `edgegap-colyseus` has the Colyseus lifecycle, client port and verified Cocos sample. |
| Extension not listed in Extension Manager | Folder must be `extensions/edgegap-extension/` with `package.json` and `dist/` at its root (not a nested `edgegap-cocos-plugin-main/`); click refresh. Needs Cocos Creator 3.8+. |
| Panel: "Docker is not running or not installed" | Start Docker Desktop; the extension calls the `docker` CLI. |
| Panel: "not a quick-start token" / `403 This token is not a quick start token` | A regular API token: use **Get a token** (one-click sign-in), or fill in Project, Username and Token from the dashboard's Container Registry page. Headless: set the three `EDGEGAP_REGISTRY_*` variables. |
| Panel: "No Dockerfile in ..." | Server folder setting points elsewhere, or no Dockerfile: copy `assets/server/Dockerfile` (better than **Create Dockerfile**'s generic `npm start` starter). |
| Headless e2e: "Local container never answered" | The server doesn't listen on `PORT`, crashed at start (`docker logs`), or listens on `127.0.0.1` only. Bind `0.0.0.0`. |
| Deployment can't pull the image | The version has no or wrong registry login: sign out and in again and re-upload (extension), or the developer adds the credentials; check `registry_credentials_set: true`. |
| `exec format error` in deployment logs | Image built for ARM (Apple Silicon): rebuild with `--platform linux/amd64`. |
| Deployment errors right after start | Read `edgegap_get_deployment_logs`: usually the `CMD`, a missing dependency (`tsx` in devDependencies with `--omit=dev`), or a port mismatch between the server and the version. |
| Client: first connection fails or 502 right after the match is found | Normal for a few seconds: keep the retry in `GameSocket.connect` (10 × 1.5 s). |
| `wss://<ip>:<port>` fails TLS | Connect by the FQDN from the assignment or status, not the IP. |
| Browser: "Mixed Content" or `ws://` blocked | The page is `https`: use the deployment's `wss://` URL (port WS + TLS Upgrade). `ws://localhost` works only from `http` pages such as the Cocos preview. |
| Find Match: CORS error in the console | Add the page origin (scheme + host + port, e.g. `http://localhost:7456`) to `allowed_cors_origins`, then restart the matchmaker. |
| Find Match: `getConnectionUrl` throws | The port isn't named `gameport`, isn't WS, or TLS Upgrade is off. Fix the version (or `portName`). |
| Find Match: "Ticket expired before a match was found" | Not enough players within `ticket_expiration_period` (30 s): queue a second client or lower `min_team_size` (`edgegap-matchmaking`). |
| Find Match fails on a native or mini-game build only | The runtime may lack `fetch`/`AbortController` that `@edgegap/sdk` needs; check `typeof fetch` there (`client.md` §4). |
| Mini-game: "url not in domain list" style errors | The platform's domain allowlist; per-deployment hostnames can't be listed (`platforms.md`). DevTools can skip the check in development only. |
| Player refused "not in this match" | `REQUIRE_TICKET=1` and the client didn't send its `ticketId` in `hello`, or connected to a deployment it wasn't matched to. |
| Deployment never stops | `startLifecycle()` not called, `playerLeft()` never fires, or `selfStop()` missing at match end. Logs should show `[edgegap] deployment ...` at boot and `self-stop: ...` later. Max duration is the safety net. |
| Deployment restarts after a crash with nobody in it | `restart_policy` is the API default `always` (the extension doesn't set it): set `"never"` on the version. |
| Cocos web build stuck on splash during a test | Its tab is in the background (no frames): bring it to the front. |
| Headless Cocos build "fails" with exit code 36 | 36 is success; 32 = bad parameters, 34 = unexpected error. |
