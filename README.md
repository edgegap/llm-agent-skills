# Edgegap Agent Skills

Get multiplayer games online on Edgegap: dedicated servers, matchmaking, backend integration, launch and troubleshooting for Unity (including NGO, FishNet, PurrNet and Photon Fusion), Unreal Engine, Godot 4, Colyseus (including Cocos Creator clients), Nakama, PlayFab, Supabase, Three.js, vibe-coded (including Claude artifacts, ChatGPT and Gemini Canvas games, and fal.ai) and Manus browser games and any other engine, plus Edgegap relays for host/client games, driven by your coding agent.

This is the Claude plugin directory build of [edgegap/llm-agent-skills](https://github.com/edgegap/llm-agent-skills), generated from `main` by `scripts/build_claude_directory.py`. Templates are stored as Markdown code blocks; edit the skills on `main`, not here.

## Data and services

The plugin's MCP server is Edgegap's hosted connector (`mcp.edgegap.com`). You sign in with your Edgegap account and approve what it may do. Through it, Claude reads and changes your Edgegap apps, versions, deployments, logs and metrics. Deployment requests include the public IP addresses you give for the players, which Edgegap uses to pick a location.

Some skills also have Claude run commands or template scripts that contact services directly, outside the connector:

- Edgegap: the Edgegap API (`api.edgegap.com`), your own Edgegap matchmaker URL, and your deployments' addresses, using credentials you provide.
- `api.ipify.org`, to look up your public IP address for a test deployment.
- Container registries (`registry.edgegap.com`, and `ghcr.io` for the Unreal engine image) through your own `docker login`.
- Only in the skill for that service, with your own account: PlayFab and Azure Functions (`edgegap-playfab`), Supabase (`edgegap-supabase`), Steam Web API (`edgegap-manus`), Nakama (`edgegap-nakama`), Colyseus (`edgegap-colyseus`), Epic Online Services (`edgegap-eos-voice`, `edgegap-unreal`), fal.ai (`edgegap-fal`), GitHub (CI templates).

The skills tell Claude never to write your API tokens into files, code or chat. Edgegap's privacy policy: https://edgegap.com/legal
