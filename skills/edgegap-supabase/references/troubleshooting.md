# Troubleshooting: Supabase + Edgegap

| Symptom | Cause → fix |
|---|---|
| `HostedMutationConsentRequiredError` from the CLI | Agent runs must confirm hosted changes: get the developer's go-ahead, then add `--yes`. |
| `db push` → `ECONNREFUSED 127.0.0.1:54322` | CLI 3 targets the local stack by default: `npx supabase db push --remote`. |
| "Supabase sign-in failed: Anonymous sign-ins are disabled" | Turn them on (dashboard → Authentication → Sign In / Providers) or `config push` on a dedicated project. |
| Find Match: "Function exited due to an error" (`WORKER_ERROR`) | A secret is missing; the function throws at start. Dashboard → Edge Functions → logs names it. `secrets set`, no redeploy needed. |
| Find Match: `null value in column "id" of relation "tickets"` | Old template keyed tickets by `ticket_id`, which `POST /groups` returns as `null`. Use the current migration (key = `member_id`). |
| Find Match: "Matchmaker: HTTP 401" | `EDGEGAP_MM_TOKEN` is wrong: the matchmaker's Auth Token, not the Edgegap API token. |
| Searching, then "No match found in time" | Matchmaker stopped, its profile points at a missing or inactive version, or no expansion lets a lone player in. Dashboard → Matchmaker. |
| Game server: `Not signed in: Sign in first` | The client sent no token (Supabase not configured on the page, or `?server=` direct mode). |
| `Not signed in: signature verification failed` / `unexpected "iss"` | The server's `SUPABASE_URL` is another project than the page's, or the token was edited. |
| JWKS has no keys | Legacy HS256 project: migrate to asymmetric signing keys, or verify through `/auth/v1/user` (`game-server.md` §4). |
| `Unknown matchmaker ticket` | `REQUIRE_TICKET=1` and the hello had no ticket, or a stale one. |
| Match played, leaderboard unchanged | Deployment log line `supabase: report-match HTTP ...`: 403 = `GAME_SERVER_SECRET` differs between Edgegap and Supabase; 422 = a ticket was refused (wrong user, already used, or the `status` poll never saved its `ticket_id`); no line = not a matchmaker match or `SUPABASE_URL` unset. Read logs before the deployment stops. |
| Leaderboard doesn't update live | `profiles` not in the `supabase_realtime` publication, or the page's channel failed (console). |
| Deployments that end with `self-stop: nobody joined within 120s` | A search was matched after its page left: the cancel never ran (old client without the `pagehide` keepalive cancel) or came after `MATCH_FOUND`. Use the current `backend.js`, lower `FIRST_JOIN_TIMEOUT_S`. |
| Two tabs count as one player | Same browser profile = same Supabase session. Use another profile or a private window. |
| `wss://` fails | TLS Upgrade off on `gameport`, or connecting by IP instead of FQDN (`edgegap-threejs` troubleshooting). |
