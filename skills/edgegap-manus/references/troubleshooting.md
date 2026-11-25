# Troubleshooting a Manus game on Edgegap

Find the layer first: sign-in, backend ↔ matchmaker, deployment, browser ↔ server.

## Sign-in

| Symptom | Cause / fix |
|---|---|
| Steam callback always fails | `PUBLIC_BASE_URL` differs from the published origin (custom domain, `www`, trailing slash). It must match `return_to` exactly |
| Works locally, not on the published site | the session cookie isn't `Secure`/`SameSite=Lax`, or the backend runs behind a proxy without "trust proxy" so it thinks the request is http |
| Session lost on every request | more than one backend instance with an in-memory session store: use the database |

## Backend ↔ matchmaker

| Symptom | Cause / fix |
|---|---|
| `ticket_rejected` (HTTP 400 on create) | profile name or attributes don't match the config: every profile needs the `regions` rule, and no other attributes are allowed. Check `configFromEnv().modes` profiles exist in the config |
| `matchmaker_auth` (401) | wrong Auth Token, or a `Bearer `/`token ` prefix was added (send it raw) |
| `matchmaker_unavailable` | matchmaker OFFLINE (free tier stops every 3 h: restart it), wrong URL, DNS not ready yet |
| Two tickets for one player | the queue store isn't atomic: `insert` must fail on an existing `steam_id` (primary key), not upsert |
| Stuck searching alone | no compatible tickets: same mode, overlapping region. For solo tests keep the `min_team_size: 1` expansion |
| Matches, but servers are far from players | `player_ip` missing or wrong: it's the backend's IP. Log `playerIp()` on the published site (`backend.md` §4) |
| `match_found` then back to searching, then `server_allocation_failed` | deployments fail: free tier allows one at a time (stop leftovers), or the app version is broken (registry credentials, tag). Do a direct test deployment |
| `server_allocation_timeout` | same causes, or the image is large and uncached: keep it small (`node:22-slim`, production deps only) |
| `game_port_missing` | the app version's port isn't named `gameport`, or `gamePortName` differs |
| 429 in backend logs | ticket reads are limited per matchmaker: raise `pollIntervalMs`, or upgrade the matchmaker tier |
| Cancel returns `match_found` | a match formed before the cancel: the client connects. (409 handling is inferred from the group API, not yet confirmed for tickets) |
| Party members land in different matches | group ticket response order may differ from the request: map returned tickets by their `player_ip` when members' IPs differ (`backend.md` §4), and report it |

Inspect live state with `inspect: true` in the config: `GET <url>/inspect/tickets` and `/inspect/matches` with the Auth Token. Turn it off for production.

## Deployment

| Symptom | Cause / fix |
|---|---|
| Deployment errors immediately | image can't be pulled: registry credentials on the version, exact tag, `linux/amd64` |
| Container restarts / exits | logs: `JOIN_TOKEN_PUBLIC_KEY is not set` (env on the version), a crash in `game.mjs`. Read logs before stopping: they're deleted with the deployment |
| Server never stops | a socket that never joins doesn't count; check `Stopping deployment` lines and that `ARBITRIUM_DELETE_URL` is present. Max duration is the backstop |
| Server stops while players are still joining | the 120 s join grace was too short for slow loads: raise `joinGraceMs` |

## Browser ↔ game server

| Symptom | Cause / fix |
|---|---|
| `Mixed Content` / `ws://` blocked | the page is https: connect with `wss://` and turn on TLS Upgrade on the port |
| wss handshake fails, certificate error | connecting to the IP: use the fqdn |
| Connects, then closed with `4003 wrong_server` | token minted for another `request_id` (old assignment): `leave`, then find a new match |
| `4003 not_in_match` | the ticket ID isn't in `MM_TICKET_IDS`: the player's row points at an old ticket, or the token came from `dev-token.mjs` on a matchmaker deployment |
| `4003 expired` | clock skew or the token waited > 60 s: the client fetches a fresh token per attempt; check it does |
| `4003 replayed` | the same token sent twice: the client must call `status` for a new token before each attempt |
| Can't connect for the first seconds | the server is still starting: the client retries for 60 s |
| Reconnect gets a new empty player | the server ended (30 s empty grace passed) or the Steam ID changed; reconnect within the grace |
| Players see stutter | interpolate between snapshots (render ~100 ms behind), don't snap to each one |
