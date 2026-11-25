# `assets/unreal/Config/DefaultEngine-voice.ini`

Template file. Write the content of the code block below, without the fences, to `DefaultEngine-voice.ini`.

```ini
; Append to Config/DefaultEngine.ini. Read by the engine's EOSVoiceChat plugin in game clients.
; Product, sandbox and deployment IDs, and the GAME CLIENT's credentials: its policy has no Voice
; actions, so it is fine to ship. The trusted server's client must never go here.
; For a public repo keep these placeholders and put real values in Config/UserEngine.ini (git-ignored).

[EOSVoiceChat]
ProductId=YOUR_EOS_PRODUCT_ID
SandboxId=YOUR_EOS_SANDBOX_ID
DeploymentId=YOUR_EOS_DEPLOYMENT_ID
ClientId=YOUR_EOS_GAME_CLIENT_ID
ClientSecret=YOUR_EOS_GAME_CLIENT_SECRET
```
