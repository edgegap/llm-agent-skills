# Prompts for chat-canvas games

## §1 A new game, ready to go online (Claude artifact)

Used verbatim for Star Snatch on 2026-11-20 (claude.ai, new chat, Opus 5.5 with the default
settings); one message gave a playable artifact. Replace the sentences between "called" and "VERY
IMPORTANT" with the developer's game; keep the rest word for word.

> Build a small browser game as a single HTML artifact called "Star Snatch" (plain Canvas 2D, no
> frameworks, no external libraries). Gameplay: 4 round ships in a square arena (800x800 units)
> move with WASD/arrow keys with drift (velocity + friction). Stars spawn at random spots; touching
> one picks it up. Ramming another ship at speed knocks one of its stars loose. First to 10 stars
> wins, then a results screen and restart. The human plays against 3 simple bots. VERY IMPORTANT
> architecture: put ALL game rules in one block between the exact lines /* RULES:BEGIN */ and
> /* RULES:END */, with NO window, document, canvas, audio, requestAnimationFrame or timers
> inside, and no export keyword. The world is plain data (objects, arrays, numbers, strings; no
> classes or Maps). The block defines createWorld(), addPlayer(world, id, name, isBot),
> removePlayer(world, id), setInput(world, id, {up,down,left,right}), step(world, dt) returning an
> array of events ({type:'pickup', id}, {type:'bump', a, b}, {type:'win', winner}), and
> botInput(world, id) using only positions. Everything else (rendering, keyboard input, calling
> step() at 60 Hz) stays outside the block.

Adapting it:
- Change the input object if the game needs more than four directions (`{..., fire}` for a shot,
  `{..., aimX, aimY}` for aiming). Keep it plain booleans and numbers: it is what goes over the
  network, and `server/game.js` clamps every field.
- Change the event list to the game's events (hit, fall, score). The server forwards them for effects.
- "The world is plain data" is what lets the server send the world as is and the page draw it with
  the chat's own renderer. Keep it.
- "no export keyword" keeps the file a classic script, so it plays in the preview. The split
  script adds the exports.

Why each part matters online: see the table in the sample README, step 1.

## §2 An existing artifact without markers

> Restructure this game without changing how it looks or plays: move ALL game rules (movement,
> collisions, scoring, spawning, bots, win condition) into one block between the exact lines
> /* RULES:BEGIN */ and /* RULES:END */, with NO window, document, canvas, audio,
> requestAnimationFrame or timers inside, and no export keyword. The world becomes plain data
> (objects, arrays, numbers, strings; no classes or Maps). The block defines createWorld(),
> addPlayer(world, id, name, isBot), removePlayer(world, id), setInput(world, id, input),
> step(world, dt) returning an array of events, and botInput(world, id) using only positions.
> Rendering, input and the 60 Hz loop stay outside the block and only call those functions.

Play the result in the preview before saving it: a restructure can change the feel (speeds,
friction) when constants move.

## §3 Follow-ups in the chat

- A split error (`the rules block uses browser-only or module code: line N ... "console"`): send it
  back as is, with "move that out of the rules block, keep everything else the same".
- Gameplay changes later: "Change X. Keep every rule between the /* RULES:BEGIN */ and
  /* RULES:END */ lines and keep the six functions' signatures."
- Don't ask the chat for networking code: the online part comes from the templates, and a chat
  canvas can't run a server.

## §4 Starting the Edgegap work (coding agent with the Edgegap MCP)

> Make this Claude artifact game online multiplayer on Edgegap. Use the Edgegap MCP and its
> edgegap-chat-canvas skill. Keep the solo mode, add a Find match button, 2 to 4 players per match,
> bots fill empty seats. Ask me before you create anything in my Edgegap account.

For friends only, without a matchmaker: "...add a way to join one server by its address instead of
a Find match button."
