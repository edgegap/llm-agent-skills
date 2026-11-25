# Troubleshooting: symptom → cause → fix

Rows marked ✓ happened while building and testing the Edgegap Unreal sample. The others are the shipped code's own error messages with their cause.

| Symptom | Cause | Fix |
|---|---|---|
| Client: `EOS voice did not initialize … Check [EOSVoiceChat]` | `[EOSVoiceChat]` missing or placeholders in the engine ini. | Fill `UserEngine.ini` / `DefaultEngine.ini` (eos-portal.md §4). The plugin reads `GEngineIni`, not the game ini. |
| Server: `missing EOS server credentials or deployment ID, voice chat is off` | `EOS_VOICE_CLIENT_ID`/`SECRET` not on the app version, or `DeploymentId` still a placeholder. | Add the variables, or `EOS_VOICE_DEPLOYMENT_ID`. |
| Server: `EOS refused the server credentials` | Wrong client ID or secret. | Recheck the trusted server client. |
| Server: `room token request … failed (403)` | Trusted server policy lacks Voice `createRoomToken`, or has User required on. | Edit the policy (eos-portal.md §2). |
| Server: `rejected <puid>: token is for another EOS deployment` | Client and server use different deployment IDs. | Same Deployment ID in `[EOSVoiceChat]` and `EOS_VOICE_DEPLOYMENT_ID`. |
| Server: `rejected <puid>: token was issued to another EOS client` | `EOS_VOICE_GAME_CLIENT_ID` (or the server's `[EOSVoiceChat] ClientId`) isn't the client the game logs in with. | Fix the variable, or remove it to skip the check. |
| ✓ Client disconnects right after joining; server log: `Unable to resolve default guid from client: ObjectName: EdgegapVoiceComponent_0` | A Server RPC was sent from the component's `BeginPlay`, in the frame it replicated. Happens when the EOS login finished before the player reached the server. | The shipped component sends the RPC on the next tick. Keep that if you change it. |
| ✓ Both test clients log the same PUID, the second join fails with `ImplementationError` | Shared Windows device ID, or B started before A finished logging in. | `-EOSVoiceNewDeviceId` on B, launched after A's `logged into EOS` (testing.md §1). |
| ✓ Two matchmaking test clients end up in separate solo matches | They queued more than the first expansion delay apart: each client starts at a different speed, and B must wait for A's EOS login. | Queue both at the same wall-clock time with `-FindMatchAt` (testing.md §2). A timer set at startup isn't enough: it fired 40-60 s early during loading. |
| ✓ Clients `Connection failed` locally, server log shows `Browse: C:/Program Files/Git/Game/...` | Git Bash path conversion. | Launch from PowerShell. |
| ✓ Linux server build: `'this' argument to member function 'LowLevelGetRemoteAddress' has type 'const UNetConnection'` | Called on a const pointer. | Non-const `UNetConnection*` (as shipped). |
| ✓ Win64 build: `'EOS_Platform_GetConnectInterface': identifier not found` | Missing `eos_sdk.h`. | Include it (as shipped). |
| ✓ Packaging rebuilds the whole engine (thousands of actions) | UAT picked a newer MSVC than the one the editor was built with (VS 2026 installed next to VS 2022). | Pin the compiler for every UBT run in `%APPDATA%\Unreal Engine\UnrealBuildTool\BuildConfiguration.xml` (`<WindowsPlatform><Compiler>VisualStudio2022</Compiler><CompilerVersion>14.44.35207</CompilerVersion></WindowsPlatform>`) and pass `-nocompileeditor` to BuildCookRun when the editor is built. Stopping a run midway leaves mixed objects and forces the full rebuild anyway. |
| ✓ Dashboard won't save the version: "Invalid image, please verify your registry and container inputs" | The tag isn't pushed yet. | Push first; the dashboard checks the registry. |
| ✓ Matchmaker config: "The application configuration is not valid for profile …" | `application.version` names a version that doesn't exist yet. | Create the version first. |
| ✓ Old matchmaker URL doesn't resolve | Free-tier matchmakers stop after 3 hours. | Recreate it, update `MatchmakerUrl`/`AuthToken`. |
| Players on different teams share a room | The player's connection IP differs from the ticket's `player_ip` (ticket over IPv6, game over IPv4), or players on two teams share one public IP. | Expected fallback to the match room rather than a guess. If it matters, have your backend pass a signed team claim. |
