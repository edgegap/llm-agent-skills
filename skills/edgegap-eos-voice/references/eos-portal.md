# EOS Developer Portal setup

The developer does these steps; send them as written. Epic's own guide: [Manage your clients and client policies](https://dev.epicgames.com/docs/epic-online-services/eos-fundamentals/client-and-client-policy/client-policy-guide).

## 1. IDs

1. [dev.epicgames.com/portal](https://dev.epicgames.com/portal) → left menu, under **Your Products**, click the product (click **Back to organization** first if it isn't listed). Create a product if there is none; any name works for testing.
2. Left menu → **Product Settings**. The **SDK Download & Credentials** tab shows the **Product ID**, and the **Sandbox ID** and **Deployment ID** of each sandbox. Use the Dev sandbox and its deployment for testing.

## 2. Client policies

**Clients** is a tab inside Product Settings, next to SDK Download & Credentials, not a left-menu item. Scroll to **Client policies** (accept any new agreements shown at the top first) and click **Add new client policy** twice:

| Policy | Type | User required | Features |
|---|---|---|---|
| Voice game client | `GameClient` (predefined) | checked | no Voice actions needed |
| Voice trusted server | **Create custom policy** | **unchecked** | **Voice**: `createRoomToken`, `kick`, `mute` |

Saving the trusted server policy shows "You are creating client credential without requiring a user…": expected, click **Acknowledge & Save**. That warning is the reason its secret never goes into a game build.

## 3. Clients

In the **Clients** section of the same tab, **Add new client** twice, one per policy. The list shows the client's name (whatever the developer typed, often "1") above the **Client ID**, a long string with a copy icon. Developers often mistake the name for the ID.

## 4. Where each value goes

| Value | Goes in | Ships to players? |
|---|---|---|
| Product ID, Sandbox ID, Deployment ID | `[EOSVoiceChat]` in `DefaultEngine.ini` / `UserEngine.ini` | yes (not secret) |
| Game client ID + secret | `[EOSVoiceChat]` `ClientId`, `ClientSecret` | yes, by design |
| Trusted server client ID + secret | Edgegap variables `EOS_VOICE_CLIENT_ID`, `EOS_VOICE_CLIENT_SECRET` (hidden); `UserGame.ini` `ServerClientId`/`ServerClientSecret` for a local server | **never** |
| Deployment ID (again) | Edgegap variable `EOS_VOICE_DEPLOYMENT_ID` | no |
| Game client ID (again, optional) | Edgegap variable `EOS_VOICE_GAME_CLIENT_ID`: the server then rejects ID tokens issued to other clients | no |

No identity provider setup is needed: device ID login works out of the box. To use Steam, PlayStation, Xbox or Epic accounts instead, configure an identity provider and change the credential type in `UEdgegapVoiceClientSubsystem::OnDeviceIdReady`.
