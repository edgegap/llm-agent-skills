# Edgegap matchmaker: config, dashboard, client contract

Contents
1. How it fits together
2. Designing the profile (questions to ask)
3. Config schema essentials
4. Templates
5. Creating the matchmaker in the dashboard (guide the developer)
6. Ticket ↔ profile contract (the #1 source of 400s)
7. What the server receives
8. Matchmaker troubleshooting

## 1. How it fits together

```
Client ──POST /groups (profile, attributes)──▶ Matchmaker ──match found──▶ Edgegap deploys app/version near players
Client ◀──poll: SEARCHING → MATCH_FOUND → HOST_ASSIGNED {fqdn, public_ip, ports{gameport:{external}}}──┘
Client ──connect fqdn/public_ip : external port──▶ Dedicated server (env: MM_TICKET_IDS, MM_MATCH_ID, ...)
```

- The matchmaker is a hosted service the developer creates in the dashboard. There is no public API to create one. `edgegap_build_matchmaker_config` only produces the JSON.
- Each profile points at one `application.name` + `application.version`. The app version must exist and be active, so create and test it first.
- Matchmaker version: `3.3.2` (latest as of 2026-10). `TEAM_FOUND` status is deprecated since 3.3.0; teams are assigned at `MATCH_FOUND`.

## 2. Designing the profile

Ask only what you can't infer from the game:
- Players per match (min/max), and teams? (1 team = co-op / free-for-all / battle royale; 2 teams = 2v2 etc.)
- The real minimum per match. Never start a match below it: don't add an expansion that lowers `min_team_size` unless the developer explicitly wants solo or smaller matches, and never below the game's real minimum (a duel or race with one player is not a match). Test end to end with two clients instead.
- Platforms: any WebGL client → no `latencies` rule for that profile + `allowed_cors_origins`.
- Desktop/mobile only → a `latencies` rule (beacons) is fine and improves placement, but the client must then send beacons in every ticket (`UseLatencyBeacons = true`).
- Skill/mode/map filters? Each adds a rule and a matching ticket attribute. Skip them for the first end-to-end run and add them afterwards.

## 3. Config schema essentials

Top level: `version` ("3.3.2"), `inspect` (true in dev: enables `GET /inspect/tickets|matches`; turn off for live), `max_deployment_retry_count` (3), optional `allowed_cors_origins` (exact origins `https://host[:port]`, no path/trailing slash; wildcard subdomains `https://*.example.com` allowed), `profiles` (map name → profile).

Profile: `ticket_expiration_period` ("30s"; unmatched tickets become CANCELLED. Keep it short: a lone or partial ticket may only match near expiry, so with "5m" a developer testing alone waits 5 minutes), `ticket_removal_period` ("1m"), `group_inactivity_removal_period` ("5m"), `application {name, version}`, `rules {initial, expansions}`.

Rule types in `rules.initial` (each `{ "type": ..., "attributes": {...} }`, rule names are free-form; the name is also the ticket attribute key):
- `player_count` (required, exactly once): `team_count`, `min_team_size`, `max_team_size`. Fills to max if possible, otherwise makes a partial match (≥ min) when an expansion stage or the expiration elapses. Never below min. `min_team_size < max_team_size` is what enables partial matches: no expansion stage is needed; keep `ticket_expiration_period` short (`30s`) instead, because expansions cost the matchmaker a lot of performance. Measured on matchmaker 3.3.2 (2026-10-19, `min 2 / max 8`, no expansion): with a 5-minute expiration, two tickets stayed `SEARCHING` and matched exactly at expiry.
- `latencies` (optional, once): `difference` (max ms difference between players to the same beacon), `max_latency` (beacons above are discarded). Ticket attribute: `{"Chicago": 12.3, ...}`.
- `number_difference`: `max_difference`. Ticket attribute: a number (e.g. `elo_rating`).
- `string_equality`: no attributes. Ticket attribute: a string; case-sensitive exact match.
- `intersection`: `overlap`. Ticket attribute: array of strings (e.g. maps, modes, `backfill_group_size`).

`rules.expansions`: `{ "<seconds since ticket creation>": { "<rule name>": { <attributes to overwrite> } } }`, `{}` for none. Each key must be < ticket expiration or it never fires.

Duration strings: `"30s"`, `"5m"`. Validate the final JSON (`python -m json.tool file.json`). Some docs examples are missing commas, so never copy them blindly.

## 4. Templates

Write the final file as `matchmaker-config.json` in the project root (it contains no secrets). Replace `application.name`/`version` with the real ones.

**Casual, WebGL-safe (no beacons), 2-4 players**: the verified end-to-end shape, with no expansion stage (it was tested with a solo expansion; `assets/matchmaker/casual.json`):
```json
{
  "version": "3.3.2",
  "inspect": true,
  "max_deployment_retry_count": 3,
  "allowed_cors_origins": ["http://localhost:8080"],
  "profiles": {
    "casual": {
      "ticket_expiration_period": "30s",
      "ticket_removal_period": "1m",
      "group_inactivity_removal_period": "5m",
      "application": { "name": "my-game", "version": "20261022-1430" },
      "rules": {
        "initial": {
          "match_size": {
            "type": "player_count",
            "attributes": { "team_count": 1, "min_team_size": 2, "max_team_size": 4 }
          }
        },
        "expansions": {}
      }
    }
  }
}
```
Remove `allowed_cors_origins` if there is no WebGL client.

**Desktop with latency beacons, 2 teams of 2** (`assets/matchmaker/teams-latency.json`): adds
```json
"beacons": { "type": "latencies", "attributes": { "difference": 100, "max_latency": 200 } }
```
to `initial`, `team_count: 2`, `min_team_size: 2`, `max_team_size: 2`, and an expansion that relaxes latency (`"20": {"beacons": {"max_latency": 300}}`). Match size stays 2v2.

Prefer generating with `edgegap_build_matchmaker_config` (it also checks the app version exists and has ports). It takes `profile_name`, `application`, `version`, `team_count`, `min_team_size`, `max_team_size`, optional `max_latency_ms`, `latency_difference_ms`, `expansions[{after_seconds, min_team_size?, max_latency_ms?}]` (leave it out unless a rule should relax over time; partial matches don't need it), `ticket_expiration`, and `allowed_cors_origins` (needed for WebGL; older MCP servers without this field: add the top-level key to the JSON yourself).

## 5. Creating the matchmaker in the dashboard

There is no API for this step, so walk the developer through it and wait for them:

1. Open https://app.edgegap.com/matchmaker-management-v2/matchmakers/list (sidebar: **Matchmaker**).
2. Click **Create Matchmaker**. Enter a name (e.g. `mygame-dev`) and **upload** (or paste) `matchmaker-config.json`.
3. If it shows `The application configuration is not valid for profile X`, the `application.name`/`version` don't match an existing active app version. Fix and re-upload. `Docker image ... is not cached` is only a warning on free tier, so proceed.
4. Click **Create and Start**. Free tier runs on a shared cluster and **shuts down 3 hours after each start**. Restart it from the list. URL and token stay the same across restarts.
5. When Status is **ONLINE**, copy the **API URL** and **Auth Token** and paste them here (or directly into the `EdgegapMatchmakingClient` component). The Auth Token is the *matchmaker* token: it is safe to ship in game clients and gives no access to the Edgegap account. It is not the Edgegap API token.
6. DNS can take up to ~5 minutes after the first start. Check `curl -s -H "Authorization: <auth token>" <API URL>/monitor` until it answers.

Cleanup order: a matchmaker (even stopped) blocks disabling, renaming or deleting the app/version it references. Delete the matchmaker in the dashboard first (no API), then the version and app.

Updating: editing the config of a running matchmaker does a quick reload (all tickets are deleted, short downtime). Changing `version` needs **Stop → Edit → Start**. When the app version changes (new build), update `application.version` in the config the same way. Forgetting this means matches keep deploying the old build.

## 6. Ticket ↔ profile contract

Tickets are validated against the profile:
- `profile` in the ticket must equal a profile name in the config (`EdgegapMatchmakingClient.Profile`).
- Every rule **except `player_count`** must be present as an attribute with the rule's name as key (e.g. `beacons`, `elo_rating`), and **unknown attributes are rejected**. A mismatch gives HTTP 400 on `POST /groups`.
- So: profile has `latencies` rule ⇔ client sends `beacons` (`UseLatencyBeacons = true`, never on WebGL). Add one field to `GameTicketAttributes` per extra rule, with `[JsonProperty("<rule name>")]`.
- Beacons are measured with ICMP; a 0 value means the ping failed. The client template drops 0 values.

## 7. What the server receives

On matchmaker-created deployments Edgegap injects (parsed by `MatchEnvironmentDTO<GameTicketAttributes>`): `MM_MATCH_ID`, `MM_MATCH_PROFILE`, `MM_EXPANSION`, `MM_TICKET_IDS` (JSON array), `MM_TICKET_<id>` (JSON ticket with `player_ip`, `group_id`, `team_id`, `attributes`), `MM_GROUPS`, `MM_TEAMS`, `MM_EQUALITY`, `MM_INTERSECTION`. Plus the usual `ARBITRIUM_*` deployment variables.

Uses: expected player count (`TicketIds.Count`) to start the match when everyone is in, team assignment, and validating joiners: the client sends `EdgegapMatchmakingClient.TicketId` in its connection payload and the server checks it is in `MM_TICKET_IDS`. That handshake is optional for a first playtest; it's netcode-specific code you write.

The server should allow ~60 s for matched players to connect before giving up on them.

## 8. Matchmaker troubleshooting

| Symptom | Cause / fix |
|---|---|
| Monitor call fails right after creation | DNS propagation, wait ~5 min |
| CORS error in browser console | origin missing from `allowed_cors_origins` (scheme + host + port exactly) |
| 400 on create group | profile name or attributes don't match the config (section 6) |
| 401 | wrong matchmaker token, or "Bearer "/"token " prefix added (send it raw) |
| Two players stay SEARCHING until their tickets expire, then match | `ticket_expiration_period` is long (e.g. `5m`), so the partial match waits until expiry (section 3). Set it to `30s`; don't add an expansion for this (expansions cost the matchmaker a lot of performance) |
| Stuck in SEARCHING | not enough compatible tickets: expected for a lone ticket, so test with two clients; check latency rule isn't excluding players |
| Flips MATCH_FOUND ↔ SEARCHING | deployment can't start: free tier allows **1 concurrent deployment**. Stop leftover test deployments (`edgegap_list_deployments`, `edgegap_stop_deployment`). Also check the app version (registry credentials, image tag) by doing a direct deploy |
| Straight to CANCELLED | ticket expired before a match: test with two clients (a lone ticket can't meet a minimum of 2). Raise `ticket_expiration_period` only for production queues |
| Matches at random times ignoring player count | stale tickets from earlier tests: restart the matchmaker |
| 404 while polling | ticket/group removed (expired, or deleted) |
| Matchmaker OFFLINE | free tier 3-hour shutdown: restart it |
| HOST_ASSIGNED but client can't connect | it's a server/port problem, not matchmaker: see troubleshooting.md "connection" |
