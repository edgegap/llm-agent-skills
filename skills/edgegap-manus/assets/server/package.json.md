# `assets/server/package.json`

Template file. Write the content of the code block below, without the fences, to `package.json`.

```json
{
  "name": "game-server",
  "private": true,
  "type": "module",
  "description": "Authoritative dedicated server for the browser game, run on Edgegap.",
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "node src/server.mjs"
  },
  "dependencies": {
    "ws": "8.18.3"
  }
}
```
