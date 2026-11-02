# Backend: relay sessions, the lobby service, deploying it

Contents: 1. The Relay API · 2. Who calls what · 3. The lobby service · 4. Deploying the lobby service · 5. Security

## 1. The Relay API

Base `https://api.edgegap.com`, header `Authorization: token <relay token>`. The token comes from a **relay profile** in the dashboard (Relays). A regular API token is refused (`401`/`403`).

| Call | Body | Returns |
|---|---|---|
| `POST /v1/relays/sessions` | `{"users":[{"ip":"<host public IP>"}], "webhook_url": optional, "filters": optional}` | `session_id`, `ready: false` at first |
| `GET /v1/relays/sessions/{session_id}` | | Once `ready: true`: `authorization_token` (the session token), `relay {ip, host, ports {server {port}, client {port}}}`, `session_users [{ip_address, authorization_token}]` |
| `POST /v1/relays/sessions:authorize-user` | `{"session_id":"...","user_ip":"<joiner public IP>"}` | `session_user {ip_address, authorization_token}` |
| `POST /v1/relays/sessions:revoke-user` | `{"session_id":"...","authorization_token":<user token>}` | Kicks one player |
| `DELETE /v1/relays/sessions/{session_id}` | | `204` |
| `GET /v1/relays/sessions` | | Open sessions (find leftovers) |

- The relay is picked from the users' IPs, so the first call needs real public IPs. Group players by region before creating sessions; one far-away player pulls the relay away from the rest.
- `ready` usually turns true within a few seconds. Poll every second, with a 30 s limit (`webhook_url` is the push alternative).
- Tokens are unsigned 32-bit integers. Carry them as numbers (`long`/`uint` in C#; JavaScript numbers are fine).
- Sessions bill while open. Delete them when the match ends.

The Edgegap MCP has the same calls for tests (`edgegap_create_relay_session`, `edgegap_authorize_relay_user`, `edgegap_get_relay_session`, `edgegap_list_relay_sessions`, `edgegap_revoke_relay_user`, `edgegap_delete_relay_session`). They only work when the MCP runs with a relay token; with an API token they return 403.

## 2. Who calls what

- **Backend** (lobby, matchmaker, game backend): holds the relay token and makes every call above. It returns to each player: relay address (prefer `relay.ip`; `relay.host` also works), the port for its role, the session token, and its own user token.
- **Host game**: connects to `relay.ip : ports.server.port` with the session token and the host's user token.
- **Client game**: connects to `relay.ip : ports.client.port` with the session token and its own user token.
- **Never** put the relay token in the game: anyone could open sessions on the account.

A player's IP is the address the backend sees on the request. That's why the backend, not the game, should determine it: a game asking `api.ipify.org` and sending the answer could claim any IP.

## 3. The lobby service

`assets/lobby-service/server.js` is one dependency-free Node 18+ file (built and run on Node 22).

| Endpoint | |
|---|---|
| `POST /lobbies` `{"max_players":4}` | Creates the relay session with the caller's IP, waits for `ready`, returns `code` (6 letters), `host_secret`, `session_id`, `relay_ip`, `relay_host`, `relay_port` (server port), `session_token`, `user_token`. |
| `POST /lobbies/{code}/join` | Authorizes the caller's IP, returns the same fields with the client port. Codes are case-insensitive. `404` unknown, `409` full. |
| `GET /lobbies/{code}` | Player count only. |
| `DELETE /lobbies/{code}` + `X-Host-Secret` | Deletes the session. `403` without the right secret. |
| `GET /health` | |

Env (from the process or `lobby-service/.env`): `EDGEGAP_RELAY_TOKEN` (required), `PORT` (8080), `TRUST_PROXY` (`1` to use `X-Forwarded-For`), `LOBBY_TTL_MINUTES` (120: lobbies older than that are closed and their sessions deleted), `MAX_PLAYERS_LIMIT` (16), `EDGEGAP_API_URL` (to point at a mock in tests). On SIGINT/SIGTERM it deletes every open session.

**Local development**: a request from `127.0.0.1` or a private address gets this machine's public IP (looked up once from api.ipify.org), because that is the address the relay will see from players on this machine and LAN.

To put the same logic in an existing backend, the three functions to port are `createRelaySession` (POST, then poll GET until ready), the `authorize-user` call in `joinLobby`, and `deleteRelaySession`.

## 4. Deploying the lobby service

Any host that runs a container or Node and serves HTTP: `docker build -t relay-lobby assets/lobby-service`, then run it with `EDGEGAP_RELAY_TOKEN` as a secret env var. Requirements:
- It must see the players' public IPs. Behind a load balancer, proxy or CDN, set `TRUST_PROXY=1` and make sure the proxy sets `X-Forwarded-For`.
- One instance only, since lobbies live in memory. For more, move the lobby map to Redis or a database.
- HTTPS in production (UnityWebRequest blocks plain HTTP on some platforms by default).

## 5. Security

The sample service is for development and small playtests. For production add:
- Player authentication (Steam, platform, your accounts) before creating or joining lobbies, and a per-player lobby limit. Otherwise anyone can open billable sessions.
- Rate limits per IP.
- Revoking a kicked player with `sessions:revoke-user`.
- The host secret is the only thing that lets a client close a lobby. Keep it in memory on the host, never in logs.
