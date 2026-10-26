# Edgegap Agent Skills

Skills that let a coding agent (Claude Code, and other agents that read `SKILL.md` skills) take a multiplayer game from "works on my machine" to **online play with dedicated servers and matchmaking on [Edgegap](https://edgegap.com)**, end to end.

```
Edgegap Agent Skills
│
├─ Start here
│  └─ edgegap ····················· platform overview, server shape per game, safety rules for the MCP tools
│
├─ Engines
│  ├─ edgegap-unity ··············· Unity end to end: server build, matchmaker, client, e2e test
│  ├─ edgegap-ngo ················· Unity + Netcode for GameObjects end to end, with templates verified on Edgegap
│  ├─ edgegap-fishnet ············· Unity + FishNet end to end, with templates verified on Edgegap
│  ├─ edgegap-purrnet ············· Unity + PurrNet end to end, with templates verified on Edgegap
│  ├─ edgegap-fusion ·············· Unity + Photon Fusion 2 dedicated servers, verified with Photon's BR200 sample
│  │  └─ edgegap-fusion-simplefps · Photon's Simple FPS sample: dedicated server, join from the Party menu
│  ├─ edgegap-unreal ·············· Unreal Engine end to end: source engine, Linux server, matchmaker, e2e test
│  │  └─ edgegap-eos-voice ········ EOS Voice chat on top: the game server decides who talks to whom
│  ├─ edgegap-godot ··············· Godot 4 end to end: GDScript server lifecycle + matchmaker client, export, Dockerfile
│  ├─ edgegap-colyseus ············ Colyseus (Node.js) servers, any client: per-match servers, matchmaker clients, verified
│  ├─ edgegap-threejs ············· Three.js / web games + Node.js ws server: per-match servers, Find Match, verified
│  └─ edgegap-manus ··············· Manus browser games: Steam sign-in, backend matchmaking, Node.js WebSocket server
│
├─ Any engine
│  ├─ edgegap-server-design ······· authoritative server and the deployment lifecycle contract
│  ├─ edgegap-containerize ········ the container contract, Dockerfiles, registries, app versions
│  ├─ edgegap-local-testing ······· parity tests on your machine, then one smoke-test deployment
│  └─ edgegap-troubleshoot ········ pull errors, crash loops, OOM, clients that can't connect
│
├─ Your backend
│  ├─ edgegap-nakama ·············· Nakama matchmaking + Edgegap Fleet Manager, any engine, verified
│  ├─ edgegap-playfab ············· PlayFab Matchmaking + Azure Functions, any engine, verified
│  ├─ edgegap-matchmaking ········· who owns matchmaking, profiles, parties, regions, backfill, third-party matchmakers
│  └─ edgegap-deployments-api ····· Deploy API, webhooks, cleanup; UGS, EOS
│
└─ Going live
   └─ edgegap-launch ·············· launch checklist, rollouts, caching, cost control, operations
```

| Skill | What it does |
|---|---|
| [`edgegap`](skills/edgegap/SKILL.md) | Starting point for any engine. Picks the server shape for any game, including always-online single-player games whose logic should stay off the client, explains apps, versions, deployments and the matchmaker, sets the safety rules for acting on an Edgegap account, and routes to the other skills. |
| [`edgegap-unity`](skills/edgegap-unity/SKILL.md) | Unity games (Mirror, WebGL, other netcodes; NGO, FishNet, PurrNet and Photon Fusion projects go to `edgegap-ngo`, `edgegap-fishnet`, `edgegap-purrnet` and `edgegap-fusion`). Converts host/client code to a headless dedicated server, builds and containerizes the Linux server, deploys it on Edgegap, integrates the Edgegap matchmaker SDK in the client, writes the matchmaker config, then debugs until real players get matched onto a server. |
| [`edgegap-ngo`](skills/edgegap-ngo/SKILL.md) | Unity games built on Netcode for GameObjects, including Boss Room-style `ConnectionManager` projects. Ships templates from the end-to-end run of [netcode-sample-unity-ngo-bossroom](https://github.com/edgegap/netcode-sample-unity-ngo-bossroom) that add themselves at startup without scene edits (server start and self-stop, a Find Match panel, a settings asset), the Boss Room adapter, and NGO fixes: host-only logic, payloads and approval, UnityTransport needing an IP, client-only code on the server. |
| [`edgegap-fishnet`](skills/edgegap-fishnet/SKILL.md) | Unity games built on FishNet (Tugboat, Bayou, WebGL). Ships the FishNet-ready matchmaker client, server self-stop and scene-change persistence from the end-to-end run of [netcode-sample-unity-fishnet](https://github.com/edgegap/netcode-sample-unity-fishnet), and covers Start On Headless, Bayou `wss` with TLS Upgrade, removing client-side Edgegap API calls from older samples, and the SDK fix that Unity 2021.3 needs for matchmaker tickets. |
| [`edgegap-purrnet`](skills/edgegap-purrnet/SKILL.md) | Unity games built on PurrNet. Ships the templates from the end-to-end run of [PurrNet-Incremental-Sample](https://github.com/edgegap/PurrNet-Incremental-Sample): they add themselves at startup without scene edits (server start and self-stop, a connect panel with direct and matchmaker modes, a settings asset, command-line test flags). Covers PurrNet's auto start flags, the async `StartClient`, and `ObserversRpc` setup code that never runs on a dedicated server. |
| [`edgegap-fusion`](skills/edgegap-fusion/SKILL.md) | Unity games built on Photon Fusion 2, verified with Photon's BR200 Battle Royale sample. Ships a drop-in BR200 kit that changes no sample code (server build with preflight checks, Dockerfile, a start script that maps Edgegap's variables to BR200's command-line options, picks the Photon region and self-stops) and headless test clients that log the connection type. Covers the bind address (0.0.0.0 gives Direct, 127.0.0.1 forces Photon relays, the public IP fails to bind), IL2CPP on the server, and the Linux toolchain packages. |
| [`edgegap-fusion-simplefps`](skills/edgegap-fusion-simplefps/SKILL.md) | Photon's Simple FPS (Fusion 2) sample as dedicated servers, joined from the sample's Party menu by deployment FQDN and Photon region. Ships the drop-in kit from [fusion-simplefps-edgegap](https://github.com/edgegap/fusion-simplefps-edgegap) that edits no Simple FPS or Fusion file: a `FusionBootstrap` subclass (server auto-start in server builds, session named after the deployment, scene active on load, region and session logged), a Party menu subclass, an editor setup and IL2CPP builds, a Dockerfile, and headless clients that join through the Party menu. Covers the two traps that make clients throw `NullReferenceException` in `Player.FixedUpdateNetwork`: a server built with only the Deathmatch scene, and a scene that isn't active on load. |
| [`edgegap-unreal`](skills/edgegap-unreal/SKILL.md) | Unreal Engine 5 games, C++ or Blueprint-only. Sets up the source engine and Linux cross-compile toolchain, makes the project dedicated-server ready, drops in two C++ subsystems (matchmaker client with latency beacons, server self-stop), packages and containerizes the Linux server, deploys it on Edgegap, writes the matchmaker config, then tests two clients end to end. |
| [`edgegap-eos-voice`](skills/edgegap-eos-voice/SKILL.md) | In-game voice chat with [EOS Voice](https://dev.epicgames.com/docs/epic-online-services/multiplayer/voice-and-rtc-interface/voice-interface/voice-overview) for an Unreal game on Edgegap. The dedicated server is the trusted server: it verifies each player's EOS ID token, picks a match or team room from the matchmaker's ticket data, requests room tokens from the EOS Voice Web API (EOS Voice doesn't run on Linux) and removes players who leave. Drop-in C++ that needs no game class edits, device ID login (no Epic account), Developer Portal setup, and a two-client test with fake audio, verified end to end on Edgegap with [unreal-sample](https://github.com/edgegap/unreal-sample). |
| [`edgegap-godot`](skills/edgegap-godot/SKILL.md) | Godot 4 games on high-level multiplayer (`ENetMultiplayerPeer` over UDP, `WebSocketMultiplayerPeer` with `wss` for web exports, netfox on top). Ships GDScript templates from the end-to-end run of [godot-sample-arena-shooter](https://github.com/edgegap/godot-sample-arena-shooter), made game-agnostic: a server lifecycle autoload (waits for the matched players from `MM_TICKET_IDS`, stops its own deployment), a matchmaker client and Find Match button, the Linux dedicated server export preset and a Dockerfile. Covers moving a Host button to a dedicated server and the Godot pitfalls: empty logs without `flush_stdout_on_print`, export allowlists that drop new scripts, SIGTERM ignored as PID 1, and join validation that silently blocks matched players. |
| [`edgegap-colyseus`](skills/edgegap-colyseus/SKILL.md) | Games with a [Colyseus](https://colyseus.io) (Node.js) server and any client. One Colyseus process per match on Edgegap, placed near its players, reached directly or through the Edgegap matchmaker over `wss` with TLS Upgrade (the matchmake HTTP request and the room WebSocket share one port). Ships the files from the end-to-end run of [realtime-tanks-demo](https://github.com/edgegap/realtime-tanks-demo): a lifecycle module that stops the deployment when nobody joins, everyone leaves or the match ends, a Dockerfile with Node as PID 1, a direct deploy script, a matchmaker config, and dependency-free matchmaker clients for browser JS/TS, Unity and Godot. Covers the 502 a fresh deployment returns for a few seconds (retry the join), FQDN-only `wss`, CORS origins, and turning off the playground and monitor. |
| [`edgegap-manus`](skills/edgegap-manus/SKILL.md) | Browser games built with [Manus](https://manus.im). The Manus backend signs players in with Steam, creates Edgegap matchmaker tickets (mode, region, party, player IP) and returns only the server address and a short-lived signed join token; the game rules move to an authoritative Node.js WebSocket server that runs on Edgegap with TLS Upgrade (`wss`) and stops itself. Includes duplicate-ticket prevention, timeouts, cancel, reconnect, allocation error handling, a GitHub Actions image build, and phase-by-phase prompts to paste into Manus. |
| [`edgegap-threejs`](skills/edgegap-threejs/SKILL.md) | Browser games in Three.js (or Babylon.js, PlayCanvas, Phaser, canvas) with their own Node.js WebSocket server. One authoritative server per match on Edgegap; the page calls the matchmaker directly (client-safe token, CORS) and connects over `wss` with TLS Upgrade. Ships the shared files of [netcode-sample-threejs-minigames](https://github.com/edgegap/netcode-sample-threejs-minigames): a game-agnostic room (phases, bots, fixed tick, snapshots, matchmaker teams, self-stop), a no-build Three.js client with Find Match, direct and local modes, a skeleton game, one image for several games, a multi-profile matchmaker config, and headless-player and e2e scripts. Covers 429 rate limits on ticket bursts, stale tickets, and team profiles that only make partial matches at ticket expiry. |
| [`edgegap-server-design`](skills/edgegap-server-design/SKILL.md) | Engine-agnostic server design: authority, injected env vars, fixed port on `0.0.0.0`, readiness, self-stop at match end, SIGTERM draining, logging. |
| [`edgegap-containerize`](skills/edgegap-containerize/SKILL.md) | Packages any server into a `linux/amd64` image, pushes it to the Edgegap registry or another one, and registers the app version with the right ports, credentials and restart policy. |
| [`edgegap-local-testing`](skills/edgegap-local-testing/SKILL.md) | Parity `docker run`, the random-external-port test, the drain test, two servers on one host, resource sizing, then one tagged smoke-test deployment. |
| [`edgegap-matchmaking`](skills/edgegap-matchmaking/SKILL.md) | Matchmaking design for any engine. Picks who owns matchmaking (Edgegap's hosted matchmaker, your own allocator, or a matchmaker you keep: Unity Matchmaker, Nakama, PlayFab, EOS or Steam lobbies, Pragma, AccelByte, Open Match), designs profiles (teams, parties, skill, modes, expansions, 30 s queues), places servers with ping beacons and player IPs (region and hub pickers), and adds backfill so running servers take new players and replace leavers. Ships three annotated matchmaker configs and an engine-agnostic backfill loop that follows the backfill verified on Edgegap with Megacity Metro. |
| [`edgegap-deployments-api`](skills/edgegap-deployments-api/SKILL.md) | Backend code that deploys servers for matches: player-based placement, env vars, tags, webhooks, rate limits, error handling, reconciliation. Covers keeping Unity Matchmaker or EOS lobbies. |
| [`edgegap-nakama`](skills/edgegap-nakama/SKILL.md) | Games with a [Nakama](https://heroiclabs.com/nakama/) backend, any engine. Nakama keeps accounts, matchmaking and leaderboards; each match it forms gets its own Edgegap server near the players through the [Edgegap Fleet Manager for Nakama](https://github.com/edgegap/nakama-edgegap). Ships the files from the end-to-end run of [fishgame-godot](https://github.com/edgegap/fishgame-godot): a Go module (Fleet Manager, the AfterAuthenticate hook for the game's real sign-in, a MatchmakerMatched hook that returns no Nakama match, notifications 111/112/113, an authoritative leaderboard written by the server through an S2S RPC), the Nakama Dockerfile and compose, and game server code for READY, batched connection events, STOP and player checks (Godot, verified; Node). Covers the plugin README's matchmaker sample, the tags Go can't use, `sh -x` leaking the token, and why Nakama needs a public HTTPS URL. Unity servers use [edgegap-server-nakama-plugin-unity](https://github.com/edgegap/edgegap-server-nakama-plugin-unity). |
| [`edgegap-playfab`](skills/edgegap-playfab/SKILL.md) | Games that keep [PlayFab](https://playfab.com) for players, login and Matchmaking, any engine, including studios leaving PlayFab Multiplayer Servers. The queue runs with server allocation off; a rule on `match_found` runs an Azure Function that deploys an Edgegap server near the matched players, and Edgegap's ready webhook runs a second one that checks the deployment and writes the address to each player's read-only data. Ships the files from the end-to-end run of [sample-playfab-matchmaker-fishnet](https://github.com/edgegap/sample-playfab-matchmaker-fishnet): the two Node.js functions (no SDKs), deploy and PlayFab setup scripts, a dependency-free Unity client and a server self-stop, plus the REST contract for other engines. Covers new titles blocking `LoginWithCustomID` player creation, legacy CloudScript, the 10 s rule timeout, ticket polling limits, and keeping the title secret off the game server. |
| [`edgegap-launch`](skills/edgegap-launch/SKILL.md) | Production checklist: tier limits, tokens, version settings, caching, log storage, blue/green rollouts, cost control, observability, Private Fleets for persistent servers. |
| [`edgegap-troubleshoot`](skills/edgegap-troubleshoot/SKILL.md) | Symptom → cause → fix for images, registries, app versions, deployments, server processes, networking and the matchmaker. |

Dedicated (authoritative) servers by default. Relays only when the developer explicitly wants host/client.

API facts in the skills come from Edgegap's published [OpenAPI spec](https://github.com/edgegap/openapi-specification). The commit they were checked against is pinned in `scripts/spec-pin.txt`, and a weekly CI job opens an issue when the published spec changes.

## What it looks like

You ask, in your own words:

> My Unity game works when I play with my friend on the same wifi, but not over the internet. How do I fix that?

The agent then:

1. **Inspects the project**: Unity version, netcode, transport and port, scenes, target platforms. It asks only what it can't infer (players per match, browser build or not).
2. **Makes the game dedicated-server ready**: the server starts headless and binds `0.0.0.0`, players spawn on connect, and host-only logic moves to the server.
3. **Adds drop-in scripts**: an Edgegap matchmaking client (*Find Match* → connect) and a server lifecycle component. The lifecycle component reads match data and **stops its own deployment when the match ends**, so empty servers don't bill you.
4. **Builds the Linux dedicated server**, builds the Docker image and pushes it to your Edgegap registry.
5. **Creates the app and version** through the Edgegap MCP, and deploys a test server to prove the image and ports work.
6. **Writes the matchmaker config** and walks you through creating the matchmaker in the dashboard.
7. **Runs an end-to-end test**: two clients click *Find Match*, get matched, connect to the same server, and the server shuts down after they leave.

You only handle the parts that need a human: secrets, a few dashboard clicks, and playtesting.

## Install

### Claude Code: plugin (recommended)

```bash
/plugin marketplace add edgegap/edgegap-agent-skills
/plugin install edgegap@edgegap
```

The plugin installs all the skills **and** the hosted Edgegap MCP server. When you install and enable it, Claude Code asks for your [Edgegap API token](https://app.edgegap.com/user-settings?tab=tokens) (paste just the UUID). It is stored in your system's secure credential store (it's a `sensitive` plugin setting), never in your project, and sent only to the Edgegap MCP server.

### Any agent: the `skills` CLI

Install every skill into the current project (Claude Code, Cursor, Copilot, Codex and other agents that read `SKILL.md`):

```bash
npx skills add edgegap/edgegap-agent-skills --skill "*"
```

Add `-g` to install for your user instead of one project, or pick skills, e.g. `--skill edgegap --skill edgegap-containerize`. Update later with `npx skills update`.

### Claude Code: skills only, by hand

Copy the skills into your user skills folder:

```bash
git clone https://github.com/edgegap/edgegap-agent-skills
cp -r edgegap-agent-skills/skills/* ~/.claude/skills/
```

Manual copies don't update themselves; copy again after pulling.

Then add the Edgegap MCP server yourself:

```bash
claude mcp add --transport http edgegap https://mcp.edgegap.dev/mcp -H "Authorization: token <YOUR_EDGEGAP_API_TOKEN>" --scope user
```

### Other agents

Each skill is a plain folder: `SKILL.md`, plus `references/` and sometimes `assets/`. Use the `skills` CLI above, or point your agent at `skills/edgegap/SKILL.md` (or `skills/edgegap-unity/SKILL.md` for Unity, `skills/edgegap-fishnet/SKILL.md` for FishNet, `skills/edgegap-purrnet/SKILL.md` for PurrNet, `skills/edgegap-unreal/SKILL.md` for Unreal Engine, `skills/edgegap-colyseus/SKILL.md` for Colyseus servers, `skills/edgegap-nakama/SKILL.md` for Nakama backends, `skills/edgegap-manus/SKILL.md` for Manus games). Manus users can upload the `skills/edgegap-manus` folder in Manus (Skills → + Add). For the MCP server in other clients (Cursor, VS Code, Codex, Claude Desktop), see [edgegap-mcp](https://github.com/edgegap/edgegap-mcp).

> claude.ai and Claude Desktop *custom connectors* can't send an `Authorization` header, so they can't use the hosted MCP server. In Claude Desktop, use the local server (`npx -y @edgegap/mcp`) as described in the edgegap-mcp README.

## What the plugin runs, sends and fetches

Everything here happens only when you ask the agent to work on your game, and most steps show you the command first.

**Network**
- **Hosted Edgegap MCP server**, `https://mcp.edgegap.dev/mcp`, operated by Edgegap. Every tool call sends your Edgegap API token in the `Authorization` header. The server uses it for that request against the Edgegap API (`https://api.edgegap.com`) and does not store it. Tools list and create applications and app versions, start, inspect and stop deployments, read deployment logs, list registry tags, and generate Dockerfiles and matchmaker configs. Deployments are billed to your Edgegap account outside the free tier.
- **Edgegap API from your backend**, `https://api.edgegap.com`: code the `edgegap-deployments-api` skill writes for your backend calls it at runtime, with the token from your backend's secret manager. The agent itself never calls it directly or reads a token from your machine.
- **Edgegap container registry**, `registry.edgegap.com`: `docker push` of your game server image, using the registry login you enter yourself with `docker login`.
- **GitHub**: Unity Package Manager downloads the Edgegap Unity SDK (`https://github.com/edgegap/edgegap-unity-sdk.git`, latest) when the skill adds it to your project. For Unreal, you clone the engine source (`https://github.com/EpicGames/UnrealEngine`) yourself, and its `Setup.bat` downloads engine dependencies from Epic.
- **Docker Hub**: `docker build` pulls the `ubuntu:22.04` base image.
- **Your matchmaker** (`https://<id>.edgegap.net`, created by you in the Edgegap dashboard): the game client code the skill adds calls it at runtime with the matchmaker auth token.
- **Optional checks**: `https://api.ipify.org`, to find your public IP so a test server is placed near you, and an HTTPS/WebSocket request to a test deployment to confirm its port answers.

**Local commands** (in your project folder): Unity in batch mode (`-executeMethod EdgegapServerBuild.Build`, `BuildClient`, `EdgegapSceneSetup.Setup`), the same for FishNet and PurrNet projects; for Unreal, the engine's `Build.bat`, `RunUAT BuildCookRun` (Linux server package) and `UnrealEditor -game` test clients; `docker build`, `docker run` (local smoke test), `docker push`, `git`, `curl`, and a local static web server for WebGL tests.

**Files it writes to your project**: C# scripts under `Assets/Edgegap/`, a `link.xml`, a `Dockerfile` and `.dockerignore`, `matchmaker-config.json`, a line in `Packages/manifest.json`, and edits to your scenes and netcode scripts (Unity). FishNet projects also get `EdgegapPersistence.cs`, and on Unity before 2022.3 an embedded copy of the Edgegap SDK with a one-line fix in `Packages/com.edgegap.unity-sdk`. PurrNet projects get `EdgegapBootstrap.cs`, `EdgegapConnectPanel.cs`, `EdgegapSettings.cs` and `Resources/EdgegapSettings.asset` instead of scene edits. For Unreal: two C++ subsystems in `Source/<Module>/`, module dependencies in `<Module>.Build.cs`, build settings in `*.Target.cs`, ini sections in `Config/DefaultGame.ini`, a `matchmaker-config.json`, a `Dockerfile` and `.dockerignore`, and for Blueprint-only projects a minimal C++ module. For other engines: a `Dockerfile`, `.dockerignore`, an optional start script, server lifecycle code (self-stop, SIGTERM handling), and, if you ask for it, backend code that calls the Deploy API.

**Inside your game server (on Edgegap, not on your machine)**: the `EdgegapServerLifecycle` script (Unity) or `EdgegapServerSubsystem` (Unreal) added to your game reads the deployment variables Edgegap injects into the server container, including a one-time self-stop key, and uses them only to call Edgegap's own self-stop endpoint for that deployment when the match ends. The game client script calls only your matchmaker. Neither script talks to the MCP server.

**Not collected**: the plugin itself sends no telemetry and no conversation data anywhere. Your Edgegap API token and registry credentials are never written to project files. The matchmaker auth token is written into the game client by design: it is meant to ship to players and grants no access to your Edgegap account.

## Requirements

- Unity: 2021.3+ (tested on Unity 6000.3) with the **Linux Build Support** and **Linux Dedicated Server Build Support** modules, and git (for the Edgegap Unity SDK package).
- Unreal Engine: 5.3+ **built from source** (tested on 5.5.4), Visual Studio 2022 with the C++ game workloads, and the Linux cross-compile toolchain for your engine version. Launcher builds can't build dedicated servers.
- [Docker](https://www.docker.com/products/docker-desktop/) running locally.
- A free [Edgegap account](https://app.edgegap.com/auth/register). Free tier limits: one deployment at a time, 60-minute deployments, and the matchmaker stops 3 hours after each start.

## What's verified

| Area | Status |
|---|---|
| Mirror + SimpleWebTransport (WebGL) | **End-to-end verified** on Edgegap: two browser clients matched by the matchmaker, connected over `wss` with TLS Upgrade, and the server stopped itself after they left. |
| Netcode for GameObjects 1.13 + UnityTransport (UDP) | **End-to-end verified** on Edgegap with [netcode-sample-unity-ngo-bossroom](https://github.com/edgegap/netcode-sample-unity-ngo-bossroom) (Boss Room, Unity 6000.0.54f1): two desktop clients played in the dungeon on the same server by direct connection and through the matchmaker (connected within 40 s of launch), and the server stopped itself. The generic `edgegap-ngo` server start and direct connection were tested locally (Docker server, two clients). NGO 2.4: `edgegap-unity` templates compile and the Linux server builds. |
| FishNet 4.1 + Bayou (WebGL) | **End-to-end verified** on Edgegap with [netcode-sample-unity-fishnet](https://github.com/edgegap/netcode-sample-unity-fishnet) (Unity 2021.3.45f2): two browser clients matched by the matchmaker, connected over `wss` with TLS Upgrade, played, and the server stopped itself; the no-player self-stop works too. The `edgegap-fishnet` templates are the files from that run. Tugboat (UDP) and Multipass compile but have not been run on Edgegap; FishNet 2.x/3.x are best effort. |
| PurrNet + UDPTransport | **End-to-end verified** on Edgegap with [PurrNet-Incremental-Sample](https://github.com/edgegap/PurrNet-Incremental-Sample) (Unity 6000.3.11f1): two desktop clients played on the same server by direct connection and through the matchmaker (matched in about 35 s), and the server stopped itself both times. The `edgegap-purrnet` templates are the files from that run. `WebTransport` (WebGL) has not been run on Edgegap. |
| Photon Fusion 2.1 (BR200 2.1.0) | **End-to-end verified** on Edgegap (Unity 6000.3.11f1, IL2CPP server built with the `edgegap-fusion` kit): two headless clients joined each deployment in Toronto and Newark with CT Direct (14 ms in Newark), a two-player Battle Royale ran with no exceptions, and the deployment stopped on its own after the match ended. Other Fusion games: guidance only. Edgegap's matchmaker hasn't been used with Fusion; matchmaking stays on Photon Cloud. |
| Photon Fusion 2.1 (Simple FPS 2.1.1) | **End-to-end verified** on Edgegap (Unity 6000.3.11f1): the `edgegap-fusion-simplefps` kit ([fusion-simplefps-edgegap](https://github.com/edgegap/fusion-simplefps-edgegap)) on an unmodified Simple FPS project built an IL2CPP server that ran in Newark; two headless clients joined through the Party menu with CT Direct (11 to 29 ms), two players and no exceptions. Not yet tested: more than two players, a full match, the server exiting after a match. |
| Unreal Engine 5.5 (C++ subsystems) | **End-to-end verified** on Edgegap with the [unreal-sample](https://github.com/edgegap/unreal-sample) top-down project: two clients pinged the beacons, were matched under a latency rule in about 8 s, joined the same server, and the server stopped itself. The drop-in templates compile for the Win64 editor and as a Linux server (clang). Task evals: 3 scenarios (C++ project, Blueprint-only project, debugging a broken setup), 100% of checks with the skill versus 70.5% without, and only the with-skill outputs all compile against UE 5.5. |
| Godot 4.7 high-level multiplayer | **End-to-end verified** on Edgegap with [godot-sample-arena-shooter](https://github.com/edgegap/godot-sample-arena-shooter) (`WebSocketMultiplayerPeer`, `wss` with TLS Upgrade): two Windows clients matched by the matchmaker joined the same server, played, and the deployment stopped itself. The game-agnostic `edgegap-godot` templates were tested locally with Godot 4.7.2: Linux dedicated server export in Docker, a mock matchmaker and two clients, with ENet and WebSocket, through `match_ready`, `match_ended` and the self-stop call. ENet (UDP) has not been run on Edgegap yet. |
| Colyseus 0.17 (realtime-tanks-demo) | **End-to-end verified** on Edgegap with [realtime-tanks-demo](https://github.com/edgegap/realtime-tanks-demo): the matchmake HTTP request and the room WebSocket both worked through one WS port with TLS Upgrade; Node and Godot 4.5 desktop clients joined a direct deployment; matchmaker 3.3.2 matched a Three.js browser client with a Godot desktop client, then with a Unity 6 Windows build; the server stopped itself each time. The `edgegap-colyseus` templates are the files from that run. Not run: Construct 3, Defold, GameMaker, Haxe and PlayCanvas clients, Godot web, Unity WebGL, Colyseus 0.15/0.16. |
| Nakama 3.39 + Fleet Manager (fishgame-godot) | **End-to-end verified** on Edgegap with [fishgame-godot](https://github.com/edgegap/fishgame-godot) (Godot 4.7.2, nakama-edgegap `20d849e`, Nakama behind a Cloudflare quick tunnel): email sign-up, Nakama matchmaking, a deployment near the players, 5 server-decided rounds, a leaderboard win written by the server, a player's attempt to post a win refused, server self-stop. The `edgegap-nakama` Go module compiles in `nakama-pluginbuilder:3.39.0`; the Godot and Node server templates send identical requests to a mock Nakama. Not run: other auth methods than email, TypeScript/Lua modules, Heroic Cloud, the Node template on Edgegap, WebSocket game servers. |
| PlayFab Matchmaking + Azure Functions (SpaceEdge, FishNet 3.11) | **End-to-end verified** on Edgegap with [sample-playfab-matchmaker-fishnet](https://github.com/edgegap/sample-playfab-matchmaker-fishnet) (Unity 2021.3.45f2, Tugboat UDP, Azure Functions Flex Consumption on Node 22): two clients logged in and were matched by PlayFab, the `match_found` rule ran `StartEdgegapDeployment`, both clients got the server address from their read-only data about 8 s after the call and connected (`2 player(s) connected`), and the server stopped itself 48 s after they quit, and about 2 minutes after start when nobody joined. The `edgegap-playfab` files are that run's. Not run: the Unity client in WebGL, Unreal and Godot clients, latency queue rules, more than 2 players. |
| Three.js + Node.js `ws` (five minigames) | **End-to-end verified** on Edgegap with [netcode-sample-threejs-minigames](https://github.com/edgegap/netcode-sample-threejs-minigames): one image, one app version and one matchmaker profile per game (shooter, kart racer, 2v2 soccer, light cycles, sumo). Headless players queued through matchmaker 3.3.2 landed on one deployment per game, played full matches over `wss` with TLS Upgrade (soccer with the matchmaker's teams), and each server stopped itself about 17 s after its match; a browser on `http://localhost:8080` clicked Find Match and played with a headless player; unjoined deployments stopped after 120 s. Not run: Babylon.js/PlayCanvas/Phaser clients, mobile browsers, `REQUIRE_TICKET=1`. |
| Manus browser games (Node.js + WebSocket) | Templates tested locally against a mock matchmaker: backend flow (duplicate join, cancel, timeout, allocation failures), join tokens and their reject paths, reconnect, self-stop, and the Docker image. The browser client is type-checked only. Not yet run end to end on Edgegap and Manus hosting. |
| Edgegap Unity SDK | Latest, installed from the git URL with no `#tag` (3.5.5 is the first that compiles for WebGL; 3.5.6 the first whose matchmaker tickets work before Unity 2022.3). |
| Edgegap MCP | 0.3.3+ (`tls_upgrade`, `allowed_cors_origins`). Older servers work with dashboard fallbacks. |
| Triggering | `edgegap-unity`: 20/20 on its eval set (10 should-trigger prompts, 10 near-misses). `edgegap-fusion`: 20/20 on `evals/fusion-routing-eval.json`, and 57/60 routing runs with the whole pack. `edgegap-fusion-simplefps`: 47/48 routing runs with the whole pack on `evals/fusion-simplefps-routing-eval.json`. `edgegap-colyseus`: 48/48 on `evals/colyseus-routing-eval.json`. `edgegap-godot`: 57/60 routing runs with the whole pack on `evals/godot-routing-eval.json`. `edgegap-nakama`: 48/48 on `evals/nakama-routing-eval.json`; task evals 100% with the skill vs 39% without (`evals/nakama-evals.json`). `edgegap-playfab`: 54/54 routing runs with the whole pack on `evals/playfab-routing-eval.json`; task evals 100% with the skill vs 74% without (`evals/playfab-evals.json`). `edgegap-threejs`: 48/48 routing runs with the whole pack on `evals/threejs-routing-eval.json`; task evals not run. `edgegap-matchmaking`: 35/36 routing runs on its prompts in `evals/matchmaking-routing-eval.json` (62/66 for the whole file); task evals not run. `edgegap-unreal`, `edgegap-ngo`, `edgegap-fishnet` and `edgegap-purrnet`: not yet measured. The new engine-agnostic skills ship with a routing eval set (`evals/routing-eval.json`) and safety scenarios (`evals/guardrails.json`), not yet run. |
| Engine-agnostic skills (0.2.0) | Written from the Edgegap docs and the published OpenAPI spec, and checked against the Unity end-to-end run. Exercised end to end with Unity, Unreal Engine and Godot servers; not yet with Node. |

## Security and cost

- Your **Edgegap API token** is organization-wide and can't be scoped. The skill never writes it to files, code or chat. It goes in the plugin's sensitive setting (prompted at install) or your own MCP config.
- The **matchmaker Auth Token** is designed to ship in game clients and grants no account access.
- Deployments cost money outside the free tier. The skill tags its test deployments, stops the ones it starts, and makes servers stop themselves when matches end.

## Repository layout

```
.claude-plugin/        plugin + marketplace manifests
.mcp.json              hosted Edgegap MCP server (token from the plugin's sensitive user setting)
skills/edgegap/        entry skill: routing, vocabulary, agent safety rules
skills/edgegap-unity/  Unity skill: SKILL.md, references/, assets/ (C# templates, Dockerfile, matchmaker configs)
skills/edgegap-fishnet/ FishNet skill: SKILL.md, references/, assets/ (FishNet-ready C# templates, Dockerfile, matchmaker config)
skills/edgegap-colyseus/ Colyseus skill: SKILL.md, references/, assets/ (lifecycle module, Dockerfile, deploy script, matchmaker config, JS/TS, Unity and Godot matchmaker clients)
skills/edgegap-nakama/  Nakama skill: SKILL.md, references/, assets/ (Go module, Nakama Dockerfile and compose, Godot and Node game server event code)
skills/edgegap-playfab/ PlayFab skill: SKILL.md, references/, assets/ (Azure Functions, deploy and PlayFab setup scripts, Unity client and server C#, Dockerfile)
skills/edgegap-threejs/ Three.js / web skill: SKILL.md, references/, assets/ (Node.js room, lifecycle, skeleton game, Dockerfile, deploy script, Three.js client shell, matchmaker client, matchmaker configs, headless e2e)
skills/edgegap-manus/   Manus skill: SKILL.md, references/, assets/ (TypeScript backend, Node.js game server, browser client, Dockerfile, GitHub Actions, matchmaker config, Manus prompts)
skills/edgegap-purrnet/ PurrNet skill: SKILL.md, references/, assets/ (runtime-bootstrapped C# templates, settings asset, Dockerfile, matchmaker config)
skills/edgegap-unreal/ Unreal Engine skill: SKILL.md, references/, assets/ (C++ subsystems, ini, Dockerfile, matchmaker config)
skills/edgegap-matchmaking/ matchmaking skill: SKILL.md, references/ (profiles, region selection, backfill, third-party matchmakers), assets/ (matchmaker configs)
skills/edgegap-eos-voice/ EOS Voice skill: SKILL.md, references/, assets/ (C++ voice classes, ini, Build.cs and .uproject snippets)
skills/edgegap-*/      engine-agnostic skills (server design, containerize, testing, API, launch, troubleshoot)
evals/                 task evals, trigger and routing sets, safety scenarios, a small fixture project
scripts/               validate.py, scan_private_refs.py, check_spec.py (all run by CI)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome, especially end-to-end reports for netcodes and platforms not yet verified.

## License

[Apache 2.0](LICENSE)
