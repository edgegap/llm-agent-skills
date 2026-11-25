# Walkthrough: Relic Rumble, a coding agent, fal assets and online matches

Repo: [edgegap/netcode-sample-fal-relic-rumble](https://github.com/edgegap/netcode-sample-fal-relic-rumble). Its README is the step-by-step version for people and `PROMPTS.md` has every fal prompt. Built on 2026-11-17 by one coding agent (Claude Code) with fal's `genmedia` CLI and the Edgegap MCP; the developer did the account steps (fal key and credit, registry secrets, creating the matchmaker).

The game: four characters on a square floor, three relics in the middle, a home pedestal per corner. Walk over a relic to carry it, bring it home for a point, shove (Space) to knock a rival back, stun them and make them drop theirs. First to 5 wins. Carriers are slower and can't shove, so stealing works.

## Order of work

| Step | What | fal | Edgegap |
|---|---|---|---|
| 1 | Graybox game: `rules.js`, Three.js view with plain shapes, solo vs bots | none | none |
| 2 | Server from the templates + `server/game.js`, Find match, `tests/local-match.mjs` PASS | none | none |
| 3 | CI image, app version, direct deployment, `SERVER_URL=... node tests/e2e.mjs 2` PASS | none | first use |
| 4 | Matchmaker (developer), `tests/e2e.mjs rumble 2` PASS, two browser tabs matched | none | |
| 5 | fal assets, listed in `client/assets.js` | first use | none (page only) |
| 6 | Rules tuned for the look (smaller floor, slower bots): new image tag on the same version | | `edgegap_update_app_version` |

Steps 1 to 4 were finished and verified before any fal asset existed, because every asset is optional in the renderer. That order also meant the wait for fal credit blocked nothing.

## Files

| File | Lines | What it does |
|---|---|---|
| `client/rules.js` | ≈300 | The whole game: movement with acceleration and friction, walls and pillar boxes, shove with an arc and cooldown, stun, relic pickup, drop and scoring, bots that fetch, steal and walk around pillars. No DOM, no Three.js. |
| `client/render.js` | ≈400 | Three.js scene from a plain view object; optional fal models, clips, texture and sounds, with plain shapes and beeps as fallbacks. |
| `client/assets.js` | 25 | The asset list. Empty it and the game is a graybox again. |
| `client/main.js` | ≈250 | Menu, keyboard and touch input, the solo loop, the online view (eased positions), HUD. |
| `server/game.js` | 70 | Wraps `rules.js` for the room: clamps inputs, runs bots, steps, copies scores, sends rounded positions and events. |
| `server/main.js`, `room.js`, `edgegap.js`, `util.js` | | `edgegap-threejs` templates (0.3.6), unchanged. |
| `tests/headless-player.mjs` | | Template plus `playLikeABot()`, which rebuilds players and relics from the snapshot and calls `botInput`. |

The snapshot, 20 times a second: per player `{id, seat, x, z, f (facing), c (carried relic), st (stunned), sv (shoving)}`, per relic `[id, x, z, holder]`, plus the events since the last one. Positions are rounded to centimetres.

## Edgegap settings used

App `relic-rumble`; version with port 7777 WS `gameport`, TLS Upgrade on, 256 vCPU units, 512 MB, restart `never`, max 30 minutes, env `EMPTY_TIMEOUT_S=15`, `FIRST_JOIN_TIMEOUT_S=60`, `RESULTS_SECONDS=8`, `IDLE_TIMEOUT_S=75`; created with `edgegap_create_app_version` (the registry login came from `registry_profile` "Edgegap"). Matchmaker profile `rumble`: 2 to 4 players, one team, a lone player after 20 s, tickets expire after 30 s.

## What was measured

- Direct deployment (Toronto for a Montreal player): ready 5 s after `edgegap_deploy`; full match; self-stop 20 s after the result.
- Through the matchmaker: `MATCH_FOUND` 12 s after queueing (the test staggers the two players), `HOST_ASSIGNED` 5 s later, both players on one deployment, self-stop 20 s after the match.
- Two browser tabs on `http://localhost:8093` (an allowed origin): same match, two bots filled the seats, both tabs back at the menu when the server closed.
- Server image: `node:22-slim` plus `ws` and `@edgegap/sdk`; nothing from `client/assets/`.

## Pitfalls hit

| Symptom | Cause | Fix |
|---|---|---|
| `docker push` to `registry.edgegap.com` answers 401 from the developer's machine | Its Docker login was for another registry project of theirs | Build in GitHub Actions with the repo's own registry secrets. |
| Every fal call: `403 User is locked. Reason: Exhausted balance` | The fal account had no credit; after a first small amount, the balance ran out again after three images | The developer tops up; the agent retries. |
| Rigged character renders as a dot | `Box3.setFromObject` on a skinned model ignores the armature's 0.01 scale | `setFromObject(model, true)` after `updateMatrixWorld(true)` ([assets.md](assets.md)). |
| Relics invisible on the stone floor | Small generated model on a busy generated texture | Bigger model, glowing disc under free relics, darker floor tint. |
| Bots win a match in 35 s | `botInput` plays at full speed with perfect paths | Bots move at 80%; that is a rules change, so a new image. |
