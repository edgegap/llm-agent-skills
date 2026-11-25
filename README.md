# Edgegap Agent Skills

[![skills.sh](https://skills.sh/b/edgegap/llm-agent-skills)](https://skills.sh/edgegap/llm-agent-skills)

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
│  ├─ edgegap-unreal ·············· Unreal Engine end to end: Edgegap Unreal SDK (UE 5.0-5.8), Linux server, matchmaker, e2e test
│  │  └─ edgegap-eos-voice ········ EOS Voice chat on top: the game server decides who talks to whom
│  ├─ edgegap-godot ··············· Godot 4 end to end: GDScript server lifecycle + matchmaker client, build with the Edgegap Godot plugin
│  ├─ edgegap-colyseus ············ Colyseus (Node.js) servers, any client: per-match servers, matchmaker clients, verified
│  ├─ edgegap-cocos ··············· Cocos Creator 3.8 games with their own server: the Edgegap Cocos extension, wss, Find Match
│  ├─ edgegap-threejs ············· Three.js / web games + Node.js ws server: per-match servers, Find Match, verified
│  ├─ edgegap-browser-wasm ········ browser / WebAssembly games: Rapier physics on server + client prediction, wss, slim image
│  ├─ edgegap-vibe-coded ·········· vibe-coded single-player web games made online: game fit, shared rules file, public demo
│  ├─ edgegap-chat-canvas ········· Claude, ChatGPT and Gemini Canvas games (one HTML file from a chat): rules between markers, split script, online matches, verified
│  ├─ edgegap-fal ················· fal.ai games (coding agent + fal assets, or fal Agent): server-ready rules, asset pipeline, online matches, verified
│  └─ edgegap-manus ··············· Manus games: no Cloud Computer needed (self-hosted server on Edgegap), or Steam sign-in + backend matchmaking
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
│  ├─ edgegap-ugs-matchmaker ······ Unity Matchmaker (UGS) + Unity's EdgegapAllocator Cloud Code module, leaving Multiplay
│  ├─ edgegap-supabase ············ Supabase Auth, profiles, leaderboard, Edge Functions + per-match servers, verified
│  ├─ edgegap-matchmaking ········· who owns matchmaking, profiles, parties, regions, backfill, third-party matchmakers
│  └─ edgegap-deployments-api ····· Deploy API, webhooks, cleanup; EOS and Steam lobbies
│
├─ Going live
│  └─ edgegap-launch ·············· launch checklist, rollouts, caching, cost control, operations
│
└─ Find an example
   └─ edgegap-samples ············· every public Edgegap sample, SDK and tool: stack, last update, current or legacy
```

| Skill | What it does |
|---|---|
| [`edgegap`](skills/edgegap/SKILL.md) | Starting point for any engine. Picks the server shape for any game, including always-online single-player games whose logic should stay off the client, explains apps, versions, deployments and the matchmaker, sets the safety rules for acting on an Edgegap account, and routes to the other skills. |
| [`edgegap-unity`](skills/edgegap-unity/SKILL.md) | Unity games (Mirror, WebGL, other netcodes; NGO, FishNet, PurrNet and Photon Fusion projects go to `edgegap-ngo`, `edgegap-fishnet`, `edgegap-purrnet` and `edgegap-fusion`). Converts host/client code to a headless dedicated server, builds and containerizes the Linux server, deploys it on Edgegap, integrates the Edgegap matchmaker SDK in the client, writes the matchmaker config, then debugs until real players get matched onto a server. |
| [`edgegap-ngo`](skills/edgegap-ngo/SKILL.md) | Unity games built on Netcode for GameObjects, including Boss Room-style `ConnectionManager` projects. Ships templates from the end-to-end run of [netcode-game-sample-unity-ngo-bossroom](https://github.com/edgegap/netcode-game-sample-unity-ngo-bossroom) that add themselves at startup without scene edits (server start and self-stop, a Find Match panel, a settings asset), the Boss Room adapter, and NGO fixes: host-only logic, payloads and approval, UnityTransport needing an IP, client-only code on the server. |
| [`edgegap-fishnet`](skills/edgegap-fishnet/SKILL.md) | Unity games built on FishNet (Tugboat, Bayou, WebGL). Ships the FishNet-ready matchmaker client, server self-stop and scene-change persistence from the end-to-end run of [netcode-game-sample-unity-fishnet-hashgrid](https://github.com/edgegap/netcode-game-sample-unity-fishnet-hashgrid), and covers Start On Headless, Bayou `wss` with TLS Upgrade, removing client-side Edgegap API calls from older samples, and the SDK fix that Unity 2021.3 needs for matchmaker tickets. |
| [`edgegap-purrnet`](skills/edgegap-purrnet/SKILL.md) | Unity games built on PurrNet. Ships the templates from the end-to-end run of [netcode-game-sample-unity-purrnet-incremental](https://github.com/edgegap/netcode-game-sample-unity-purrnet-incremental): they add themselves at startup without scene edits (server start and self-stop, a connect panel with direct and matchmaker modes, a settings asset, command-line test flags). Covers PurrNet's auto start flags, the async `StartClient`, and `ObserversRpc` setup code that never runs on a dedicated server. |
| [`edgegap-fusion`](skills/edgegap-fusion/SKILL.md) | Unity games built on Photon Fusion 2, verified with Photon's BR200 Battle Royale sample. Ships a drop-in BR200 kit that changes no sample code (server build with preflight checks, Dockerfile, a start script that maps Edgegap's variables to BR200's command-line options, picks the Photon region and self-stops) and headless test clients that log the connection type. Covers the bind address (0.0.0.0 gives Direct, 127.0.0.1 forces Photon relays, the public IP fails to bind), IL2CPP on the server, and the Linux toolchain packages. |
| [`edgegap-fusion-simplefps`](skills/edgegap-fusion-simplefps/SKILL.md) | Photon's Simple FPS (Fusion 2) sample as dedicated servers, joined from the sample's Party menu by deployment FQDN and Photon region. Ships the drop-in kit from [netcode-game-sample-photon-fusion2-simple-fps](https://github.com/edgegap/netcode-game-sample-photon-fusion2-simple-fps) that edits no Simple FPS or Fusion file: a `FusionBootstrap` subclass (server auto-start in server builds, session named after the deployment, scene active on load, region and session logged), a Party menu subclass, an editor setup and IL2CPP builds, a Dockerfile, and headless clients that join through the Party menu. Covers the two traps that make clients throw `NullReferenceException` in `Player.FixedUpdateNetwork`: a server built with only the Deathmatch scene, and a scene that isn't active on load. |
| [`edgegap-unreal`](skills/edgegap-unreal/SKILL.md) | Unreal Engine 5 games, C++ or Blueprint-only. Sets up the source engine and Linux cross-compile toolchain, makes the project dedicated-server ready, adds the [Edgegap Unreal SDK](https://github.com/edgegap/sdk-unreal-engine) plugin on UE 5.0 to 5.8 (matchmaker client with latency beacons, server ticket check, self-stop; beta) or two drop-in C++ subsystems outside that range, packages and containerizes the Linux server, deploys it on Edgegap, writes the matchmaker config, then tests two clients end to end. |
| [`edgegap-eos-voice`](skills/edgegap-eos-voice/SKILL.md) | In-game voice chat with [EOS Voice](https://dev.epicgames.com/docs/epic-online-services/multiplayer/voice-and-rtc-interface/voice-interface/voice-overview) for an Unreal game on Edgegap. The dedicated server is the trusted server: it verifies each player's EOS ID token, picks a match or team room from the matchmaker's ticket data, requests room tokens from the EOS Voice Web API (EOS Voice doesn't run on Linux) and removes players who leave. Drop-in C++ that needs no game class edits, device ID login (no Epic account), Developer Portal setup, and a two-client test with fake audio, verified end to end on Edgegap with [game-sample-unreal-engine-topdown](https://github.com/edgegap/game-sample-unreal-engine-topdown). |
| [`edgegap-godot`](skills/edgegap-godot/SKILL.md) | Godot 4 games on high-level multiplayer (`ENetMultiplayerPeer` over UDP, `WebSocketMultiplayerPeer` with `wss` for web exports, netfox on top). Ships GDScript templates from the end-to-end run of [game-sample-godot-arena-shooter](https://github.com/edgegap/game-sample-godot-arena-shooter), made game-agnostic: a server lifecycle autoload (waits for the matched players from `MM_TICKET_IDS`, stops its own deployment), a matchmaker client and Find Match button. The server export, image, local test and push go through the [Edgegap Godot plugin](https://github.com/edgegap/buildtool-godot-plugin)'s editor dock, so the agent writes no Dockerfile or registry login. Covers moving a Host button to a dedicated server and the Godot pitfalls: empty logs without `flush_stdout_on_print`, export allowlists that drop new scripts, `class_name` clashes with the plugin, and join validation that silently blocks matched players. |
| [`edgegap-colyseus`](skills/edgegap-colyseus/SKILL.md) | Games with a [Colyseus](https://colyseus.io) (Node.js) server and any client. One Colyseus process per match on Edgegap, placed near its players, reached directly or through the Edgegap matchmaker over `wss` with TLS Upgrade (the matchmake HTTP request and the room WebSocket share one port). Ships the files from the end-to-end run of [backend-game-sample-threejs-colyseus-tanks](https://github.com/edgegap/backend-game-sample-threejs-colyseus-tanks): a lifecycle module that stops the deployment when nobody joins, everyone leaves or the match ends, a Dockerfile with Node as PID 1, a direct deploy script, a matchmaker config, and dependency-free matchmaker clients for browser JS/TS, Unity and Godot. Covers the 502 a fresh deployment returns for a few seconds (retry the join), FQDN-only `wss`, CORS origins, and turning off the playground and monitor. |
| [`edgegap-cocos`](skills/edgegap-cocos/SKILL.md) | Cocos Creator 3.8 games whose server is not Colyseus (usually Node.js with `ws` or socket.io). One server per match on Edgegap with a WebSocket port behind TLS Upgrade for `wss://`, deployed with the [Edgegap Cocos extension](https://github.com/edgegap/buildtool-cocos-plugin) or the MCP; a Cocos client that connects by FQDN and Find Match with `@edgegap/sdk`. Covers WeChat and Douyin mini-game domain allowlists, which a new hostname per deployment runs into. Server and client templates tested locally. |
| [`edgegap-manus`](skills/edgegap-manus/SKILL.md) | Games built with [Manus](https://manus.im). Path A: when Manus Game Dev asks for a Cloud Computer to host multiplayer, have it build a self-hostable Node.js server instead and run that on Edgegap, one server per match that stops itself (the prompts, a drop-in self-stop, Dockerfile, app version, test). Path B: the Manus backend signs players in with Steam, creates Edgegap matchmaker tickets (mode, region, party, player IP) and returns only the server address and a short-lived signed join token; the game rules move to an authoritative Node.js WebSocket server that runs on Edgegap with TLS Upgrade (`wss`) and stops itself. Includes duplicate-ticket prevention, timeouts, cancel, reconnect, allocation error handling, a GitHub Actions image build, and phase-by-phase prompts to paste into Manus. |
| [`edgegap-threejs`](skills/edgegap-threejs/SKILL.md) | Browser games in Three.js (or Babylon.js, PlayCanvas, Phaser, canvas) with their own Node.js WebSocket server. One authoritative server per match on Edgegap; the page calls the matchmaker directly (client-safe token, CORS) and connects over `wss` with TLS Upgrade. Ships the shared files of [netcode-sample-threejs-minigames](https://github.com/edgegap/netcode-sample-threejs-minigames): a game-agnostic room (phases, bots, fixed tick, snapshots, matchmaker teams, self-stop), a no-build Three.js client with Find Match, direct and local modes, a skeleton game, one image for several games, a multi-profile matchmaker config, and headless-player and e2e scripts. Covers 429 rate limits on ticket bursts, stale tickets, and team profiles that only make partial matches at ticket expiry. |
| [`edgegap-browser-wasm`](skills/edgegap-browser-wasm/SKILL.md) | Browser and WebAssembly games made authoritative multiplayer: the same WASM physics engine (Rapier) runs on a Node.js server as the truth and in the browser to predict the local player, over `wss://` with TLS Upgrade. Ships the files of [netcode-sample-threejs-rapier](https://github.com/edgegap/netcode-sample-threejs-rapier): a shared physics module, the server (fixed tick, input queue, snapshots with acks, keep-alive, empty-server self-stop, SIGTERM), the client predictor and connection code, and a multi-stage Dockerfile with an allowlist `.dockerignore` (63.5 MB image, no client files, no runtime download). Covers the exact Chrome/Edge messages for mixed content, certificate, TLS and port errors, and WASM in containers and on static hosts. |
| [`edgegap-vibe-coded`](skills/edgegap-vibe-coded/SKILL.md) | Single-player browser games made with an AI tool (Claude, Cursor, Lovable, Bolt, v0...) turned into online matches without losing solo play. Checks whether the game holds up with network delay, gets the code out of the AI tool into a repo, moves the rules into one file the page and the server both run, then uses the `edgegap-threejs` templates for the server, Find Match and tests. Covers running a public demo: matchmaker always on, servers that stop within seconds, free-tier limits, no deployment cap. Worked example: [netcode-sample-threejs-thin-ice-tussle](https://github.com/edgegap/netcode-sample-threejs-thin-ice-tussle) (tags `before` and `after`), verified on Edgegap. |
| [`edgegap-chat-canvas`](skills/edgegap-chat-canvas/SKILL.md) | Browser games written in a chat as one HTML file: a Claude artifact on claude.ai, a ChatGPT game on chatgpt.com or a Gemini Canvas. The prompt asks Claude to keep every rule between the exact lines `/* RULES:BEGIN */` and `/* RULES:END */`, so the file still plays in the artifact preview and can go back into the chat for changes; `split-artifact.mjs` copies that block into an ES module the Node.js server imports, refuses browser code in it, and checks in CI that the server's rules still match the artifact. Then the page's online mode (Claude's renderer draws the server's world), a direct `?server=` path for friends without a matchmaker, the optional Find Match, a GitHub Actions image build, tests and clean-up. It also has the checks and the fix prompt for what the chat gets wrong (ChatGPT's first file had frozen bots), and how to get the exact file out of each chat. Worked examples verified on Edgegap: [netcode-sample-claude-star-snatch](https://github.com/edgegap/netcode-sample-claude-star-snatch) (Claude) and [netcode-sample-chatgpt-turf-painters](https://github.com/edgegap/netcode-sample-chatgpt-turf-painters) (ChatGPT) and [netcode-sample-gemini-bomb-tag](https://github.com/edgegap/netcode-sample-gemini-bomb-tag) (Gemini Canvas). |
| [`edgegap-fal`](skills/edgegap-fal/SKILL.md) | Browser games made with [fal.ai](https://fal.ai), on two paths. A coding agent (Claude Code, Codex, Cursor, ChatGPT) writes a Three.js or canvas game and fal generates the assets through the fal MCP or the `genmedia` CLI: the skill has the game prompt that keeps every rule in one DOM-free `rules.js`, the asset pipeline (concept image to rigged GLB with walk and run clips, props, textures, sounds, shrinking for the web, the Three.js loader pitfalls) and the rule that no asset reaches the server image. Or fal Agent writes the code in a chat: the prompt, and getting code out of the chat. Both then take the `edgegap-vibe-coded` and `edgegap-threejs` path: shared rules on an authoritative Node.js server per match, Find Match, a GitHub Actions image build, the dashboard path without an API token, end-to-end tests and clean-up. Worked examples verified on Edgegap: [netcode-sample-fal-relic-rumble](https://github.com/edgegap/netcode-sample-fal-relic-rumble) (3D, fal assets) and [netcode-sample-fal-orb-arena](https://github.com/edgegap/netcode-sample-fal-orb-arena) (fal Agent). |
| [`edgegap-server-design`](skills/edgegap-server-design/SKILL.md) | Engine-agnostic server design: authority, injected env vars, fixed port on `0.0.0.0`, readiness, self-stop at match end, SIGTERM draining, logging. |
| [`edgegap-containerize`](skills/edgegap-containerize/SKILL.md) | Packages any server into a `linux/amd64` image, pushes it to the Edgegap registry or another one, and registers the app version with the right ports, credentials and restart policy. |
| [`edgegap-local-testing`](skills/edgegap-local-testing/SKILL.md) | Parity `docker run`, the random-external-port test, the drain test, two servers on one host, resource sizing, then one tagged smoke-test deployment. |
| [`edgegap-matchmaking`](skills/edgegap-matchmaking/SKILL.md) | Matchmaking design for any engine. Picks who owns matchmaking (Edgegap's hosted matchmaker, your own allocator, or a matchmaker you keep: Unity Matchmaker, Nakama, PlayFab, EOS or Steam lobbies, Pragma, AccelByte, Open Match), designs profiles (teams, parties, skill, modes, expansions, 30 s queues), places servers with ping beacons and player IPs (region and hub pickers), and adds backfill so running servers take new players and replace leavers. Ships three annotated matchmaker configs and an engine-agnostic backfill loop that follows the backfill verified on Edgegap with Megacity Metro. |
| [`edgegap-deployments-api`](skills/edgegap-deployments-api/SKILL.md) | Backend code that deploys servers for matches: player-based placement, env vars, tags, webhooks, rate limits, error handling, reconciliation. Covers keeping Unity Matchmaker or EOS lobbies. |
| [`edgegap-nakama`](skills/edgegap-nakama/SKILL.md) | Games with a [Nakama](https://heroiclabs.com/nakama/) backend, any engine. Nakama keeps accounts, matchmaking and leaderboards; each match it forms gets its own Edgegap server near the players through the [Edgegap Fleet Manager for Nakama](https://github.com/edgegap/backend-nakama-edgegap-plugin). Ships the files from the end-to-end run of [backend-game-sample-godot-nakama-fishgame](https://github.com/edgegap/backend-game-sample-godot-nakama-fishgame): a Go module (Fleet Manager, the AfterAuthenticate hook for the game's real sign-in, a MatchmakerMatched hook that returns no Nakama match, notifications 111/112/113, an authoritative leaderboard written by the server through an S2S RPC), the Nakama Dockerfile and compose, and game server code for READY, batched connection events, STOP and player checks (Godot, verified; Node). Covers the plugin README's matchmaker sample, the tags Go can't use, `sh -x` leaking the token, and why Nakama needs a public HTTPS URL. Unity servers use [backend-nakama-unity-template-model](https://github.com/edgegap/backend-nakama-unity-template-model). |
| [`edgegap-playfab`](skills/edgegap-playfab/SKILL.md) | Games that keep [PlayFab](https://playfab.com) for players, login and Matchmaking, any engine, including studios leaving PlayFab Multiplayer Servers. The queue runs with server allocation off; a rule on `match_found` runs an Azure Function that deploys an Edgegap server near the matched players, and Edgegap's ready webhook runs a second one that checks the deployment and writes the address to each player's read-only data. Ships the files from the end-to-end run of [backend-game-sample-unity-playfab-matchmaker-fishnet-spaceedge](https://github.com/edgegap/backend-game-sample-unity-playfab-matchmaker-fishnet-spaceedge): the two Node.js functions (no SDKs), deploy and PlayFab setup scripts, a dependency-free Unity client and a server self-stop, plus the REST contract for other engines. Covers new titles blocking `LoginWithCustomID` player creation, legacy CloudScript, the 10 s rule timeout, ticket polling limits, and keeping the title secret off the game server. |
| [`edgegap-ugs-matchmaker`](skills/edgegap-ugs-matchmaker/SKILL.md) | Unity games that keep Unity Matchmaker (UGS), for example when leaving Multiplay Hosting. Unity's `EdgegapAllocator` Cloud Code module (in [Unity-Technologies/matchmaker-hosting-providers](https://github.com/Unity-Technologies/matchmaker-hosting-providers)) starts one Edgegap server per match near the players and returns IP and port to the tickets. Covers deploying the module with the UGS CLI, the token secret, the queue's Cloud Code hosting, the client ticket flow and the server side. |
| [`edgegap-supabase`](skills/edgegap-supabase/SKILL.md) | Games with a [Supabase](https://supabase.com) backend. Supabase signs players in (anonymous, upgradable), keeps profiles, wins and match history behind Row Level Security, and pushes a live leaderboard; an Edge Function holds the Edgegap matchmaker token and ties every ticket to a user; the game server on Edgegap verifies players' access tokens against the project's JWKS (no Supabase key on the server) and reports results to a second Edge Function, where Postgres only accepts players with their own unused ticket. Templates from [netcode-sample-threejs-supabase](https://github.com/edgegap/netcode-sample-threejs-supabase). |
| [`edgegap-launch`](skills/edgegap-launch/SKILL.md) | Production checklist: tier limits, tokens, version settings, caching, log storage, blue/green rollouts, cost control, observability, Private Fleets for persistent servers. |
| [`edgegap-troubleshoot`](skills/edgegap-troubleshoot/SKILL.md) | Symptom → cause → fix for images, registries, app versions, deployments, server processes, networking and the matchmaker. |
| [`edgegap-samples`](skills/edgegap-samples/SKILL.md) | A catalog of every public Edgegap sample, SDK and build tool: engine, netcode or backend, last update, current or legacy, and which skill walks through it. For "is there an example for my stack" and "is this sample still current". |

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
/plugin marketplace add edgegap/llm-agent-skills
/plugin install edgegap@edgegap
```

The plugin installs all the skills **and** the hosted Edgegap MCP server. When you install and enable it, Claude Code asks for your [Edgegap API token](https://app.edgegap.com/user-settings?tab=tokens) (paste just the UUID). It is stored in your system's secure credential store (it's a `sensitive` plugin setting), never in your project, and sent only to the Edgegap MCP server.

### Any agent: the `skills` CLI

Install every skill into the current project (Claude Code, Cursor, Copilot, Codex and other agents that read `SKILL.md`):

```bash
npx skills add edgegap/llm-agent-skills --skill "*"
```

Add `-g` to install for your user instead of one project, or pick skills, e.g. `--skill edgegap --skill edgegap-containerize`. Update later with `npx skills update`.

### Claude Code: skills only, by hand

Copy the skills into your user skills folder:

```bash
git clone https://github.com/edgegap/llm-agent-skills
cp -r llm-agent-skills/skills/* ~/.claude/skills/
```

Manual copies don't update themselves; copy again after pulling.

Then add the Edgegap MCP server yourself:

```bash
claude mcp add --transport http edgegap https://mcp.edgegap.com/mcp -H "Authorization: token <YOUR_EDGEGAP_API_TOKEN>" --scope user
```

### Codex: plugin

Add this repository as a plugin marketplace and install the plugin (Codex CLI; in the ChatGPT desktop app, install `edgegap` from the Plugins Directory after adding the marketplace):

```bash
codex plugin marketplace add edgegap/llm-agent-skills
codex plugin add edgegap@edgegap
```

The plugin installs every skill (call one with `$edgegap`, `$edgegap-threejs`... or just describe what you want) **and** the hosted Edgegap MCP server, which reads your [Edgegap API token](https://app.edgegap.com/user-settings?tab=tokens) from the `EDGEGAP_API_TOKEN` environment variable. Set it to the UUID only, in the environment Codex starts from; Codex sends it as `Authorization: Bearer <token>`, which the hosted server accepts. The token stays out of your project. `codex mcp list` shows `edgegap` with `Bearer token` auth.

Without the plugin, add the server yourself (`codex mcp add edgegap --url https://mcp.edgegap.com/mcp --bearer-token-env-var EDGEGAP_API_TOKEN`) and install the skills with `npx skills add edgegap/llm-agent-skills --skill "*"`, which puts them in `.agents/skills`, where Codex reads them.

Worked example: [netcode-sample-codex-slime-sumo](https://github.com/edgegap/netcode-sample-codex-slime-sumo), where Codex built a Phaser game with OpenAI's Game Studio plugin, then made it online multiplayer on Edgegap with this plugin from one prompt (every prompt is in its `PROMPTS.md`). On Windows, the Codex CLI's sandbox may only allow reading files; run it in the ChatGPT desktop app, in WSL, or start `codex` with `--dangerously-bypass-approvals-and-sandbox` in the game's folder.

To keep Codex on the Edgegap rules in a game repo, copy [`skills/edgegap/assets/AGENTS.md`](skills/edgegap/assets/AGENTS.md) into the repo's `AGENTS.md`.

### Other agents

Each skill is a plain folder: `SKILL.md`, plus `references/` and sometimes `assets/`. Use the `skills` CLI above, or point your agent at `skills/edgegap/SKILL.md` (or `skills/edgegap-unity/SKILL.md` for Unity, `skills/edgegap-fishnet/SKILL.md` for FishNet, `skills/edgegap-purrnet/SKILL.md` for PurrNet, `skills/edgegap-unreal/SKILL.md` for Unreal Engine, `skills/edgegap-colyseus/SKILL.md` for Colyseus servers, `skills/edgegap-nakama/SKILL.md` for Nakama backends, `skills/edgegap-manus/SKILL.md` for Manus games). Manus users can import `skills/edgegap-manus` in Manus (Plugins & Skills → Skills → Create → Import skill from GitHub) or upload the folder. For the MCP server in other clients (Cursor, VS Code, Codex, Claude Desktop), see [llm-mcp-server](https://github.com/edgegap/llm-mcp-server).

> claude.ai and Claude Desktop *custom connectors* can't send an `Authorization` header, so they can't use the hosted MCP server. In Claude Desktop, use the local server (`npx -y @edgegap/mcp`) as described in the edgegap-mcp README.

## What the plugin runs, sends and fetches

Everything here happens only when you ask the agent to work on your game, and most steps show you the command first.

**Network**
- **Hosted Edgegap MCP server**, `https://mcp.edgegap.com/mcp`, operated by Edgegap. Every tool call sends your Edgegap API token in the `Authorization` header. The server uses it for that request against the Edgegap API (`https://api.edgegap.com`) and does not store it. Tools list and create applications and app versions, start, inspect and stop deployments, read deployment logs, list registry tags, and generate Dockerfiles and matchmaker configs. Deployments are billed to your Edgegap account outside the free tier.
- **Edgegap API from your backend**, `https://api.edgegap.com`: code the `edgegap-deployments-api` skill writes for your backend calls it at runtime, with the token from your backend's secret manager. The agent itself never calls it directly or reads a token from your machine.
- **Edgegap container registry**, `registry.edgegap.com`: `docker push` of your game server image, using the registry login you enter yourself with `docker login`.
- **GitHub**: Unity Package Manager downloads the Edgegap Unity SDK (`https://github.com/edgegap/sdk-unity-sessions-matchmaker-server-browser.git`, latest) when the skill adds it to your project. For Unreal, you clone the engine source (`https://github.com/EpicGames/UnrealEngine`) yourself, and its `Setup.bat` downloads engine dependencies from Epic.
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
| Netcode for GameObjects 1.13 + UnityTransport (UDP) | **End-to-end verified** on Edgegap with [netcode-game-sample-unity-ngo-bossroom](https://github.com/edgegap/netcode-game-sample-unity-ngo-bossroom) (Boss Room, Unity 6000.0.54f1): two desktop clients played in the dungeon on the same server by direct connection and through the matchmaker (connected within 40 s of launch), and the server stopped itself. The generic `edgegap-ngo` server start and direct connection were tested locally (Docker server, two clients). NGO 2.4: `edgegap-unity` templates compile and the Linux server builds. |
| FishNet 4.1 + Bayou (WebGL) | **End-to-end verified** on Edgegap with [netcode-game-sample-unity-fishnet-hashgrid](https://github.com/edgegap/netcode-game-sample-unity-fishnet-hashgrid) (Unity 2021.3.45f2): two browser clients matched by the matchmaker, connected over `wss` with TLS Upgrade, played, and the server stopped itself; the no-player self-stop works too. The `edgegap-fishnet` templates are the files from that run. |
| PurrNet + UDPTransport | **End-to-end verified** on Edgegap with [netcode-game-sample-unity-purrnet-incremental](https://github.com/edgegap/netcode-game-sample-unity-purrnet-incremental) (Unity 6000.3.11f1): two desktop clients played on the same server by direct connection and through the matchmaker (matched in about 35 s), and the server stopped itself both times. The `edgegap-purrnet` templates are the files from that run. |
| Photon Fusion 2.1 (BR200 2.1.0) | **End-to-end verified** on Edgegap (Unity 6000.3.11f1, IL2CPP server built with the `edgegap-fusion` kit): two headless clients joined each deployment in Toronto and Newark with CT Direct (14 ms in Newark), a two-player Battle Royale ran with no exceptions, and the deployment stopped on its own after the match ended. Other Fusion games: guidance only. Edgegap's matchmaker hasn't been used with Fusion; matchmaking stays on Photon Cloud. |
| Photon Fusion 2.1 (Simple FPS 2.1.1) | **End-to-end verified** on Edgegap (Unity 6000.3.11f1): the `edgegap-fusion-simplefps` kit ([netcode-game-sample-photon-fusion2-simple-fps](https://github.com/edgegap/netcode-game-sample-photon-fusion2-simple-fps)) on an unmodified Simple FPS project built an IL2CPP server that ran in Newark; two headless clients joined through the Party menu with CT Direct (11 to 29 ms), two players and no exceptions. |
| Unreal Engine 5.5 (C++ subsystems) | **End-to-end verified** on Edgegap with the [game-sample-unreal-engine-topdown](https://github.com/edgegap/game-sample-unreal-engine-topdown) top-down project: two clients pinged the beacons, were matched under a latency rule in about 8 s, joined the same server, and the server stopped itself. The drop-in templates compile for the Win64 editor and as a Linux server (clang). Task evals: 3 scenarios (C++ project, Blueprint-only project, debugging a broken setup), 100% of checks with the skill versus 70.5% without, and only the with-skill outputs all compile against UE 5.5. |
| Edgegap Unreal SDK (beta, UE 5.0-5.8) | The SDK passed live matchmaking and ticket-check runs on Edgegap on UE 5.8 (2026-11-02) and compiled with its tests on 5.0.3, 5.3.2 and 5.5.4. |
| Godot 4.7 high-level multiplayer | **End-to-end verified** on Edgegap with [game-sample-godot-arena-shooter](https://github.com/edgegap/game-sample-godot-arena-shooter) (`WebSocketMultiplayerPeer`, `wss` with TLS Upgrade): two Windows clients matched by the matchmaker joined the same server, played, and the deployment stopped itself. The game-agnostic `edgegap-godot` templates were tested locally with Godot 4.7.2: Linux dedicated server export in Docker, a mock matchmaker and two clients, with ENet and WebSocket, through `match_ready`, `match_ended` and the self-stop call. |
| Colyseus 0.17 (realtime-tanks-demo) | **End-to-end verified** on Edgegap with [backend-game-sample-threejs-colyseus-tanks](https://github.com/edgegap/backend-game-sample-threejs-colyseus-tanks): the matchmake HTTP request and the room WebSocket both worked through one WS port with TLS Upgrade; Node and Godot 4.5 desktop clients joined a direct deployment; matchmaker 3.3.2 matched a Three.js browser client with a Godot desktop client, then with a Unity 6 Windows build; the server stopped itself each time. The `edgegap-colyseus` templates are the files from that run. |
| Nakama 3.39 + Fleet Manager (fishgame-godot) | **End-to-end verified** on Edgegap with [backend-game-sample-godot-nakama-fishgame](https://github.com/edgegap/backend-game-sample-godot-nakama-fishgame) (Godot 4.7.2, nakama-edgegap `20d849e`, Nakama behind a Cloudflare quick tunnel): email sign-up, Nakama matchmaking, a deployment near the players, 5 server-decided rounds, a leaderboard win written by the server, a player's attempt to post a win refused, server self-stop. The `edgegap-nakama` Go module compiles in `nakama-pluginbuilder:3.39.0`; the Godot and Node server templates send identical requests to a mock Nakama. |
| PlayFab Matchmaking + Azure Functions (SpaceEdge, FishNet 3.11) | **End-to-end verified** on Edgegap with [backend-game-sample-unity-playfab-matchmaker-fishnet-spaceedge](https://github.com/edgegap/backend-game-sample-unity-playfab-matchmaker-fishnet-spaceedge) (Unity 2021.3.45f2, Tugboat UDP, Azure Functions Flex Consumption on Node 22): two clients logged in and were matched by PlayFab, the `match_found` rule ran `StartEdgegapDeployment`, both clients got the server address from their read-only data about 8 s after the call and connected (`2 player(s) connected`), and the server stopped itself 48 s after they quit, and about 2 minutes after start when nobody joined. The `edgegap-playfab` files are that run's. |
| Three.js + Node.js `ws` (five minigames) | **End-to-end verified** on Edgegap with [netcode-sample-threejs-minigames](https://github.com/edgegap/netcode-sample-threejs-minigames): one image, one app version and one matchmaker profile per game (shooter, kart racer, 2v2 soccer, light cycles, sumo). Headless players queued through matchmaker 3.3.2 landed on one deployment per game, played full matches over `wss` with TLS Upgrade (soccer with the matchmaker's teams), and each server stopped itself about 17 s after its match; a browser on `http://localhost:8080` clicked Find Match and played with a headless player; unjoined deployments stopped after 120 s. |
| three.js + Rapier WASM (browser / WebAssembly reference) | **Verified locally** on 2026-11-18 with [netcode-sample-threejs-rapier](https://github.com/edgegap/netcode-sample-threejs-rapier): two headless players and two browser windows on one server, the image started with `--network none`, SIGTERM and the empty-server stop; the browser errors reproduced in Chrome 157 and Edge 157. Its WS + TLS Upgrade deployment path is the one verified on Edgegap with the Three.js minigames. |
| Supabase backend + Three.js (Sumo Push) | **End-to-end verified** on Edgegap with [netcode-sample-threejs-supabase](https://github.com/edgegap/netcode-sample-threejs-supabase) on 2026-11-03 (hosted Supabase, CLI 3.0.0, supabase-js 2.118.0): anonymous sign-in, Find Match through the Edge Function, two players on one deployment, full match with verified access tokens, result recorded in Supabase, self-stop; a browser match with the live leaderboard; RLS and report forgery checks against the live project. |
| Unity Matchmaker (UGS) + `EdgegapAllocator` | Written from Unity's module code, its unit tests and Unity's docs; the Edgegap side is the one verified in the Unity samples above. |
| Cocos Creator + own Node.js server | Server, Docker image and client templates tested locally (two clients, ticket check, self-stop call); client files type-checked against `@edgegap/sdk` 1.1.0. |
| Gemini Canvas games (one HTML file, Node.js + WebSocket server) | Verified on Edgegap 2026-11-20: a Gemini Canvas file split by marker lines, two browser tabs in one match on a direct deployment (`?server=`) and through the matchmaker (Find match), self-stop after the match. Public sample: [netcode-sample-gemini-bomb-tag](https://github.com/edgegap/netcode-sample-gemini-bomb-tag). |
| ChatGPT games (one HTML file, Node.js + WebSocket server) | Verified on Edgegap 2026-11-20: a chatgpt.com file split by marker lines, two browser tabs in one match on a direct deployment (`?server=`) and through the matchmaker (Find match), self-stop after the match. Public sample: [netcode-sample-chatgpt-turf-painters](https://github.com/edgegap/netcode-sample-chatgpt-turf-painters). |
| Claude artifacts (one HTML file, Node.js + WebSocket server) | Verified on Edgegap 2026-11-20: a claude.ai artifact split by marker lines, two browser tabs in one match on a direct deployment (`?server=`) and through the matchmaker (Find match), self-stop after the match. Public sample: [netcode-sample-claude-star-snatch](https://github.com/edgegap/netcode-sample-claude-star-snatch). |
| Manus browser games (Node.js + WebSocket) | Path A (no Cloud Computer) verified on Edgegap 2026-11-20, direct and through the matchmaker (optional Find Match): a Manus-built server and client, two browser tabs in one match, self-stop after they left. Public sample: [netcode-sample-manus-orb-arena](https://github.com/edgegap/netcode-sample-manus-orb-arena). Path B templates tested locally against a mock matchmaker: backend flow (duplicate join, cancel, timeout, allocation failures), join tokens and their reject paths, reconnect, self-stop, and the Docker image. |
| Edgegap Unity SDK | Latest, installed from the git URL with no `#tag` (3.5.5 is the first that compiles for WebGL; 3.5.6 the first whose matchmaker tickets work before Unity 2022.3). |
| Edgegap MCP | 0.3.3+ (`tls_upgrade`, `allowed_cors_origins`). Older servers work with dashboard fallbacks. |
| Triggering | `edgegap-unity`: 20/20 on its eval set (10 should-trigger prompts, 10 near-misses). `edgegap-fusion`: 20/20 on `evals/fusion-routing-eval.json`, and 57/60 routing runs with the whole pack. `edgegap-fusion-simplefps`: 47/48 routing runs with the whole pack on `evals/fusion-simplefps-routing-eval.json`. `edgegap-colyseus`: 48/48 on `evals/colyseus-routing-eval.json`. `edgegap-godot`: 57/60 routing runs with the whole pack on `evals/godot-routing-eval.json`. `edgegap-nakama`: 48/48 on `evals/nakama-routing-eval.json`; task evals 100% with the skill vs 39% without (`evals/nakama-evals.json`). `edgegap-playfab`: 54/54 routing runs with the whole pack on `evals/playfab-routing-eval.json`; task evals 100% with the skill vs 74% without (`evals/playfab-evals.json`). `edgegap-threejs`: 48/48 routing runs with the whole pack on `evals/threejs-routing-eval.json`. `edgegap-matchmaking`: 35/36 routing runs on its prompts in `evals/matchmaking-routing-eval.json` (62/66 for the whole file). CI and GitHub Actions deploys: 18/18 routing runs on the six prompts added to `evals/routing-eval.json` in 0.19.0 (51/52 for the whole file, one run each). The engine-agnostic skills ship with a routing eval set (`evals/routing-eval.json`) and safety scenarios (`evals/guardrails.json`). |
| Engine-agnostic skills (0.2.0) | Written from the Edgegap docs and the published OpenAPI spec, and checked against the Unity end-to-end run. Exercised end to end with Unity, Unreal Engine and Godot servers. |

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
skills/edgegap-browser-wasm/ browser / WebAssembly skill: SKILL.md, references/ (architecture, prediction, WASM in containers, troubleshooting), assets/ (shared physics, server, Dockerfile, client predictor and connection)
skills/edgegap-vibe-coded/ vibe-coded games skill: SKILL.md, references/ (Thin Ice Tussle walkthrough, running a public demo)
skills/edgegap-chat-canvas/ chat-canvas games skill: SKILL.md, references/ (prompts, Star Snatch, ChatGPT and Gemini walkthroughs), assets/ (split-artifact.mjs, two server game.js adapters, the page's online block)
skills/edgegap-fal/     fal.ai games skill: SKILL.md, references/ (prompts, fal asset pipeline, Edgegap setup, Relic Rumble and Orb Arena walkthroughs)
skills/edgegap-supabase/ Supabase skill: SKILL.md, references/, assets/ (migration with RLS and record_match(), matchmaking and report-match Edge Functions, server token check and room patch, browser client, matchmaker config, headless e2e)
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

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome, especially end-to-end reports for new netcodes and platforms.

## License

[Apache 2.0](LICENSE)
