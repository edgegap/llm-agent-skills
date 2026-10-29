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

## 4. Only let matched players in

`StartEdgegapDeployment` passes the match's join tokens in the hidden variable `EDGEGAP_JOIN_TOKENS` (comma-separated, one per member), and `EdgegapDeploymentReady` writes each player's own token next to the address. The server needs no secret to check them:

1. Read `EDGEGAP_JOIN_TOKENS` at startup. If it is missing (Editor, local container), admit everyone and log a warning.
2. The client sends its token as its first message (FishNet: an `Authenticator` with a broadcast, `assets/unity/JoinTokenAuthenticator.cs`; NGO: `ConnectionApproval` with the token as the connection payload; Mirror: an `Authenticator`; Unreal: the token in the travel URL options, checked in `PreLogin`; Godot: the first RPC, kick after a short timeout).
3. Reject tokens not in the list. A second connection with a known token replaces the first: a crashed client's connection lives on until the transport times it out, and the player must be able to rejoin.

Tested on 2026-10-29 with a local container (FishNet): matched tokens admitted, wrong or missing tokens rejected, a killed client rejoining at once.
