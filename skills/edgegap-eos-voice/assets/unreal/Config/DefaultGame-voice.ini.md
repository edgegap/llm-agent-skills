# `assets/unreal/Config/DefaultGame-voice.ini`

Template file. Write the content of the code block below, without the fences, to `DefaultGame-voice.ini`.

```ini
; Append to Config/DefaultGame.ini. Replace <Module> with the C++ module name from <Module>.Build.cs.

[/Script/<Module>.EdgegapVoiceSettings]
; Optional EOS Voice chat, off by default. Also fill in [EOSVoiceChat] in DefaultEngine.ini.
bEnabled=False
; One voice room per matchmaker team; False puts everyone in one room per match.
bTeamRooms=True
; Name players get when logging in with an EOS device ID. EOS requires one; nobody else sees it.
DeviceIdDisplayName=Player
; For a local server only: the trusted server's EOS client. Put real values in the git-ignored
; Config/UserGame.ini, and on Edgegap use EOS_VOICE_CLIENT_ID and EOS_VOICE_CLIENT_SECRET instead.
; Never ship them in a game client.
ServerClientId=
ServerClientSecret=
```
