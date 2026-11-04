# Platform caveats: web, native, mini-games

Only what the Cocos and platform docs state, plus what follows directly from Edgegap's addresses. None of the native or mini-game paths has been run on Edgegap.

Contents
1. Web (web-desktop, web-mobile)
2. Native (Windows, macOS, Android, iOS)
3. WeChat mini-games
4. Douyin (ByteDance) mini-games
5. What this means for Edgegap

## 1. Web

Browsers open only `wss://` from `https` pages, so the app version's port is WS with TLS Upgrade and the client connects by FQDN. Run on Edgegap with a Cocos web-desktop build (Chrome) through the Colyseus sample; web-mobile was not run.

## 2. Native

Cocos's docs: "The native environment supports the Web Standard WebSocket interface." Before Cocos Creator 3.5, `wss://` on Android and Windows needed a CA certificate file passed as the third `WebSocket` constructor argument; from 3.5 "certificates are no longer mandatory on Android" ([Cocos 3.8 manual: WebSocket on native](https://docs.cocos.com/creator/3.8/manual/en/advanced-topics/websocket.html)). The page doesn't say the same for Windows: if a Windows native build fails the TLS handshake to `wss://<fqdn>`, try passing a CA bundle (the page links curl's). Native builds can also use TCP or UDP ports (no TLS Upgrade) if the game ships no web or mini-game build.

## 3. WeChat mini-games

From WeChat's network guide ([developers.weixin.qq.com, minigame network](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/network.html), Chinese page; the English one says the translation isn't available):
- The game can talk only to domains configured in its admin console (服务器域名), `https` and `wss` only.
- No IP addresses (except LAN IPs) and no `localhost`.
- Parent domains can't be configured, only the subdomain used ("不支持配置父域名，使用子域名").
- For `wss` domains no port is configured: all ports on the domain are allowed.
- Domains must have ICP filing (ICP 备案), and the certificate must be valid, trusted and match the domain.
- WeChat DevTools has a development option that skips domain, TLS-version and certificate checks; the guide says to turn it off and test on devices.

## 4. Douyin (ByteDance) mini-games

From Douyin's network guide ([developer.open-douyin.com, mini-game network](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/network)):
- Only domains on the allowlist; requests must use HTTPS/WSS.
- The configured domain can't carry a port; all ports of an allowlisted domain are allowed.
- No IP addresses (except LAN IPs) or `localhost`; ICP filing required.
- The developer tool can temporarily skip the domain check, also in phone debug mode.
- The page doesn't address subdomains or wildcards.

## 5. What this means for Edgegap

Each Edgegap deployment gets its own hostname, `<request id>.pr.edgegap.net`, and the matchmaker has its own host. Per the rules above:
- The external port changing per deployment is fine (wss domains allow all ports on both platforms).
- The hostname changing per deployment is not: WeChat wants each subdomain configured, not the parent, and neither platform documents wildcards. An allowlist can't list hostnames that don't exist yet.
- ICP filing applies to the configured domains; whether Edgegap's domains have it is not stated anywhere checked here. Ask Edgegap before promising a mini-game launch in mainland China.

So in development (DevTools with the domain check off) a mini-game build can reach Edgegap the same way a web build does, in principle. For a release, plan a stable, ICP-filed domain of the game's own that forwards to the deployment (a WebSocket gateway or proxy the game controls), or confirm with Edgegap whether a fixed-hostname option exists. None of this was tested; say so to the developer rather than promising mini-game support.

Also check on each mini-game runtime that the matchmaker client works (`@edgegap/sdk` needs `fetch` and `AbortController`, `client.md` §4).
