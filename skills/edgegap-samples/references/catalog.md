# Edgegap public samples, SDKs and tools

Last commit on each repo's default branch, checked 2026-11-04. **Current** = updated in late 2026 and run end to end on Edgegap by the skill that links it. **Dated** = updated in 2026 but not re-verified since. **Legacy** = 2024 or older: use for the idea only. "Fork" means the repo keeps its upstream licence.

## Unity

| Repo | Stack | Last commit | Status | Skill |
|---|---|---|---|---|
| [netcode-game-sample-unity-ngo-bossroom](https://github.com/edgegap/netcode-game-sample-unity-ngo-bossroom) | Netcode for GameObjects (Boss Room) | 2026-10-29 | Current | `edgegap-ngo` |
| [netcode-game-sample-unity-fishnet-hashgrid](https://github.com/edgegap/netcode-game-sample-unity-fishnet-hashgrid) | FishNet, matchmaker | 2026-10-29 | Current | `edgegap-fishnet` |
| [netcode-game-sample-unity-purrnet-incremental](https://github.com/edgegap/netcode-game-sample-unity-purrnet-incremental) (fork) | PurrNet | 2026-10-29 | Current | `edgegap-purrnet` |
| [netcode-game-sample-webgl-mirror-tanks](https://github.com/edgegap/netcode-game-sample-webgl-mirror-tanks) | Mirror, WebGL client, matchmaker | 2026-10-22 | Current | `edgegap-unity` |
| [netcode-game-sample-unity-dots-ecs-mobile-megacity-metro](https://github.com/edgegap/netcode-game-sample-unity-dots-ecs-mobile-megacity-metro) (fork) | Netcode for Entities, mobile, matchmaker with backfill | 2026-10-29 | Current | `edgegap-matchmaking` |
| [netcode-game-sample-photon-fusion2-battleroyale-200](https://github.com/edgegap/netcode-game-sample-photon-fusion2-battleroyale-200) | Photon Fusion 2 (BR200 kit, Edgegap files only) | 2026-10-20 | Current | `edgegap-fusion` |
| [netcode-game-sample-photon-fusion2-simple-fps](https://github.com/edgegap/netcode-game-sample-photon-fusion2-simple-fps) | Photon Fusion 2 (Simple FPS kit, Edgegap files only) | 2026-10-20 | Current | `edgegap-fusion-simplefps` |
| [backend-game-sample-unity-playfab-matchmaker-fishnet-spaceedge](https://github.com/edgegap/backend-game-sample-unity-playfab-matchmaker-fishnet-spaceedge) | FishNet + PlayFab Matchmaking + Azure Functions | 2026-11-02 | Current | `edgegap-playfab` |
| [backend-game-sample-unity-mirror-playfab-mps](https://github.com/edgegap/backend-game-sample-unity-mirror-playfab-mps) (fork) | Mirror, PlayFab Multiplayer Servers samples moved to Edgegap (branch `feature/edgegap`) | 2026-11-02 | Current | `edgegap-playfab` |
| [backend-nakama-unity-template-model](https://github.com/edgegap/backend-nakama-unity-template-model) | Unity + Nakama | 2026-03-26 | Dated | `edgegap-nakama` |
| [backend-unity-ugs-matchmaker-template-model](https://github.com/edgegap/backend-unity-ugs-matchmaker-template-model) (fork) | Unity Gaming Services Matchmaker, Cloud Code allocators. Stale: 34 commits behind upstream, and its `edgagap-allocator-integration` branch (2026-01-28) lacks the later timeout fix. Use the `EdgegapAllocator` module in Unity's own [matchmaker-hosting-providers](https://github.com/Unity-Technologies/matchmaker-hosting-providers) instead (merged 2026-01-29, updated 2026-10-08) | 2026-01-23 | Dated | `edgegap-ugs-matchmaker` |
| [netcode-game-sample-photon-fusion2-asteroid](https://github.com/edgegap/netcode-game-sample-photon-fusion2-asteroid) | Photon Fusion 2 (Asteroids Simple, host mode) | 2026-05-19 | Dated | none; follow `edgegap-fusion` |
| [netcode-game-sample-unity-mirror-tanks](https://github.com/edgegap/netcode-game-sample-unity-mirror-tanks) | Mirror (Tanks), desktop | 2024-06-05 | Legacy | none; use the WebGL Mirror sample and `edgegap-unity` |
| [netcode-game-sample-unity-ngo-3d-spaceshooter](https://github.com/edgegap/netcode-game-sample-unity-ngo-3d-spaceshooter) | NGO (2D Space Shooter), Unity 2021.3 | 2024-06-05 | Legacy | none; use Boss Room and `edgegap-ngo` |
| [netcode-game-sample-unity-photon-fusion-tanknarok](https://github.com/edgegap/netcode-game-sample-unity-photon-fusion-tanknarok) | Photon Fusion 1 (Tanknarok) | 2024-06-05 | Legacy | none; `edgegap-fusion` for Fusion 2 |
| [netcode-game-sample-unity-photon-bolt-demo](https://github.com/edgegap/netcode-game-sample-unity-photon-bolt-demo) | Photon Bolt | 2024-06-05 | Legacy | none; for new work use Photon Fusion 2 and `edgegap-fusion` |

## Unreal Engine

| Repo | Stack | Last commit | Status | Skill |
|---|---|---|---|---|
| [game-sample-unreal-engine-lyra](https://github.com/edgegap/game-sample-unreal-engine-lyra) | Lyra (UE 5.8) + EOS sessions + Edgegap matchmaker; Edgegap files only, Lyra comes from Epic | 2026-11-02 | Current | `edgegap-unreal` |
| [game-sample-unreal-engine-topdown](https://github.com/edgegap/game-sample-unreal-engine-topdown) | Top-down template, matchmaker, EOS voice | 2026-10-22 | Current | `edgegap-unreal`, `edgegap-eos-voice` |

## Godot

| Repo | Stack | Last commit | Status | Skill |
|---|---|---|---|---|
| [game-sample-godot-arena-shooter](https://github.com/edgegap/game-sample-godot-arena-shooter) (fork) | Godot 4, Godot server, matchmaker | 2026-10-29 | Current | `edgegap-godot` |
| [backend-game-sample-godot-nakama-fishgame](https://github.com/edgegap/backend-game-sample-godot-nakama-fishgame) (fork) | Godot 4 + Nakama | 2026-10-22 | Current | `edgegap-nakama` |

## Web, Node.js and other engines

| Repo | Stack | Last commit | Status | Skill |
|---|---|---|---|---|
| [netcode-sample-threejs-minigames](https://github.com/edgegap/netcode-sample-threejs-minigames) | Three.js, five minigames, Node.js server, matchmaker | 2026-11-02 | Current | `edgegap-threejs` |
| [netcode-sample-threejs-supabase](https://github.com/edgegap/netcode-sample-threejs-supabase) | Three.js + Supabase auth, profiles, leaderboard | 2026-11-03 | Current | `edgegap-supabase` |
| [netcode-sample-threejs-vibe-coded](https://github.com/edgegap/netcode-sample-threejs-vibe-coded) | A vibe-coded single-player Three.js game made online multiplayer; tags `before` and `after` | 2026-11-03 | Current | `edgegap-vibe-coded`, `edgegap-threejs` |
| [netcode-sample-threejs-thin-ice-tussle](https://github.com/edgegap/netcode-sample-threejs-thin-ice-tussle) | A second vibe-coded game (ice brawler), same `before`/`after` tags, live on GitHub Pages with a splash page and a matchmaker that stays up | 2026-11-04 | Current | `edgegap-vibe-coded`, `edgegap-threejs` |
| [backend-game-sample-threejs-colyseus-tanks](https://github.com/edgegap/backend-game-sample-threejs-colyseus-tanks) (fork) | Colyseus 0.17 tanks | 2026-10-27 | Current | `edgegap-colyseus` |
| [backend-game-sample-cocos-colyseus-tictactoe](https://github.com/edgegap/backend-game-sample-cocos-colyseus-tictactoe) (fork) | Cocos Creator 3.8 + Colyseus, vendors the Cocos extension | 2026-10-29 | Current | `edgegap-colyseus` |
| [backend-game-sample-colyseus-phaser](https://github.com/edgegap/backend-game-sample-colyseus-phaser) | Colyseus + Phaser, client and server in one container | 2026-06-12 | Dated (older Colyseus; its README notes a wrong clone URL) | none; follow `edgegap-colyseus` |

## Relays (host-client games)

| Repo | Stack | Last commit | Status | Skill |
|---|---|---|---|---|
| [server-sample-lightnet-relay](https://github.com/edgegap/server-sample-lightnet-relay) | A relay you host on Edgegap, for Mirror, FishNet, PurrNet and NGO, desktop and Unity WebGL (`wss://`) | 2026-11-09 | Current | `edgegap-relays`, `edgegap-unity` |
| [relay-sample-unity-mirror-](https://github.com/edgegap/relay-sample-unity-mirror-) | Edgegap managed relays, Mirror | 2024-05-16 | Legacy | `edgegap-relays` |
| [relay-sample-unity-fishnet-](https://github.com/edgegap/relay-sample-unity-fishnet-) | Edgegap managed relays, FishNet | 2024-05-16 | Legacy | `edgegap-relays` |
| [relay-sample-unity-ngo-helloworld](https://github.com/edgegap/relay-sample-unity-ngo-helloworld) | Edgegap managed relays, NGO | 2024-04-25 | Legacy | `edgegap-relays` |
| [relay-transport-template-model](https://github.com/edgegap/relay-transport-template-model) | Managed-relay manual and transport integrations | 2024-11-04 | Legacy | none; follow `edgegap-relays` |
| [server-sample-unity-smart-relays](https://github.com/edgegap/server-sample-unity-smart-relays) (fork) | LightNet library (upstream of the LightNet relay) | 2021-08-17 | Legacy | `edgegap-relays` |

## Backends

| Repo | Stack | Last commit | Status | Skill |
|---|---|---|---|---|
| [backend-nakama-edgegap-plugin](https://github.com/edgegap/backend-nakama-edgegap-plugin) | Nakama Fleet Manager plugin | 2026-10-30 | Current | `edgegap-nakama` |

## SDKs and build tools

| Repo | What it is | Last commit | Skill |
|---|---|---|---|
| [sdk-unity-sessions-matchmaker-server-browser](https://github.com/edgegap/sdk-unity-sessions-matchmaker-server-browser) | Unity SDK: matchmaker, deployments, server browser | 2026-10-22 | `edgegap-unity` and the Unity netcode skills |
| [sdk-js-sessions-matchmaker-server-browser](https://github.com/edgegap/sdk-js-sessions-matchmaker-server-browser) | JavaScript SDK (`@edgegap/sdk`) | 2026-11-02 | `edgegap-threejs`, `edgegap-colyseus`, `edgegap-matchmaking` |
| [sdk-unreal-engine](https://github.com/edgegap/sdk-unreal-engine) | Unreal SDK (UE 5.0 to 5.8, beta): matchmaker client, server ticket check | 2026-11-03 | `edgegap-unreal` |
| [buildtool-unity-plugin](https://github.com/edgegap/buildtool-unity-plugin) | Unity editor plugin: build, push, deploy | 2026-11-02 | `edgegap-unity` and the Unity netcode skills |
| [buildtool-unreal-scripts](https://github.com/edgegap/buildtool-unreal-scripts) | Unreal build scripts | 2026-11-02 | `edgegap-unreal` |
| [buildtool-godot-plugin](https://github.com/edgegap/buildtool-godot-plugin) | Godot editor plugin | 2026-10-28 | `edgegap-godot` |
| [edgegap-cocos-plugin](https://github.com/edgegap/edgegap-cocos-plugin) | Cocos Creator 3.8 extension | 2026-10-29 | `edgegap-cocos`, `edgegap-colyseus` |
| [deploy-action](https://github.com/edgegap/deploy-action) | GitHub Action: new app version from CI | 2026-10-27 | `edgegap-containerize`, `edgegap-launch` |
| [openapi-specification](https://github.com/edgegap/openapi-specification) | Edgegap API spec | 2026-10-23 | `edgegap-deployments-api` |
| [llm-mcp-server](https://github.com/edgegap/llm-mcp-server) | Edgegap MCP server | 2026-11-03 | `edgegap` |
