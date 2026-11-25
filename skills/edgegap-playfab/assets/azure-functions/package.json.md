# `assets/azure-functions/package.json`

Template file. Write the content of the code block below, without the fences, to `package.json`.

```json
{
  "name": "edgegap-playfab-bridge",
  "version": "1.0.0",
  "description": "PlayFab Azure Functions that start an Edgegap game server when PlayFab Matchmaking forms a match.",
  "main": "src/functions/*.js",
  "scripts": {
    "start": "func start",
    "test": "node --test"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@azure/functions": "^4.6.0"
  }
}
```
