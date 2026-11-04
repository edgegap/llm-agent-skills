# Walkthrough: Thin Ice Tussle, from single-player to online

Repo: [edgegap/netcode-sample-threejs-thin-ice-tussle](https://github.com/edgegap/netcode-sample-threejs-thin-ice-tussle). Tags `before` (the single-player game) and `after` (online on Edgegap); later commits on `main` add the splash page and the quick-stop fixes. Every line was written by an agent (Claude Code) with the Edgegap MCP connected; `PROMPTS.md` in the repo lists the prompts.

## The game at `before`

Plain HTML and ES modules, Three.js from a CDN, no build step:

| File | What it does |
|---|---|
| `client/rules.js` (≈340 lines) | The whole game: hex ice tiles that crack from the edge in, players that slide and belly-slide, the golden fish power-up, rounds, match winner, bot brains. No DOM, no Three.js. |
| `client/render.js` | Three.js scene built in code: ice, sea, penguins, name tags. Draws a plain view `{players, tiles, fish}`. |
| `client/input.js` | Keyboard plus a touch thumb-stick and SLIDE button. |
| `client/main.js` | Menu, HUD, and the solo loop: fixed 60 Hz `stepMatch()` with three bots. |
| `client/audio.js`, `style.css`, `index.html` | Sound effects, layout. |

The rules were already in their own file because the first prompt asked for a clean structure. When a game arrives with everything in one file, splitting that file out is the first job (SKILL.md Phase 1).

## What `after` added (about 1,300 lines, 25 files)

The rules file is unchanged.

**Server** (`server/`, from `edgegap-threejs` `assets/server/`):
- `main.js`, `room.js`, `edgegap.js`, `util.js`: copied templates. The room runs phases (waiting, countdown, playing, over), the WebSocket protocol, bots, the ticket check, the self-stop and SIGTERM.
- `game.js` (67 lines): the only game-specific server file. It imports `../client/rules.js` and maps it onto the room contract:
  - `config: { tickHz: 60, sendHz: 20, maxPlayers: 4, botFill: 4, matchSeconds }`;
  - `addPlayer` / `removePlayer` / `input` call the rules;
  - `update(dt)` runs `botInput` for bots, then `stepMatch`, and copies round wins into the room's scores;
  - `result()` ends the match when the rules have a winner;
  - `snapshot()` sends rounded positions, the tile string, the fish and the events since the last snapshot (so the page plays sounds and effects).
- `Dockerfile`: `node:22-slim`, `npm ci --omit=dev`, copies `server/` and only `client/rules.js`, `USER node`, `CMD ["node", "server/main.js"]` so Node gets SIGTERM. `.dockerignore` has `client/*` then `!client/rules.js`.
- Root `package.json`: `"type": "module"`, dependencies `ws` and `@edgegap/sdk`, Node 22 or later.

**Client:**
- `client/online.js` (88 lines): Find Match with `matchmaking.GroupAgent` from `@edgegap/sdk` (profile `floe`, a group of one, `is_ready: true`), status text per matchmaking state, Cancel and `pagehide` leave the queue, `getConnectionUrl(assignment, "gameport")` for the `wss://` URL by FQDN, then `joinServer()` sends `hello` with the name and the ticket ID and throttles inputs to at most 30 a second.
- `client/net.js`: the WebSocket wrapper with retries for the first seconds of a fresh deployment.
- `client/config.js`: the matchmaker URL and its client Auth Token (made to ship in games), overridable by `config.local.js` or `?mm=&token=`. A comment says never to put the Edgegap API token there.
- `client/main.js` (+112 lines): Find Match, Cancel, a Local server button shown only on localhost, and the online loop: read input, send it while the phase is `playing`, ease the renderer toward the latest snapshot. Solo mode is untouched.
- `index.html`: an import map for `@edgegap/sdk` from a CDN, so there is still no build step.

**Matchmaker** (`matchmaker/floe.json`): profile `floe`, one team of 2 to 4, `min_team_size` drops to 1 after 20 s (a lone player gets a match with bots), `ticket_expiration_period` `30s`, `inspect: false`, CORS origins `http://localhost:8081` and `https://edgegap.github.io`.

**Tests** (`tests/`):
- `headless-player.mjs` and `local-match.mjs`: two Node players drive `botInput` from the snapshot and play a full match on a local server.
- `parity.sh` (from `edgegap-local-testing`): the image run the way Edgegap runs it.
- `e2e.mjs`: two players through the real matchmaker, a full match on Edgegap, then a check the deployment stopped (three failed requests in a row, since one failure through the TLS proxy can be a blip).

**CI** (`.github/workflows/`): `server-image.yml` builds and pushes the image with a UTC timestamp tag on pushes to `main` (secrets `EDGEGAP_REGISTRY_USERNAME`, `EDGEGAP_REGISTRY_TOKEN`, variable `EDGEGAP_REGISTRY_PROJECT`; the local match it runs first lasts 90 s so a round can finish); `pages.yml` publishes `client/` to GitHub Pages.

## Edgegap resources

- App `thin-ice-tussle`, versions named by UTC timestamp. Port `7777` named `gameport`, protocol WS, TLS Upgrade on; 256 CPU units, 512 MB; max duration 30 minutes; restart policy `never`; quick-stop env vars (`public-demo.md`).
- The developer created the matchmaker from `floe.json`.

## After `after`: what running it in public taught

- **Splash page.** The menu became a landing page: one big Play online button, Practice vs bots, a collapsed How to play, and four bots playing a real match behind it, run in the page by the same `rules.js` (no server cost). The queue shows elapsed time and Cancel.
- **Background tabs keep sockets open.** Two closed or hidden tabs kept a match alive for 132 s. `IDLE_TIMEOUT_S` now disconnects a player who sends nothing while playing (close code 4000, and the page says why); that abandoned match then stopped at 48 s. At 30 s and without a heartbeat it also dropped players who had only switched tabs, and when the other player left the server stopped: the page now sends a heartbeat every 5 s from a timer, the server pings sockets to catch dead ones, and the timeout is 75 s. A background-tab player then kept playing over 100 s after the other left. This is in `edgegap-threejs` 0.3.3.
- **The free-tier matchmaker stopped** about 3 hours after it was created (its URL stopped resolving), so the live page's Play online broke until it was restarted. A demo that stays up needs a paid tier.

## The prompts that matter

The developer's starting prompt for the online work, which a vibe coder can reuse almost as is:

> Make this game online multiplayer on Edgegap. Use the Edgegap MCP and its edgegap-threejs skill. Keep the solo mode, add a Find Match button, 2 to 4 players per match, bots fill empty seats. Ask me before you create anything in my Edgegap account.

Then, for a public demo:

> Get game servers to stop quickly once there's no player. Only the matchmaker will run non-stop.

> Run the end-to-end test through the matchmaker, then try Find Match from two browser tabs, leave, and check the server stops right away. Make sure nothing is left running.
