# Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Deployment errors right away, "image pull" / 424 | No registry login on the version (`registry_credentials_set: false`) or wrong tag. The developer adds the Container Registry username/token to the version; `edgegap_list_registry_tags` for the tag. |
| Container exits at once, log says `Set GAME to one of...` | The version lacks the `GAME` env var (several-games image). |
| Browser: `WebSocket connection to 'wss://...' failed` once, then works | Fresh deployment not accepting yet. Expected: `net.js` retries. If it never works: port not WS + TLS Upgrade, or connecting by IP instead of FQDN (certificate mismatch). |
| Browser: mixed content / `ws://` blocked | `https` page with `ws://`. Use the `wss://<fqdn>:<external>` from the assignment; TLS Upgrade must be on. |
| Browser console: CORS error on `/groups` or `/monitor` | Page origin missing from `allowed_cors_origins` (scheme + host + port, no trailing slash). Edit the matchmaker config. |
| `/groups` → 401 | Wrong matchmaker Auth Token in `config.js` (the SDK sends it raw; never add a `Bearer`/`token ` prefix). |
| `/groups` → 400 | `profile` doesn't exist in the config, or attributes don't match the profile's rules. |
| `/groups` → 429 | Rate limit on bursts. The SDK retries with backoff; space out test players. |
| Browser: `Failed to resolve module specifier "@edgegap/sdk"` | The page's import map lacks the `@edgegap/sdk` entry (`client.md` §1), or a bundled project imports `matchmaking` from `@edgegap/sdk` (npm: `GroupAgent` from `@edgegap/sdk/matchmaking`). |
| Server log: `Edgegap Env \| Missing variables ...` | Harmless. On Edgegap, SDK 1.1.0 lists the four `ARBITRIUM_*BEACON*` variables, which deployments without a private beacon don't get (seen 2026-11-02); on a local `docker run` with only `ARBITRIUM_REQUEST_ID` it lists most of them. Worry only if `ARBITRIUM_DELETE_URL`/`TOKEN` or `ARBITRIUM_PORTS_MAPPING` are listed on Edgegap. |
| Stuck `SEARCHING` | Not enough players for `min_team_size` × `team_count`. One-team profiles: add the 20 s expansion to 1. Team profiles: start at `min_team_size: 1` (expansions didn't trigger a partial team match, see `deploy.md` §4). |
| `MATCH_FOUND` ↔ `SEARCHING` flapping | Deployments can't start (free tier: one deployment at a time; a leftover test deployment blocks it), or the version can't pull. |
| Players of one test land on different servers | Stale `SEARCHING` tickets from an earlier run. `GET /inspect/tickets`; wait for expiry or restart the matchmaker. |
| Server waits 15 s before the countdown | A matched player never connected (closed tab); expected. With all players in, the countdown starts at once. |
| Deployment keeps running after the match | No self-stop: check the log for `self-stop: ...` and `self-stop request: HTTP 200`. Missing `ARBITRIUM_DELETE_URL` means it isn't on Edgegap. Node not PID 1 (an `sh -c` or `npm start` CMD) also loses SIGTERM. |
| Deployment of a match nobody joined lingers ~2 min | `FIRST_JOIN_TIMEOUT_S` (120). Lower it if clients connect fast. |
| Teams wrong in a team game | The client didn't send its ticket ID in `hello`, so the server balanced teams itself. Check `welcome.team` and the log line `join #.. ticket=.. team=..`. |
| Movement jerky | Rendering snapshots directly. Ease toward them every frame (`client.md` §3) and keep `sendHz` ≥ 15. |
| Rounds never end with bots | Bots too good: shorter look-ahead, randomness, sudden death, end the round when every human is out (`server.md` §5). |
