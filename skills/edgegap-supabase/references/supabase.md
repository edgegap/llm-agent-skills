# Supabase side: project, schema, functions

Contents
1. CLI workflow (Supabase CLI 3)
2. Schema and Row Level Security
3. `record_match()`: why results can't be forged
4. Edge Function `matchmaking` and the Edgegap group API
5. Edge Function `report-match`
6. Secrets and keys: what lives where
7. Realtime leaderboard

## 1. CLI workflow (Supabase CLI 3)

`npx supabase` runs the CLI with nothing to install (verified with 3.0.0). The developer logs in once, in a terminal: `npx supabase login` opens the browser. The CLI keeps the token in the OS credential store.

```bash
npx supabase orgs list
npx supabase projects create <name> --org-id <org-id> --region us-east-1 --db-password <generated> --yes
npx supabase init                       # creates supabase/config.toml
npx supabase link --project-ref <ref> --yes
npx supabase db push --remote --yes     # applies supabase/migrations/
npx supabase config push --yes          # pushes config.toml's Auth settings (see below)
npx supabase secrets set KEY=value ... --yes
npx supabase functions deploy <name> --yes
npx supabase projects api-keys --remote=<ref>    # publishable key; secret keys come masked
```

Observed with CLI 3.0.0:
- Every command that changes a hosted project asks for confirmation; in an agent run it refuses with `HostedMutationConsentRequiredError` and changes nothing. Ask the developer once for the plan, then pass `--yes`.
- `db push` without `--remote` targets the local stack (`127.0.0.1:54322`) and fails with `ECONNREFUSED` when none runs.
- `config push` sends every Auth setting in `config.toml`, which `supabase init` fills with local-development defaults (email confirmations off, local site URL...). Fine on a project made for the game; on an existing project, change the one setting in the dashboard instead.
- `projects create` returns `ACTIVE_HEALTHY` within seconds; `link` ignores `--password`.
- `db reset --linked --yes` re-applies the migrations on the hosted project and **drops the data**: only on a fresh test project.

Generate the database password and the game server secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, keep them out of the repo and out of chat summaries.

## 2. Schema and Row Level Security

`assets/supabase/migrations/20261103000000_game_backend.sql`:

| Table | Holds | Players may | Service role (functions) |
|---|---|---|---|
| `profiles` | `display_name`, `wins`, `matches_played` | read all; update their own `display_name` only | `record_match()` updates counts |
| `tickets` | one Find Match: matchmaker `member_id` (primary key), `ticket_id` once matched, `user_id`, `group_id`, status, `connect_url`, `match_id` once played | read their own | insert, update |
| `matches` | one per Edgegap deployment (`deployment_id` unique), result text, `winner_id` | read all | `record_match()` |
| `match_players` | score and place per player, with the ticket they came with | read all | `record_match()` |

- "Update their own `display_name` only" takes two things: an RLS `update` policy on `auth.uid() = id`, **and** a column grant (`revoke update ... ; grant update (display_name) ...`). RLS alone lets a player set their own `wins`.
- A `security definer` trigger on `auth.users` inserts the profile, so anonymous users get one too.
- Adapt the columns to the game (rating, XP, unlocks); keep the ticket columns and checks.

## 3. `record_match()`: why results can't be forged

The function takes the deployment id, the matchmaker match id, profile, result text, winner and `[{ticket_id, user_id, score, place}]`, and in one transaction:
1. refuses any player whose `ticket_id` row doesn't belong to that `user_id` or already has a `match_id` (used);
2. refuses a winner who isn't in the list;
3. inserts `matches` (unique `deployment_id`) and `match_players`, marks the tickets used, adds a match to every player and a win to the winner.

`execute` is revoked from `public`, `anon` and `authenticated` and granted to `service_role`. Tickets are only written by the matchmaking function, so a game server (or anyone holding its secret) can only report players the matchmaker really matched, once each. Verified: a replay of a recorded report and a made-up ticket both return 422.

## 4. Edge Function `matchmaking` and the Edgegap group API

`assets/supabase/functions/matchmaking/index.ts`, called by the page with `supabase.functions.invoke("matchmaking", {body: {action}})` (supabase-js adds the player's access token):

| action | does | returns |
|---|---|---|
| `join` | cancels the player's open search, `POST /groups {profile, attributes: {}, is_ready: true}`, inserts the ticket row | `{status: "SEARCHING"}` |
| `status` | `GET /groups/{group_id}/members/{member_id}`, saves `ticket_id` and status; on `HOST_ASSIGNED` builds `wss://<ports.gameport.link>` | `{status, ticket_id, url}` |
| `cancel` | `DELETE /groups/{group_id}` (the player owns their group of one) | `{status: "CANCELLED"}`, or the current status if the matchmaker refused (409 once the match is formed) |

Matchmaker facts observed on 2026-11-03 (matchmaker 3.3.2): `POST /groups` answers `{member_id, group_id, is_ready, ticket_id: null, assignment: null, status: null}`, and the member keeps `ticket_id: null` while `SEARCHING`. The ticket id appears when the player is matched. So the row is keyed by `member_id` and `ticket_id` is filled in by `status`. An expired search answers 404 → `EXPIRED`. After `DELETE /groups/{id}` the member still answers 200 with `status: "CANCELLED"` and is never matched (verified 2026-11-03); removing one member of a bigger group is `DELETE /groups/{id}/members/{member_id}`.

The function authenticates the caller with `admin.auth.getUser(jwt)` (works with both legacy and asymmetric signing) and uses the injected `SUPABASE_SERVICE_ROLE_KEY` for its writes. `verify_jwt = false` in `config.toml` because the function checks the session itself. It reads `EDGEGAP_MM_URL`, `EDGEGAP_MM_TOKEN` and optionally `EDGEGAP_MM_PROFILE` (default `sumo`: change it).

The page polls `status` every 1.5 s: about 40 calls per search, far inside the free plan's Edge Function quota. The matchmaker rate-limits bursts of ticket creation (`edgegap-threejs` deploy.md §4); the function makes one `POST /groups` per click.

## 5. Edge Function `report-match`

`assets/supabase/functions/report-match/index.ts`: checks `x-game-server-secret` against `GAME_SERVER_SECRET` (constant-time compare; 403 otherwise), then calls `record_match()`. 409 = duplicate deployment report with fresh tickets, 422 = anything `record_match()` refused (the error says which ticket). The server retries only on 5xx and network errors.

## 6. Secrets and keys: what lives where

| Value | Where | Never in |
|---|---|---|
| Project URL, publishable key (`sb_publishable_...` or legacy anon) | page `config.js`; `SUPABASE_URL` env on the app version | |
| Secret / service role key | injected into Edge Functions by Supabase | page, image, app version, repo |
| Matchmaker URL + Auth Token | `npx supabase secrets set` | page (here), repo |
| `GAME_SERVER_SECRET` | Supabase secret **and** app version env (hidden) | page, repo |
| Edgegap API token | nowhere in this design | everywhere |

The CLI masks `sb_secret_...` keys in `projects api-keys`; a one-off admin script can use `--reveal` and the legacy `service_role` key. Don't keep it in a file.

## 7. Realtime leaderboard

The migration adds `profiles` to the `supabase_realtime` publication. The page subscribes with `db.channel("leaderboard").on("postgres_changes", {event: "*", schema: "public", table: "profiles"}, reload)` and reloads the top N. RLS applies to Realtime too (profiles are public here). Verified: a match finishing updated an open menu without reload.
