# Edgegap matchmaker for a FishNet game

Contents
1. How it fits together
2. The config
3. Expansion stages, lone tickets and testing
4. Creating the matchmaker in the dashboard
5. Ticket ↔ profile contract
6. What the server receives
7. Shipping a new build

## 1. How it fits together

```
Client ──POST /groups (profile, attributes)──▶ Matchmaker ──match found──▶ Edgegap deploys the app version near the players
Client ◀──poll: SEARCHING → MATCH_FOUND → HOST_ASSIGNED {fqdn, public_ip, ports{gameport:{external}}}
Client ──Bayou wss://fqdn:external  /  Tugboat public_ip:external──▶ FishNet server (env: MM_MATCH_ID, MM_TICKET_IDS, ...)
```

`EdgegapMatchmakingClient` runs this flow with the SDK's Group Up client (a group of one), retries the connection while the server boots, and handles a cancel that races a match (409 → resume). The server's `EdgegapServerLifecycle` logs the match and stops the deployment when it empties.

## 2. The config

Start from `assets/matchmaker/casual-webgl.json`:
- `version` `3.3.2`, `inspect: true` for development (turn off for live), `max_deployment_retry_count: 3`.
- `allowed_cors_origins`: every origin that serves a WebGL build, exact scheme + host + port, no path (e.g. `http://localhost:8080`, `https://<user>.itch.io`, `https://html-classic.itch.zone`).
- Profile `casual`: one team of 2-4 players (`player_count` rule), tickets expire after 30 s (`ticket_expiration_period: "30s"`, so a developer testing alone isn't left waiting 5 minutes), and no expansion stage: `min_team_size` below `max_team_size` already allows partial matches (§3). A match never starts with fewer players than the developer asked for. Only lower `min_team_size` in an expansion when the developer explicitly wants solo or smaller matches, and never below the game's real minimum (a race or duel with one player is not a match).
- `application.name` / `version`: the app and version from Phase 4. They must exist and be active, or the dashboard rejects the config.

Desktop-only (Tugboat) games can add a `latencies` rule for better placement; the client must then send beacons (`UseLatencyBeacons = true`). Never for WebGL, which can't ping beacons. `edgegap_build_matchmaker_config` generates configs too (pass `allowed_cors_origins` for WebGL). Save the result as `matchmaker-config.json` in the project root.

## 3. Expansion stages, lone tickets and testing

A profile with `min_team_size < max_team_size` already allows **partial** matches (at least `min_team_size`, fewer than `max_team_size`): it needs no expansion stage for that. The matchmaker fills a match up to `max_team_size` when it can, and otherwise makes the partial match by the time the tickets reach `ticket_expiration_period`. So keep that period short (`30s`, the template's value) instead of adding an expansion: expansions cost the matchmaker a lot of performance. Measured on matchmaker 3.3.2 (2026-10-19, `min 2 / max 8`, no expansion): with a 5-minute expiration, two tickets stayed `SEARCHING` and matched exactly at expiry, which is why the templates expire tickets after 30 s. Use expansions only to relax a rule over time (a lower `min_team_size` for solo play, wider latency or skill), never just to get partial matches.
- With `edgegap_build_matchmaker_config`, leave `expansions` out unless a rule should relax over time.

In the original FishNet run (with a `min_team_size: 1` expansion at 30 s that the template no longer has), a single ticket got `HOST_ASSIGNED` only when it neared its 5-minute expiration, not at the expansion. Two tickets matched within seconds. So:
- Run the end-to-end test with **two clients** (two browser tabs, or two builds).
- Keep `ticket_expiration_period` at `30s` (the template's value) so a lone or partial ticket is matched or cancelled within 30 s instead of 5 minutes, and keep every expansion key below it. The client shows "try again" on `CANCELLED`.

## 4. Creating the matchmaker in the dashboard

There is no API for this. Guide the developer:
1. https://app.edgegap.com/matchmaker-management-v2/matchmakers/list → **Create Matchmaker**, a name like `mygame-dev`, upload `matchmaker-config.json`.
2. `The application configuration is not valid for profile X`: the app name/version doesn't match an active version. `Docker image ... is not cached` is only a warning on the free tier.
3. **Create and Start**. When ONLINE, copy the **API URL** and **Auth Token**. The Auth Token is client-safe and grants no account access.
4. DNS can take ~5 minutes: `curl -s -H "Authorization: <auth token>" <API URL>/monitor` until it answers. The token is sent raw, with no `Bearer` or `token` prefix.

Then set them on `EdgegapMatchmakingClient` (`BaseUrl`, `AuthToken`), or rerun `EdgegapSceneSetup` with `-edgegapBaseUrl` and `-edgegapAuthToken`. Free-tier matchmakers stop 3 hours after each start; restart from the list, the URL and token stay the same. To delete the app or version later, delete the matchmaker first.

## 5. Ticket ↔ profile contract

- The ticket's `profile` must equal a profile name (`EdgegapMatchmakingClient.Profile`).
- Every rule except `player_count` needs a ticket attribute with the rule's name, and unknown attributes are rejected. A mismatch is HTTP 400 on `POST /groups`.
- On Unity before 2022.3 with SDK 3.5.5 or older, **every** ticket gets HTTP 400 even with a correct profile: that is the SDK's form-encoded POST body, fixed in 3.5.6 (`troubleshooting.md` §1), not the config.

## 6. What the server receives

Matchmaker deployments get `MM_MATCH_ID`, `MM_MATCH_PROFILE`, `MM_EXPANSION`, `MM_TICKET_IDS` (JSON array), `MM_TICKET_<id>`, `MM_GROUPS`, `MM_TEAMS` and the usual `ARBITRIUM_*` variables. `EdgegapServerLifecycle.MatchEnv` parses them; `ExpectedPlayers` is the ticket count, and the startup log prints `N matched player(s)`.

To validate joiners, send `EdgegapMatchmakingClient.TicketId` from the client in a FishNet authenticator or a first `ServerRpc`, and kick connections whose ticket isn't in `MM_TICKET_IDS`. Optional for a first playtest.

## 7. Shipping a new build

Build the server → push a new tag → new app version → matchmaker **Stop → Edit** `application.version` **→ Start**. Forgetting the last step keeps matches on the old build.
