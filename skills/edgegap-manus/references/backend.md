# Manus backend: Steam sign-in, matchmaking routes, join tokens

Contents
1. The browser ↔ backend contract
2. Steam sign-in
3. The queue table (duplicate-ticket prevention)
4. Creating tickets: mode, region, party, player IP
5. Polling, timeouts and allocation errors
6. Cancel, leave, reconnect
7. Join tokens
8. Secrets
9. What the UI shows for each result

## 1. The browser ↔ backend contract

All routes need the session cookie set by the Steam callback. Nothing in a request body identifies the player.

| Route | Body | Returns |
|---|---|---|
| `GET /api/auth/steam` | | redirect to Steam |
| `GET /api/auth/steam/callback` | Steam's OpenID query | sets session, redirects to `/` |
| `POST /api/matchmaking/join` | `{ mode, regions: [] }` | a result (below) |
| `GET /api/matchmaking/status` | | a result; poll every 2 s |
| `POST /api/matchmaking/cancel` | | `cancelled`, or `match_found` if too late |
| `POST /api/matchmaking/leave` | | `idle`; forgets the assignment |

Result (`MatchmakingResult` in `edgegapMatchmaker.ts`):
```json
{ "status": "idle" }
{ "status": "searching", "since": 1760540000000 }
{ "status": "match_found" }
{ "status": "ready", "server": { "requestId": "f68e011bfb01", "host": "f68e011bfb01.pr.edgegap.net", "port": 31504, "url": "wss://f68e011bfb01.pr.edgegap.net:31504", "location": { "city": "Montreal" } }, "joinToken": "eyJ2Ijo...", "expiresInSeconds": 60 }
{ "status": "error", "reason": "ticket_rejected", "retryable": false }
```
No matchmaker URL, Auth Token, ticket ID or other player's data goes to the browser.

## 2. Steam sign-in

A browser game signs players in with **Steam OpenID 2.0** (`steamAuth.ts`):
1. `/api/auth/steam` redirects to `https://steamcommunity.com/openid/login` with `return_to` = `PUBLIC_BASE_URL` + callback path and `realm` = `PUBLIC_BASE_URL`.
2. Steam redirects back with `openid.*` fields. The backend checks `op_endpoint`, that `return_to` is its own callback, and the `claimed_id` format, then POSTs the fields back to Steam with `openid.mode=check_authentication`. Only `is_valid:true` counts.
3. The SteamID64 from `claimed_id` (`https://steamcommunity.com/openid/id/<17 digits>`) goes into the app's server-side session. Regenerate the session ID at login.

`PUBLIC_BASE_URL` must be the published site's exact origin (custom domain if the developer uses one), or Steam's return check fails. For local testing it's the local origin.

`STEAM_WEB_API_KEY` (from https://steamcommunity.com/dev/apikey) is only for the persona name and avatar (`GetPlayerSummaries`); sign-in doesn't need it.

If the game also ships as a Steam desktop app (an Electron or Tauri wrapper with Steamworks), its sign-in uses session tickets instead: the client gets a ticket from `GetAuthTicketForWebApi`, and the backend checks it with `ISteamUserAuth/AuthenticateUserTicket` and the publisher Web API key. The rest of this skill is unchanged: whatever proves the Steam ID ends by setting the same session.

If the Manus project already has its own login (Manus OAuth, email), keep it and link the Steam ID to the account; matchmaking needs a verified player ID, Steam is the one the developer asked for.

## 3. The queue table (duplicate-ticket prevention)

One row per player in the queue or in a match. The primary key on `steam_id` is what stops two tabs, two clicks or two backend instances from creating two tickets: the insert either wins or fails.

```sql
CREATE TABLE matchmaking_queue (
  steam_id        VARCHAR(20) PRIMARY KEY,
  party_leader    VARCHAR(20) NOT NULL,
  ticket_id       VARCHAR(64),
  mode            VARCHAR(32) NOT NULL,
  regions         TEXT NOT NULL,          -- JSON array
  state           VARCHAR(16) NOT NULL,   -- creating | searching | match_found | host_assigned
  created_at      BIGINT NOT NULL,        -- ms
  updated_at      BIGINT NOT NULL,
  last_polled_at  BIGINT,
  match_found_at  BIGINT,
  deploy_retries  INT NOT NULL DEFAULT 0,
  error_count     INT NOT NULL DEFAULT 0,
  assignment      TEXT                    -- JSON Assignment once HOST_ASSIGNED
);
```

Implement `QueueStore` on it: `insert` = `INSERT` that returns false on a duplicate-key error (not an upsert), `put` = update by `steam_id`, `get`, `delete`. Use the project's ORM if it has one. `MemoryQueueStore` is for local tests only: it forgets the queue on restart and doesn't work across instances, and Manus may run more than one.

## 4. Creating tickets: mode, region, party, player IP

`join()` sends, per player:
```json
{ "profile": "casual", "attributes": { "regions": ["europe"] }, "player_ip": "203.0.113.7" }
```
to `POST {url}/tickets`, or a list of them as `{ "player_tickets": [...] }` to `POST {url}/group-tickets` for a party. Header `Authorization: <Auth Token>`, raw.

- **Mode → profile.** Each mode is a matchmaker profile (`configFromEnv().modes`), so modes can have different player counts. The server reads the mode from `MM_MATCH_PROFILE`.
- **Region → `regions` attribute.** The profile has an `intersection` rule named `regions` with `overlap: 1`: players are matched only if they share a region. "Any region" sends the full list. The region filters who plays together; **where the server runs** is chosen from the players' IPs. The matchmaker rejects tickets whose attributes don't match the profile's rules exactly (HTTP 400): add or rename rules on both sides together.
- **Party.** The backend builds `members` from its own party data (invite accepted, all signed in), never from the request. All members get one row each and are matched together. Group ticket responses are mapped to members by order; confirm the member-to-ticket mapping in the end-to-end test with a real party.
- **Player IP.** Created from the backend, a ticket without `player_ip` carries the backend's IP, and Edgegap would place every server near Manus's hosting instead of near the players. `playerIp()` in `routes.example.ts` reads the right-most `X-Forwarded-For` entry. Log it once on the published site and compare with the player's real IP (e.g. from https://api.ipify.org in the browser). If the hosting puts the client IP elsewhere, change that one function. VPN users get servers near their VPN exit.

## 5. Polling, timeouts and allocation errors

The browser polls `status` every 2 s; the backend reads the ticket at most once per 2 s per player, because ticket reads are rate-limited per matchmaker (free tier: 10 reads/s across all players). With many players, raise `pollIntervalMs`.

| Ticket | Backend does |
|---|---|
| `SEARCHING` | keep waiting; after `searchTimeoutMs` (28 s) delete the ticket, return `timeout` |
| `MATCH_FOUND` | a server is starting; after `allocationTimeoutMs` (90 s) return `server_allocation_timeout` |
| `MATCH_FOUND` → `SEARCHING` | the deployment failed and the matchmaker retries; after `maxDeploymentRetries` return `server_allocation_failed` |
| `HOST_ASSIGNED` | store the assignment (the matchmaker deletes assigned tickets soon after), return `ready` with a fresh join token |
| `CANCELLED` | expired, or a party member left: delete the row, return `cancelled` |
| 404 | ticket removed: delete the row, return `expired` |
| 429 | keep state, tell the browser to slow down |
| 5xx / network | keep state; after 5 in a row return `matchmaker_unavailable` (free-tier matchmakers stop every 3 hours) |

Keep the matchmaker's `ticket_expiration_period` (30 s in the template, so a developer testing alone isn't left waiting minutes) longer than `searchTimeoutMs`, so the backend decides the timeout and the user sees why.

## 6. Cancel, leave, reconnect

- **Cancel** while searching deletes the ticket and the row. A 409 means a match already formed: the UI keeps polling and connects.
- **Leave** after a match deletes the row so the player can queue again. The client calls it when the server sends `over`, or when the player quits to the menu.
- **Reconnect**: the row keeps the assignment for `assignmentTtlMs` (30 min). After a reload or a dropped connection, `status` returns `ready` with a new join token for the same server, and the server gives the player back their state. The server holds an empty match for 30 s, so reconnects must happen within that.
- A new `join` while a match is assigned returns that match (rejoin), not a new ticket. To play again, `leave` first.

## 7. Join tokens

`joinToken.ts` signs `{ v, sub: steamId, tid: ticketId, rid: requestId, iat, exp, jti }` with Ed25519. The game server (`assets/server/src/auth.mjs`) checks:
- the signature, with `JOIN_TOKEN_PUBLIC_KEY`;
- `exp` (60 s, 10 s clock skew);
- `rid` equals its `ARBITRIUM_REQUEST_ID`, so a token for one server doesn't open another;
- `tid` is in `MM_TICKET_IDS`, the tickets the matchmaker put in this match;
- `jti` not seen before, so a captured token can't be replayed.

The browser sends the token as the first WebSocket message, not in the URL, so it doesn't end up in access logs.

If the backend runtime has no `node:crypto` (an edge runtime), sign with WebCrypto `crypto.subtle.sign("Ed25519", ...)` and the same format.

## 8. Secrets

| Name | Where | Secret? |
|---|---|---|
| `EDGEGAP_MATCHMAKER_URL` | Manus backend | no, but keep it server-side |
| `EDGEGAP_MATCHMAKER_TOKEN` | Manus backend | yes |
| `JOIN_TOKEN_PRIVATE_KEY` | Manus backend | yes |
| `STEAM_WEB_API_KEY` | Manus backend | yes |
| `PUBLIC_BASE_URL` | Manus backend | no |
| `JOIN_TOKEN_PUBLIC_KEY` | Edgegap app version env | no |
| Registry username/token | GitHub Actions secrets | yes |
| Edgegap API token | nowhere in this design (the agent's MCP signs in with Edgegap) | yes; never in the Manus project |

In Manus, secrets are given to Manus in chat and stored as server-side env vars. Prefer that the developer types them there directly; don't echo them back, and check the code never logs them or sends them to the browser.

## 9. What the UI shows for each result

| Result | Show |
|---|---|
| `searching` | "Finding players… 0:12" + Cancel |
| `match_found` | "Match found, starting server…" (Cancel hidden) |
| `ready` → connecting | "Joining…" (retries up to 60 s while the server boots) |
| `reconnecting` | "Reconnecting…" |
| `timeout` | "No match found. Try again or pick another region." |
| `server_allocation_*`, `matchmaker_unavailable` | "Servers are busy, try again." |
| `ticket_rejected`, `game_port_missing`, `matchmaker_auth` | developer error: log it; "Matchmaking is unavailable." |
| `not_signed_in` | Steam sign-in button |
