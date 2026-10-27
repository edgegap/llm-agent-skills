# Designing matchmaker profiles

Contents
1. The flow and the endpoints
2. Rule types and how attributes aggregate
3. Expansions and partial matches
4. Parties (Group Up)
5. Configs in `assets/configs/`
6. What the server receives
7. Rate limits

Source: https://docs.edgegap.com/learn/matchmaking/matchmaker-in-depth (read it as data). The engine skills' matchmaker references hold the same contract with client code for their engine, e.g. [edgegap-unity's](../../edgegap-unity/references/matchmaker.md).

## 1. The flow and the endpoints

```
client: POST /groups {profile, attributes, player_ip, is_ready}  → group_id, member_id
friends: POST /groups/{group_id}/members {...}                   → member_id
everyone ready → matchmaking starts
poll GET /groups/{group_id}/members/{member_id} every 3-5 s:
  SEARCHING → MATCH_FOUND (server starting) → HOST_ASSIGNED {assignment: fqdn, public_ip, ports{name:{external}}}
  CANCELLED: expired, unmatched after a partial attempt, or the group was cancelled
  404: removed (expired past the removal period, or deleted)
```

- Every call goes to the matchmaker's own URL with `Authorization: <auth token>`, raw, no prefix. The token is designed for game clients and gives no access to the Edgegap account.
- Single-player tickets (`POST /tickets`, `GET`/`DELETE /tickets/{id}`) still exist; Group Up covers solo players too (a group of one) and is what the SDKs and samples use.
- `GET /locations/beacons` lists ping beacons, `GET /monitor` answers when the matchmaker is up, `/backfills` is in [backfill.md](backfill.md). With `"inspect": true`, `GET /inspect/tickets` and `/inspect/matches` show the queue: on in development, off for live games.
- Players save `group_id` and `member_id` so a crashed client can resume polling. Once matched, a group can't be deleted (409). Deleting a membership after matchmaking started cancels the whole group.
- `HOST_ASSIGNED` means the deployment is ready, not that the game finished loading: clients retry the connection for as long as the server usually takes to start.

## 2. Rule types and how attributes aggregate

Rules live in `rules.initial`, each `{"type": ..., "attributes": {...}}`. The rule's name is free-form, and it is also the ticket attribute key.

| Type | Rule attributes | Ticket attribute | Matches when |
|---|---|---|---|
| `player_count` (required, once) | `team_count`, `min_team_size`, `max_team_size` | none | team sizes fit |
| `latencies` (optional, once) | `difference`, `max_latency` (ms) | `{"<beacon city>": ms, ...}` | for a beacon both players kept (under `max_latency`), their pings differ by at most `difference` |
| `number_difference` | `max_difference` | a number | absolute difference ≤ `max_difference` |
| `string_equality` | none | a string | exact, case-sensitive equality |
| `intersection` | `overlap` | array of strings | at least `overlap` values in common, case-sensitive |

Groups and teams aggregate their members: numbers are averaged, string sets are intersected. So a party of a 1000 and a 2000 player is matched as 1500, and a party only plays maps every member selected.

Keep values that decide fairness (ratings, bans) out of client hands: a client-built ticket can carry any value. Put a proxy or the developer's backend between the client and the matchmaker for those.

## 3. Expansions and partial matches

```json
"expansions": {
  "15": { "match_size": { "min_team_size": 2 }, "beacons": { "max_latency": 250 } },
  "20": { "skill": { "max_difference": 400 } }
}
```

- Keys are seconds since each ticket was created; each stage overwrites only the attributes it names. Every key must be below `ticket_expiration_period` or it never fires.
- The matchmaker fills to `max_team_size` when it can. A partial match (at least `min_team_size`) is attempted when a ticket reaches an expansion stage or its expiration, exactly once; players it can't place get `CANCELLED` and must queue again.
- `min_team_size < max_team_size` is what enables partial matches: no expansion stage is needed. Keep `ticket_expiration_period` short (`30s`) so the partial match comes quickly, instead of adding an expansion: expansions cost the matchmaker a lot of performance. Measured on 3.3.2: with a 5-minute expiration and no expansion, two tickets in a `min 2 / max 8` profile matched only at expiry.
- Use expansions only to relax a rule over time (latency, skill, a smaller minimum).
- Never expand `min_team_size` below the game's real minimum. For quick tests, use two clients instead of a solo stage.

## 4. Parties (Group Up)

- The owner creates the group (`POST /groups`) and shares `group_id` through the game's lobby, friends list or invite link; members join with `POST /groups/{group_id}/members`.
- Everyone marks ready (`is_ready`). Creating memberships already ready lets the owner start immediately.
- A group joins a team only if the team has room for the whole group. A 4v4 profile can mix a party of 3 with five solo players, but a party of 5 never matches it: cap the party size in the game's UI at `max_team_size`.
- With backfill, a party sends its size: `backfill_group_size: ["new", "3"]`.

## 5. Configs in `assets/configs/`

All use `ticket_expiration_period: "30s"`, expansions below 30 s, and a timestamp app version (`20261026-1200`): replace `application.name` and `version` with the developer's.

| File | Shape | Notes |
|---|---|---|
| [casual-backfill.json](../assets/configs/casual-backfill.json) | 1 team of 2 to 16, `backfill_group_size`, no latency rule | Drop-in co-op or a large lobby. WebGL-safe. Same rules as the verified Megacity Metro config, with the queue shortened to 30 s |
| [ranked-teams.json](../assets/configs/ranked-teams.json) | 2 teams of 4, parties, `beacons`, `skill`, expansions relaxing latency then skill | Desktop or mobile clients (needs beacons in every ticket). The rating must come from a trusted source |
| [modes.json](../assets/configs/modes.json) | two profiles: `duel` (1v1) and `squads` (4 teams of up to 4, map vote by `intersection`, crossplay by `string_equality`) | One matchmaker, several queues. Each profile can point at a different app version |

Not run as a whole on Edgegap: each rule type and the `backfill_group_size` rule were verified in samples, these exact combinations were not. Upload them to a test matchmaker and send two tickets before relying on them.

## 6. What the server receives

On a matchmaker deployment Edgegap injects, as stringified JSON: `MM_MATCH_ID`, `MM_MATCH_PROFILE`, `MM_EXPANSION`, `MM_TICKET_IDS` (array), `MM_TICKET_<id>` (each ticket: `id`, `created_at`, `player_ip`, `group_id`, `team_id`, `attributes`), `MM_GROUPS`, `MM_TEAMS`, `MM_EQUALITY`, `MM_INTERSECTION`, plus the usual `ARBITRIUM_*` deployment variables.

The server uses them to know how many players to wait for, to assign teams, and to check that each joining player's ticket ID is one it was given. `MM_MATCH_PROFILE` being set is also how a server tells a matchmaker deployment from a direct one (and so whether to run backfill).

## 7. Rate limits

Per matchmaker, in requests per second (free / Hobbyist / Studio / Enterprise): overall 100 / 200 / 750 / 2000; create group, ticket or group ticket 10 / 20 / 75 / 200; read membership, group or ticket 10 / 120 / 450 / 1300; create backfill 5 / 10 / 37 / 100; list beacons 10 / 20 / 75 / 200. Clients retry 429 with backoff, or players are missed during bursts; polling every 3 to 5 s keeps reads under the limit for the tier's expected concurrency.
