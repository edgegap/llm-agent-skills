# `assets/scripts/gen-join-keys.mjs`

Template file. Write the content of the code block below, without the fences, to `gen-join-keys.mjs`.

```js
// Generates the Ed25519 key pair for join tokens. Run once: node gen-join-keys.mjs
//   JOIN_TOKEN_PRIVATE_KEY -> Manus backend secret (server-side env var). Never in the browser or the image.
//   JOIN_TOKEN_PUBLIC_KEY  -> env var on the Edgegap app version. Not a secret.
// The developer runs this in their own terminal and pastes each value where it belongs,
// so the private key never passes through a chat.
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
console.log("JOIN_TOKEN_PRIVATE_KEY=" + privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"));
console.log("JOIN_TOKEN_PUBLIC_KEY=" + publicKey.export({ type: "spki", format: "der" }).toString("base64"));
```
