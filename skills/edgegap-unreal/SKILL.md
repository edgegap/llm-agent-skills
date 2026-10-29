---
name: edgegap-unreal
description: 'Unreal Engine + Edgegap: get an Unreal multiplayer game online with dedicated servers and matchmaking, end to end. Load this before using any Edgegap MCP tool on an Unreal project: it has the Unreal workflow, tested C++ drop-ins (matchmaker client with latency beacons, server self-stop), source-engine and Linux cross-compile setup, server packaging, Dockerfile, matchmaker config and fixes for the pitfalls that cost hours. Use when an Unreal dev wants online play: "put my game online", "players can only join on LAN", "nobody should have to host", "click Play and get matched", listen server to dedicated server, a .uproject that needs servers, "open <ip>" connections, packaging a Linux server, or debugging Edgegap deployments, ports or matchmaking for an Unreal game. Covers C++ and Blueprint-only projects. Use even for beginners who never say Edgegap, servers or Docker. Not for Unity (edgegap-unity), Godot or non-game backends.'
metadata:
  version: "0.1.3"
---

# Edgegap for Unreal Engine: dedicated servers + matchmaking

Goal: a player clicks **Find Match**, the Edgegap matchmaker groups players by latency, Edgegap starts a dedicated server near them, every client connects automatically, and the server shuts itself down when the match ends. The job is done when that loop works end to end with real builds, not when the code compiles.

Use **dedicated (authoritative) servers only**; never relays. Unreal's replication is already server-authoritative, so a dedicated server is the natural fit: no player hosts, has a latency advantage, or ends the match by quitting.

Verified on **UE 5.5.4** built from source (Windows editor, Linux server on Edgegap) with the top-down template, two clients, latency rules and self-stop. UE 5.3+ should work the same; the version-specific bits (build settings, toolchain version) are called out where they appear. UE 4.27 is out of scope.

## How to work

- **Be the engineer, not a tutorial.** Inspect the project, write the code, run the builds, Docker and MCP tools, read the logs yourself. Hand the developer only what truly needs them: installers and account links, dashboard clicks, secrets, and playtesting.
- **Unreal builds are slow; plan around them.** An engine source build takes 1-3 h, the first Linux server package about 1 h, the first game launch compiles shaders for minutes. Run them in the background, say how long they'll take, and never redo one you can avoid (`references/engine-setup.md` §5).
- **One layer at a time.** Each phase ends with a check that proves it works, so when something breaks you know which layer broke.
- **Secrets.** The Edgegap **API token** and **registry token** are account secrets: never in files, code, git or chat output. The **matchmaker auth token** is client-safe by design and ships in the game, but keep real values out of public repos (`Config/UserGame.ini`, §Phase 6).
- **Money.** Deployments cost money outside the free tier. Stop the ones you start, never leave one running, and remember the free tier allows one deployment at a time, so a forgotten test server silently blocks matchmaking.
- Track the phases as a todo list; sessions are long.

## Phase 0: Understand the project (read before asking)

Inspect, don't interrogate:
- `*.uproject`: `EngineAssociation` (a version like `5.5`, or a GUID meaning a source build), `Modules` (none means **Blueprint-only**), plugins (OnlineSubsystem*, EOS, Steam).
- `Source/*.Target.cs`: is there a `Type = TargetType.Server` target? `DefaultBuildSettings`/`IncludeOrderVersion`.
- `Config/DefaultEngine.ini`: `GameDefaultMap`, `ServerDefaultMap`, `GlobalDefaultGameMode`; `Config/DefaultGame.ini` maps to cook.
- How players connect today: `open <ip>` in the console, `ServerTravel`/`ClientTravel`, `?listen`, Sessions/OnlineSubsystem, EOS lobbies.
- Which engine is installed: a source build is required for dedicated servers (Epic Launcher builds can't build Server targets). Look for a cloned `UnrealEngine` folder or registered builds (`HKCU\Software\Epic Games\Unreal Engine\Builds` on Windows).

Then ask, in one message, only what you couldn't infer: players per match and teams, whether they have an Edgegap account, a source engine, Docker. Give recommended defaults so they can just say "yes".

**No multiplayer yet** (single-player, or nothing replicates): get two players working on a local dedicated server first and scope that honestly before touching Edgegap.

## Phase 1: Engine and toolchain

Read `references/engine-setup.md`. The developer installs (links in §1): a source build of their engine version, Visual Studio 2022 with the C++ game workloads, the Linux cross-compile toolchain matching the engine version, Docker Desktop. You do the build steps and the known fixes (§3-4): pinning the compiler when a newer Visual Studio is also installed, the missing `<chrono>` include in 5.5, building ShaderCompileWorker, short project paths on Windows.

✅ Check: the editor builds, and the project's editor target compiles against that engine.

## Phase 2: Make the game dedicated-server ready

Read `references/server-ready.md`.
1. Blueprint-only project? Add a C++ module first (§1). The integration is C++; Blueprints call it.
2. Add a Server target if missing, upgrade old target build settings (§2). Set `ServerDefaultMap` and maps to cook.
3. Copy `assets/unreal/Source/*` into the game module (`Source/<Module>/`) and add `HTTP`, `Json`, `Sockets`, `Slate`, `SlateCore` to the module's `PublicDependencyModuleNames`. Neither file needs edits to the game mode or player controller:
   - `EdgegapMatchmakerSubsystem`: client matchmaking, off unless `bEnabled=True`.
   - `EdgegapServerSubsystem`: dedicated server only; stops the deployment when the match is empty, only when the matchmaker started the server.
4. Add the sections from `assets/unreal/Config/DefaultGame-edgegap.ini` to `DefaultGame.ini`, with `bEnabled=False` until the matchmaker exists (Phase 6 turns it on).

✅ Check: the editor target compiles; a local dedicated server (`-server -log`) accepts a client via `open 127.0.0.1:7777` (§4).

## Phase 3: Connect to Edgegap

Read `references/deploy.md` §1. Get the Edgegap MCP connected with the developer's API token (they run the `claude mcp add` command themselves, or the plugin prompts for it). The header must be exactly `Authorization: token <uuid>`.

✅ Check: `edgegap_list_apps` succeeds.

## Phase 4: Package, containerize, push

Read `references/deploy.md` §2-4.
1. Package the Linux server with `RunUAT BuildCookRun -server -noclient -serverplatform=Linux` into `Packaged/LinuxServer` (§2). Background it; the first run is about an hour.
2. Copy `assets/docker/Dockerfile` and `.dockerignore` to the repo root and replace `<Module>`/`<Project>` (§3). The Dockerfile runs the server binary directly (not the generated `.sh`) with `-stdout -FullStdOutLogOutput`; both matter.
3. `docker build --platform linux/amd64`, run it locally: the log must show `listening on port 7777` and `docker stop` must exit within seconds.
4. Developer logs Docker into `registry.edgegap.com` with the dashboard Container Registry credentials; you push with a **new tag every build** (UTC timestamp `YYYYMMDD-HHMM`, also the app version name), never reusing one (Edgegap hosts cache tags).

✅ Check: `edgegap_list_registry_tags` shows the tag.

## Phase 5: App, version, direct deploy

Read `references/deploy.md` §5-6.
1. `edgegap_list_apps` → `edgegap_create_app` if needed → `edgegap_create_app_version`: port `7777`, `UDP`, named `gameport`; 1 vCPU / 2 GB is plenty for a small map. The developer adds the **registry credentials** to the version in the dashboard; `edgegap_list_app_versions` must show `registry_credentials_set: true`.
2. `edgegap_deploy` → `edgegap_wait_for_deployment` → `edgegap_get_deployment_logs` (look for `listening on port 7777`).
3. A client connects with `open <public_ip>:<external port>`.
4. `edgegap_stop_deployment`.

✅ Check: a client played on the Edgegap server. Don't add the matchmaker on top of an unproven server.

## Phase 6: Matchmaker and client integration

Read `references/matchmaker.md`.
1. Start from `assets/matchmaker/latency.json` (latency rule, 2-4 players, short expiration, solo after 10 s) or generate with `edgegap_build_matchmaker_config`. Set `application.name`/`version`, validate, save as `matchmaker-config.json` in the repo.
2. The developer creates the matchmaker in the dashboard and sends you the **API URL** and **auth token**. Check `GET <url>/locations/beacons` with the token answers.
3. Turn the client on: `bEnabled=True`, quoted `MatchmakerUrl`, `AuthToken`, `Profile`; `bSendBeaconLatencies` must match whether the profile has a `latencies` rule. Private repo: real values in `DefaultGame.ini`. Public repo: placeholders there and real values in `Config/UserGame.ini` (git-ignored, still packaged; matchmaker.md §6).
4. If the server image changed since Phase 5, rebuild, push a new tag, create a new version, and point the matchmaker at it.

## Phase 7: End-to-end test and hand-off

1. `edgegap_list_deployments`: nothing left running.
2. Launch two clients, e.g. `UnrealEditor.exe <uproject> -game -windowed -ResX=960 -ResY=540 -WinX=0 -log` and a second at `-WinX=970`. Launch one first alone to compile shaders. For an unattended run add `-FindMatch` (queues at startup); otherwise the developer clicks **Find Match** in both within the expansion delay.
3. Watch the client logs: beacon pings, `ticket … created`, `assigned to <ip>:<port>`, `Welcomed by server`, both on the same address. `edgegap_list_deployments` shows one deployment tagged with both ticket IDs; its log shows `Started by the Edgegap matchmaker` and two `Join succeeded`.
4. Close both clients: about a minute later (connection timeout + 15 s grace) the deployment stops itself. That protects the developer's bill.
5. Debug with `references/troubleshooting.md` until this passes.

Hand-off: what was built and where, the app/version/matchmaker names, how to ship a new server build (package → new tag → new version → update matchmaker), free-tier caveats (matchmaker restarts every few hours, one deployment at a time, 60-minute cap), and next steps (a real UMG menu bound to `FindMatch`/`OnStatusChanged`, validating ticket IDs on the server, backfill, a production matchmaker tier).

## Reference files

- `references/engine-setup.md`: installs and links, source build, toolchain, compiler pinning, known engine fixes, timings.
- `references/server-ready.md`: Blueprint-only to C++, Server target, maps, the drop-in files, local dedicated server test.
- `references/deploy.md`: MCP connection, packaging, Dockerfile, registry, app version, direct deploy, free tier.
- `references/matchmaker.md`: profile design, latency beacons, expiration timing, dashboard steps, client settings, ticket contract, injected variables.
- `references/troubleshooting.md`: symptom → cause → fix, from real runs.
- `assets/unreal/Source/`: the two drop-in subsystems. `assets/unreal/Config/`: ini section. `assets/docker/`: Dockerfile + .dockerignore. `assets/matchmaker/`: config templates.

Related skills in this pack, if installed: `edgegap-eos-voice` (in-game voice chat with EOS Voice once this works end to end), `edgegap-server-design` (deployment lifecycle for any engine), `edgegap-deployments-api` when the studio keeps its own backend or EOS/PlayFab matchmaking, `edgegap-launch` before going live.

Sources of truth if something here looks outdated: https://docs.edgegap.com/unreal-engine, https://docs.edgegap.com/learn/matchmaking, and the reference sample https://github.com/edgegap/game-sample-unreal-engine-topdown.
