# Photon's Asteroids Simple sample on Edgegap

Repo: [edgegap/netcode-game-sample-photon-fusion2-asteroid](https://github.com/edgegap/netcode-game-sample-photon-fusion2-asteroid) (Unity 6000.0, Fusion 2.0.6, Edgegap plugin `sample/unity-photon-fusion-2` branch). It is Photon's "Asteroid Simple (Host)" sample plus `Assets/EdgegapHelpers/EdgegapServerManager.cs`. It has no kit (no scripts, Dockerfile or tests): the Edgegap Unity plugin builds and packages the server.

How it works (read from the code): in batch mode `EdgegapServerManager` reads `ARBITRIUM_PUBLIC_IP`, `ARBITRIUM_PORT_GAMEPORT_EXTERNAL` and `ARBITRIUM_REQUEST_ID`, starts a `GameMode.Server` runner with session name `<request id>.pr.edgegap.net`, `Address = NetAddress.Any(7777)` and `CustomPublicAddress = <public ip>:<external port>`, then loads the game scene. The app version needs a UDP port **named `gameport`**, internal 7777. In the menu, **Start Edgegap** joins the session named in the room field as a client.

Run on 2026-11-27 (Unity 6000.0.54f1, Windows):
1. Set `AppIdFusion` in `Assets/Photon/Fusion/Resources/PhotonAppSettings.asset` (the repo's value is a placeholder; use your own App ID, don't commit it).
2. Server build with the plugin: command line `-executeMethod` into `Edgegap.EdgegapBuildUtils.BuildServer("EdgegapServer")` (same as the `edgegap-unity` skill's wrapper) → `Builds/EdgegapServer/ServerBuild`. Image: `docker build --platform linux/amd64 -f Library/PackageCache/com.edgegap.unity-servers-plugin@*/Editor/Dockerfile .`
3. Push to the main registry, create the app version (7777 UDP `gameport`, `to_check` off, restart `never`), deploy.
4. Server log: `Starting server room with code <request id>.pr.edgegap.net`.
5. Two clients (`FixedRegion` = the Photon region nearest the deployment, e.g. `cae` for Toronto) typed the FQDN into the room field and pressed Start Edgegap: both joined, `runner.CurrentConnectionType` = **Direct**, 2 players, 33 to 50 ms.

Pitfalls seen:
- A client started with `-batchmode` runs the server path of `EdgegapServerManager` (`Application.isBatchMode`) and throws `Could not find port mapping`. Headless test clients need another way to be told apart from the server (for example a command-line flag), or run the Windows client without `-batchmode`.
- Before the fix in repo PR #3, clients threw `NullReferenceException` in `SpaceshipController.HasHitAsteroid` on every tick (`Runner.LagCompensation` is null on clients). Use a repo that has the `HasStateAuthority` guard.
- Older plugin pins (3.0.9) print all `ARBITRIUM_*` variables, including the self-stop token, to the deployment logs. Keep the lock on plugin 3.2.2 or later.
- Unity re-resolves `Packages/manifest.json` entries when it opens the project (it bumped `com.unity.toolchain.win-x86_64-linux-x86_64` to 2.0.11 and left the build working). Don't commit that churn.
- `Failed to get ...` / `Game Does Not Exist (32758)`: Photon region of the client differs from the server's (see `fusion.md` §4).
