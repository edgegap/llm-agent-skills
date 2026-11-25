# Troubleshooting Fusion on Edgegap

## Build

| Symptom | Fix |
|---|---|
| `Unsafe code may only appear if compiling with /unsafe` right after importing BR200 | First-import ordering: reopen the project. If it stays, enable *Allow 'unsafe' Code* (the kit's builder turns it on). |
| `No Toolchain found for host platform` | Add the Linux toolchain package (`deploy.md` §1). |
| `No Linux sysroot found for x64` on Unity 6000.3 | Add `com.unity.sdk.linux-x86_64` next to `com.unity.toolchain.win-x86_64-linux`. |
| Preflight: `Add these TPSBR/Scenes scenes to the build profile` | Add the listed scenes, with `Loader` first. `Template` isn't needed. |
| Preflight: `Set ... Dedicated Server > Scripting Backend to IL2CPP` | Switch the server backend to IL2CPP (`fusion.md` §3). |
| Batch build can't open the project | The editor has it open. Close it first. |
| A Windows "client" build has `MonoBleedingEdge` and no `GameAssembly.dll` | The standalone subtarget was left on Server, or the backend is Mono. Set `subtarget = StandaloneBuildSubtarget.Player` and IL2CPP. |

## Server start

| Symptom | Fix |
|---|---|
| `Failed to bind socket to [Address Ip=<public IP> Port=7777]` | The bind address is set to an address the container doesn't own. Use `0.0.0.0` or leave IP empty (`fusion.md` §2). |
| `[edgegap-br200] error: ...` and the deployment exits | A `BR200_*` value is invalid. The line names it. |
| `ServerBuild: not found` | The image was built from another folder. Rebuild to `Builds/EdgegapServer`, or pass `SERVER_BUILD_PATH` and allow that folder in `.dockerignore`. |
| `bad interpreter` / `\r` errors | CRLF line endings. Keep the kit's `.gitattributes`. The Dockerfile also strips CRLF. |
| Deployment 424 / pull error | The app version has no registry login. Create a new version without one so `edgegap_create_app_version` sends `registry_profile: "Edgegap"` (MCP 0.17.0+), or the developer adds it in the dashboard. |

## Joining

| Symptom | Fix |
|---|---|
| `GameNotFound` | Session name, region, App Version or App ID differs from the server, or the server didn't start. Compare with the server's `photon_region=` line and its `StartGame() Result`. |
| `InvalidAuthentication` | Missing or wrong Fusion App ID in the build. |
| CT **Relayed** on Edgegap | The server binds `127.0.0.1` (BR200's old Loader setting, or `-ip 127.0.0.1`). Bind `0.0.0.0`. |
| CT **Relayed** in a local Docker test only | Expected with Docker Desktop. Test Direct on Edgegap. |
| `MethodAccessException ... CheckInvokeRpc` and no character spawns | Mono build (server or client). Use IL2CPP. |
| Each client process starts ten clients | BR200's batch default `ExtraPeers: 9`. Pass `-extraPeers 0`. |
| Players join but count as eliminated | They arrived after BR200's 120-second waiting timer. Deploy when the group is ready. |
| Server isn't in the Menu list | Wrong region in the client, or the waiting timer ran out. |
