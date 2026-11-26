## Multiplayer hosting: Edgegap

<!-- Copy this section into the AGENTS.md at the root of your game repo. Codex, Cursor, Copilot and other agents that read AGENTS.md follow it. -->

- Online play runs on Edgegap: one authoritative game server per match, started by Edgegap's matchmaker, stopped by the server itself when the match ends. Load the `edgegap` skill (or the engine skill it routes to) before changing anything about servers, ports, Docker images or matchmaking.
- The Edgegap API token never goes into this repo, the game client, CI logs or chat. Agents don't need it: they use the Edgegap MCP server (`https://mcp.edgegap.com/mcp`), where the developer signs in with their Edgegap account. CI reads it from a repository secret.
- The game client only talks to the matchmaker (with its client-safe auth token) and to the game server. It never calls the Edgegap API.
- Game rules live in one module that the page and the server both import. The server decides the outcome; the client sends inputs and draws what the server sends back.
- The server listens on `0.0.0.0` on a fixed port, reads match data from the environment variables Edgegap injects, logs to stdout and exits when the match ends or on SIGTERM.
- Server images are `linux/amd64`. The image tag and the Edgegap app version name are the same UTC timestamp, `YYYYMMDD-HHMM`.
- Ask before deploying, stopping a deployment, or creating, changing or deleting an Edgegap app, app version or matchmaker. Tag test deployments `agent-test`, stop only the ones you started, and leave nothing running.
