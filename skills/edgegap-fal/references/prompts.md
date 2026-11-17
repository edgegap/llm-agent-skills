# Prompts

## 1. A coding agent builds the game (path A)

For Claude Code, Codex, Cursor or ChatGPT writing the game, with fal for the assets. Replace the first paragraph with the developer's game; keep the rest. If you are that agent, this is your own brief.

> Build a 3D browser game called "[NAME]" with Three.js from a CDN (ES modules, import map, no build step). Gameplay: [the game in a few sentences: who the players are, how they move (a bit of slide: acceleration + friction), what they do (push, carry, collect, slow projectiles), how a point is scored, first to N wins]. The human plays against 3 bots.
>
> Architecture, important: put ALL game rules in `client/rules.js`, an ES module with NO window, document, WebGL, audio or timers: export createWorld(), addPlayer(world, id, name, isBot), removePlayer(world, id), setInput(world, id, input) with plain numbers and booleans, step(world, dt) that returns an array of events, and botInput(world, id) that reads only positions. Characters collide as circles and obstacles as boxes, never as meshes. `client/render.js` draws a plain view object ({players, items, ...}); `client/main.js` handles input, runs step() at a fixed 60 Hz for solo play and builds that view.
>
> Assets: start as a graybox (capsules, boxes, flat colours). List every model, texture and sound in `client/assets.js`, all optional: an empty entry or a failed load keeps the plain shape. Scale each model to a size in world units in the renderer; no rule may depend on a model's size.

Then, once the graybox plays and the server tests pass, the asset pass ([assets.md](assets.md)):

> Generate the game's assets with fal and list them in client/assets.js. For each of the 4 characters: one concept image (same style paragraph, A-pose, separated limbs, empty hands, white background), show it to me, then image-to-3D with rigging and the walk and run clips. Props the same way without rigging. One seamless floor texture, one short sound per rules event. Tell me the cost before you start, keep every prompt in PROMPTS.md, shrink the models for the web, and don't put any asset in the server image.

The exact brief and prompts used for Relic Rumble are in its [README](https://github.com/edgegap/netcode-sample-fal-relic-rumble#step-1-build-the-game-as-a-graybox-rules-in-their-own-file) and [PROMPTS.md](https://github.com/edgegap/netcode-sample-fal-relic-rumble/blob/main/PROMPTS.md) (verified 2026-11-17).

## 2. fal Agent: the game (path B)

Paste into a new fal Agent chat (fal.ai/agent). Replace the first paragraph with the developer's game; keep the second and third paragraphs as they are.

> Build me a small [top-down / side-view] browser game called "[NAME]" as code (HTML + JavaScript, no frameworks, plain Canvas 2D). Gameplay: [the game in a few sentences: who the players are, how they move (prefer a bit of drift: velocity + friction), what they do (slow projectiles, pushing, collecting), how a point is scored, first to N wins, then a results screen and restart]. The human plays against 3 simple bots.
>
> VERY IMPORTANT architecture: put ALL game rules in a separate file rules.js written as an ES module with NO window, document, canvas, audio or timers inside: export createWorld(), addPlayer(world, id, name, isBot), removePlayer(world, id), setInput(world, id, {[the input fields, e.g. up,down,left,right,aimX,aimY,fire]}), step(world, dt) that returns an array of events ([e.g. {type:'hit', shooter, victim} and {type:'win', winner}]), and botInput(world, id) that returns an input object using only positions. index.html + main.js only handle rendering, keyboard/mouse input and calling step() at 60 Hz.
>
> Please output the full content of rules.js, main.js and index.html so I can copy them.

Optional, at the end of the first paragraph: "Generate a [style] background image for the arena and use it." fal Agent then also runs an image model; download the image into `client/assets/`.

The exact prompt used for Orb Arena (verified 2026-11-09, fal Agent on its free models, one answer of three files):

> Build me a small top-down arena browser game called "Orb Arena" as code (HTML + JavaScript, no frameworks, plain Canvas 2D). Gameplay: 4 round ships in a square arena (800x800 units), each moves with WASD/arrow keys with a bit of drift (velocity + friction), aims with the mouse and fires slow projectiles on click (cooldown 0.4 s, projectile speed ~420 units/s, lifetime 1.5 s). A hit gives +1 point to the shooter and respawns the victim at a random corner with 1 s invulnerability. First to 10 points wins, then a results screen and restart. The human plays against 3 simple bots. VERY IMPORTANT architecture: put ALL game rules in a separate file rules.js written as an ES module with NO window, document, canvas, audio or timers inside: export createWorld(), addPlayer(world, id, name, isBot), removePlayer(world, id), setInput(world, id, {up,down,left,right,aimX,aimY,fire}), step(world, dt) that returns an array of events ({type:'hit', shooter, victim} and {type:'win', winner}), and botInput(world, id) that returns an input object using only positions. index.html + main.js only handle rendering, keyboard/mouse input and calling step() at 60 Hz. Optionally generate a small dark sci-fi arena floor background image and use it. Please output the full content of rules.js, main.js and index.html so I can copy them.

Why each part is there:

| Part | Why |
|---|---|
| "as code", "full content of each file" | fal Agent defaults to media; without these it may describe the game or offer a download the agent can't open. |
| Plain Canvas 2D or Three.js from a CDN, no frameworks, no build | The page can be served as static files, and the server can import `rules.js` with plain Node. |
| `rules.js` with no DOM, canvas, audio or timers | The Node server imports the same file: one set of rules for solo and online. |
| `setInput` with plain booleans and numbers | That object is what the page sends over the WebSocket; the server clamps each field. |
| `step(world, dt)` returns events | The server forwards them for effects and scores. |
| `botInput(world, id)` from positions only | Server bots and headless test players reuse it. |
| Drift, slow projectiles | Holds up with network delay without client prediction. |

## 3. fal Agent: follow-ups

Short prompts that keep the shape intact:

- "Make the bots less accurate and slower to fire. Keep all rules in rules.js."
- "Add a dash on Shift with a 2 s cooldown. It's a rule, so it goes in rules.js and setInput gets a dash field."
- "Output only the files that changed, in full."

## 4. Going online: the coding agent with the Edgegap MCP

> Here is a game made with fal (client/): [a coding agent wrote it and fal generated the assets / fal Agent wrote it]. Make it online multiplayer on Edgegap. Use the Edgegap MCP and its edgegap-fal skill. Keep the solo mode, add a Find match button, 2 to 4 players per match, bots fill empty seats. Build the server image with GitHub Actions. Ask me before you create anything in my Edgegap account, and make sure nothing is left running at the end.
