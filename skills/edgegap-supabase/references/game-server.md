# Game server: who is playing, and where results go

Contents
1. Environment
2. The hello handshake
3. Verifying the access token
4. Other server languages and legacy projects
5. Reporting the result

## 1. Environment

| Variable | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` | public; without it the server lets anyone in (local dev) |
| `GAME_SERVER_SECRET` | 32 random bytes, hex | hidden env var on the app version; same value as the Supabase secret |
| `REQUIRE_TICKET` | `1` | the hello's ticket must be in `MM_TICKET_IDS` |

No Supabase key goes on the server. Edgegap shows env var values in the dashboard unless the variable is marked hidden: mark `GAME_SERVER_SECRET` hidden.

## 2. The hello handshake

`assets/server/room.js.patch` (applies to `edgegap-threejs`'s `assets/server/room.js`):
- `hello` becomes `{t: "hello", name, ticket, token}`.
- `accept()` calls the async `identify(hello)` once, ignores further hellos while it runs, and joins only if the socket is still open. On failure it sends `{t: "error", message: "Not signed in: ..."}` and closes. The client's retry loop (`net.js`) treats an `error` as final.
- `join()` stores `userId` on the player and refuses a second connection from the same user (`Already in this match`).
- The display name still comes from the hello; the leaderboard shows `profiles.display_name`, which only the player can change. If names on the HUD must match profiles, read the profile with the player's token instead.

## 3. Verifying the access token

`assets/server/supabase.js`:

```js
const jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
const { payload } = await jwtVerify(token, jwks, { issuer: `${SUPABASE_URL}/auth/v1`, audience: "authenticated" });
// payload.sub = the user id, payload.is_anonymous = anonymous sign-in
```

`jose` fetches the keys once and caches them, so joins cost no request to Supabase. New projects sign with ES256 (observed 2026-11-03: one EC P-256 key in the JWKS). Checking `issuer` keeps tokens from another Supabase project out; `audience: "authenticated"` keeps out the anon/publishable key JWTs.

Access tokens expire after an hour by default. The client takes a fresh one from `supabase.auth.getSession()` right before connecting, and the server checks it only at join, so a long match doesn't drop players.

Verified locally against the hosted project: a real token → `welcome`; no token → `Not signed in: Sign in first`; a token with a changed signature → `Not signed in: signature verification failed`.

## 4. Other server languages and legacy projects

- **Unity, Godot, Unreal, Go, C#**: the same check with the platform's JWT library: fetch the JWKS, verify ES256 (or RS256), issuer and audience, read `sub`. Not run on Edgegap with these; say so.
- **Legacy HS256 projects** (an empty `keys` list in the JWKS): either migrate the project to asymmetric signing keys (dashboard → JWT signing keys; recommended), or have the server call `GET <SUPABASE_URL>/auth/v1/user` with `Authorization: Bearer <token>` and `apikey: <publishable key>` per join. Never put the legacy JWT secret on the game server: it can mint tokens for any user.

## 5. Reporting the result

`Room.finish()` calls `report(result)`, which only runs on matchmaker matches (`MM_TICKET_IDS` present) with Supabase on:
- players = humans with a verified `userId` and a ticket, in `result.ranking` order, `place` = position among all players including bots;
- `winnerId` = the top player if human and not tied, otherwise `null` (a bot win or a draw gives nobody a win);
- `reportMatch()` posts to `<SUPABASE_URL>/functions/v1/report-match` with `x-game-server-secret`, logs `supabase: report-match HTTP <status> <body>`, retries up to 3 times on network errors and 5xx only.

The results screen (`RESULTS_SECONDS`, default 12) gives the report time to land before self-stop. Players who left before the end aren't reported; to count leavers as losses, keep them in a roster and report them with the last place.

Local runs (no `MM_TICKET_IDS`) report nothing: `record_match()` would refuse players without tickets anyway.
