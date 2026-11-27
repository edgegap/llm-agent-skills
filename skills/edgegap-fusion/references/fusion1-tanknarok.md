# Fusion 1: Tanknarok sample

For Photon's Tanknarok (Fusion 1, Unity 2021.3) as modified in [edgegap/netcode-game-sample-unity-photon-fusion-tanknarok](https://github.com/edgegap/netcode-game-sample-unity-photon-fusion-tanknarok). Different from BR200: Fusion 1 SDK, Mono server build, Edgegap deploy API called by the host client.

- **App ID plugin version.** The Photon app must be set to Plugin Version **Fusion 1.1**. A Fusion 2 App ID makes both client and server fail with `DisconnectMessage Code: 104 "Incompatible Configuration"`. Ask the developer for a Fusion 1.1 App ID, and never change the plugin version of an App ID other games use.
- **Server detection.** `EdgegapManager.IsServer()` is `Application.isBatchMode`: a batch-mode client acts as a server. Test clients must run windowed (`-screen-width 320 -screen-height 240`), joining by session name (the `room_code`).
- **Port.** The server binds `NetAddress.Any(5050)` and passes the deployment's external address as `CustomPublicAddress` (read from `ARBITRIUM_CONTEXT_URL`). App version: UDP `5050`, `to_check: false`, 512 CPU units / 512 MB, restart policy `never`.
- **Environment variables** sent by the host client: `room_code` (session name) and `player_count` (players to wait for). The server stops itself when it is empty after 60 s, through `ARBITRIUM_DELETE_URL`.
- **Build.** Linux, `StandaloneBuildSubtarget.Server`, scenes MainScene, Lobby, Level1, Level2, TransferringScene, output `Builds/EdgegapServer/ServerBuild`; the sample's Dockerfile copies that folder (Ubuntu 18.04 base works).
- **Secrets.** The sample keeps the Edgegap API token in `EdgegapConfig.asset` on the client. Keep the token out of git; a production game should deploy from a backend.
- Run on 2026-11-27: Unity 2021.3.45 build, image push, app version, deployment READY in Toronto, server started with room code and connected to Photon Cloud.
