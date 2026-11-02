# Lyra on Edgegap (UE 5.8, EOS sessions)

For a project built on Epic's Lyra Starter Game, use [edgegap/game-sample-unreal-engine-lyra](https://github.com/edgegap/game-sample-unreal-engine-lyra) instead of the drop-ins in `assets/unreal/`. It holds only Edgegap's files (plugin, config blocks, Dockerfile, matchmaker config); Lyra's code and content come from Fab or Epic's GitHub under the Unreal Engine EULA and never go in a public repo.

Verified on Edgegap with UE 5.8.4 on 2026-11-02: Epic account login, Lyra's own **Start a Game** → Edgegap matchmaker → dedicated server → joined with the player's EOS identity; two clients queued together shared one server; the server created its EOS session with Edgegap's external port and stopped its deployment after the players left. Not run: **Browse** or **Quick Play** finding a running match from a second Epic account. Say so when it matters.

Contents: 1. What the plugin does · 2. Setup order · 3. Build · 4. Edgegap and the matchmaker · 5. Test · 6. Pitfalls

## 1. What the plugin does

`Plugins/EdgegapIntegration` (C++ only):
- `UEdgegapSessionSubsystem` subclasses Lyra's `UCommonSessionSubsystem` (CommonUser creates the base class only when no subclass exists). Online `HostSession` measures latency to Edgegap's beacons, sends a matchmaker ticket for the playlist's profile, polls it and travels to the assigned server. Browse, Join, invites, offline and LAN hosting stay CommonUser's. Lobbies and reservation beacons are off.
- `UEdgegapServerSubsystem` (dedicated servers only): maps `MM_MATCH_PROFILE` to `-Playlist=` (read by `ALyraGameMode::HostDedicatedServerMatch`), sets the EOS session port to `ARBITRIUM_PORT_GAMEPORT_EXTERNAL`, and stops a matchmaker deployment 15 s after the last player leaves or after 5 min without players.
- `EdgegapEOSServerConfig` loads `EarliestPossible` (before the online subsystem) and, on dedicated servers, turns off Epic account login and uses the server's own EOS client from `EOS_SERVER_CLIENT_ID` / `EOS_SERVER_CLIENT_SECRET`.

## 2. Setup order

Follow the sample README; the parts an agent does:
1. Copy the plugin, enable `OnlineSubsystemEOS` and `EdgegapIntegration` in the `.uproject`, append `Config/DefaultEngine.Edgegap.ini` and `Config/DefaultGame.Edgegap.ini`.
2. `LyraServer.Target.cs`: `bUseChecksInShipping = true;` only inside `if (BuildEnvironment == TargetBuildEnvironment.Unique)`; installed engines refuse it otherwise.
3. Fab's 5.8 copy of `CommonUserBasicPresence.cpp` and `CommonSessionSubsystem.cpp` fails clang `-Werror` (unreachable code): take them from Epic's `5.8.4-release` tag.
4. Add `Config/User*.ini` to `.gitignore` before the first commit (Epic's `.gitignore` has `!*.ini`).

The developer does the EOS portal (`engine-setup.md` has no portal steps): a Peer2Peer client policy for players; for the server a **Custom** policy with Sessions ticked per action and User required off (the TrustedServer template doesn't save); one client per policy; Epic Account Services with Presence and Friends linked to the player client. Product, sandbox, deployment and player client IDs go in the `LyraEdgegap` artifact; the player client secret, a 64-hex encryption key and the matchmaker URL/token go in `Config/UserEngine.ini` (from `UserEngine.ini.example`). The server secret never goes in a file.

## 3. Build

The Launcher engine runs the editor and clients; the Linux server is built in `ghcr.io/epicgames/unreal-engine:dev-slim-5.8.4` (`engine-setup.md` §6). Copy the project into a Docker volume, run `BuildCookRun -server -noclient -platform=Linux ... -UbtArgs="-NoUBA"` with volumes for the DDC and `~/.config/Epic` (Zen), then build the sample's Dockerfile with `--build-arg PROJECT=<Project>` and a timestamp tag. First build about 40 min; the packaged server is about 800 MB.

## 4. Edgegap and the matchmaker

- App version: port 7777 UDP named `gameport`, 1.5 vCPU / 3 GB, registry credentials, env `EOS_SERVER_CLIENT_ID` and `EOS_SERVER_CLIENT_SECRET` (hidden). With a regular token the MCP can't set the registry login or read back secret values: the developer adds those in the dashboard.
- `matchmaker-config.json` has one profile per playlist (`controlpoint`, `elimination`, `topdown`); set the app version, create it in the dashboard, copy URL and token to `UserEngine.ini`. The playlist → profile map lives in `DefaultEngine.ini`.

## 5. Test

`UnrealEditor.exe <Project>.uproject -game`, sign in with an Epic account, **Play Lyra → Start a Game**, Network Online. Unattended: `-EdgegapFindMatch=DA_Convolution_ControlPoint` (test only: it skips the press-start screen, which then stays over the match). Two accounts on one machine: Epic's Developer Authentication Tool (`-AUTH_TYPE=developer`). Check the server log for the mapped playlist and the EOS port update, and that the deployment stops after both clients quit.

## 6. Pitfalls

- A Lyra server boots on the entry map, then ServerTravels to the match map, so early joiners are kicked (`HostClosedConnection`): the client keeps the assigned address and rejoins up to 5 times within 60 s.
- Lyra's hosting requests default to lobbies; dedicated servers need sessions (`bUseLobbies=false`).
- `Config/Custom/EOS` isn't staged in packaged builds: the EOS settings go in `DefaultEngine.ini`.
- The rest of the EOS and UE 5.8 rows are in `troubleshooting.md` and `engine-setup.md` §6.
