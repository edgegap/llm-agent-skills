# `assets/scripts/dev-token.mjs`

Template file. Write the content of the code block below, without the fences, to `dev-token.mjs`.

```js
// Local testing only: mints a join token for a server running on this machine (no ARBITRIUM_REQUEST_ID,
// so it expects rid "local"). Needs JOIN_TOKEN_PRIVATE_KEY in the environment.
//   node dev-token.mjs 76561197960287930 [requestId]
import { createPrivateKey, randomUUID, sign } from "node:crypto";

const steamId = process.argv[2] ?? "76561197960287930";
const requestId = process.argv[3] ?? "local";
const key = createPrivateKey({ key: Buffer.from(process.env.JOIN_TOKEN_PRIVATE_KEY ?? "", "base64"), format: "der", type: "pkcs8" });
const now = Math.floor(Date.now() / 1000);
const body = Buffer.from(JSON.stringify({ v: 1, sub: steamId, tid: "local", rid: requestId, iat: now, exp: now + 300, jti: randomUUID() })).toString("base64url");
console.log(`${body}.${sign(null, Buffer.from(body), key).toString("base64url")}`);
```
