# How Simple FPS runs, and what the kit changes

Simple FPS 2.1.1 (Fusion 2.1.1 build 2177). Everything here was read from the sample's source or measured on Edgegap on 2026-10-20.

## 1. How the sample starts a game

- **Scenes**: `Startup` (build index 0) holds the menu. `Deathmatch` (index 1) is the game.
- **Menu → game**: `SimpleFPS.MenuConnectionBehaviour` (`Assets/Scripts/Menu/`) creates a `NetworkRunner` and calls `StartGame`. The host then loads Deathmatch with `runner.LoadScene(sceneName, LoadSceneMode.Additive, LocalPhysicsMode.None, setActiveOnLoad: true)`. Its `FixedRegion` comes from the menu's region (`connectionArgs.Region`).
- **Party menu**: `Fusion.Menu.FusionMenuUIParty` creates a game with a generated party code that encodes the region, or joins one by decoding that code. The stock join upper-cases the code (`_sessionCodeField.text.ToUpper()`) and rejects anything that isn't a party code.
- **`FusionBootstrap`** sits on the Deathmatch scene for quick testing in the editor. As shipped, it auto-starts as AutoHostOrClient on port 27015. When the menu has already started a runner, it removes itself. Its server start (`StartWithClients` → `InitializeNetworkRunner`) binds `NetAddress.Any(ServerPort)` (0.0.0.0, which gives CT Direct) and calls `sceneInfo.AddSceneRef(scene, LoadSceneMode.Additive)`, without `activeOnLoad`.
- **`SceneObjects`** (`Assets/Scripts/Gameplay/`) finds `Gameplay` and the game UI in `runner.SceneManager.MainRunnerScene`. With Peer Mode Single, that's Unity's **active** scene (`NetworkSceneManagerDefault.MainRunnerScene`). `Player.Spawned` caches it, and `Player.FixedUpdateNetwork` reads `_sceneObjects.Gameplay.State` every tick.
- **Region**: the dedicated server registers in `PhotonAppSettings.FixedRegion`, which is empty by default, so it gets the best ping from wherever it runs. A Toronto deployment registered in `cae`. The client must use the same region, or `StartGame` fails with GameNotFound.

## 2. The two traps (measured)

Both appear when you build a dedicated server with `FusionBootstrap` (Start Mode Automatic, Autostart As Server). Clients join, the server counts the player, and then each client throws `NullReferenceException` in `SimpleFPS.Player.FixedUpdateNetwork` hundreds of times a second (14,400 lines in 50 s). The player can't move.

| Trap | What happens | Fix (the kit does both) |
|---|---|---|
| The server build includes **only Deathmatch** | Fusion tells clients the scene by **build index**. On the server, Deathmatch is index 0; on the client, index 0 is Startup. Clients load nothing useful, and `Gameplay` is never found. | Build the server with the client's scene list (Startup 0, Deathmatch 1). In the server build, `EdgegapServerSceneLoader` (`#if UNITY_SERVER`) leaves Startup for Deathmatch. |
| The scene isn't **active on load** | Even with matching indices, the client loads `Deathmatch#1` additively but keeps `Startup#0` active. `MainRunnerScene` is Startup, so `SceneObjects.Gameplay` is null. Measured: the probe shows `runnerScene=Startup#0 loaded=Startup#0,Deathmatch#1`. | Register the scene with `AddSceneRef(scene, LoadSceneMode.Additive, LocalPhysicsMode.None, activeOnLoad: true)` on the server, as the menu's host does. After the fix: `runnerScene=Deathmatch#1`, 0 exceptions. |

The server itself logs no exception in either case, so check the **client** logs.

## 3. What the kit changes

No Simple FPS or Fusion file is edited. **Tools > Edgegap Simple FPS > Set Up Project** (or `scripts/build.sh setup`) does this, and it is safe to run again:

| Change | Why |
|---|---|
| Deathmatch: `FusionBootstrap` → `EdgegapFusionBootstrap` (a subclass, same serialized values) | In a server build (`UNITY_SERVER`), it starts automatically as a Server on `ARBITRIUM_PORT_GAMEPORT_INTERNAL` (7777). It names the session `<ARBITRIUM_REQUEST_ID>.pr.edgegap.net`, marks the scene active on load (trap 2), fixes the region when `PHOTON_REGION` is set, and logs `[edgegap-simplefps] server started: session=… photon_region=…`. Hosts, clients and editor play are unchanged. |
| Deathmatch: Start Mode = User Interface | Players start from the Startup menu. The server sets Automatic by itself, so one project builds both sides without changing the scene between builds. |
| Startup: `FusionMenuUIParty` → `EdgegapPartyMenu` (a subclass) | Join uses the code field as the session name, kept as typed (session names are case-sensitive and FQDNs are lowercase), and the Region field as `ConnectionArgs.Region`. Create Game is unchanged. The menu controller registers screens under their base types, so `Show<FusionMenuUIParty>()` still finds it. The menu is a prefab instance, so setup unpacks it to change the script. |
| Join card: `CodeInputButton` (under **JoinCard**, not CreateCard) | Character Limit 30 (an FQDN is 27), Content Type Custom, Character Validation Regex `^[A-Za-z0-9\.]`, AllCaps off. |
| Join card: new `RegionInputButton` | A copy of the code field, limited to 4 characters, assigned to `EdgegapPartyMenu._regionCodeField`. |
| Build profile: Startup (0), Deathmatch (1) | Trap 1. |
| `EdgegapServerSceneLoader` (server builds only) | Trap 1: the server boots into Startup and moves straight to Deathmatch. |

The kit's `edgegap/Dockerfile` and `start-server.sh` run the server as a non-root user. They never print the environment, which holds `ARBITRIUM_DELETE_TOKEN`; the Edgegap Unity plugin's default Dockerfile ran `env` up to 3.2.1. When the server process exits on its own, the start script calls `ARBITRIUM_DELETE_URL` to stop the deployment.

## 4. A project that followed manual steps

Some written guides set up Simple FPS by editing `FusionBootstrap.cs` (session name from `ARBITRIUM_REQUEST_ID`), building the server with Deathmatch only, and editing `FusionMenuUIParty.cs`. To move such a project to the kit:
- Revert the edits to `FusionBootstrap.cs` and `FusionMenuUIParty.cs` (reimport them from the package, or undo them in git). If you keep them instead, they must include the `activeOnLoad` change from §2, and the join must not upper-case the FQDN.
- Remove any Region field added by hand, so setup doesn't leave two. Setup reuses an existing `RegionInputButton` under JoinCard.
- Then run setup. It puts Startup back in the build profile.

## 5. What the probe shows

`assets/test/EdgegapSimpleFPSTest/ConnectionTypeProbe.cs` logs every 5 seconds:

```
[probe] mode=Client CT=Direct rtt=14ms players=2 session=f68e011bfb01.pr.edgegap.net region=cae runnerScene=Deathmatch#1 loaded=Startup#0,Deathmatch#1
```

- `CT`: `runner.CurrentConnectionType`. **Direct** on Edgegap, **Relayed** in a local Docker Desktop test, **None** on the server.
- `runnerScene` must be `Deathmatch#1` on clients. `Startup#0` is trap 2.
- `loaded` lists every Unity scene. A client keeps Startup loaded underneath, which is expected.
