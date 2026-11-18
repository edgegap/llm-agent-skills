# Troubleshooting browser connections

A failed WebSocket gives the page's script nothing but `close` code `1006`. The browser console (F12) has the cause. The messages below were copied from Chrome 157 and Edge 157 on Windows (2026-11-18), with the address changed to an example. Firefox: not captured.

| Console message | Cause | Fix |
| --- | --- | --- |
| `Mixed Content: The page at 'https://…' was loaded over HTTPS, but attempted to connect to the insecure WebSocket endpoint 'ws://example.com/'. This request has been blocked; this endpoint must be available over WSS.` and the page script gets `SecurityError: Failed to construct 'WebSocket': An insecure WebSocket connection may not be initiated from a page loaded over HTTPS.` (thrown by `new WebSocket`) | `ws://` from an `https` page | `wss://<host>:<external port>` and TLS Upgrade on the WS port |
| `Mixed Content: … 'ws://192.168.1.50:7777/'. This endpoint should be available via WSS. Insecure access is deprecated.` then `WebSocket connection to 'ws://192.168.1.50:7777/' failed: Error in connection establishment: net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` | `ws://` to a private-network address from an `https` page | test a local server from `http://localhost`; online, use the deployment's `wss://` address |
| `WebSocket connection to 'wss://203.0.113.10:31504/' failed: Error in connection establishment: net::ERR_CERT_COMMON_NAME_INVALID` | certificate doesn't match the address: usually the deployment's IP was used | use the deployment's host name (`<id>.pr.edgegap.net`) with the same external port |
| `WebSocket connection to 'wss://…:31504/' failed: Error in connection establishment: net::ERR_SSL_PROTOCOL_ERROR` | the port answered without TLS | app version port: protocol `WS`, TLS Upgrade on; new deployment |
| `WebSocket connection to 'wss://…:7777/' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED` | wrong port (internal `7777` instead of the external one), or nothing listening yet | the **external** port of `gameport`, new for each deployment; retry for a few seconds after Ready; check logs for `listening on 0.0.0.0:7777` |
| `TypeError: Cannot read properties of undefined (reading 'rawintegrationparameters_new')` | Rapier used before `init()` resolved | `await RAPIER.init()` first |

Opening `https://<host>:<port>/health` in a tab shows the same certificate, TLS or connection error as a page, which is easier to read for non-developers.

Older Chromium builds (the in-app browser of some desktop apps) log `WebSocket connection to '…' failed:` with nothing after the colon; the cause is then only visible on the `https://` health page.

Other symptoms:

| Symptom | Cause → fix |
| --- | --- |
| Own player rubber-bands constantly | Server and client run different physics code or tuning (stale server build after editing `shared/`), or the client sends inputs faster than the server tick. Rebuild the server; send one input per fixed client tick. |
| Input round trip high even on localhost | Server input queue too deep: cap it at ~4 inputs. |
| Others stutter | Rendering snapshots on arrival instead of interpolating by server tick ~100 ms in the past (`prediction.md` §4). |
| Image pull fails on Edgegap after a local build | Docker Desktop pushed an attestation index: rebuild with `--provenance=false --sbom=false`. |
| `docker push` → `401 Unauthorized` | Stale or wrong-project registry login: log in again with the dashboard's Container Registry credentials. |
| Deployment keeps running with nobody connected | Look for `no players: stopping in …` and `self-stop request: HTTP 200` in the logs; a hidden tab with a live socket counts as a player until it leaves. |
| WASM file 404 or wrong MIME on the static host | A non-compat build: serve the `.wasm` with `application/wasm`, or switch to the compat package (`wasm-in-containers.md` §1). |
