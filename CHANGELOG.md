# Changelog

Each skill also carries its own `metadata.version` in its frontmatter, and the `edgegap` skill states the pack version (`Pack version:`), so an agent can tell which copy it has.

## 0.20.0 (unreleased)

Partial matches no longer get an expansion stage, and PurrNet uses port 7777.

- Matchmaker guidance (user, 2026-10-27): a profile with `min_team_size < max_team_size` already allows partial matches, and they form by the time tickets reach `ticket_expiration_period`. The fix for a slow partial match is the short `30s` expiration, not an expansion: expansions cost the matchmaker a lot of performance. This replaces the 0.13.x rule that every such profile needs an expansion stage.
  - The `15` s expansion that only repeated `min_team_size` is gone from the `casual` templates (Colyseus, FishNet, Godot, NGO, PurrNet, Unity) and from `casual-backfill.json` and `modes.json` `squads` in `edgegap-matchmaking`. Expansions that relax a rule (solo play, latency, skill) stay.
  - `SKILL.md`, `references/matchmaker.md` and `references/troubleshooting.md` in those skills, `edgegap-matchmaking` `references/profiles.md`, `edgegap-troubleshoot`, and `edgegap` `references/agent-rules.md`: say so, and tell agents to leave `expansions` out of `edgegap_build_matchmaker_config` unless a rule should relax over time.
  - `evals/godot-evals.json`: assertions check for a 30 s expiration instead of an expansion stage.
- `edgegap-purrnet` (0.2.0): templates listen on 7777 instead of PurrNet's default 5000 (`EdgegapSettings`, settings asset, `EdgegapServerLifecycle`, Dockerfile), so the app version uses the same port as the other samples. `ListenPort` is applied to `UDPTransport.serverPort` at runtime, so the scene's port doesn't need changing. Matches the fork's change (edgegap/netcode-game-sample-unity-purrnet-incremental PR #4).
- Versions: `edgegap` 0.20.0, `edgegap-colyseus` 0.1.5, `edgegap-fishnet` 0.2.7, `edgegap-godot` 0.1.5, `edgegap-matchmaking` 0.1.1, `edgegap-ngo` 0.1.5, `edgegap-troubleshoot` 0.2.1, `edgegap-unity` 0.1.17.
- Not re-run on Edgegap: neither the no-expansion templates nor PurrNet on 7777.

## 0.19.0 (unreleased)

Points CI and release work at Edgegap's GitHub Action, [edgegap/deploy-action](https://github.com/edgegap/deploy-action) (v0.1.0, e2e passed on GitHub 2026-10-26). The action creates the version for a pushed image tag from an existing version's settings, optionally smoke-tests it on a real deployment, and promotes it. Agents now recommend it instead of hand-written Deploy API calls in CI.

- `edgegap-launch` (0.3.0): Releases has the action, its secrets, what promotion changes, and that a running matchmaker picking up a promoted image without Stop → Start is untested. The description adds "deploying builds from CI or GitHub Actions".
- `edgegap` (0.19.0): a jump-table row sends CI and GitHub Actions deploys to `edgegap-launch`.
- `edgegap-deployments-api` (0.2.8): a CI job that only ships a build uses the action, not code (description and intro).
- `edgegap-containerize` (0.2.2) and `edgegap-manus` (0.1.5) `references/deploy.md`: the action as the step after the image push.
- Wording only. The action itself was run on Edgegap; these skills were not re-run.

## 0.18.0 (unreleased)

The Edgegap API never returns stored secrets: reading a version gives the literal string `This value is set and encrypted` for `private_username`, `private_token` and every secret env value (found 2026-10-26). An agent copying a version sent the placeholder back, and pulls failed with "Unable to login". Ships with the MCP release that refuses the placeholder.

- `edgegap` `references/agent-rules.md`, Secrets: copy only non-secret settings from an existing version; the registry login comes from the dashboard's Container Registry page or the developer, secret env values from the developer; leave the registry fields out of an update to keep them. `SKILL.md` (0.18.0) says it in one sentence.
- `edgegap-deployments-api` (0.2.7) `references/api-reference.md`: the placeholder on version reads, and PATCH needs real values for secret env vars.
- `edgegap-colyseus` (0.1.4) and `edgegap-manus` (0.1.4) deploy references: "copy/duplicate the previous version" now means the dashboard's Duplicate button, or non-secret settings only through the API or MCP.
- Wording only; not re-run on Edgegap.

## 0.17.0 (unreleased)

Matches Edgegap MCP 0.12.0, which returns empty and "not set up" states as results with a `next_step` instead of errors. Ship together with that release, not before: the MCP server bundles this pack.

- `edgegap` `references/agent-rules.md`: new section "Reading what the MCP tools return":
  - `status` `empty`, `not_configured`, `not_found`, `not_ready` or `expired` with a `next_step` is a normal answer: follow it, don't retry or work around it.
  - Registry: `manual_steps_required` from `edgegap_get_registry_credentials` is expected with a normal token; ask for the dashboard login or use Docker Hub, GHCR or another registry with `edgegap_create_app_version`.
  - Token problems (none, a client-issued credential, rejected): what to tell the developer; `edgegap_context` `check_token: true` shows the token's last four characters.
  - Validate an existing Dockerfile with `edgegap_validate_server_config` before building.
  - `edgegap_wait_for_deployment`: on a timeout call it again, never deploy a second server; on a failure read the logs first.
  - Cleanup: stop every deployment you created unless asked to keep it, and confirm with `edgegap_list_deployments` `only_agent_deployments: true`.
  - The connection check uses `edgegap_context` instead of `edgegap_list_apps`, and the MCP link points to `edgegap/llm-mcp-server`.
- `edgegap` `SKILL.md` (0.17.0): the same rules in two sentences, under "How you act on Edgegap".
- `edgegap-unity` (0.1.16), `-ngo` (0.1.4), `-fishnet` (0.2.6), `-purrnet` (0.1.5), `-godot` (0.1.4): their deploy references said `edgegap_get_registry_credentials` "returns 403"; since MCP 0.10.0 it returns `manual_steps_required`, which they now describe, with the external-registry path.
- Unity `.meta` files stay in the skills (the templates find their scripts by GUID). The MCP server stops listing them in skill file indexes instead.
- `plugin.json` repository URL: `edgegap/llm-agent-skills`.
- Wording only; not re-run on Edgegap.
## 0.16.0 (2026-10-26)

Adds matchmaking design for any engine.

- New skill `edgegap-matchmaking` (0.1.0): decides who owns matchmaking (Edgegap's hosted matchmaker, the studio's own allocator, or a matchmaker the game keeps), then designs the profile, server placement and backfill.
  - `references/profiles.md`: Group Up flow and endpoints, rule types and how groups and teams aggregate, expansions and partial matches, parties, injected `MM_*` variables, matchmaker rate limits per tier.
  - `references/region-selection.md`: ping beacons (reload per round, backend cache for `GET /v1/locations/beacons`), `player_ip` and Deploy API `users`, region and hub pickers, WebGL and mobile.
  - `references/backfill.md`: the `backfill_group_size` contract, `POST`/`GET`/`DELETE /backfills` shapes, the assignment built from `ARBITRIUM_*` variables, an engine-agnostic server loop, shutdown and edge cases. Follows the backfill verified on Edgegap with Megacity Metro (2026-10-21); the TypeScript loop was not run as written.
  - `references/third-party.md`: the allocator shape for any third-party matchmaker, and Unity Matchmaker (`EdgegapAllocator`), EOS and Steam lobbies, Photon, Pragma, AccelByte, Open Match, GameLift FlexMatch, plus the Multiplay, GameLift and Hathora migration guides.
  - `assets/configs/`: `casual-backfill.json`, `ranked-teams.json`, `modes.json` (30 s tickets, expansions below 30 s, timestamp app versions). Not run as whole configs.
  - Notes matchmaker 3.3.3 (Edgegap release notes: stability, no config changes); the pack's templates stay on the verified 3.3.2.
- `edgegap` (0.16.0): routes matchmaking design, parties, regions, backfill and third-party matchmakers to `edgegap-matchmaking`; step 5 of the path points there.
- `edgegap-deployments-api` (0.2.6): points to `edgegap-matchmaking` for choosing and designing matchmaking; its description no longer claims Unity Matchmaker, which uses Unity's ready-made `EdgegapAllocator` module (now in `edgegap-matchmaking`).
- `evals/matchmaking-routing-eval.json`: routing between `edgegap-matchmaking`, the engine skills, `edgegap-deployments-api`, `edgegap-nakama`, `edgegap-playfab` and no skill. Run 2026-10-26 with the whole pack, 3 runs each: 62/66; the 12 matchmaking prompts 35/36 (one run loaded no skill); the other miss is the existing exec-format-error prompt going to `edgegap-containerize` instead of `edgegap-troubleshoot`.
- `evals/routing-eval.json`: the Unity Matchmaker Cloud Code prompt now expects `edgegap-matchmaking`. Whole pack, 2 runs each: 85/92; no other miss picked `edgegap-matchmaking`.

## 0.15.3 (2026-10-26)

Edgegap OpenAPI spec 2026.10.23 (#25).

- `edgegap-deployments-api` (0.2.5): the API reference lists `PATCH /v1/app/{app}/version/{version}` and says that `ports` and `envs` replace the whole list, as the spec now states. Other fields keep their value when left out.
- `edgegap` (0.15.3): pack version.
- Spec pin moved to the current `edgegap/openapi-specification` main. The v2 spec did not change.

## 0.15.2 (2026-10-22)

Short ticket expiration in every matchmaker config.

- Matchmaker templates set `ticket_expiration_period` to `"30s"` (was `"5m"`, `"3m"` for Manus). On matchmaker 3.3.2 a lone or partial ticket may only get a match when it nears expiry, so a developer testing alone waited about 5 minutes and gave up before getting a server. Expansion keys that sat at or above 30 s move to 20 s (Manus solo stage, Unity `teams-latency` latency stage), so they still fire before tickets expire.
  - New rule in `edgegap` `references/agent-rules.md`: every matchmaker config an agent writes or generates uses `30s`, with expansions below it; raise it only when the developer asks for longer production queues.
  - Matchmaker references, `SKILL.md` steps and troubleshooting rows in `edgegap-unity`, `-ngo`, `-fishnet`, `-purrnet`, `-godot`, `-colyseus`, `-threejs` and `-manus` describe the 30 s value instead of the 5-minute wait.
  - `edgegap-manus`: the backend's `searchTimeoutMs` drops from 120 s to 28 s so it stays below the ticket expiration.
- Skills bumped (patch): edgegap 0.15.2, colyseus 0.1.3, fishnet 0.2.5, godot 0.1.3, manus 0.1.3, ngo 0.1.3, purrnet 0.1.4, threejs 0.1.2, unity 0.1.15. `edgegap-unreal` already used `20s`.
- Not re-run on Edgegap with the 30 s value; eval fixtures (`evals/fixtures/broken-*`) keep their original configs.

## 0.15.1 (2026-10-22)

Timestamp image tags and app versions.

- Every skill that builds an image or creates an app version now tags the image and names the version with the same UTC timestamp, `YYYYMMDD-HHMM` (e.g. `20261022-1430`, `date -u +%Y%m%d-%H%M`), instead of `v1`, `v2`, semver, environment aliases or `latest`, so the team and customers testing a sample can see when a server was last updated. Docker tags can't contain colons, hence no ISO `T14:30`.
  - New rule in `edgegap` `references/agent-rules.md`; `edgegap-containerize` uses the tag as the version name.
  - Matchmaker templates (`edgegap-unity`, `-ngo`, `-fishnet`, `-purrnet`, `-godot`, `-colyseus`, `-manus`, `-threejs`) and the PlayFab `local.settings.example.json` show `"version": "20261022-1430"`; the API reference examples and the BR200 example JSON use the same format.
  - Scripts: the BR200 and Simple FPS `package.sh` default to the UTC timestamp tag (Simple FPS no longer requires a tag argument), and the Manus GitHub workflow tags with `YYYYMMDD-HHMM` instead of date + commit SHA.
  - Build steps in each engine skill's `SKILL.md` and `deploy.md` say which format to use.
- Skills bumped (patch): edgegap 0.15.1, colyseus 0.1.2, containerize 0.2.1, deployments-api 0.2.4, eos-voice 0.1.1, fishnet 0.2.4, fusion 0.1.2, fusion-simplefps 0.1.1, godot 0.1.2, manus 0.1.2, nakama 0.1.2, ngo 0.1.2, playfab 0.1.1, purrnet 0.1.3, unity 0.1.14, unreal 0.1.2, threejs 0.1.1 (its matchmaker template and build step, from 0.15.0).
- `evals/guardrails.json` uses a timestamp tag in its smoke-test prompt. Not re-run: wording and examples only.

## 0.15.0 (2026-10-22)

Adds Three.js and other browser games with their own Node.js server.

- New skill `edgegap-threejs` (0.1.0): browser games in Three.js (or Babylon.js, PlayCanvas, Phaser, canvas) with a plain Node.js `ws` server. One authoritative server per match on Edgegap; the page calls the matchmaker itself with the client-safe token and connects over `wss` with TLS Upgrade.
  - Verified on Edgegap on 2026-10-22 with [netcode-sample-threejs-minigames](https://github.com/edgegap/netcode-sample-threejs-minigames): five games (top-down shooter, kart racer, 2v2 soccer, light cycles, sumo) in one image, one app version per game (`GAME` env), one matchmaker 3.3.2 with a profile per game. Headless players queued together landed on one deployment per game (2 to 4 players, 4 to 16 s), played full matches, and every server stopped itself about 17 s after its match. Soccer used the matchmaker's teams (`team_id` from `MM_TICKET_<id>`: 0, 0, 1, 1). A browser page on `http://localhost:8080` clicked Find Match and played with a headless player. A direct deployment did the same, and matched deployments nobody joined stopped after 120 s.
  - Templates are that repo's shared files: a game-agnostic room (phases, fixed tick, 20 Hz snapshots, bots, input handshake with the ticket ID, waiting for every matched player), the lifecycle module (matchmaker env, self-stop), a skeleton game, a Dockerfile, a direct-deploy script, the no-build Three.js client shell (menu, Find Match, local and `?server=` modes, HUD, easing helpers), matchmaker and WebSocket clients, matchmaker configs (one game; five profiles with a team profile), and headless-player and e2e scripts. The skeleton was copied into an empty project and played locally and in Docker, including the empty-server self-stop.
  - Pitfalls from the run: 14 tickets in the same second got `429` (clients back off); tickets left by a crashed run got matched with the next run's players; with `team_count: 2`, `min_team_size: 2` and a 20 s expansion to 1, two or three tickets only matched at the 5 minute expiry, so team profiles start at `min_team_size: 1`; bots that are too careful make rounds last 40 s.
  - Not run: Babylon.js, PlayCanvas or Phaser clients, mobile browsers, `REQUIRE_TICKET=1`, latency rules, the skeleton game on Edgegap.
- `edgegap` (0.15.0) routes Three.js and other browser games with their own Node.js server to `edgegap-threejs` instead of pointing them at `edgegap-manus`. Its description is slightly shorter, to stay under 1024 characters.
- `edgegap-manus` (0.1.1) points web games that need no sign-in to `edgegap-threejs`.
- README, plugin and marketplace descriptions name Three.js; the verified table lists the minigames run.
- Evals: `evals/threejs-routing-eval.json` (16 queries: 8 for the new skill, 4 for neighbouring skills, 4 browser-game questions unrelated to hosting): 48/48 with the whole pack, 3 runs each. `evals/colyseus-routing-eval.json` re-run with the new skill installed: 47/48 (one run loaded `edgegap-colyseus` for an `allowReconnection` question; the custom Node.js server prompt still routes to `edgegap-server-design`). Task evals not run.

## 0.14.0 (2026-10-21)

Adds PlayFab.

- New skill `edgegap-playfab` (0.1.0): games that keep PlayFab for players, login and Matchmaking, any engine, including studios leaving PlayFab Multiplayer Servers. The queue runs with server allocation off. A rule on `playfab.matchmaking.match_found` runs the Azure Function `StartEdgegapDeployment`, which deploys near the matched players with `POST /v2/deployments` and ready/error webhooks and returns in about 1 to 2 s. Edgegap then calls `EdgegapDeploymentReady`, which re-reads the deployment and the match and writes `{matchId, host, port}` to each player's read-only data.
  - Verified on Edgegap on 2026-10-21 with [sample-playfab-matchmaker-fishnet](https://github.com/edgegap/sample-playfab-matchmaker-fishnet) (Unity 2021.3.45f2, FishNet 3.11 Tugboat, Azure Functions Flex Consumption on Node 22): two clients matched, the rule fired, one server near them, the address in player data about 8 s after the call, `2 player(s) connected`, and self-stop 48 s after they quit (about 2 minutes when nobody joins).
  - Ships the two functions (Node, no SDKs), `deploy-functions.sh` (deploys and sets every app setting without printing secrets), `playfab-setup.mjs` (queue with allocation off, keeping an existing queue's teams and rules; function registration), a dependency-free Unity client (`UnityWebRequest` + `JsonUtility`), a server lifecycle with self-stop, a build script and a Dockerfile, plus the REST contract for Unreal and Godot clients.
  - Pitfalls from the run: new titles block `LoginWithCustomID` player creation (`PlayerCreationDisabled`). The rule's HTTP call times out after 10 s, so nothing waits for the server. `GetMatchmakingTicket` allows 10 calls per minute per ticket. `match_found` fires for every queue (`EDGEGAP_QUEUES` filters). A manual call while the rule exists starts a second server. Windows `az login` can pick another account with the same email. Legacy JavaScript CloudScript is replaced by Azure Functions, and the title secret never goes on the game server.
  - Not run: the Unity client in WebGL, Unreal and Godot clients, latency queue rules, more than 2 players, C# functions.
- `edgegap` (0.14.0) routes PlayFab to `edgegap-playfab` instead of `edgegap-deployments-api`. `edgegap-deployments-api` (0.2.3) no longer claims PlayFab, and `edgegap-unity` (0.1.13) and `edgegap-fishnet` (0.2.3) point PlayFab projects to the new skill.
- README, plugin and marketplace descriptions name PlayFab; the verified table lists the SpaceEdge run.
- Evals: `evals/playfab-routing-eval.json` (18 queries: 10 PlayFab hosting, 4 other skills, 4 PlayFab questions unrelated to hosting): 54/54 with the whole pack, 3 runs each.
  - Task evals: `evals/playfab-evals.json` (3 tasks, fixtures `mps-skirmish`, `driftclash` and `broken-playfab-bridge`): 100% with the skill vs 74% without (38/38 vs 28/38; 15/15 vs 11/15, 12/12 vs 9/12, 11/11 vs 8/11), one run per configuration, every delivered JavaScript file passes `node --check`.
  - Without the skill, agents built working backends but called by clients rather than by the PlayFab rule. They still read the wrong event path in the broken bridge, kept client-writable `UpdateUserData` and left the title secret on the game server without saying to rotate it, used `/v1/deploy`, and didn't know about the `LoginWithCustomID` setting. Several assertions check the skill's architecture (rule plus Azure Functions), which favours it.
  - Gaps found by the with-skill runs and fixed before release: the `match_found` filter per queue (`EDGEGAP_QUEUES`), and `playfab-setup.mjs` keeping an existing queue's teams and rules instead of replacing them. Both were re-run on the live setup.

## 0.13.1 (2026-10-21)

Task evals for Colyseus.

- `edgegap-colyseus` (0.1.1), from its first task evals:
  - `references/server.md`: the `onLeave` snippet no longer uses `consented: boolean`, which doesn't typecheck on Colyseus 0.17 (the second parameter is the close code). Reconnection code for 0.17 (`onDrop` / `onReconnect` / `onLeave`) and 0.15/0.16 (`allowReconnection` in `onLeave`), with `playerLeft()` only when the seat is gone; typechecked on 0.16 and 0.17, not run on Edgegap.
  - `references/clients.md`: with one deployment per match, a client that resumes with `reconnect(token)` stores the endpoint with the token; the itch.io embed origin (`https://html-classic.itch.zone`) for `allowed_cors_origins`.
  - `SKILL.md`, `references/deploy.md`: the `15` s expansion repeats `min_team_size: 2` on purpose (agents "fixed" it); `inspect` off before launch.
- Evals: `evals/colyseus-evals.json` (3 tasks, 3 runs per configuration) with fixtures `hoverhoop` (Colyseus 0.16 on Colyseus Cloud, Redis, PM2, `allowReconnection`, Phaser) and `broken-rocketrumble` (Colyseus 0.17 with planted pitfalls and matching logs); the tanks fixture is the upstream demo before the Edgegap work. 100% with the skill vs 90% without (51/51 vs 43/51, 54/54 vs 47/54, 48/48 vs 48/48). Without the skill: matchmaker configs off the 3.x schema, beacon latency rules for browser clients, TCP instead of WS, missing CORS origins, no `--platform linux/amd64`. The broken-project task doesn't separate the two: its logs name every bug.

## 0.13.0 (2026-10-21)

Adds Nakama. PR #17 merged into the stacked branch after its base had already landed, so this release brings it to main on top of 0.12.0 (Godot).

- New skill `edgegap-nakama` (0.1.1): games with a Nakama backend, any engine. Nakama keeps accounts, matchmaking and leaderboards, and each match it forms runs on its own Edgegap server near the players, started through the [Edgegap Fleet Manager for Nakama](https://github.com/edgegap/nakama-edgegap). From the end-to-end run of [fishgame-godot](https://github.com/edgegap/fishgame-godot) (Godot 4.7.2, Nakama 3.39.0, nakama-edgegap `20d849e`).
  - Verified on Edgegap on 2026-10-20: email sign-up, Nakama matchmaking, a deployment near the players, 5 rounds decided by the server, a leaderboard win written by the server, a player's attempt to post a win refused, and the server stopping itself.
  - Templates: the Go module (Fleet Manager, the AfterAuthenticate hook for the game's real sign-in method, a MatchmakerMatched hook that calls the six-argument `Create` with `user_ids` metadata and returns `""`, notifications 111/112/113, an authoritative leaderboard written through an S2S `report_match_result` RPC that refuses player sessions and counts each instance once), `go.mod`/`go.sum` with nakama-edgegap pinned by pseudo-version, a Dockerfile on `nakama-pluginbuilder:3.39.0`, compose with runtime env from `.env`, and game server code for READY (with `game_server` IP and ports), batched connection events, STOP, player checks through `/v2/account` and S2S calls with the `http_key` from the event URLs: Godot 4 (from the verified run) and Node.js (a port). The Go module compiles in pluginbuilder 3.39.0; both server templates sent identical requests to a mock Nakama.
  - Pitfalls from the run and the plugin's code: the plugin registers only the Custom auth hook, and without the right one `Create` fails for every match; the README's matchmaker sample passes no metadata, doesn't compile against two return values, returns JSON as a match ID and reads `ConnectionInfo`, which can still be nil when the READY callback runs; tags without `v` that Go can't use; `sh -x` printing the token; `NAKAMA_ACCESS_URL` must be public HTTPS (a Cloudflare quick tunnel for tests); clients must reach Nakama through the public URL so player IPs are public; registry credentials on the app version. It also documents that the plugin's `instance_create` and event RPCs accept player sessions.
  - Not run: other auth methods than email, TypeScript/Lua Nakama modules, Heroic Cloud, the Node template on Edgegap, WebSocket game servers. Unity servers are pointed to edgegap-server-nakama-plugin-unity.
- `edgegap` (0.13.0) routes Nakama backends to `edgegap-nakama` instead of `edgegap-deployments-api`. Its description is slightly shorter, to stay under 1024 characters.
- `edgegap-deployments-api` (0.2.2), `edgegap-unity` (0.1.12) and `edgegap-godot` (0.1.1) send Nakama to `edgegap-nakama`.
- README, plugin and marketplace descriptions name Nakama; the verified table lists the Fish Game run.
- Evals: `evals/nakama-routing-eval.json` (16 queries: 8 Nakama hosting, 4 other skills, 4 Nakama questions unrelated to hosting). `evals/routing-eval.json`: the Nakama backend query now expects `edgegap-nakama`, plus two Nakama queries. With the whole pack, 3 runs each: 48/48 on the Nakama set and 9/9 on the three Nakama queries in `routing-eval.json` (57/57).
  - Task evals: `evals/nakama-evals.json` (3 tasks, fixtures `reefrush`, `starhaul` and `broken-tidewars`): 100% with the skill vs 39% without (62/62 vs 24/62; 22/22 vs 9/22, 21/21 vs 5/21, 19/19 vs 10/19), one run per configuration, mean 249 s vs 315 s. Every delivered Go module compiles in pluginbuilder 3.39.0, except the eval 2 baseline, which wrote none. Without the skill, every run called the Edgegap API from Nakama itself instead of using the Fleet Manager, so most Fleet Manager assertions fail by construction. The baselines also kept `sh -x` or left nakama-edgegap unpinned, skipped the registry credentials step, used no `/v2/account` check, and sent no READY address. In the debug task, the baseline sent 113 on a nil `ConnectionInfo` instead of falling back to the READY metadata.
  - Gaps found and fixed in 0.1.1: `LeaderboardCreate` won't turn an existing client-writable board authoritative (delete and recreate it); the hand-off now explains why `NAKAMA_ACCESS_URL` must be public. The with-skill runs already handled both.

## 0.12.0 (2026-10-20)

Adds Godot 4.

- New skill `edgegap-godot` (0.1.0): Godot 4 games on high-level multiplayer (`ENetMultiplayerPeer` over UDP, `WebSocketMultiplayerPeer` with `wss` for web exports, netfox on top) as dedicated servers with Edgegap's matchmaker. Built from [edgegap/godot-sample-arena-shooter](https://github.com/edgegap/godot-sample-arena-shooter), which ran end to end on Edgegap on 2026-10-20 (Godot 4.7.2, WebSocket with TLS Upgrade, two Windows clients matched onto one deployment that stopped itself).
  - GDScript templates made game-agnostic: an `EdgegapServer` autoload (creates the ENet or WebSocket server on all interfaces, emits `match_ready` once the `MM_TICKET_IDS` players are in or after a grace period, stops its own deployment through `ARBITRIUM_DELETE_URL` with the raw token after `match_ended()`, when nobody joins or when everyone left), a matchmaker client (`POST`/`GET`/`DELETE /tickets`, raw `Authorization`, cancel that races a match, join retries while the server boots), a Find Match button, a settings script with env overrides, a Linux dedicated server export preset, a Dockerfile and a matchmaker config.
  - Tested on 2026-10-20 with Godot 4.7.2 in a minimal project, exported as a Linux dedicated server and run in Docker against a mock matchmaker with two clients, with ENet and with WebSocket: tickets → assignment → both joined → `match_ready` → `match_ended` → self-stop. ENet hasn't been run on a real Edgegap deployment yet.
  - Pitfalls measured in that run, now in the references: without `application/run/flush_stdout_on_print` the container logs are empty, even the engine banner. Godot has no SIGTERM handler, so as PID 1 it ignores `docker stop` and Edgegap's stop until killed (20 s, exit 137); `tini` in the image fixes it (1 s). An export allowlist ships the autoload but not the `class_name` scripts it uses, which fails only at runtime (`Identifier "EdgegapSettings" not declared`), and an `export_filter="scenes"` preset ignores listed scripts altogether. From the sample: a join refused by the game's own validation (an empty display name) fails silently and the player looks stuck searching.
- `edgegap` (0.12.0) routes Godot 4 projects whose server is Godot to `edgegap-godot`; Colyseus servers with Godot clients stay with `edgegap-colyseus`. Its description is slightly shorter, to stay under 1024 characters.
- README, plugin and marketplace descriptions name Godot; the verified table lists the Godot run. `scan_private_refs.py` and `validate.py` also scan `.gd`, `.cfg` and `.godot` files.
- Evals: `evals/godot-evals.json` (3 tasks, fixtures `skyarena`, `pixelparty`, `broken-skyarena`) and `evals/godot-routing-eval.json` (20 queries). `evals/routing-eval.json` now expects `edgegap-godot` for its Godot query. Results with `edgegap-godot` 0.1.0, 3 runs each:
  - Tasks: 99% with the skill vs 83% without (148/150 vs 124/150). Every delivered project, with or without the skill, loaded in Godot 4.7.2 with no script errors as a client and as a server. Sky Arena (ENet host/join) 54/54 vs 46/54: without the skill, no run turned on `flush_stdout_on_print` or handled SIGTERM as PID 1, and one had no expansion stage. Pixel Party (web, `wss`) 54/54 vs 43/54: without the skill, no run had the itch.io `allowed_cors_origins`, `flush_stdout_on_print` or an init in the Dockerfile, and two had no expansion stage. Broken Sky Arena 40/42 vs 35/42: without the skill, no run pinned `linux/amd64` or added an init, and one wrote the expansion keys inverted. The two with-skill misses: runs that kept the client preset on `export_filter="scenes"` and only listed the scripts, which an `--export-pack` showed are still left out. The skill now says to switch such presets to `"resources"` and check with `--export-pack`; that fix wasn't re-run through the task evals.
  - Routing with the whole pack: 57/60. The miss: a one-line question about the app version port protocol for ENet was answered without loading any skill, 3 times out of 3. No non-Godot or gameplay query loaded `edgegap-godot`.
  - With `edgegap-colyseus` in the pack: the Godot routing eval is unchanged (57/60). `evals/colyseus-routing-eval.json` now expects `edgegap-godot` for its Godot high-level multiplayer query, which loaded it 3 times out of 3; the rest of that eval scored as before, except a Colyseus `allowReconnection` near-miss that loaded `edgegap-colyseus` 2 times out of 3.

## 0.11.0 (2026-10-20)

Adds Colyseus.

- New skill `edgegap-colyseus` (0.1.0): games with a Colyseus (Node.js) server and any client, one server per match on Edgegap, from the end-to-end run of [realtime-tanks-demo](https://github.com/edgegap/realtime-tanks-demo) (Colyseus 0.17, matchmaker 3.3.2, Godot 4.5.2 with Colyseus Godot SDK 0.17.12, Unity 6000.3).
  - Verified on Edgegap on 2026-10-20: the Colyseus matchmake HTTP request and the room WebSocket both go through one WS port with TLS Upgrade; Node and Godot desktop clients joined a direct deployment; the matchmaker matched a Three.js browser client with a Godot desktop client, then with a Unity Windows build; the server stopped itself each time.
  - Templates from that run: a lifecycle module (self-stop through `ARBITRIUM_DELETE_URL` when nobody joins, everyone leaves, or the game ends the match; the tanks-specific round rule moved out to the room), a Dockerfile with Node as PID 1 (`node --import tsx`), a direct deploy script (tags and port name configurable), a matchmaker config with the expansion stage and local CORS origins, and dependency-free matchmaker clients for browser JS/TS (`fetch`), Unity (`UnityWebRequest` + `Awaitable`) and Godot 4 (`HTTPRequest`), plus a join-retry helper for JS.
  - Pitfalls from the run: a fresh deployment answers 502 for a few seconds after `HOST_ASSIGNED`, so clients retry the first join; `wss` only by FQDN; page origins in `allowed_cors_origins`; playground and monitor off on Edgegap; Windows long paths for a GameMaker client.
  - Not run: Construct 3, Defold, GameMaker, Haxe and PlayCanvas clients, Godot web, Unity WebGL, Colyseus 0.15/0.16, rooms with `allowReconnection`, the optional matched-tickets-only `onAuth`.
- `edgegap` (0.11.0) routes Colyseus servers to `edgegap-colyseus`. Its description is slightly shorter, to stay under 1024 characters.
- README, plugin and marketplace descriptions name Colyseus; the verified table lists the tanks run.
- Evals: `evals/colyseus-routing-eval.json` (16 queries: 8 Colyseus hosting, 4 other skills, 4 Colyseus gameplay near-misses), and two Colyseus queries in `evals/routing-eval.json`. With the whole pack, 3 runs each: 48/48. Task evals not run yet.

## 0.10.0 (2026-10-20)

Adds Photon's Simple FPS sample.

- New skill `edgegap-fusion-simplefps` (0.1.0): Photon's Simple FPS Multiplayer (Fusion 2) sample as dedicated servers on Edgegap, joined from the sample's Party menu by deployment FQDN and Photon region. Verified end to end on 2026-10-20 (Simple FPS 2.1.1, Fusion 2.1.1 build 2177, Unity 6000.3.11f1): the kit, copied into an unmodified Simple FPS project, built an IL2CPP server that ran in Newark (`us`). Two headless clients joined through the Party menu with CT Direct (11 to 29 ms), two players, Deathmatch loaded and no exceptions on either side.
  - A drop-in kit that edits no Simple FPS or Fusion file. `EdgegapFusionBootstrap` (a `FusionBootstrap` subclass) starts a server automatically in server builds, names the session `<request_id>.pr.edgegap.net`, marks the scene active on load, optionally fixes the region (`PHOTON_REGION`, not tested yet) and logs the session and region. `EdgegapPartyMenu` (a `FusionMenuUIParty` subclass) joins by FQDN, kept as typed, and region. The kit is also public at [edgegap/fusion-simplefps-edgegap](https://github.com/edgegap/fusion-simplefps-edgegap), with a README for developers. Also a server-only scene loader, an editor setup and IL2CPP builds (with an automatic retry on the intermittent `No Linux sysroot found`), a Dockerfile and start script that never print the environment, and helper scripts.
  - Measured traps of the usual manual setup, both of which make clients throw `NullReferenceException` in `Player.FixedUpdateNetwork` every tick. A server built with only the Deathmatch scene sends build index 0, which is Startup on clients. A server scene that isn't active on load leaves clients with Startup active, so `SceneObjects` finds no `Gameplay`.
  - Headless test clients that type into the Party menu's Join card and press Join, a probe that logs CT, players and the runner's scene, and `scripts/test-clients.sh`.
- `edgegap-fusion` (0.1.1) sends Simple FPS projects to `edgegap-fusion-simplefps`. Its description is slightly shorter, to stay under 1024 characters.
- `edgegap` (0.10.0) routes Simple FPS to `edgegap-fusion-simplefps`.
- README: new skill, verified table row. CONTRIBUTING: the licence rule covers Simple FPS.
- Evals: `evals/fusion-simplefps-routing-eval.json` (16 queries: 8 Simple FPS hosting, 4 other Fusion, 4 Simple FPS gameplay near-misses). With the whole pack, 3 runs each: 47/48. The miss: a Simple FPS lag-compensation question loaded `edgegap-fusion-simplefps` once in 3 runs.
  - `evals/fusion-routing-eval.json` rerun with the 0.10.0 pack: 56/60 (57/60 at 0.9.0). The BR200 lag-compensation near-miss still loads `edgegap-fusion` 3 times out of 3. A generic Fusion project query loaded no skill once in 3 runs. No Fusion query loaded `edgegap-fusion-simplefps`.

## 0.9.1 (2026-10-20)

Stops pinning an exact Edgegap Unity SDK version.

- `edgegap-unity` (0.1.11), `edgegap-ngo` (0.1.1), `edgegap-fishnet` (0.2.2) and `edgegap-purrnet` (0.1.2) install the SDK from `https://github.com/edgegap/edgegap-unity-sdk.git` with no `#tag`, so projects get the latest release and its fixes instead of a frozen `#3.5.6` (or `#main`). The minimum versions (3.5.5 for WebGL, 3.5.6 before Unity 2022.3) stay documented as facts, not pins.
- README and CONTRIBUTING use the same untagged URL.
- `edgegap` (0.9.1): pack version.

## 0.9.0 (2026-10-20)

Adds Photon Fusion 2.

- New skill `edgegap-fusion` (0.1.0): Unity games built on Photon Fusion 2 as dedicated servers on Edgegap, verified end to end with Photon's BR200 Battle Royale sample (BR200 2.1.0, Fusion 2.1.1 build 2177, Unity 6000.3.11f1).
  - A drop-in BR200 kit that changes no sample code. An editor preflight and Linux Server build checks the scenes BR200 loads, an IL2CPP server, the Linux toolchain, the App ID and Peer Mode, and restores the editor's standalone subtarget afterwards. Also a Dockerfile, a start script that maps Edgegap's variables to BR200's command-line options (session name = deployment FQDN, nearest Photon region, bind `0.0.0.0`, self-stop, SIGTERM forwarding), helper scripts, start-script tests and API examples.
  - Headless test clients: a Windows IL2CPP client build and a probe that logs `runner.CurrentConnectionType`, the CT value in BR200's Tab overlay.
  - Measured with two clients: binding `0.0.0.0` gives CT Direct on Edgegap (14 ms in Newark) with no `CustomPublicAddress`. `127.0.0.1` forces Photon relays (about 235 ms). Binding the deployment's public IP fails (`Failed to bind socket`), because BR200's `IP`/`-ip` is Fusion's bind address.
  - A Mono server or client breaks BR200's RPCs (`MethodAccessException ... CheckInvokeRpc`), so the server must be IL2CPP. On Unity 6000.3 on Windows, that needs `com.unity.toolchain.win-x86_64-linux` and `com.unity.sdk.linux-x86_64`.
  - A two-player Battle Royale ran with no exceptions. When one player left, the other got Game Over and the deployment stopped on its own.
- `edgegap` (0.9.0) routes Photon Fusion projects to `edgegap-fusion`.
- `edgegap-unity` (0.1.10) points Photon Fusion projects to `edgegap-fusion`.
- README, plugin and marketplace descriptions name Photon Fusion. The verified table lists the BR200 run.
- Evals: Fusion queries in `evals/routing-eval.json`, plus `evals/fusion-evals.json` (3 tasks, with fixtures `br200-shell`, `skyraid` and `broken-br200`, scripts and trimmed settings only, no BR200 or Photon files) and `evals/fusion-routing-eval.json` (20 queries). Results with `edgegap-fusion` 0.1.0, 3 runs each:
  - Tasks: 99% with the skill vs 69% without (107/108 vs 75/108). BR200 setup 42/42 vs 27/42: without the skill, every run switched the server to Mono, left out the Linux toolchain packages, patched BR200's code and had no CT Direct check. SkyRaid CT Relayed 33/33 vs 27/33: without the skill, every run expected CT Direct in a local Docker Desktop test and left out `--platform linux/amd64`. Broken BR200 32/33 vs 21/33: without the skill, every run left out `com.unity.sdk.linux-x86_64`, `--platform` and the CT Direct check. The fixtures can't compile without the licensed assets, so the assertions check the delivered files and HANDOFF.md.
  - Triggering (skill-creator `run_eval`, `--num-workers 1`): 20/20; 30/30 should-trigger runs, 1 false trigger in 30 near-miss runs.
  - Routing with the whole pack: 57/60. The miss: a BR200 lag-compensation question with nothing to do with hosting loaded `edgegap-fusion` 3 times out of 3.

## 0.8.0 (2026-10-19)

Adds in-game voice chat.

- New skill `edgegap-eos-voice` (0.1.0): EOS Voice for an Unreal Engine game on Edgegap dedicated servers, with the game server as the trusted server.
  - Client: EOS Connect device ID login on the EOSVoiceChat plugin's own EOS platform (the plugin doesn't log players in), ID token, join and leave, `VoiceMute`.
  - Server: verifies the ID token (RS256 against Epic's JWKS: `sub`, `pfdid`, `aud`, `exp`, `iss`) with the OpenSSL that ships with Unreal, picks a match room or a team room by matching the player's IP to the matchmaker's `MM_TICKET_*` variables, calls the EOS Voice Web API (EOS Voice doesn't support Linux) with the player's IP, sends each token to its owner only, and removes players on logout, which revokes their token.
  - A replicated component added at login carries the RPCs, so the game mode and player controller don't change. Voice is off by default and turns on in the server when the `EOS_VOICE_*` variables are on the app version.
  - Verified with [unreal-sample](https://github.com/edgegap/unreal-sample) (UE 5.5.4, EOS SDK 1.16): a local two-client test, and two clients matched onto one Edgegap deployment in the same team room, hearing each other (fake audio input), with the leaving player removed (`204`).
  - Pitfalls from the run: a Server RPC sent in the frame the component replicates drops the connection; two clients on one PC share a device ID; Git Bash rewrites `/Game/...` map paths; packaging rebuilds the engine when UAT picks a newer MSVC.
- `edgegap` (0.8.0) routes voice chat questions to it; `edgegap-unreal` (0.1.1) points to it.

## 0.7.1 (2026-10-19)

Matchmaker expansion stages, and the 0.6.1 fixes carried over to `edgegap-unity` and `edgegap-purrnet`, which share the FishNet templates.

- Matchmaker templates: a profile with `min_team_size < max_team_size` needs an expansion stage, or a partial match only starts when the tickets expire. Measured on matchmaker 3.3.2: two tickets waited 5 minutes without one, and matched within 40 s with `"15": {"match_size": {"min_team_size": 2}}`. The FishNet, Unity and PurrNet `casual` templates now have that stage. It keeps `min_team_size` at 2, so a match still never starts below the requested size. The matchmaker references explain the rule, and troubleshooting has a row for two players stuck in `SEARCHING` for about 5 minutes.
- `edgegap-fishnet` (0.2.1): the expansion stage in `casual-webgl.json`, `references/matchmaker.md` §3 and troubleshooting.
- `edgegap-unity` (0.1.9):
  - The expansion stage in `casual.json`. `teams-latency.json` is unchanged: at 2v2, min and max are equal, so it can't make a partial match.
  - Pins Edgegap Unity SDK 3.5.6, and a new troubleshooting row for HTTP 400 on every ticket on Unity before 2022.3 (SDK 3.5.5 or older): replace an embedded, hand-patched SDK with the git package.
  - The `casual` and `teams-latency` matchmaker templates no longer lower `min_team_size` to 1; the matchmaker reference and the end-to-end test no longer promise a solo match.
  - `EdgegapSceneSetup` uses explicit `== null` checks instead of `??` on Unity objects.
- `edgegap-purrnet` (0.1.1):
  - The expansion stage in `casual.json`.
  - Pins Edgegap Unity SDK 3.5.6; the embed-and-patch fix for Unity before 2022.3 is gone, replaced by the SDK version.
  - The matchmaker template no longer lowers `min_team_size` to 1 after 30 s.
  - Transport log messages use explicit `!= null` checks instead of `?.` on the transport component.
- `edgegap` (0.7.1): pack version.
- Evals: `evals/purrnet-evals.json` (3 tasks, with fixtures `orbitbrawl` and `broken-orbitbrawl`) and `evals/purrnet-routing-eval.json` (20 queries). Results with `edgegap-purrnet` 0.1.1 (before the expansion stage): routing 60/60; tasks 100% with the skill vs 85% without, all outputs compile as Linux dedicated servers.

## 0.7.0 (2026-10-19)

Adds Netcode for GameObjects.

- New skill `edgegap-ngo` (0.1.0): Unity games built on Netcode for GameObjects, end to end, from the verified run of [netcode-sample-unity-ngo-bossroom](https://github.com/edgegap/netcode-sample-unity-ngo-bossroom) (Boss Room, Unity 6000.0.54f1, NGO 1.13.0, UnityTransport UDP, SDK 3.5.6).
  - Templates that add themselves at startup so scenes stay unchanged: `EdgegapBootstrap`, `EdgegapServerLifecycle` (starts the NGO server on the Edgegap internal port, or only watches a server the game starts itself; self-stop), `EdgegapMatchmakingClient` (Find Match panel, connects to the public IP), an `EdgegapSettings` asset, and command-line flags for scripted two-client tests. The generic plain-NGO server start and direct connection were tested locally (Docker server, two clients) and the generic matchmaker adapter compiles; the Boss Room `ConnectionManager` adapter, server starter and test driver in `Examples/BossRoom/` are the files from the Edgegap run.
  - NGO pitfalls: host-only logic, connection payloads and approval, debug/release build checks, Relay leftovers, UnityTransport needing an IP, client-only code throwing on the server, two local clients sharing a player id, a UGS Matchmaker client that breaks compilation.
  - Matchmaker: a profile with `min_team_size < max_team_size` needs an expansion stage, or a partial match only starts when the tickets expire (measured: 5 minutes without one, under 40 s with one).
- `edgegap` (0.7.0): routes NGO projects to `edgegap-ngo`.
- `edgegap-unity` (0.1.8): points NGO projects to `edgegap-ngo`; keeps Mirror, WebGL and other netcodes.
- README, plugin and marketplace descriptions name NGO; the verified table lists the Boss Room end-to-end run.
- Evals: NGO queries in `evals/routing-eval.json`.

## 0.6.1 (2026-10-19)

Fixes in `edgegap-fishnet` found by its first task evals.

- `edgegap-fishnet` (0.2.0):
  - Pins Edgegap Unity SDK 3.5.6, which fixes the form-encoded ticket body on Unity before 2022.3. The embed-and-patch steps for 3.5.5 are gone; an embedded, hand-patched SDK should be replaced by the git package.
  - New guidance for `LoadGlobalScenes` with `ReplaceScenes.All`: the game's match manager and players die with the replaced scene on a dedicated server. Scene objects can't be moved with `MovedNetworkObjects`, so spawn the manager as a global prefab (`SetIsGlobal(true)` after `Instantiate`) or give the next scene its own; move or respawn players.
  - The matchmaker template no longer lowers `min_team_size` to 1 after 30 s, so it never starts a match below the requested size.
  - `EdgegapSceneSetup` and the example bridge use explicit `== null` checks instead of `??` / `?.` on Unity objects.
- Evals: `evals/fishnet-evals.json` (3 tasks, with fixtures `kartclash` and `broken-kartclash`) and `evals/fishnet-routing-eval.json` (20 queries). Results: routing 60/60; tasks 100% with the skill vs 86% without (iteration 2), all outputs compile as Linux dedicated servers.

## 0.6.0 (2026-10-15)

Adds Manus browser games.

- New skill `edgegap-manus` (0.1.0): browser games built with Manus, taken to an authoritative dedicated server and the Edgegap matchmaker.
  - The Manus backend owns matchmaking: Steam OpenID sign-in verified server-side, join / status / cancel / leave routes that create tickets with `player_ip` (so servers are placed near players, not near the backend), modes as profiles, regions as an `intersection` rule, parties as group tickets, and a queue table whose primary key prevents duplicate tickets. Timeouts, cancel, reconnect and allocation failures (MATCH_FOUND ↔ SEARCHING flips, allocation timeout) are handled and mapped to UI states.
  - Ed25519 join tokens: the backend signs, the game server verifies with a public key on the app version and checks request ID, `MM_TICKET_IDS`, expiry and replay.
  - Node.js `ws` game server template (authoritative loop, input validation, reconnect, self-stop, SIGTERM), browser `MatchClient`, Dockerfile, GitHub Actions build to the Edgegap registry, matchmaker config, and phase-by-phase prompts to paste into Manus.
  - Tested locally against a mock matchmaker and in Docker; not yet run end to end on Edgegap and Manus hosting.
- `edgegap` (0.6.0): routes Manus games to `edgegap-manus`, and points JavaScript browser games at its templates.
- README, plugin and marketplace descriptions name Manus.

## 0.5.0 (2026-10-15)

Adds PurrNet.

- New skill `edgegap-purrnet` (0.1.0): Unity games built on PurrNet, end to end, from the verified run of [PurrNet-Incremental-Sample](https://github.com/edgegap/PurrNet-Incremental-Sample) (Unity 6000.3.11f1, PurrNet `dev`, `UDPTransport`, SDK 3.5.5).
  - Templates from that run, which add themselves at startup so scenes stay unchanged: `EdgegapBootstrap` (turns PurrNet's auto start off in builds, keeps the Editor's host + clone flow), `EdgegapServerLifecycle` (UDP 5000, self-stop), `EdgegapConnectPanel` (direct connection by default, Find Match when the matchmaker is on), `EdgegapMatchmakingClient`, and an `EdgegapSettings` asset, plus command-line flags for scripted two-client tests.
  - PurrNet pitfalls: `[ObserversRpc]` server setup that needs `runLocally: true` on a dedicated server (the sample spawned no trees without it), the async `StartClient` that breaks naive retry loops, PurrNet's own Edgegap auto-setup, permissive network rules, and the untested WebGL path.
- `edgegap` (0.5.0): routes PurrNet projects to `edgegap-purrnet`.
- `edgegap-unity` (0.1.7): points PurrNet projects to `edgegap-purrnet`.
- README, plugin and marketplace descriptions name PurrNet; the verified table lists the PurrNet end-to-end run.

## 0.4.0 (2026-10-15)

Adds FishNet.

- New skill `edgegap-fishnet` (0.1.0): Unity games built on FishNet, end to end, from the verified run of [netcode-sample-unity-fishnet](https://github.com/edgegap/netcode-sample-unity-fishnet) (`Fishnet_v4.1.6R_WebGL_Matchmaker`, Unity 2021.3.45f2, FishNet 4.1.6R, Bayou, SDK 3.5.5).
  - FishNet-ready templates from that run: `EdgegapMatchmakingClient` (Bayou `wss` to the fqdn, Tugboat to the IP), `EdgegapServerLifecycle` (port 7770, starts the server in every server build), `EdgegapPersistence` (keeps the Edgegap object across FishNet scene loads, so self-stop survives the menu → game switch), `EdgegapSceneSetup` that adds all three, and an example menu bridge with a direct-connection mode and an opt-in matchmaker mode.
  - Covers Start On Headless versus the lifecycle auto start, ServerManager's frame rate, NetworkHudCanvas auto start, Multipass ports, FishNet 2.x/3.x, and removing the client-side Edgegap API calls and token from older FishNet samples.
  - The SDK 3.5.5 fix Unity before 2022.3 needs (form-encoded POST bodies make every matchmaker ticket fail with HTTP 400), the lone-ticket timing seen on matchmaker 3.3.2, and WebSocket probes that keep a server alive.
- `edgegap` (0.4.0): routes FishNet projects to `edgegap-fishnet`.
- `edgegap-unity` (0.1.6): points FishNet projects to `edgegap-fishnet`; its FishNet adapter is now the verified one (sets Use WSS on Bayou), with notes on scene persistence and the SDK fix.
- README, plugin and marketplace descriptions name FishNet; the verified table lists the FishNet end-to-end run.

## 0.3.1 (2026-10-14)

Shrinks the plugin so the directory scanner accepts it.

- `.claude-plugin/icon.png`: 256×256, 256-colour palette, 23 KB (was 512×512 full colour, 162 KB). The pack unpacks to about 331 KB instead of 470 KB.
- No skill content changes.

## 0.3.0 (2026-10-14)

Adds Unreal Engine.

- New skill `edgegap-unreal` (0.1.0): Unreal Engine 5 games, C++ or Blueprint-only, end to end.
  - Source engine and Linux cross-compile setup, with the fixes that cost hours: compiler pinning when a newer Visual Studio is installed, UE 5.5's missing `<chrono>` include, ShaderCompileWorker, the Windows path limit and old target build settings.
  - Two drop-in C++ subsystems that need no changes to the game mode or player controller. The matchmaker client measures latency to the beacons, creates and polls a ticket and travels to the server; it adds a default overlay, console commands, Blueprint functions and an event. The server subsystem stops matchmaker deployments once they are empty.
  - Linux server packaging, a Dockerfile that runs the server binary directly with `-stdout -FullStdOutLogOutput`, and a matchmaker template with a latency rule.
  - Verified end to end on Edgegap with UE 5.5.4 and the unreal-sample project. Task evals: 100% of checks with the skill versus 70.5% without.
- `edgegap` (0.3.0): routes Unreal Engine projects to `edgegap-unreal`.
- `edgegap-unity` (0.1.5): description points Unreal projects to `edgegap-unreal`.
- README, plugin and marketplace descriptions name Unreal Engine.

## 0.2.1 (2026-10-13)

Fixes the Anthropic Directory hold on 0.2.0.

- The OpenAPI spec copies in `spec/` are gone: their examples contain token-shaped values, which the directory treats as shipped secrets. `scripts/spec-pin.txt` now records the upstream commit the skills were checked against, and `check_spec.py` diffs the published spec against it.
- `scan_private_refs.py` also flags long literal values assigned to token, password or secret fields.
- `edgegap` (0.2.1): without the MCP tools, the agent guides the developer through the dashboard instead of asking for the API token or reading it from their machine.
- `edgegap-deployments-api` (0.2.1): the backend sketch loads the token from a secret manager instead of an environment variable.

## 0.2.0 (2026-10-13)

Pack version 0.2.0. The pack now covers any engine, not only Unity.

- New skills:
  - `edgegap` (entry point): server shape per game (per match, per player session for always-online single-player games, persistent), vocabulary, tiers and limits, and `references/agent-rules.md`, the one place that states when to use MCP tools versus HTTP and the safety rules (confirm before spending, tag what you start, stop only your own deployments by exact ID, secrets never in files, clients or servers).
  - `edgegap-server-design`: the deployment lifecycle contract for any engine (injected `ARBITRIUM_*`/`MM_*` variables, `0.0.0.0` binding, readiness, self-stop, restart policy, SIGTERM and the termination grace period, logs, persistent worlds).
  - `edgegap-containerize`: the container contract, a generic Dockerfile and variants, registry push, tags, app version fields, TLS Upgrade for browser clients.
  - `edgegap-local-testing`: parity run, random-external-port test, drain test, two servers on one host, sizing, and a tagged smoke-test deployment.
  - `edgegap-deployments-api`: backend allocation with `POST /v2/deployments`, webhooks, rate limits, error handling, retry safety without an idempotency key, reconciliation, and the Nakama, UGS, PlayFab and EOS integrations. `references/api-reference.md` is written from the published OpenAPI spec.
  - `edgegap-launch`: launch checklist, blue/green rollouts, caching, cost control, observability, Private Fleets and persistence.
  - `edgegap-troubleshoot`: symptom → cause → fix tables for every layer, any engine.
- `edgegap-unity` (0.1.4): `metadata.version` added, a pointer to the backend and launch skills, always-online single-player games, and the free registry is now 10 GB.
- `scripts/check_spec.py` and a weekly workflow (`spec-drift.yml`) open an issue when Edgegap's published OpenAPI spec changes from the commit pinned in `scripts/spec-pin.txt`.
- `scripts/scan_private_refs.py` (run in CI): fails on personal paths, personal emails, real matchmaker or deployment hosts, registry robot accounts, and token-shaped strings.
- `scripts/validate.py`: requires `metadata.version` on every skill, and checks relative links and skill names mentioned across skills.
- Evals: `evals/routing-eval.json` (which skill should load for 20 prompts) and `evals/guardrails.json` (7 safety scenarios). Not yet run.
- `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue templates. README: skill map, `npx skills add` install for any agent.

## 0.1.3 (2026-10-09)

- Directory review fixes: no example matchmaker URLs next to token arguments in the C# templates, the self-stop comment no longer names the injected key, the changelog no longer names the icon file, and the README explains which deployment variables the game server reads inside its Edgegap container.

## 0.1.2 (2026-10-09)

- The Edgegap API token is now a `sensitive` plugin setting (`userConfig.edgegap_api_token`), prompted when the plugin is enabled and kept in the system credential store, instead of the `EDGEGAP_API_TOKEN` environment variable.
- README: new "What the plugin runs, sends and fetches" section listing every network endpoint, local command and project file.

## 0.1.1 (2026-10-09)

- Plugin icon (Edgegap logo, 512×512) and `privacyPolicyUrl` for the Anthropic Directory listing.

## 0.1.0 (2026-10-09)

First release.

- `edgegap-unity` skill: from Unity host/client or local multiplayer to dedicated servers and matchmaking on Edgegap, end to end.
  - Drop-in C# templates: `EdgegapMatchmakingClient` (Group Up flow, connect with retries, cancel/409 handling), `EdgegapServerLifecycle` (headless start, injected match data, self-stop), ticket DTOs, `link.xml`.
  - Editor tools: `EdgegapServerBuild` (Linux dedicated server and test-client builds from the command line) and `EdgegapSceneSetup` (adds and configures the components without hand-editing scenes).
  - Netcode adapters for Netcode for GameObjects, Mirror (KCP, Telepathy, SimpleWeb) and FishNet (Tugboat, Bayou).
  - Dockerfile (no `env` dump of the self-stop token), matchmaker config templates, troubleshooting tables.
  - Uses Edgegap MCP 0.3.3+ (`tls_upgrade`, `allowed_cors_origins`), with dashboard fallbacks for older servers.
- Claude Code plugin and marketplace manifests, bundling the hosted Edgegap MCP server.
- Verified end to end on Edgegap with the Mirror WebGL sample.
