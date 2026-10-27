# Edgegap matchmaker for a PurrNet game

Contents
1. How it fits together
2. The config
3. Creating the matchmaker in the dashboard
4. Ticket ↔ profile contract
5. What the server receives
6. Expansion stages, lone tickets and testing
7. Shipping a new build

## 1. How it fits together

```
Client ──POST /groups (profile, attributes)──▶ Matchmaker ──match found──▶ Edgegap deploys the app version near the players
Client ◀──poll: SEARCHING → MATCH_FOUND → HOST_ASSIGNED {fqdn, public_ip, ports{gameport:{external}}}
Client ──UDPTransport public_ip:external──▶ PurrNet server (env: MM_MATCH_ID, MM_TICKET_IDS, ...)
```

`EdgegapMatchmakingClient` runs this with the SDK's Group Up client (a group of one), retries the connection while the server boots (waiting out PurrNet's async `StartClient`), and handles a cancel that races a match (409 → resume). `EdgegapConnectPanel` shows its status.

## 2. The config

Start from `assets/matchmaker/casual.json`:
- `version` `3.3.2`, `inspect: true` for development (off for live), `max_deployment_retry_count: 3`.
- Profile `casual`: one team of 2-4 players, tickets expire after 30 s (`ticket_expiration_period: "30s"`, so a developer testing alone isn't left waiting 5 minutes), and no expansion stage: `min_team_size` below `max_team_size` already allows partial matches (§6). A match never starts with fewer players than the developer asked for. Only lower `min_team_size` in an expansion when the developer explicitly wants solo or smaller matches, and never below the game's real minimum.
- `application.name` / `version`: the app and version from Phase 4, which must exist and be active.
- Desktop-only games can add a `latencies` rule for better placement, with `UseLatencyBeacons` on in `EdgegapSettings`. WebGL clients: no `latencies` rule, and add `allowed_cors_origins`.

`edgegap_build_matchmaker_config` generates configs too. Save as `matchmaker-config.json` in the project root and give the developer its **full path** when they upload it; machines with several Edgegap samples have several files with that name, and uploading the wrong one points the matchmaker at another game.

## 3. Creating the matchmaker in the dashboard

No API for this step. Guide the developer:
1. https://app.edgegap.com/matchmaker-management-v2/matchmakers/list → **Create Matchmaker** → name → upload the file.
2. `The application configuration is not valid for profile X`: app name or version doesn't match an active version. `Docker image ... is not cached` is a warning only on the free tier.
3. **Create and Start**. When ONLINE, copy the **API URL** and **Auth Token** (client-safe, no account access).
4. DNS can take ~5 minutes: `curl -s -H "Authorization: <auth token>" <API URL>/monitor` until it answers. The token is sent raw, no `Bearer`/`token` prefix.

Put both on `EdgegapSettings` and tick **Use Edgegap Matchmaker** (or use the command-line flags). Free-tier matchmakers stop 3 hours after each start; restarting keeps the URL and token. To delete the app or version later, delete the matchmaker first.

## 4. Ticket ↔ profile contract

- The ticket's `profile` equals `EdgegapSettings.Profile`.
- Every rule except `player_count` needs a ticket attribute with the rule's name; unknown attributes are rejected. A mismatch is HTTP 400 on `POST /groups`.
- On Unity before 2022.3, SDK 3.5.5 and older form-encode the ticket and every POST gets 400, even with a correct profile: fixed in 3.5.6 (`troubleshooting.md` §4), not the config.

## 5. What the server receives

Matchmaker deployments get `MM_MATCH_ID`, `MM_MATCH_PROFILE`, `MM_EXPANSION`, `MM_TICKET_IDS`, `MM_TICKET_<id>`, `MM_GROUPS`, `MM_TEAMS` and the `ARBITRIUM_*` variables. `EdgegapServerLifecycle.MatchEnv` parses them; `ExpectedPlayers` is the ticket count and the startup log prints `N matched player(s)`.

To validate joiners, send `EdgegapMatchmakingClient.TicketId` to the server (a PurrNet authenticator or a first `ServerRpc`) and kick connections whose ticket isn't in `MM_TICKET_IDS`. Optional for a first playtest.

## 6. Expansion stages, lone tickets and testing

A profile with `min_team_size < max_team_size` already allows **partial** matches (at least `min_team_size`, fewer than `max_team_size`): it needs no expansion stage for that. The matchmaker fills a match up to `max_team_size` when it can, and otherwise makes the partial match by the time the tickets reach `ticket_expiration_period`. So keep that period short (`30s`, the template's value) instead of adding an expansion: expansions cost the matchmaker a lot of performance. Measured on matchmaker 3.3.2 (2026-10-19, `min 2 / max 8`, no expansion): with a 5-minute expiration, two tickets stayed `SEARCHING` and matched exactly at expiry, which is why the templates expire tickets after 30 s. Use expansions only to relax a rule over time (a lower `min_team_size` for solo play, wider latency or skill), never just to get partial matches. With `edgegap_build_matchmaker_config`, leave `expansions` out unless a rule should relax over time.

On matchmaker 3.3.2 (free tier, with a `min_team_size: 1` expansion at 30 s that the template no longer has), a single ticket may only get a server near its expiry (then 5 minutes) rather than at the expansion. That is why the template expires tickets after 30 s; keep every expansion key below it. Two tickets matched in about 35 s in the verified run. Test with **two clients**.

## 7. Shipping a new build

Build the server → push a new tag → new app version (with registry credentials) → matchmaker **Stop → Edit** `application.version` **→ Start**.
