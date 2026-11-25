# Testing

## 1. Local: dedicated server and two clients on one PC

Prerequisites: `UserEngine.ini` and `UserGame.ini` filled (Phase 3), editor target built.

```powershell
$E = "<UE>\Engine\Binaries\Win64\UnrealEditor.exe"; $P = "<path>\<Project>.uproject"
Start-Process $E -ArgumentList "`"$P`" /Game/<Maps>/<ServerMap> -server -log -abslog=`"$env:TEMP\server.log`""
# wait for "Load map complete" in server.log
Start-Process $E -ArgumentList "`"$P`" 127.0.0.1:7777 -game -windowed -resx=640 -resy=360 -abslog=`"$env:TEMP\clientA.log`" `"-ExecCmds=EOSVoiceChat.FakeAudioInputEnabled 1`""
# wait for "Voice: joined room" in clientA.log
Start-Process $E -ArgumentList "`"$P`" 127.0.0.1:7777 -game -windowed -resx=640 -resy=360 -EOSVoiceNewDeviceId -abslog=`"$env:TEMP\clientB.log`""
```

- Launch from **PowerShell**, not Git Bash: Git Bash rewrites `/Game/...` into `C:/Program Files/Git/Game/...`, the server loads the wrong map and clients get `Connection failed`. `MSYS_NO_PATHCONV=1` fixes that but breaks `cmd //c start`.
- A device ID belongs to the Windows user, so both clients would be the same EOS player. `-EOSVoiceNewDeviceId` makes client B a new one (a new EOS user on every launch: tests only). Start B only after A has logged in: B deletes and recreates the shared device ID, and if A is still logging in, A picks up B's new ID and both join as one player (the second join fails with `ImplementationError`).
- `EOSVoiceChat.FakeAudioInputEnabled 1` makes A send a test signal (non-shipping builds), so nobody has to talk.

Expected logs (`LogEdgegapVoice`):

| Where | Line |
|---|---|
| server | `Voice: trusted voice server ready, match room <id>` |
| clients | `Voice: logged into EOS as <puid>`: two **different** PUIDs |
| server | `Voice: <puid> gets room <room>`, once per player |
| clients | `Voice: joined room <room>`, then `Voice: <other puid> joined room <room>` |
| client B | `Voice: <A's puid> started talking in room <room>` |
| server, after closing B | `Voice: removed <B's puid> from <room> (204)` |

`VoiceMute` in a client console logs `Voice: microphone muted`.

## 2. On Edgegap

1. Package the Linux server (`edgegap-unreal`), `docker build --platform linux/amd64`, push a **new tag**.
2. App version for that tag with the `EOS_VOICE_*` variables (eos-portal.md §4). Check that `edgegap_list_app_versions` shows the new tag in `image`: a duplicated version keeps the old tag until someone changes it.
3. Matchmaker profile `application.version` → the new version. The server finds each player's team by matching their connection IP to the tickets' `player_ip`, so two clients on one PC (one public IP) show a single `-team-<id>` room with a one-team profile, and fall back to the match room with a two-team profile. Seeing two teams in separate rooms needs clients on two different networks.
4. Clients: matchmaker `bEnabled=True` with the matchmaker's URL and token, voice `bEnabled=True`. The two clients must queue within the profile's first expansion delay (10 s in the sample's `casual`) or each gets a solo match, but B can only start after A has logged into EOS. `-FindMatch` can't satisfy both, and typing into the windows takes over the developer's desktop. Add a wall-clock queue time where the matchmaker reads `-FindMatch` (the sample's PlayerController, or `UEdgegapMatchmakerSubsystem` in the `edgegap-unreal` drop-in), with an `FTimerHandle QueueTimer` member:

   ```cpp
   // -FindMatchAt=<unix time>: queue at that moment, so clients that start at different speeds queue together.
   int64 QueueAt = 0;
   if (!bAutoQueued && FParse::Value(FCommandLine::Get(), TEXT("FindMatchAt="), QueueAt))
   {
       bAutoQueued = true;
       // Compare with the wall clock: a plain timer set at startup fired 40-60 s early in our run.
       GetGameInstance()->GetTimerManager().SetTimer(QueueTimer, FTimerDelegate::CreateWeakLambda(this, [this, QueueAt]()
       {
           if (FDateTime::UtcNow().ToUnixTimestamp() >= QueueAt)
           {
               GetGameInstance()->GetTimerManager().ClearTimer(QueueTimer);
               FindMatch();
           }
       }), 0.5f, true);
   }
   ```

   Then: `$T = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 120`; start A with `-FindMatchAt=$T` and fake audio; when A logs `Voice: logged into EOS`, start B with `-FindMatchAt=$T -EOSVoiceNewDeviceId`.
5. `edgegap_get_deployment_logs`: `trusted voice server ready, match room <MM_MATCH_ID>`, `gets room` per player (with `-team-<id>` when the profile has teams), and after a client quits `removed … (204)`. Client logs as in §1.
6. `edgegap_list_deployments`: the deployment stops itself after the players leave (`edgegap-unreal` self-stop); stop it otherwise.
