# Troubleshooting Simple FPS on Edgegap

General Fusion symptoms (CT Relayed on Edgegap, `Failed to bind socket`, `MethodAccessException` on Mono, App ID or App Version mismatches) are in the `edgegap-fusion` skill's troubleshooting reference. These are the ones specific to Simple FPS.

| Symptom | Cause | Fix |
|---|---|---|
| Clients join (the server counts them) but throw `NullReferenceException` at `SimpleFPS.Player.FixedUpdateNetwork` every tick, and the player can't move | Trap 1 or 2 in `simplefps.md` §2: the server built with only Deathmatch, or the scene isn't active on load on clients | Run the kit's setup and build the server with both scenes. The probe must show `runnerScene=Deathmatch#1` on clients. |
| Probe on a client: `runnerScene=Startup#0 loaded=Startup#0,Deathmatch#1` | Trap 2 | The server must register the scene with `activeOnLoad: true` (`EdgegapFusionBootstrap` does). |
| Probe on a client: `loaded=Startup#0` only, or a scene other than Deathmatch | Trap 1: server and client build indices differ | Same scene list in both builds: Startup (0), Deathmatch (1). |
| Join fails with GameNotFound, or the client waits on "Connecting" | The region typed doesn't match the server's, or the FQDN is wrong | Use the `photon_region=` value from the server's `[edgegap-simplefps] server started` line. Set `PHOTON_REGION` on the version or deployment to make it predictable. |
| The code field turns the FQDN into capitals, or a join with a correct FQDN still fails | The stock party join upper-cases the code, and the field may show AllCaps | Use `EdgegapPartyMenu` (setup swaps it in). Setup also turns AllCaps off. |
| "The session code '...' is not a valid session code" | The stock `FusionMenuUIParty` is still on the Party menu | Run setup. Check that the component on `PhotonMenuViewPartyMenu` is `EdgegapPartyMenu`. |
| Typing stops after 8 characters in the code field | The field still has the party-code limit | Run setup (limit 30). The Region field's limit is 4. |
| The server container starts but never logs `server started` | It sits in the Startup menu: the server-only scene loader isn't in the build, or the build isn't the Server subtarget | `edgegap-build.txt` must say `subtarget=Server`, and `Assets/EdgegapSimpleFPS/EdgegapServerSceneLoader.cs` must be in the project. |
| A client logs `[join] the Region field is not assigned` | Setup wasn't run, or ran before the kit compiled | Run `scripts/build.sh setup` again. |
| `No Linux sysroot found for x64` | `com.unity.sdk.linux-x86_64` is missing, or another editor was starting at the same time | `deploy-and-test.md` §1. |
| Deployment logs show `ARBITRIUM_DELETE_TOKEN` | The image was built with the Edgegap plugin's default Dockerfile from 3.2.1 or older, which runs `env` | Use the kit's `edgegap/Dockerfile` (the plugin's **Path To Dockerfile**). |
| Local test: CT Relayed | Docker Desktop NAT | Expected locally. Check CT on Edgegap. |
