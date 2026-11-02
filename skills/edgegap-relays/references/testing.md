# Testing: offline emulator, then a real relay

Contents: 1. Offline, against the emulator · 2. End to end on Edgegap · 3. Without a lobby (MCP sessions) · 4. Cleanup

The commands use the sample's built player (`RelaySample.exe`, Windows) and its flags. For another game, give it equivalent flags: host, join by code, an automated test that exits 0 or 1, and `-loss`.

## 1. Offline, against the emulator

`assets/tools/local-relay.js` speaks the relay protocol on `127.0.0.1` (server port 41000, client port 41001, session token 1000, host user token 1, client tokens 2 to 4). It accepts any IP, picks no location, and can drop packets. It tests the transport only.

```bash
node assets/tools/local-relay.js --loss 15
RelaySample.exe -batchmode -nographics -logFile host.log -relayAddress 127.0.0.1 -relayPort 41000 -sessionToken 1000 -userToken 1 -quitWhenEmpty -quitAfter 120
RelaySample.exe -batchmode -nographics -logFile c1.log -client -relayAddress 127.0.0.1 -relayPort 41001 -sessionToken 1000 -userToken 2 -e2e -expectPlayers 3
RelaySample.exe -batchmode -nographics -logFile c2.log -client -relayAddress 127.0.0.1 -relayPort 41001 -sessionToken 1000 -userToken 3 -e2e -expectPlayers 3
```

The sample's `-e2e` client sends 60 reliable messages (64 B, 3 KB every tenth, one of 20 KB) and checks that the host's echoes come back complete and in order. `-expectPlayers 3` also waits until it has seen the other client's cube, which proves host forwarding. Expected: `E2E PASS: 60/60 reliable echoes in order, avg round trip ... ms, saw cubes of players [0,2], N resends`.

Results from the sample on one Windows machine: 0% loss gave 13 to 21 ms round trips and 0 resends. With 15% loss at the emulator plus 15% in each game, and with 20% in each game, every run passed, with 0.4 to 1.3 s round trips and 22 to 51 resends.

A stale emulator still bound to the ports keeps its old `--loss`. A new one then fails to bind and exits, and the "lossless" run shows resends. Kill emulators by PID before each run.

## 2. End to end on Edgegap

```bash
cd lobby-service && npm start                                         # EDGEGAP_RELAY_TOKEN in .env
RelaySample.exe -batchmode -nographics -logFile host.log -lobby http://localhost:8080 -host -codeFile code.txt -quitWhenEmpty -quitAfter 300
RelaySample.exe -batchmode -nographics -logFile c1.log -lobby http://localhost:8080 -join <code> -e2e -expectPlayers 3
RelaySample.exe -batchmode -nographics -logFile c2.log -lobby http://localhost:8080 -join <code> -e2e -expectPlayers 3
```

What to look for:
- Lobby log: `lobby <code>: relay session <id> on <host>`, then `player 2/4 joined`, `player 3/4 joined`, and at the end `deleted relay session <id>`.
- Every game log: `Relay state: Valid` within 1-2 s.
- Host: `Client joined through the relay (connection N, handle 1)` per client, then `All clients left, closing the lobby` and `Closed lobby <code>`.
- Clients: `E2E PASS`, with the round trip through the real relay.

Not yet run against a live Edgegap relay (see the verification status in `SKILL.md`). Record the first real run's round-trip time, resend count and player count here.

## 3. Without a lobby (MCP sessions)

With the Edgegap MCP running on a relay token, the agent can open a session by hand: `edgegap_create_relay_session` with `user_ips` (the developer's public IP, host first; one entry per player). Then pass `relay.ip`, the server port and the host's token to the host, and the client port and each other user's token to the clients (`-relayAddress -relayPort -sessionToken -userToken`, `-client` for clients). Delete the session afterwards with `edgegap_delete_relay_session`.

## 4. Cleanup

- `edgegap_list_relay_sessions` (or `GET /v1/relays/sessions` with the relay token) should show none of your sessions. Delete only sessions you created, by exact `session_id`.
- Stop the lobby service with Ctrl+C: it deletes every open session it knows about.
