# Edgegap matchmaker for a Godot game

Contents
1. How it fits together
2. The config
3. Creating the matchmaker in the dashboard
4. Ticket API contract
5. What the server receives
6. Expansion stages, lone tickets and testing
7. Shipping a new build

## 1. How it fits together

```
Client ──POST /tickets {profile, attributes}──▶ Matchmaker ──match found──▶ Edgegap deploys the app version near the players
Client ◀──GET /tickets/{id} every 2 s: SEARCHING → MATCH_FOUND → HOST_ASSIGNED {fqdn, public_ip, ports{gameport:{external}}}
Client ──ENet public_ip:external  /  WebSocket wss://fqdn:external──▶ Godot server (env: MM_TICKET_IDS, MM_MATCH_ID, ...)
```

`EdgegapMatchmaker` runs this with `HTTPRequest` (one ticket per player; the Godot sample used the same calls on matchmaker 3.3.2), then `join()` retries the connection while the fresh server boots. `EdgegapServer` reads `MM_TICKET_IDS` and starts the match when that many players are in.

## 2. The config

Start from `assets/matchmaker/casual.json`:
- `version` `3.3.2`, `inspect: true` for development (off for live), `max_deployment_retry_count: 3`.
- Profile `casual`: one team of 2-4 players, tickets expire after 30 s (`ticket_expiration_period: "30s"`, so a developer testing alone isn't left waiting 5 minutes), and no expansion stage: `min_team_size` below `max_team_size` already allows partial matches (§6). A match never starts with fewer players than the developer asked for. Lower `min_team_size` in an expansion only when the developer explicitly wants solo or smaller matches (the sample drops to 1 after 30 s and fills seats with bots).
- `application.name` / `version`: the app and version from Phase 4, which must exist and be active.
- **Web exports**: `allowed_cors_origins` with every origin that serves the build, exact scheme + host + port, no path (e.g. `http://localhost:8060`, `https://<user>.itch.io`, `https://html-classic.itch.zone`). Without it the browser blocks every ticket call and the game only sees `HTTPRequest` result errors (code 0).
- Desktop-only games can add a `latencies` rule for better placement; the client must then send a `latencies` attribute (beacon pings), which the templates don't do. Never for web clients.

`edgegap_build_matchmaker_config` generates configs too (pass `allowed_cors_origins` for web). Save as `matchmaker-config.json` in the project root and give the developer its **full path** when they upload it; machines with several Edgegap samples have several files with that name, and uploading the wrong one points the matchmaker at another game.

## 3. Creating the matchmaker in the dashboard

No API for this step. Guide the developer:
1. https://app.edgegap.com/matchmaker-management-v2/matchmakers/list → **Create Matchmaker** → name → upload the file.
2. `The application configuration is not valid for profile X`: app name or version doesn't match an active version. `Docker image ... is not cached` is a warning only on the free tier.
3. **Create and Start**. When ONLINE, copy the **API URL** and **Auth Token** (client-safe, no account access).
4. DNS can take ~5 minutes: `curl -s -H "Authorization: <auth token>" <API URL>/monitor` until it answers.

Put both in `edgegap_settings.gd` (`MATCHMAKER_URL`, `MATCHMAKER_AUTH_TOKEN`), or pass `EDGEGAP_MATCHMAKER_URL` / `EDGEGAP_MATCHMAKER_TOKEN` to test clients. Free-tier matchmakers stop 3 hours after each start; restarting keeps the URL and token. To delete the app or version later, delete the matchmaker first.

## 4. Ticket API contract

- Header `Authorization: <auth token>`, **raw**: no `Bearer` or `token` prefix (401 otherwise). `Content-Type: application/json` on the POST.
- `POST /tickets` `{"profile": "casual", "attributes": {}}` → 200/201 `{"id": ...}`. The `profile` equals `EdgegapGameSettings.PROFILE`. Every rule except `player_count` needs an attribute with the rule's name; unknown attributes are rejected. A mismatch is HTTP 400.
- `GET /tickets/{id}` → `status`: `SEARCHING`, `MATCH_FOUND` / `TEAM_FOUND`, `HOST_ASSIGNED` with `assignment.fqdn`, `assignment.public_ip` and `assignment.ports.<name>.external`, or `CANCELLED`. 404 = expired or removed.
- `DELETE /tickets/{id}` cancels. 409 means it was already matched: keep polling and join (the template does).
- Poll every 2 s, one request in flight; give up and delete the ticket after a timeout (`SEARCH_TIMEOUT_SECONDS`, 300).

## 5. What the server receives

Matchmaker deployments get `MM_MATCH_ID`, `MM_MATCH_PROFILE`, `MM_EXPANSION`, `MM_TICKET_IDS` (a JSON array, one ID per ticket), `MM_TICKET_<id>`, `MM_GROUPS`, `MM_TEAMS` and the `ARBITRIUM_*` variables. `EdgegapServer.expected_players` is the ticket count; its `ready` log line prints `match_id`, `profile` and `expected_players`. A direct deploy has no `MM_*` variables: `expected_players=0`, and the match starts 10 s after the first join.

Validating joiners: `godot.md` §8.

## 6. Expansion stages, lone tickets and testing

A profile with `min_team_size < max_team_size` already allows **partial** matches (at least `min_team_size`, fewer than `max_team_size`): it needs no expansion stage for that. The matchmaker fills a match up to `max_team_size` when it can, and otherwise makes the partial match by the time the tickets reach `ticket_expiration_period`. So keep that period short (`30s`, the template's value) instead of adding an expansion: expansions cost the matchmaker a lot of performance. Measured on matchmaker 3.3.2 (2026-10-19, `min 2 / max 8`, no expansion): with a 5-minute expiration, two tickets stayed `SEARCHING` and matched exactly at expiry, which is why the templates expire tickets after 30 s. Use expansions only to relax a rule over time (a lower `min_team_size` for solo play, wider latency or skill), never just to get partial matches. With `edgegap_build_matchmaker_config`, leave `expansions` out unless a rule should relax over time. In the Godot sample, matching took about 20 s per cycle.

Test with **two clients** (`EDGEGAP_FIND_MATCH=1` on both): a lone ticket may only get a server near its expiry (30 s with the template) on the free tier.

## 7. Shipping a new build

Export the server → push a new tag → new app version (with registry credentials) → matchmaker **Stop → Edit** `application.version` **→ Start**.
