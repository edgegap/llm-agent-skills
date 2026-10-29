---
name: edgegap-playfab
description: 'PlayFab + Edgegap: keep PlayFab for players, login and Matchmaking, and run each match on its own Edgegap dedicated server near the players, started by PlayFab Azure Functions (CloudScript using Azure Functions), end to end. Load this before using any Edgegap MCP tool on a project that uses PlayFab for matchmaking (a PlayFab title ID, playfabapi.com, PlayFabMultiplayerAPI, CreateMatchmakingTicket) or is leaving PlayFab Multiplayer Servers (MPS, GSDK). Verified on Edgegap with a Unity FishNet game: match_found rule, StartEdgegapDeployment (POST /v2/deployments near the players), ready webhook, server address in player read-only data. Ships the Azure Functions, setup scripts, a dependency-free Unity client, server self-stop, and fixes for PlayFab pitfalls (new titles block LoginWithCustomID player creation, legacy CloudScript, ticket polling limits). Use for "PlayFab matchmaking with Edgegap servers", "replace PlayFab Multiplayer Servers", "PlayFab CloudScript Edgegap bridge", or debugging one.'
metadata:
  version: "0.2.0"
---

# Edgegap for PlayFab games: PlayFab matches players, Edgegap runs the match

Goal: PlayFab keeps doing what it does (players, login, Matchmaking, economy, leaderboards), and every match it forms gets its own dedicated server on Edgegap, placed near the matched players. Players are told where to connect, and the server stops its own deployment when the match is over. Done means two real clients logged in, were matched by PlayFab, played on one Edgegap deployment, and the deployment stopped. Code that compiles is not done.

```
Client --LoginWithCustomID / CreateMatchmakingTicket--> PlayFab queue (server allocation OFF)
PlayFab --match_found rule--> Azure Function StartEdgegapDeployment
            GetMatch + player locations --POST /v2/deployments (geo users, tag=match, webhooks)--> Edgegap
Edgegap --webhook_on_ready--> Azure Function EdgegapDeploymentReady
            re-reads deployment + match --UpdateUserReadOnlyData "EdgegapServer" {matchId,host,port}--> each player
Client polls GetUserReadOnlyData --> connects to host:port --> game server --> self-stop when empty
```

This path was run end to end on Edgegap on 2026-10-21 with [edgegap/backend-game-sample-unity-playfab-matchmaker-fishnet-spaceedge](https://github.com/edgegap/backend-game-sample-unity-playfab-matchmaker-fishnet-spaceedge) (Unity 2021.3.45f2, FishNet 3.11.14 Tugboat UDP, Azure Functions Flex Consumption with Node 22 in westus2, PlayFab queue of 2). Two clients logged in and were matched. The rule fired, one server started near them, and the address reached both players about 8 s after the function call. Both connected (`2 player(s) connected`). The server stopped itself 48 s after they quit, and 2 minutes after start when nobody joined. `assets/` holds that run's files. Not run: the Unity client in WebGL, other engines' clients, latency-based PlayFab queue rules, C# Azure Functions, queues larger than 2. Say so when those matter.

Why this shape, so you can defend it:
- **PlayFab stays the backend; Edgegap replaces the server host.** Turn **server allocation off** on the queue, so PlayFab only forms matches. This also replaces PlayFab Multiplayer Servers: no GSDK, no PlayFab builds, and Edgegap picks a location near the players for each match.
- **Azure Functions, not legacy CloudScript.** Microsoft labels JavaScript CloudScript "Legacy" and points new work to [CloudScript using Azure Functions](https://learn.microsoft.com/en-us/gaming/playfab/live-service-management/service-gateway/automation/cloudscript-af/quickstart). The old Edgegap bridge built on it also had bugs. Say "Azure Functions" to the developer. The same rule and event drive both.
- **Nothing waits.** The rule's HTTP call times out after 10 s, while a server takes 5 to 30 s to be ready. So the first function deploys with a webhook and returns in about 1 to 2 s, and Edgegap calls the second one when the server is up.
- **No secret leaves the backend.** The Edgegap token and the PlayFab title secret live only in the Function App settings. The client holds the title ID. The game server holds nothing: the old bridge gave it the title secret so it could write player data, and this design removes that need.
- **The webhook is verified, not trusted.** `EdgegapDeploymentReady` re-reads the deployment from the Edgegap API, checks its match tag, and re-reads the members from PlayFab. It writes to **read-only** player data, which clients can read but not forge.

## How to work

- **Be the engineer.** Read the project, write the code, run Unity/engine builds, Docker, `az`, Node and the Edgegap MCP tools, and read the logs. Hand the developer only account steps: PlayFab Game Manager clicks (the title setting, the rule), the secret key and Edgegap token into a local env file, `az login`, `docker login`, the registry credentials on the app version, and playtesting.
- **One layer at a time:** server runs locally → image → one direct Edgegap deployment → PlayFab queue → functions → chain test → clients → rule → end to end. Each phase has a check.
- **Secrets** (full rules: [the edgegap skill's agent rules](../edgegap/references/agent-rules.md)): the PlayFab secret key and the Edgegap API token go into a git-ignored env file the developer writes, and from there straight into app settings (`assets/scripts/deploy-functions.sh` does this without printing them). They never go into the client, the server image, git or chat. Function keys are secrets too: they appear in URLs, so don't paste those URLs into chat or commit them.
- **Money.** Ask before deploying. Every PlayFab match starts a deployment. Free tier allows one deployment at a time, and Azure resources live in the developer's subscription: create one resource group so it can be deleted in one go.

## Phase 0: Understand the project

Read, don't ask:
- How the game uses PlayFab: the PlayFab SDK or REST, login method (`LoginWithCustomID`, device, platform), and whether it already queues (`CreateMatchmakingTicket`, queue names). Check for PlayFab Multiplayer Servers: `RequestMultiplayerServer`, `ServerAllocationEnabled: true`, the GSDK (`PlayFabMultiplayerAgentAPI`, `GameServer.Start`), PlayFab build IDs.
- Existing CloudScript or Azure Functions, rules, and anything that sends the title secret or an Edgegap token to a client or server.
- The engine and netcode, the server's transport and port, whether a headless server build exists. For Unity netcode specifics, read the netcode's skill alongside this one (`edgegap-fishnet`, `edgegap-ngo`, `edgegap-purrnet`, `edgegap-unity`); Unreal: `edgegap-unreal`; Godot: `edgegap-godot`.
- Players per match.

Ask, in one message, only what you couldn't infer: the PlayFab title (they create the secret key), an Azure subscription (needed for Azure Functions), their Edgegap account, players per match. Default: a queue of 2, one Edgegap server per match.

## Phase 1: The game server

Read `references/game-server.md`.
1. A headless server mode that listens on a fixed port, starts without a player, and needs no PlayFab secret.
2. Self-stop through `ARBITRIUM_DELETE_URL` / `ARBITRIUM_DELETE_TOKEN` when nobody joins or everyone leaves. Unity: `assets/unity/EdgegapServer.cs` adds itself in server builds (netcode code is in its NETCODE ADAPTER region; FishNet is filled in). Remove any GSDK calls.
3. Unity build: add `"com.edgegap.unity-servers-plugin": "https://github.com/edgegap/buildtool-unity-plugin.git"` (the Edgegap Unity plugin, Editor only: build, image, push, deploy from **Tools → Edgegap Server Hosting**; no `#tag`). Its **Build server** makes the Linux server; from the command line, `assets/unity/Editor/EdgegapPluginBuild.cs` (`-executeMethod EdgegapPluginBuild.BuildServer`).

✅ Check: the server runs headless (Unity: `-batchmode`) and logs it is listening. A client connects to `127.0.0.1:<port>` directly.

## Phase 2: Image, app version, one direct deployment

1. Unity: copy `assets/docker/.dockerignore` to the project root, then the plugin's **Containerize with Docker** → **Upload image and Create app version** builds, pushes and opens the dashboard version form (the command-line equivalents are in the edgegap-ngo skill, deploy reference §3). Other engines: a Dockerfile from `edgegap-containerize`, `docker build --platform linux/amd64`, the developer runs `docker login registry.edgegap.com`, push a fresh tag (UTC timestamp `YYYYMMDD-HHMM`, also the app version name).
2. `edgegap_create_app` + `edgegap_create_app_version`: name the game port **`gameport`** (the functions look it up by that name), with its protocol (UDP for most netcodes). 0.5 vCPU / 1 GB, max duration 60. No env vars. The developer adds the registry credentials on the version; check `registry_credentials_set: true` with `edgegap_list_app_versions`. To ship a new image later without retyping them, `edgegap_update_app_version` to the new tag.
3. `edgegap_deploy` near the developer, `edgegap_wait_for_deployment`, read the logs, connect one client by hand, `edgegap_stop_deployment`.

✅ Check: a client played on the Edgegap server. Don't wire PlayFab to an unproven server.

## Phase 3: PlayFab title

Read `references/playfab.md`.
1. The developer writes `PLAYFAB_TITLE_ID`, `PLAYFAB_SECRET_KEY` and `EDGEGAP_API_TOKEN` into a local env file outside the repo. Check them with one call each (`/Authentication/GetEntityToken` → 200, `GET https://api.edgegap.com/v1/apps` → 200) without printing them.
2. Queue: `assets/scripts/playfab-setup.mjs` (`QUEUE_NAME`, `MATCH_SIZE=2` or `2-4`) creates it with **server allocation off**. On an existing queue it keeps the sizes, teams and rules and only turns allocation off (`DRY_RUN=1` prints the result first). Switching a live queue strands clients already shipped that read `GetMatch` → `ServerDetails`: test on a copy of the queue, and ship the new client before switching.
3. **New titles block player creation through `LoginWithCustomID`** (and device logins): `PlayerCreationDisabled`. If the game logs in that way, the developer unticks *Disable player creation using Client/LoginWithCustomId* in Title settings > API Features.

✅ Check: two test players created with `Server/LoginWithServerCustomId` queue and get `Matched` (`references/playfab.md` §4 has the script).

## Phase 4: Azure Functions

Read `references/azure-functions.md`.
1. The developer runs `az login` (with several accounts on one email: `az config set core.enable_broker_on_windows=false`, then `az login --tenant <tenant id>`) and picks the subscription.
2. One resource group, a storage account, and a Flex Consumption Function App on Node 22, in US West (PlayFab's recommendation).
3. Copy `assets/azure-functions/` into the project and run `assets/scripts/deploy-functions.sh`. `match_found` fires for every queue of the title: set `EDGEGAP_QUEUES` when only some queues should get Edgegap servers. It deploys, sets every app setting including the ready-webhook URL with its function key, and can write the start URL to a file for the next step.
4. `playfab-setup.mjs` again with `START_FUNCTION_URL` to register `StartEdgegapDeployment` in PlayFab. Only that one: Edgegap, not PlayFab, calls `EdgegapDeploymentReady`.

✅ Check, **before the rule exists**: the chain test (`references/azure-functions.md` §5) matches two test players, posts the rule's payload to `StartEdgegapDeployment`, and reads `{"status":"ready","host","port"}` from a player's read-only data within about 30 s. Once the rule exists, the rule fires too, and a manual call creates a second server for the same match.

## Phase 5: Clients

Read `references/clients.md`.
1. Unity: copy `assets/unity/PlayFabMatchmakingClient.cs` (UnityWebRequest + JsonUtility, no SDK). Set the title ID and queue, and fill its NETCODE ADAPTER (FishNet done; NGO/Mirror in comments). Wire the menu to `Login()`, `FindMatch()`, `OnStatus`, `OnCanQueue`. If the game already uses the PlayFab SDK, keep its login and use the same five calls through the SDK (`references/clients.md` §2).
2. Other engines: implement the REST contract in `references/clients.md` §1.
3. Poll the ticket no faster than every 6 s (PlayFab allows 10 calls per minute per ticket), and the read-only data every 2 to 3 s. Ignore a stored `EdgegapServer` whose `matchId` isn't this match's.

## Phase 6: The rule and the end-to-end test

1. The developer creates the rule in Game Manager. There is no API for rules: **Automation > Rules > New Rule**, event type **`playfab.matchmaking.match_found`**, action **Execute Azure Function > StartEdgegapDeployment**.
2. `edgegap_list_deployments`: nothing of yours left running.
3. Two clients with different PlayFab players. Several on one machine share PlayerPrefs, so pass `-playfabCustomId a` and `-playfabCustomId b`. Unity headless test clients: `-batchmode -nographics -client -autoMatch`.
4. Watch: logged in → searching → match found → server ready → connected. The server logs both players, the clients play, they quit, and the deployment stops on its own.
5. Debug with `references/troubleshooting.md` until this passes.

Hand-off: what runs where (Function App name and resource group, PlayFab queue/function/rule, Edgegap app/version), how to ship a new server build (push a tag, `edgegap_update_app_version`), and how to see the function logs. Mention the free-tier limits (one Edgegap deployment at a time, PlayFab development mode player cap). Next steps: validating players on the server, a match-end `SelfStop`, queue rules, and deleting the resource group when the demo is over.

## Reference files

- `references/playfab.md`: queue, title settings, the rule, the function context PlayFab sends, limits, moving off PlayFab Multiplayer Servers and legacy CloudScript, test players.
- `references/azure-functions.md`: Azure resources, deploy, app settings, function keys, logs, the chain test, costs.
- `references/clients.md`: the REST contract for any engine, the Unity template and PlayFab SDK equivalents, local multi-client testing.
- `references/game-server.md`: server mode, ports, self-stop, optional player validation, what not to put on the server.
- `references/troubleshooting.md`: symptom → fix.
- `assets/azure-functions/`: the two functions (Node 22, no SDKs). `assets/scripts/`: `deploy-functions.sh`, `playfab-setup.mjs`. `assets/unity/`: `PlayFabMatchmakingClient.cs`, `EdgegapServer.cs`, `Editor/EdgegapPluginBuild.cs`. `assets/docker/.dockerignore` for the plugin's Unity image.

Related skills in this pack, if installed: the engine's skill for the server build and netcode (`edgegap-fishnet`, `edgegap-ngo`, `edgegap-purrnet`, `edgegap-unity`, `edgegap-unreal`, `edgegap-godot`), `edgegap-deployments-api` for the Deploy API in depth, and `edgegap-launch` before going live.

Sources of truth if something here looks outdated: https://learn.microsoft.com/gaming/playfab (Matchmaking, CloudScript using Azure Functions, Automation rules), https://docs.edgegap.com, and the sample https://github.com/edgegap/backend-game-sample-unity-playfab-matchmaker-fishnet-spaceedge.
