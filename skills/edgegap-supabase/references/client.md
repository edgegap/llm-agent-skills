# Client: sign-in, Find Match, leaderboard

Contents
1. Loading supabase-js without a bundler
2. Sign-in and the session
3. Find Match through the Edge Function
4. Connecting to the game server
5. Profile and leaderboard
6. Keeping players' progress (upgrade from anonymous)
7. Other clients

## 1. Loading supabase-js without a bundler

`assets/client/index.html` loads the UMD build as a classic script, pinned with its SRI hash, before the module import map:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js"
  integrity="sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK" crossorigin="anonymous"></script>
```

It defines the global `supabase`. The UMD file is a static file on the CDN, so its hash is stable (the `+esm` builds are generated and not worth pinning). To upgrade: change the version and recompute the hash (`openssl dgst -sha384 -binary supabase.js | openssl base64 -A` on the file from `node_modules/@supabase/supabase-js/dist/umd/`, which matched the CDN copy). With a bundler, `npm i @supabase/supabase-js` and import `createClient` instead.

`assets/client/config.js` takes `supabaseUrl` and `supabasePublishableKey`; `config.local.js` (git-ignored) overrides it.

## 2. Sign-in and the session

`assets/client/backend.js` `connectBackend(config)`: `createClient`, then `auth.getSession()`; if none, `auth.signInAnonymously()`. supabase-js stores the session in `localStorage` and refreshes it, so the same player (and their wins) comes back on the next visit. Two tabs of one browser profile are the **same** player: test with two browser profiles or a private window. Anonymous sign-ins are rate-limited per IP (30 per hour by default).

## 3. Find Match through the Edge Function

```js
await db.functions.invoke("matchmaking", { body: { action: "join" } });
// every 1.5 s:
const { data } = await db.functions.invoke("matchmaking", { body: { action: "status" } });
// data.status: SEARCHING | MATCH_FOUND | HOST_ASSIGNED | EXPIRED | CANCELLED
// data.url (wss://...) and data.ticket_id once HOST_ASSIGNED
```

`findMatch(onStatus, signal)` wraps that; aborting the signal calls `cancel`.

**Cancel on every exit.** A search left in the queue can be matched and start a deployment nobody joins. The template cancels on the Cancel button (`cancel`), on a new Find Match (`join` cancels the previous search), and when the page closes mid-search: `pagehide` sends `cancel` with `fetch(..., {keepalive: true})` and the session's access token, because a normal `functions.invoke()` is killed with the page. Verified 2026-11-03: closing the page mid-search left the membership `CANCELLED`. Not covered: a match already formed (`MATCH_FOUND`) when the player leaves, or a killed browser; the search expires (`ticket_expiration_period`) or its server stops itself after `FIRST_JOIN_TIMEOUT_S`. On a function error, supabase-js puts the response in `error.context`: `await error.context.json()` gives the function's `{error}` message. `EXPIRED` means the matchmaker dropped the ticket (30 s expiry in the template config): show "try again".

The page never sees the matchmaker URL or token, so the matchmaker's `allowed_cors_origins` doesn't need the page's origin. The Edge Functions answer CORS for any origin (`_shared/supabase.ts`).

## 4. Connecting to the game server

The hello carries the ticket and a fresh access token:

```js
const { data } = await db.auth.getSession();
connect(url, { name, ticket: ticketId, token: data.session.access_token });
```

`net.js` from `edgegap-threejs` retries the first connection (a new deployment refuses for a few seconds after `HOST_ASSIGNED`) and treats a server `error` as final.

## 5. Profile and leaderboard

- Rename: `db.from("profiles").update({ display_name }).eq("id", userId)`. Any other column is refused by the column grant.
- Leaderboard: `select("id, display_name, wins, matches_played").gt("matches_played", 0).order("wins", {ascending: false}).limit(10)`, reloaded on `postgres_changes` for `profiles`.
- After a match, reload the player's own profile when the menu comes back (`showMenu` in `assets/client/shell.js`).

## 6. Keeping players' progress (upgrade from anonymous)

An anonymous user is lost if the browser storage is cleared. To keep progress across devices, link an identity to the same user: `db.auth.updateUser({ email })` (then confirm) or `db.auth.linkIdentity({ provider: "github" })` (manual linking must be enabled). The user id, and so the profile and wins, stays the same. Not run in the verified sample.

## 7. Other clients

Unity, Godot and other engines call the same endpoints over HTTP: Supabase Auth (`POST /auth/v1/signup` with no email = anonymous, or their Supabase SDK), then `POST /functions/v1/matchmaking` with `Authorization: Bearer <access token>` and `apikey: <publishable key>`, then the game's own connection with the token in its first message. Not run on Edgegap.
