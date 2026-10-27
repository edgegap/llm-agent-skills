# Troubleshooting a Colyseus game on Edgegap

Find the layer first: image → deployment → client ↔ server → matchmaker.

## Image and deployment

| Symptom | Cause / fix |
|---|---|
| `exec format error` in the deployment log | image built for ARM (Apple Silicon): rebuild with `--platform linux/amd64` |
| Deployment fails to pull | registry credentials missing on the app version, or wrong tag. `edgegap_list_app_versions` → `registry_credentials_set`; `edgegap_list_registry_tags` |
| `Cannot find module 'tsx'` / `ERR_MODULE_NOT_FOUND` | `tsx` is in devDependencies; `NODE_ENV=production npm ci` skips them. Move it to `dependencies`, or compile with `tsc` in the build and run `node lib/index.js` |
| Server ignores SIGTERM, deployment takes long to stop | Node isn't PID 1: `CMD npm start`, a shell form `CMD`, or PM2. Use the exec form `CMD ["node", ...]` |
| Deployment keeps running after everyone left | `playerJoined`/`playerLeft` not wired in every room, or `startLifecycle()` never called. Look for the `[edgegap] deployment ...` boot line |
| Stops while a player is still connected | `playerLeft()` called on a drop that later reconnected (`allowReconnection`): `server.md` §3 |
| `self-stop request: HTTP 4xx` | the module then exits the process, which also ends the deployment. Check the delete URL and token are the injected ones, not overridden on the app version |
| Crash: `EADDRINUSE` or the port isn't reachable | the app version's internal port differs from `PORT` (default 2567), or the server listens on `localhost` |

## Client ↔ server

| Symptom | Cause / fix |
|---|---|
| **502** on the first join, a few seconds after `HOST_ASSIGNED` or after the deployment turned running | normal on a fresh deployment: retry the join (10 × 2 s) — `references/clients.md` |
| TLS / certificate error | connecting to `wss://<ip>:<port>`: use the FQDN. Or TLS Upgrade is off on the port |
| Browser: mixed content blocked | `ws://` from an `https` page: TLS Upgrade on, `wss://` |
| Connection refused on `wss://<fqdn>:2567` | using the internal port: clients use the **external** port from the deployment or the assignment |
| Matchmake HTTP works but the WebSocket fails (or the reverse) | port protocol is not WS (e.g. UDP), or a proxy in the client's network. One WS port with TLS Upgrade carries both, verified |
| `/` or `/monitor` reachable on a deployment | playground/monitor still mounted on Edgegap: guard them with `onEdgegap` |
| Players land in different rooms on one server | each client called `create` instead of `joinOrCreate`, or the room's `maxClients` is below the match size |

## Matchmaker

| Symptom | Cause / fix |
|---|---|
| Browser: CORS error on `POST /tickets` | the page origin (scheme + host + port) isn't in `allowed_cors_origins`. Edit the config: Stop → Edit → Start |
| 401 | wrong Auth Token, or `Bearer `/`token ` was added: send it raw |
| 400 on create | profile name doesn't exist in the config, or attributes the rules don't expect (a `latencies` rule needs beacon pings) |
| 404 polling the ticket | polling `/memberships/{id}` (old MCP hint): use `GET /tickets/{id}` |
| Two players stuck `SEARCHING` until their tickets expire | `ticket_expiration_period` is long (e.g. `5m`), so the partial match waits until expiry. Set it to `30s`; don't add an expansion for this (expansions cost the matchmaker a lot of performance), as in `assets/matchmaker/casual.json` |
| One player alone never matches | expected: the template needs 2 players. Open two clients (different engines are fine) |
| `MATCH_FOUND` then back to searching, or tickets cancelled | the deployment failed: free tier allows one deployment at a time (stop leftovers), registry credentials, bad tag. Test a direct deployment first |
| Matchmaker URL stopped answering | free tier stops the matchmaker 3 hours after each start: Start it again |

Inspect live state with `"inspect": true`: `GET <url>/inspect/tickets` and `/inspect/matches` with the Auth Token. Turn it off before launch.

## Repository

| Symptom | Cause / fix |
|---|---|
| `Filename too long` cloning a repo with a GameMaker client on Windows | `git config --global core.longpaths true`, then clone or `git checkout` again |
| Every file shows as modified after cloning on Windows | `core.autocrlf` rewrote line endings: in a fresh clone with no local work, `git config core.autocrlf false`, then `git checkout .` |
