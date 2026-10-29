---
name: edgegap-ngo
description: 'Netcode for GameObjects (NGO) + Edgegap: take a Unity game built on NGO to dedicated servers and matchmaking, end to end. Load this before using any Edgegap MCP tool on an NGO project (com.unity.netcode.gameobjects, NetworkManager, UnityTransport, StartHost, ConnectionManager, Boss Room). It has NGO C# templates verified on Edgegap that add themselves at runtime, no scene edits (server start and self-stop, Find Match panel, settings asset), a Boss Room ConnectionManager adapter, port 7777 UDP app version, Dockerfile, matchmaker config, and fixes for NGO pitfalls: host-only logic, connection payloads and approval, UnityTransport needing an IP, client-only code on the server, Relay leftovers. Use when an NGO dev wants online play: "host my NGO game", "nobody should host", "replace Unity Relay or Multiplay", "Boss Room on Edgegap", "Find Match button", or is debugging NGO deployments, ports or matchmaking on Edgegap. Mirror or WebGL-first games: edgegap-unity. FishNet: edgegap-fishnet. PurrNet: edgegap-purrnet.'
metadata:
  version: "0.1.7"
---

# Edgegap for Netcode for GameObjects: dedicated servers + matchmaking

Goal: a player clicks **Find Match** (or joins an address while testing), Edgegap runs a headless NGO server near the players, every client connects, and the server stops its own deployment once the match is empty. Done means that loop works with real builds, not that the code compiles.

This path was run end to end on Edgegap with [edgegap/netcode-game-sample-unity-ngo-bossroom](https://github.com/edgegap/netcode-game-sample-unity-ngo-bossroom), Unity's Boss Room on a dedicated server (Unity 6000.0.54f1, NGO 1.13.0, UnityTransport 2.5.2 over UDP, SDK 3.5.6). Two Windows clients played in the dungeon on the same Edgegap server, first by direct connection and then through the matchmaker (matched and connected within 40 s of launch), and the server stopped itself each time. `EDGEGAP.md` in that repo is a working reference for the developer. The generic templates in `assets/unity/` (plain `NetworkManager.StartServer` / `StartClient` adapters) are the same files with those adapters swapped in; on the same Unity and NGO versions their server start and direct connection were tested locally (Docker server, two clients), and their matchmaker adapter compiles; the matchmaking flow around it is the verified one. `assets/unity/Examples/BossRoom/` holds the verified Boss Room adapter.

Use **dedicated (authoritative) servers**, not a player host, unless the developer explicitly wants host/client.

## How to work

- **Be the engineer.** Inspect the project, write the code, run Unity batch builds, Docker and the Edgegap MCP tools, read the logs. Hand the developer only Editor clicks, dashboard steps, secrets and playtesting. If you can launch client builds, run the two-client tests yourself with the command-line flags (`references/deploy.md` §6).
- **Touch the game as little as possible.** The templates add themselves at startup from `Assets/Edgegap/`, so scenes and prefabs stay unchanged. That keeps upstream syncs and the developer's scene work conflict-free.
- **One layer at a time**: local → Docker → direct Edgegap deploy → matchmaker, each with a check.
- **Secrets.** The Edgegap API token and registry token never go into files, git, the client or chat. The matchmaker Auth Token is client-safe.
- **Money.** Tag test deployments and stop the ones you start. Free tier runs one deployment at a time.
- Track the phases as a todo list.

## Phase 0: Understand the project

Read, don't ask:
- `ProjectSettings/ProjectVersion.txt` (the SDK needs 2021.3+; use SDK 3.5.6+ before Unity 2022.3).
- `Packages/manifest.json`: `com.unity.netcode.gameobjects` version, `com.unity.transport`, `com.unity.services.*` (Relay, Lobby, Matchmaker, Multiplay), any `com.edgegap.*`.
- The scene with the `NetworkManager`: transport (`UnityTransport`, its port and `ConnectTimeoutMS`/`MaxConnectAttempts`), Player Prefab, `ConnectionApproval`.
- How the game connects: grep `StartHost`, `StartServer`, `StartClient`, `SetConnectionData`, `SetRelayServerData`, `ConnectionData`, `IsHost`. A `ConnectionManager` state machine (Boss Room and projects derived from it) changes the integration (`references/ngo.md` §4).
- Code that won't compile or run without UGS: a UGS Matchmaker client without `com.unity.services.matchmaker`, Relay-only connect paths.
- Targets: desktop clients use UDP. WebGL needs WebSockets (`references/ngo.md` §7, not verified).

Then ask, in one message, only what you couldn't infer: players per match, platforms, Edgegap account and Docker. Offer defaults.

## Phase 1: Make the game dedicated-server ready

Read `references/ngo.md`.
1. Add the SDK: `"com.edgegap.unity-sdk": "https://github.com/edgegap/sdk-unity-sessions-matchmaker-server-browser.git"` in `Packages/manifest.json`. No `#tag`: that installs the latest SDK (3.5.6+). Never pin an exact version. It coexists with the older `com.edgegap.unity-servers-plugin`.
2. Copy `assets/unity/*.cs`, `EdgegapSettings.cs.meta` and `link.xml` to `Assets/Edgegap/`, `assets/unity/Editor/EdgegapServerBuild.cs` to `Assets/Edgegap/Editor/`, and `assets/unity/Resources/EdgegapSettings.asset` to `Assets/Edgegap/Resources/`. Copy the `.meta` too: the asset finds its script by that GUID. Don't copy `Examples/`. If the game's scripts live in an asmdef the templates must call, reference it from an asmdef in `Assets/Edgegap/` (with `Edgegap.SDK`, `Unity.Netcode.Runtime`, `Unity.Networking.Transport`), or keep the templates in `Assembly-CSharp`, which sees auto-referenced asmdefs.
3. **Plain NGO** (the game calls `NetworkManager` directly): keep `AutoStartServer` on; the lifecycle starts the server on `0.0.0.0` and the Edgegap internal port. Remove any headless `StartHost` the game does. **Own connection flow** (`ConnectionManager`, payloads, approval): `AutoStartServer` off, start the server through the game's flow, and swap in the Boss Room adapter (`references/ngo.md` §4).
4. Fix host-only assumptions (`references/ngo.md` §2): `StartServer` not `StartHost`, no local player on the server, no host payload, matching build types, no Relay on the dedicated path.
5. Set `ListenPort` on the settings asset if the game doesn't use 7777, and `MenuSceneName` to the main menu scene.

✅ Check: the Linux server (or a `-batchmode` instance) logs `Edgegap Server | Starting server on 0.0.0.0:7777.`, two client builds connect to `127.0.0.1:7777` (the game's own connect UI or `-edgegapConnect`), the server logs `Edgegap Server | 2 player(s) connected.`, and both players see each other in the game.

## Phase 2: Connect to Edgegap

Edgegap account, Docker running, Unity **Linux Build Support (Mono)** + **Linux Dedicated Server Build Support**. Edgegap MCP connected (`references/deploy.md` §1).

✅ Check: `edgegap_list_apps` succeeds.

## Phase 3: Build, containerize, push

Read `references/deploy.md` §2-3.
1. `"<Unity>" -batchmode -quit -projectPath "<project>" -executeMethod EdgegapServerBuild.Build -logFile build-server.log` → `Builds/EdgegapServer/ServerBuild`. A first import of a large project takes 10+ minutes: run it in the background.
2. Copy `assets/docker/Dockerfile` and `.dockerignore` to the project root.
3. The developer runs `docker login registry.edgegap.com`; you build with `--platform linux/amd64` and push a fresh tag (UTC timestamp `YYYYMMDD-HHMM`, also the app version name).
4. `docker run --rm -p 7777:7777/udp <image>` and connect two clients.

✅ Check: `edgegap_list_registry_tags` shows the tag.

## Phase 4: App version and a direct deploy

Read `references/deploy.md` §4-5.
1. Port: name `gameport`, port `7777`, protocol **UDP**. Registry credentials set (the developer adds them in the dashboard if they won't paste them); `edgegap_list_app_versions` shows `registry_credentials_set: true`.
2. `edgegap_deploy` near the developer → `edgegap_wait_for_deployment` → logs.
3. Two clients connect to `<public_ip>:<external port>` (UnityTransport needs the IP, not the fqdn).
4. `edgegap_stop_deployment`, or let the server stop itself 30 s after both leave.

✅ Check: both played on the Edgegap server and the server logged the player count. Don't add the matchmaker on an unproven server.

## Phase 5: Matchmaker

Read `references/matchmaker.md`.
1. `assets/matchmaker/casual.json` with the app name and version, or `edgegap_build_matchmaker_config`. **Don't add an expansion stage** for partial matches: `min_team_size` below `max_team_size` already enables them, and they start by the time tickets expire, so keep `ticket_expiration_period` at `30s` (expansions cost the matchmaker a lot of performance). Save as `matchmaker-config.json` in the project root and give the developer its full path to upload.
2. Dashboard: Create Matchmaker → upload → Create and Start → copy **API URL** and **Auth Token**.
3. `GET <API URL>/monitor` with the token answers `HEALTHY`.

## Phase 6: Client integration

1. On `Assets/Edgegap/Resources/EdgegapSettings.asset`: **Use Edgegap Matchmaker** on, **Matchmaker Url**, **Matchmaker Auth Token**, `Profile`. Or pass `-edgegapMatchmaker true -edgegapMatchmakerUrl <url> -edgegapAuthToken <token>` to test builds.
2. The Find Match panel shows on `MenuSceneName`. To use the game's own menu instead, call `EdgegapMatchmakingClient.FindMatch()` / `CancelMatchmaking()`, read `Status`, and set `ShowGUI = false`.
3. Server changed? Rebuild → new tag → new app version → matchmaker **Stop → Edit** `application.version` **→ Start**.

## Phase 7: End-to-end test and hand-off

1. `edgegap_list_deployments`: nothing of yours left running.
2. `-executeMethod EdgegapServerBuild.BuildClient -edgegapClientTarget win64|mac|linux` → `Builds/Client/<target>`.
3. Two clients, **Find Match** in both (or `-edgegapFindMatch`): searching → match found → joining → connected, both on one server. Two copies on one machine may need a per-instance player id (`references/ngo.md` §6).
4. Server logs `2 matched player(s)` and `2 player(s) connected.` Close both → `Stopping deployment: all players left` → the deployment disappears.
5. Debug with `references/troubleshooting.md`.

Hand-off: what was built and where, app/version/matchmaker names, how to ship a new build, free-tier caveats, and next steps (a Find Match button in the game's menu, match end via `SelfStop`, ticket-ID validation in connection approval with `MM_TICKET_IDS`, backfill, a production matchmaker tier).

## Reference files

- `references/ngo.md`: what the templates do, host → dedicated conversion, ports and UnityTransport, Boss Room-style ConnectionManager games, client-only code on the server, two clients on one machine, WebGL.
- `references/deploy.md`: MCP connection, server and client builds, Docker and registry, app version for UDP 7777, direct deploy, command-line test flags.
- `references/matchmaker.md`: config, dashboard steps, ticket contract, injected variables, expansion stages and testing.
- `references/troubleshooting.md`: symptom → fix tables.
- `assets/unity/`: `EdgegapBootstrap`, `EdgegapQuitTimer`, `EdgegapSettings` (+ `.meta`, `Resources/EdgegapSettings.asset`), `EdgegapServerLifecycle`, `EdgegapMatchmakingClient`, DTOs, `link.xml`, `Editor/EdgegapServerBuild`. `Examples/BossRoom/`: the verified Boss Room client adapter, server starter and test driver. `assets/docker/`, `assets/matchmaker/`.

Related skills in this pack, if installed: `edgegap-unity` (Mirror, WebGL, general Unity), `edgegap-fishnet`, `edgegap-purrnet`, `edgegap-deployments-api` for a studio's own backend or matchmaker, `edgegap-launch` before going live.

Sources of truth: https://docs-multiplayer.unity3d.com/netcode/current/about/, https://docs.edgegap.com/unity, https://github.com/edgegap/sdk-unity-sessions-matchmaker-server-browser, and the sample https://github.com/edgegap/netcode-game-sample-unity-ngo-bossroom.
