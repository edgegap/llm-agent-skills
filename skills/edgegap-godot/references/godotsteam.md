# GodotSteam Server on Edgegap

For a Godot 4 game that uses Steam: a headless GodotSteam Server build logs on to Steam and checks each player's Steam auth ticket, running as an Edgegap deployment. Sample: [edgegap/server-sample-godotsteam-dedicated-server](https://github.com/edgegap/server-sample-godotsteam-dedicated-server) (MIT). Guide: https://docs.edgegap.com/docs/sample-projects/godot/godotsteam-server.

Verified on Edgegap on 2026-11-09 with Godot 4.7.2, GodotSteam Server 4.12.1 and GodotSteam 4.24 (both GDExtension, Steamworks SDK 1.65): anonymous logon on the deployment, a Windows client's auth ticket validated, and the deployment stopped itself when the client left. Not tested: `logOn()` with a Game Server Login Token (GSLT).

## Shape

- One autoload for both sides (`net/session.gd` in the sample).
  - **Server:** `SteamServer.serverInitEx()`, then `logOnAnonymous()` (or `logOn(STEAM_GSLT)` for a persistent server Steam ID), ENet on UDP 7777, `beginAuthSession()` for every player, kick anyone without a valid ticket, self-stop when empty (`DELETE $ARBITRIUM_DELETE_URL`, see the lifecycle template).
  - **Client:** `Steam.steamInitEx()`, ENet connect, then send an auth session ticket bound to the server's Steam ID.
- The headless server must call `SteamServer.run_callbacks()` in `_process`. Embedded callbacks depend on `frame_post_draw`, which a headless server never reaches.
- App version: `gameport` 7777 **UDP**, and optionally `queryport` 27015 **UDP** with port verification off; 0.5 vCPU / 1 GB. Env: `SteamAppId` (instead of `steam_appid.txt`), `STEAM_GSLT` if used.

## Build and image

- Export with the `Edgegap Linux Server` preset, and exclude the client add-on from it. With both add-ons in one project, "SteamProjectSettings already registered" errors appear; they are harmless. Godot's export fails unless `build/` exists: `mkdir -p build` first.
- **Don't use the Edgegap Godot plugin's default Dockerfile here.** It copies only the `.x86_64` and `.pck`, drops the GDExtension `.so` files, and the server fails with "non-existent singleton SteamServer". Use the sample's Dockerfile:
  - a SteamCMD stage that provides `steamclient.so` in `~/.steam/sdk64`;
  - an Ubuntu 24.04 runtime, a non-root user and `tini`;
  - a copy of the GodotSteam Server `.so` files.
- `tools/fetch-godotsteam.sh` downloads the tested add-on versions (they are not committed).

## Bringing players in

Steam's server browser records the internal query port (27015), and Edgegap maps that port to a random external one, so browser pings fail. Bring players in with the Edgegap matchmaker (this skill's matchmaker client) or Steam lobbies (`Steam.setLobbyGameServer()` with the deployment's address and external `gameport`). A2S queries work on the external `queryport`.
