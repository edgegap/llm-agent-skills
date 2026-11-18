# GodotSteam Server on Edgegap

For a Godot 4 game that uses Steam: a headless GodotSteam Server build logs on to Steam and checks each player's Steam auth ticket, running as an Edgegap deployment. Sample: [edgegap/server-sample-godotsteam-dedicated-server](https://github.com/edgegap/server-sample-godotsteam-dedicated-server) (MIT). Guide: https://docs.edgegap.com/docs/sample-projects/godot/godotsteam-server.

Verified on Edgegap on 2026-11-09 with Godot 4.7.2, GodotSteam Server 4.12.1 and GodotSteam 4.24 (both GDExtension, Steamworks SDK 1.65): anonymous logon on the deployment, a Windows client's auth ticket validated, and the deployment stopped itself when the client left. On 2026-11-18 the sample moved to the Edgegap Godot plugin's build (1.0.10, vendored in `addons/edgegap/`): the dock's Export server, Containerize (with the sample's Dockerfile) and Deploy local container ran, the server logged on to Steam in the local container and a client authenticated. Not tested: the dock's upload and deploy buttons with this sample, an Edgegap deployment of the plugin-built image, and `logOn()` with a Game Server Login Token (GSLT).

## Shape

- One autoload for both sides (`net/session.gd` in the sample).
  - **Server:** `SteamServer.serverInitEx()`, then `logOnAnonymous()` (or `logOn(STEAM_GSLT)` for a persistent server Steam ID), ENet on UDP 7777, `beginAuthSession()` for every player, kick anyone without a valid ticket, self-stop when empty (`DELETE $ARBITRIUM_DELETE_URL`, see the lifecycle template).
  - **Client:** `Steam.steamInitEx()`, ENet connect, then send an auth session ticket bound to the server's Steam ID.
- The headless server must call `SteamServer.run_callbacks()` in `_process`. Embedded callbacks depend on `frame_post_draw`, which a headless server never reaches.
- App version: `gameport` 7777 **UDP**, and optionally `queryport` 27015 **UDP** with port verification off; 0.5 vCPU / 1 GB. Env: `SteamAppId` (instead of `steam_appid.txt`), `STEAM_GSLT` if used.

## Build and image

Build with the Edgegap Godot plugin, as in Phases 2-3 of this skill, with three Steam-specific settings:

- **Export preset.** The plugin creates `Edgegap Linux Server`; add `addons/godotsteam/*,addons/edgegap/*` to its exclude filter so the server ships only GodotSteam Server (client presets exclude `addons/godotsteam_server/*`). The plugin never changes an existing preset, so the filter stays. With both add-ons in one project, "SteamProjectSettings already registered" errors appear; they are harmless.
- **Dockerfile path.** In the dock's Containerize section, set **Dockerfile path** to the project's own `Dockerfile` (the relative path `Dockerfile` works) before clicking Containerize. Copy the sample's Dockerfile; it takes the plugin's `SERVER_BUILD_PATH` build argument and adds what the plugin's default image lacks:
  - a SteamCMD stage that provides `steamclient.so` in `~/.steam/sdk64`;
  - the GodotSteam Server `.so` files next to the binary (the default Dockerfile copies only the `.x86_64` and `.pck`, and the server then fails with "non-existent singleton SteamServer");
  - an Ubuntu 24.04 runtime, a non-root user and `tini`.
  The dock's fields reset when the editor restarts: set the path again each session.
- **`.dockerignore`.** `*` then `!build/`: the plugin sends the whole project as build context, and the two add-ons alone are about 160 MB.

Local test from the dock: **Docker run parameters** `-p 7777:7777/udp`, **Deploy local container**, then `docker logs` shows `STEAM logged on steam_id=...`. The plugin exports a debug build, so the library is `libgodotsteam_server.linux.template_debug.x86_64.so`; the sample's Dockerfile copies either variant.

`tools/fetch-godotsteam.sh` downloads the tested GodotSteam add-on versions (they are not committed). No editor at hand: `godot --headless --export-release "Edgegap Linux Server" build/edgegap-linux-server.x86_64` (create `build/` first) and `docker build` with the same Dockerfile.

## Bringing players in

Steam's server browser records the internal query port (27015), and Edgegap maps that port to a random external one, so browser pings fail. Bring players in with the Edgegap matchmaker (this skill's matchmaker client) or Steam lobbies (`Steam.setLobbyGameServer()` with the deployment's address and external `gameport`). A2S queries work on the external `queryport`.
