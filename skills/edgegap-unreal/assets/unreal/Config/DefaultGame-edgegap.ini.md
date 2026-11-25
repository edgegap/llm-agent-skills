# `assets/unreal/Config/DefaultGame-edgegap.ini`

Template file. Write the content of the code block below, without the fences, to `DefaultGame-edgegap.ini`.

```ini
; Append to Config/DefaultGame.ini. Replace <Module> with the C++ module name from <Module>.Build.cs.

[/Script/<Module>.EdgegapMatchmakerSubsystem]
; Off by default: the game behaves exactly as before until this is True.
bEnabled=False
; From the Edgegap dashboard, Matchmaker page. Keep the URL in quotes: unquoted, the ini parser cuts it at "//".
; For a public repo keep these placeholders here and put real values in Config/UserGame.ini (git-ignored).
MatchmakerUrl="YOUR_MATCHMAKER_URL"
AuthToken="YOUR_MATCHMAKER_AUTH_TOKEN"
Profile=casual
PortName=gameport
; True only if the profile has a "latencies" rule; the matchmaker rejects attributes it doesn't expect.
bSendBeaconLatencies=True
; Find Match / Cancel overlay on standalone maps. Set False once your own menu calls FindMatch.
bShowDefaultUI=True

[/Script/<Module>.EdgegapServerSubsystem]
; Only used on servers started by the matchmaker.
NoPlayerTimeoutSeconds=300
EmptyServerGraceSeconds=15
```
