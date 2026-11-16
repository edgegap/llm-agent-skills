# Troubleshooting relays

| Symptom | Cause | Fix |
|---|---|---|
| `401` or `403` on `/v1/relays/*` (lobby log, curl or the MCP relay tools) | The token is a regular API token | Create a relay profile in the dashboard (Relays) and use its token |
| `Relay state: Invalid` in the game | Wrong session token, a user token from another player, the host on the client port (or the reverse), or the player's IP is not the one authorized | Host: `ports.server` + host's token. Client: `ports.client` + its own token. Authorize the IP the relay will see (the public IP) |
| `No answer from the relay ... after 15 s` (state stays Disconnected/Checking) | Session deleted or expired, wrong address or port, outbound UDP blocked | `edgegap_get_relay_session`; check the port; try another network |
| `The host did not answer within 15 s` | Client is `Valid` but the host isn't connected (not started, quit, crashed), or the host is full | Start the host first; check `maxClients` |
| Client connects, then `Host timed out` after 5 s | The host process stopped sending: it crashed, was killed, or a debugger paused it | Check the host log; a host leaving on purpose sends Disconnect instead |
| Clients can't see each other | Relays only connect clients to the host | Forward on the host (`references/lightnet.md` §3) |
| Large messages never arrive or `exceeds the relay limit` | Over the 1200-byte MTU | Fragment reliable messages (the C# service does, up to 64 KB); keep unreliable messages ≤ 1182 bytes |
| Resends with a local emulator that should be lossless | An older emulator with `--loss` is still bound to the ports | Kill it by PID |
| `Insecure connection not allowed` from UnityWebRequest | The lobby URL is plain `http://` and not localhost; Unity's default blocks it | Serve the lobby over HTTPS, or set Player Settings > Allow downloads over HTTP |
| Works on the dev machine, friends can't join | The lobby URL is `localhost` | Deploy the lobby service and point the game at it |
| Lobby creation fails with a timeout after 30 s | The session never became `ready` | Read `error` from `GET /v1/relays/sessions/{id}`; check the IPs are public |
| Relay chosen far from the players | The session was created with a wrong IP (a private address, the server's own IP) or players from different continents | Authorize real public IPs; group players by region first |
| Sessions left open after testing | Host crashed or the lobby was killed with SIGKILL | `edgegap_list_relay_sessions`, then delete yours by exact `session_id`; keep `LOBBY_TTL_MINUTES` |
| WebGL build can't connect | Browsers have no raw UDP | Not supported by the managed relay protocol. For Mirror, FishNet, PurrNet or NGO use the LightNet relay sample's WebGL build over `wss://` (`relay-ws` port 7778, TLS Upgrade); otherwise a dedicated server with WebSockets |
