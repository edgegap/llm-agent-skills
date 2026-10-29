# The game server

## 1. What it needs

- A **headless mode** that starts listening on a fixed internal port with no player and no menu. Unity: a Linux Dedicated Server build (the Edgegap plugin's **Build server**, or `assets/unity/Editor/EdgegapPluginBuild.cs` from the command line). FishNet: leave *Start On Headless* off; `EdgegapServer` starts the server itself on `ListenPort` (7770).
- **No PlayFab secret, no Edgegap token.** Everything it needs comes from Edgegap's injected variables. If an old bridge passes `PLAYFAB_TITLE_SECRET` to the server, remove it, and have the developer rotate the key: every server log or crash dump was a place it could leak.
- **Self-stop.** An empty server keeps costing until its max duration. `assets/unity/EdgegapServer.cs` calls `DELETE $ARBITRIUM_DELETE_URL` with header `authorization: $ARBITRIUM_DELETE_TOKEN`:
  - when no player connects within 120 s (players gave up, or a duplicate deployment);
  - 30 s after the last player leaves;
  - from game code via `SelfStop("match over")`.
  Same idea for any engine: read the two variables, send the DELETE, and quit the process if it fails.

Variables available on Edgegap: `ARBITRIUM_REQUEST_ID`, `ARBITRIUM_PUBLIC_IP`, `ARBITRIUM_PORTS_MAPPING`, `ARBITRIUM_DELETE_URL`, `ARBITRIUM_DELETE_TOKEN`. `StartEdgegapDeployment` adds `PLAYFAB_MATCH_ID` and `PLAYFAB_QUEUE_NAME`. Never log the whole environment: it prints the delete token.

## 2. Unity specifics

`EdgegapServer` adds itself with `[RuntimeInitializeOnLoadMethod(AfterSceneLoad)]` when `IsServer` is true: a `UNITY_SERVER` build, or `-batchmode` without `-client`. Use `EdgegapServer.IsServer` to skip menus and client-only code on the server; don't use FishNet's `GetStartOnHeadless()` for that. It is `DontDestroyOnLoad`, so the online-scene load doesn't kill it. Its NETCODE ADAPTER (start the server, is it running, player count) is filled in for FishNet. For NGO, Mirror and PurrNet, swap those three lines; the netcode skills have them.

Logs it writes, useful in `edgegap_get_deployment_logs`: `Edgegap Server | Starting server on 0.0.0.0:7770.`, `… for PlayFab match <id>.`, `N player(s) connected.`, `Stopping deployment: <reason>.` Unity headless servers also log many `Shader … not supported` errors. Those are normal.

## 3. App version

- Port: name **`gameport`** (or set `EDGEGAP_PORT_NAME` on the function app), the internal port the server listens on, and its protocol (UDP for Tugboat, NGO UnityTransport, Mirror KCP, ENet; WS + TLS upgrade for WebGL transports).
- 0.5 vCPU / 1 GB for a small Unity server; max duration 60 minutes as a safety net.
- Registry credentials on the version (the developer pastes them from the dashboard's Container Registry page). Without them, deployments fail to pull.
- New build: push a new tag and `edgegap_update_app_version` → `docker_tag`. Running deployments keep the old image.

## 4. Optional: only let matched players in

The template doesn't check who connects. To lock a server to its match:
1. In `StartEdgegapDeployment`, add an env var with the members' PlayFab IDs (`PLAYFAB_PLAYER_IDS`, comma-separated; they are not secret).
2. The client sends its PlayFab `SessionTicket` in its connection payload.
3. The server must validate the ticket, which needs a secret. Either give the server a narrowly scoped path (an extra Azure Function `ValidatePlayer` that calls `Server/AuthenticateSessionTicket` and checks the ID is in the list, called with a per-deployment key), or accept the trade-off of trusting the client-reported PlayFab ID for casual games. Never put the title secret on the server for this.
