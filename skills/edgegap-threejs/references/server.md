# Server: room, game contract, lifecycle

Contents
1. Files and what they do
2. Wire protocol
3. Phases and timers
4. Writing a game (contract, authority, input validation)
5. Bots
6. Matchmaker data: expected players, tickets, teams
7. Self-stop and shutdown
8. Local checks

## 1. Files

| File | Role |
|---|---|
| `main.js` | HTTP + `ws` server on `PORT` (7777), one `Room`, SIGTERM handling. Plain HTTP `GET /` answers a status line. |
| `room.js` | Connections, `hello` handshake, phases, fixed-rate `tick()`, state broadcast at `sendHz`, bots, watchdog timers. Game-agnostic. |
| `edgegap.js` | Reads `ARBITRIUM_*` and `MM_*` with the Edgegap JS SDK (`DeploymentEnvironment`, `MatchEnvironment` from `@edgegap/sdk`), `selfStop()`. Inert off Edgegap. |
| `util.js` | `clamp`, `axisIn` (sanitise an axis to [-1, 1]), `pushOutOfBox`, `ffaResult`... |
| `game.js` | The game. Replace it. |

Node 20+, ES modules (`"type": "module"`), only dependency `ws`. No TypeScript needed; if the project uses TS, keep the same shapes and compile in the Dockerfile (or run with `tsx` as a dependency, not a devDependency).

## 2. Wire protocol

JSON text frames, small and explicit:

| Direction | Message |
|---|---|
| client → server | `{t:"hello", name, ticket}` once, first. `ticket` = the matchmaker ticket ID (absent in direct/local mode). |
| client → server | `{t:"input", ...}`: the game's input fields (axes, aim angle, buttons, a chosen direction). |
| server → client | `{t:"welcome", id, team, game, match, info}`: the player's ID, team, `match: {id, profile, players}` or `null`, static `info` (map, sizes). |
| server → client | `{t:"state", phase, timer, waitingFor, players:[{id,name,score,team,bot}], result, s}` at `sendHz`; `s` = `game.snapshot()`. |
| server → client | `{t:"error", message}` then close (server full, unknown ticket, match finished). |

20 Hz state with client-side easing looks smooth for these genres and stays far under 10 KB/s per player. JSON is fine at this size; switch to binary only if profiling says so.

## 3. Phases and timers (env vars on the app version, all optional)

`waiting → countdown → playing → over`.

| Var | Default | Meaning |
|---|---|---|
| `WAIT_SECONDS` | 15 | Start this long after the first join even if matched players are missing (closed tab, slow phone). |
| `COUNTDOWN_SECONDS` | 3 | `game.start()` runs, then a countdown; inputs are ignored until `playing`. |
| `MATCH_SECONDS` | game's `matchSeconds` | Hard time limit; then `game.timeUp()`. |
| `RESULTS_SECONDS` | 12 | Results stay on screen, then self-stop (locally: back to `waiting`). |
| `FIRST_JOIN_TIMEOUT_S` | 120 | Nobody connected at all → self-stop. |
| `EMPTY_TIMEOUT_S` | 30 | Every human left → self-stop. |
| `REQUIRE_TICKET` | off | `1` refuses a `hello` whose ticket isn't in `MM_TICKET_IDS`. |

The server starts as soon as every matched player is in (`MM_TICKET_IDS` count), so a full match doesn't wait the 15 s.

## 4. Writing a game

Contract (see `assets/server/game.js`):

```js
export function createGame() {
  return {
    name, config: { tickHz, sendHz, maxPlayers, botFill, matchSeconds },
    info(), addPlayer(p, room), removePlayer(p, room), input(p, msg),
    start(room), update(dt, room), result(room), timeUp(room), snapshot(room),
    botsNeeded(room), // optional
  };
}
```

- `p` is `{ id, name, bot, team, score, ticket }`. Write scores to `p.score`: the HUD and `ffaResult` read it.
- `update(dt)` runs only while `playing`, at `tickHz` (30 for most, 60 when fast bodies collide, as in soccer and sumo). Use `dt`; never assume a fixed step.
- **Validate every input field.** `axisIn` clamps axes and drops `NaN`/strings; check enums (`Number.isInteger(dir) && dir >= 0 && dir < 4`); turn buttons into booleans with `!!`. Speed, fire rate, damage, cooldowns and collisions are server constants: the client never sends positions.
- `addPlayer` can run in any phase: a late joiner must not crash `update`. Either spawn them at once (shooter) or park them until the next round (`out: true`, cycles/sumo).
- Round-based games keep their rounds inside `playing` (a `pause` timer between rounds) and return a result from `result()` once someone reaches the target.
- Keep `snapshot()` small: `r2()` rounds to centimetres, send only what is drawn, send trails as corner points rather than cells.
- Physics patterns that worked: circle vs axis-aligned box push-out (`pushOutOfBox`), circle-circle separation plus an impulse along the normal, bullets sub-stepped twice per tick, a centreline polyline for a race track (nearest segment = progress, lap = crossing segment 0 after a halfway checkpoint).

## 5. Bots

`config.botFill: N` adds bots at `start` until N players are in; `botsNeeded(room)` overrides it (soccer evens out the teams). A human joining a full room replaces a bot. Bots are cheap and make solo and odd-numbered matches playable, which pairs well with a matchmaker expansion that lets a lone player in after 20 s.

Make bots beatable and decisive: with smart bots, rounds drag on (light cycles with a 20-cell look-ahead lasted 40 s a round). Shorten look-ahead, add randomness, add sudden death (a ring that keeps shrinking), and end a round as soon as every human is out: nobody wants to watch bots.

## 6. Matchmaker data

On a matchmaker deployment Edgegap injects `MM_MATCH_ID`, `MM_MATCH_PROFILE`, `MM_TICKET_IDS` (JSON array) and `MM_TICKET_<id>` (JSON: `player_ip`, `group_id`, `team_id`, `attributes`), plus `MM_TEAMS`, `MM_GROUPS`, `MM_EXPANSION`. `edgegap.js` parses them with the SDK's `MatchEnvironment.fromEnv(process.env)` (never throws: a malformed value becomes `null`) and exposes `match = { id, profile, ticketIds, tickets, teamOf(ticketId) }`; `teamOf` maps the matchmaker's team UUIDs to 0, 1... in a stable order.

- Expected players = `ticketIds.length` → start when they're all in.
- Teams: with `team_count: 2` in the profile, the client's `hello.ticket` gives its team. A direct or local join has no ticket: the game balances teams itself (`p.team` null → smaller team).
- Logging the match on boot (`describeDeployment()`) makes `edgegap_get_deployment_logs` show `match <id> profile <p>, N ticket(s)`, the first thing to check when a match looks wrong.

## 7. Self-stop and shutdown

`selfStop(reason)` sends `DELETE $ARBITRIUM_DELETE_URL` with header `Authorization: $ARBITRIUM_DELETE_TOKEN` (raw). Edgegap then sends SIGTERM; `main.js` closes sockets (code 1001) and exits. If the request fails, the process exits, which also ends the deployment.

Node must be PID 1 (`CMD ["node", "server/main.js"]`, no `sh -c`, no `npm start`) or SIGTERM never reaches it.

## 8. Local checks

```bash
GAME=... PORT=7777 WAIT_SECONDS=2 COUNTDOWN_SECONDS=1 RESULTS_SECONDS=1 MATCH_SECONDS=40 node server/main.js
```

then two `playSession()` from `assets/tools/headless-player.mjs` with a `makeInput` that plays the game. Expect both players to see every phase, the same scoreboard and a result. Then the container (`docker run -p 7777:7777`), same test with `ws://localhost:7777`. Simulate Edgegap's lifecycle with `-e ARBITRIUM_REQUEST_ID=local -e EMPTY_TIMEOUT_S=5`: without a delete URL the process exits after the timeout.
