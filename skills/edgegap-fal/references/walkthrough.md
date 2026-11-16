# Walkthrough: Orb Arena, from a fal Agent chat to online matches

Repo: [edgegap/netcode-sample-fal-orb-arena](https://github.com/edgegap/netcode-sample-fal-orb-arena). Its README is the step-by-step version for people; this page is what changed, file by file. Built on 2026-11-09 by an agent (Claude) driving fal Agent in the developer's browser, with the Edgegap dashboard for the account steps.

## The fal Agent answer

One prompt (`prompts.md` §1), one answer in about a minute, free models, three code blocks:

| File | Lines | What fal wrote |
|---|---|---|
| `client/rules.js` | ≈280 | Arena 800×800, ships with velocity and friction (acceleration 700, max speed 230, friction `exp(-4.2·dt)`), wall clamping, fire cooldown 0.4 s, projectiles 420 units/s for 1.5 s, hits give +1 and respawn the victim in a random corner with 1 s invulnerability, first to 10 wins. `botInput` chases the nearest ship, keeps 130 to 220 units away and always fires. No DOM. |
| `client/main.js` | ≈280 | Canvas renderer (grid floor, glowing circles with an aim line, name tags, scores, results overlay), keyboard and mouse, fixed 60 Hz loop over `step()` with three bots. |
| `client/index.html` | ≈140 | Page, styles, canvas, Restart button. |

fal did not generate the optional background image: the renderer draws the floor in code. The only change made to `rules.js` afterwards was exporting `ARENA_SIZE` and `WIN_SCORE` for the server and the HUD.

## What online play added

**Server** (`server/`):
- `main.js`, `room.js`, `edgegap.js`, `util.js`: `edgegap-threejs` templates, unchanged.
- `game.js` (≈70 lines): `config: { tickHz: 60, sendHz: 20, maxPlayers: 4, botFill: 4, matchSeconds: 180 }`; `addPlayer`/`removePlayer` call the rules with the room's numeric ids; `input` turns every field into a boolean or a clamped number before `setInput`; `start` creates a fresh world and adds the room's players and bots; `update` sets `botInput` on bot ships, runs `step`, and copies each shooter's score from the world into the room's player; `result` ends the match when the world has a winner; `snapshot` sends `{p: [{id, x, y, ax, ay, inv}], b: [[x, y]...], ev: [hits]}` rounded to 0.1.
- `Dockerfile`: `node:22-slim`, `npm ci --omit=dev`, `server/` and `client/rules.js` only, `USER node`, `CMD ["node", "server/main.js"]`.

**Client:**
- `online.js`, `net.js`: templates (Find Match through `GroupAgent`, profile `arena`, WebSocket retries).
- `config.js`: matchmaker URL and Auth Token, empty in the published repo.
- `main.js`: fal's draw functions now take a view `{players, projectiles, big, sub, banner}`. `soloView()` builds it from the local world; `onlineView()` builds it from the latest snapshot and eases each ship toward its server position (snaps on respawn jumps over 120 units). Inputs go out every frame while the phase is `playing`, throttled by `online.js`. The fire button is sent as held (`fire: mouseDown`) online, so a click between two input messages is not lost.
- `index.html`: an import map for `@edgegap/sdk` 1.1.0 with its SRI hash, and a menu (name, Find match, Play vs bots, Local server on localhost only, Cancel).

**Tests and CI:**
- `tests/headless-player.mjs`, `tests/local-match.mjs`, `tests/e2e.mjs`: templates, with `playLikeABot()` calling `botInput` on a `{players}` view of the snapshot. Local result on the first run: `local-1 wins; scores: local-1 10, Rusty (bot) 8, local-2 6, Zed (bot) 6`.
- `.github/workflows/server-image.yml` (with `provenance: false`, `sbom: false`), `e2e.yml` (manual), `pages.yml` (manual).

## What happened on Edgegap

1. First image built with the build action's defaults. Version created in the dashboard (the MCP connection had no usable token). Matchmaker created from `matchmaker/arena.json`. The e2e run queued fine, but every deployment ended in about 8 s: `Unable to pull image from registry`. The matchmaker retried, so the deployment list filled with short-lived entries.
2. Rebuilt with `provenance: false` and `sbom: false`, new tag put on the same version. The next e2e run: `MATCH_FOUND after 11s`, `HOST_ASSIGNED after 13s`, full match to 10, `deployment stopped itself 9s after the match`, `PASS`. Deploy time 1.5 s warm, 7 s uncached.
3. The page on GitHub Pages (repo made public; the org's free plan doesn't serve Pages from private repos). The Pages origin added to the matchmaker (stop, edit, start). Two tabs with `?autoplay=1` from Montreal: matched together in about 10 s on a server in Toronto, same state in both, deployment stopped when the match ended.
4. Clean-up for the published example: matchmaker URL and token blanked in `client/config.js`, Pages unpublished and its workflow made manual, matchmaker left to be deleted by the developer.

Known cosmetic issue left in: a respawn in the top-left corner sits under the scoreboard.
