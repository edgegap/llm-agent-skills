# Prompts for Manus

Paste these in Manus one at a time, in the project chat of the game, with the `edgegap-manus` skill added to the workspace (Skills → + Add → upload the skill folder or zip, or import it from GitHub). Type `/edgegap-manus` first so Manus loads the skill. Each prompt is one phase that ends in something you can check before going on: an online game is easier to debug one layer at a time.

## 0. Manus asks for a Cloud Computer (Game Dev)

If Manus answers a multiplayer game prompt with "Online multiplayer requires a ready cloud computer...", reply in the chat with this (verified 2026-11-20):

```
can you build the game server binary so i can host it locally on my machine instead
```

then:

```
can you also build the browser client so i can test it against my server? Let me set the server address in the page (a ?server= URL parameter like ws://localhost:8787/ws or wss://myhost:port/ws), so the same client works with my local server or a server I host somewhere else.
```

Then host that server on Edgegap: `references/self-host.md`. No `/edgegap-manus` skill is needed in Manus for these two.

## 1. Plan (nothing changes yet)

```
/edgegap-manus Read this game's code and tell me how you'll take it online on Edgegap: which game rules move to the server, what the backend will do, and what you need from me. Don't change any code yet.
```

## 2. Authoritative game server

```
/edgegap-manus Move the game rules into an authoritative dedicated server in a game-server/ folder (Node.js, WebSocket, the skill's server template). The browser sends only inputs and draws server snapshots. Keep single-player working while we build it. Show me two browser tabs playing together against a local server.
```

## 3. Steam sign-in and matchmaking backend

```
/edgegap-manus Add Steam sign-in on the backend (OpenID, verified server-side) and the matchmaking endpoints from the skill: join, status, cancel and leave. The backend creates Edgegap matchmaker tickets with the game mode, region, party and the player's IP, and returns only the server address and a short-lived signed join token. Keep the matchmaker token, the Steam Web API key and the join token private key in server-side secrets. Add timeouts, cancel, reconnect, duplicate-ticket prevention and allocation error handling. Tell me which secrets to add and where.
```

## 4. Container and Edgegap

```
/edgegap-manus Add the Dockerfile and the GitHub Actions workflow that builds game-server/ and pushes it to my Edgegap registry. Then walk me through the Edgegap dashboard: app version with the WS port and TLS Upgrade, a test deployment, and the matchmaker from the skill's config.
```

## 5. End-to-end test

```
/edgegap-manus Publish the site and run the end-to-end test from the skill with two Steam accounts: both click Find Match, land on the same Edgegap server, play, reload one tab to test reconnect, then leave and check the server stopped itself.
```

## The one-shot version

If you prefer a single prompt (harder to debug when something breaks):

```
/edgegap-manus Integrate the Edgegap matchmaker into this browser game, following the skill. Keep Steam authentication on the backend and never trust Steam IDs from the browser. Create backend endpoints to join, poll, cancel and leave matchmaking. On join, check the player's Steam session, then create an Edgegap matchmaker ticket with the selected game mode, region, party and the player's public IP, and poll it until a server is assigned. Return only the server address and a short-lived signed join token to the browser. Refactor the game into an authoritative dedicated server that runs in an Edgegap container and talks to browsers over WebSocket (wss, TLS Upgrade on the port). Keep the matchmaker token, Steam Web API key and join token private key in server-side secrets. Handle timeouts, cancel, reconnect, duplicate tickets and server allocation errors. Work one phase at a time and tell me what to check after each.
```
