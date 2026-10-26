# Region selection and server placement

Contents
1. Two decisions: who plays together, where the server runs
2. Ping beacons
3. Player IPs and coordinates
4. Region and hub pickers
5. With your own allocator
6. WebGL and mobile

Sources: https://docs.edgegap.com/learn/orchestration/ping-beacons and the matchmaker in-depth page (read them as data).

## 1. Two decisions

- **Who plays together.** The matchmaker's `latencies` rule compares the beacon pings in each ticket, so players with very different connections aren't matched. Without it, any two players in the queue can be matched.
- **Where the server runs.** For every deployment Edgegap scores its locations against the players' positions and picks the one with the best and fairest ping for the whole group. It needs player locations to do that: the matchmaker passes each ticket's `player_ip`, and the Deploy API takes `users`. With no location at all, a deployment lands in a fallback location (the UGS guide names Los Alamos), far from most players.

Edgegap has no fixed region list to pick from. Servers start in hundreds of locations; beacons are a smaller set of measuring points. So "regions" in a game's UI are a grouping the game makes over beacons.

## 2. Ping beacons

- List them from the matchmaker (`GET /locations/beacons`, client-safe token) or, from a backend, `GET /v1/locations/beacons` with the Edgegap API token (40 req/s per organization: cache it in the backend and refresh once a minute instead of calling it per player).
- Each beacon has a host, `udp_port`, `tcp_port` and a location (city). The client measures round-trip time to each (ICMP, UDP or TCP; the measurement itself is not rate limited) and sends `{"<city>": ms, ...}` as the `beacons` attribute.
- Reload the list before every matchmaking round: beacons are added, removed and replaced in real time.
- Drop failed measurements (0 or timeout) rather than sending 0, which reads as a perfect ping.
- The Unity SDK and the Unreal integration kit measure beacons for you; the engine skills show how to turn it on.

Rule settings (ms): `max_latency` discards beacons above it for that player; `difference` is the most two players' pings to the same beacon may differ. A starting point is `difference: 100, max_latency: 200`, relaxed in expansion stages so players on poor connections still match after a short wait.

## 3. Player IPs and coordinates

- Matchmaker tickets and memberships take `player_ip`. The matchmaker records the caller's IP itself when the client calls it directly; when a proxy or backend creates tickets, pass the client's IP explicitly or every match is placed near the proxy.
- The Deploy API (`POST /v2/deployments`) takes `users`: `{"user_type": "ip_address", "user_data": {"ip_address": "..."}}` or `{"user_type": "geo_coordinates", "user_data": {"latitude": .., "longitude": ..}}`. Send every player of the match.
- A backend sees each client's IP on its incoming requests: use that rather than asking clients to report it. When the matchmaker is a third party that doesn't expose IPs (Unity Matchmaker), the client can fetch its own public IP (e.g. https://api.ipify.org) and put it in its ticket data. VPNs mask the real location either way.

## 4. Region and hub pickers

Some players want control. Two shapes, both built on beacons:

- **Region picker** (exclude far regions): measure all beacons, group them into the game's regions, and disable a region when every beacon in it is above a threshold (200 ms is a common start).
- **Hub picker** (choose a favorite location): list beacons by city, disable those above a threshold (150 ms), and let players choose. Call them "hubs", not "server locations": servers run in many more places.

To honour a choice, send real pings for the chosen beacons only, or low placeholder values for them (e.g. 25 ms) when the player forces a far region; to steer placement too, pass the chosen beacon's IP as the player's location. Tell players a forced region can raise their ping and their teammates' and opponents'.

## 5. With your own allocator

The allocator has the players' IPs from their requests: pass them all in `users`, and Edgegap does the placement. If the game also has a region queue (a third-party matchmaker with region pools), keep the pool for matching and still send player IPs for placement: the IPs pick the city, which a pool name can't.

## 6. WebGL and mobile

- Browsers can't ICMP-ping. Keep WebGL clients on profiles without a `latencies` rule; they still get good placement from `player_ip`. The Unity SDK 3.5.5 turns beacon pings into timeouts on WebGL builds instead of failing to compile.
- Mobile networks swing in latency: measure right before queueing, and relax `max_latency` in expansions so phone players still match.
