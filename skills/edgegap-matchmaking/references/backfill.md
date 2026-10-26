# Backfill: new players on running servers

Contents
1. When to use it
2. The ticket side
3. The API
4. The server loop
5. Shutdown
6. Edge cases

Verified end to end on Edgegap with the Megacity Metro sample (Unity Netcode for Entities, `EdgegapBackfillSystem.cs` in https://github.com/edgegap/netcode-game-sample-unity-dots-ecs-mobile-megacity-metro, Edgegap Unity SDK 3.5.5, 2026-10-21): two clients matched, a third queued later went from `SEARCHING` straight to `HOST_ASSIGNED` on the same deployment and joined, and the server closed its backfills before stopping. Unity projects can use that file or the SDK's `MatchmakingBackfill` sample. The TypeScript loop below follows the same logic for other engines and was not run as written.

## 1. When to use it

- Drop-in games: large lobbies, co-op, survival, social spaces. Players who queue while a server has room join it.
- Replacing leavers or no-shows in a match that has started.
- Filling running servers before paying for new ones.

Not for persistent worlds that players browse (Server Browser) or for matches whose teams must stay fixed once started.

## 2. The ticket side

The profile gets an `intersection` rule named `backfill_group_size` with `overlap: 1`, and every ticket must carry the attribute (tickets without it are rejected with 400):

| Who | Value | Means |
|---|---|---|
| Solo player | `["new", "1"]` | a new match, or one seat on a running server |
| Party of 3 | `["new", "3"]` | a new match, or three seats together |
| A player who only wants a game in progress | `["1"]` | backfill only |
| The server, with 3 free seats | `["3", "2", "1"]` | any group of up to 3 |
| The server, with 1 free seat | `["1"]` | one solo player |

Backfills ignore `player_count` and always match exactly one group. A profile with `min_team_size: 999999` matches only against backfills, which suits a separate "join a game in progress" queue.

Clients need nothing else: a backfilled player polls the same membership and sees `HOST_ASSIGNED` with the running server's address, then connects as usual and sends its ticket ID.

## 3. The API

Calls go to the matchmaker URL with `Authorization: <matchmaker auth token>`. The server needs that URL and token (app version env vars, `is_hidden` for the token is fine). They are the matchmaker's client-safe values, never the Edgegap API token.

`POST /backfills`:
```json
{
  "profile": "casual",
  "attributes": {
    "assignment": {
      "request_id": "f68e011bfb01",
      "fqdn": "f68e011bfb01.pr.edgegap.net",
      "public_ip": "192.0.2.14",
      "ports": { "gameport": { "internal": 7777, "external": 31504, "link": "f68e011bfb01.pr.edgegap.net:31504", "protocol": "UDP" } },
      "location": { "city": "Montreal", "country": "Canada", "continent": "North America", "administrative_division": "Quebec", "timezone": "America/Toronto" }
    }
  },
  "tickets": {
    "c3d057h5h6f7j889fk43": {
      "id": "c3d057h5h6f7j889fk43",
      "created_at": "2026-10-21T13:38:05.251393+00:00",
      "player_ip": "198.51.100.23",
      "group_id": "<group id>",
      "attributes": { "backfill_group_size": ["3", "2", "1"] }
    }
  }
}
```

- `profile`: the profile to match in, usually `MM_MATCH_PROFILE`.
- `assignment`: what new players receive. Build it from the deployment's own variables: `request_id` from `ARBITRIUM_REQUEST_ID`, `public_ip` from `ARBITRIUM_PUBLIC_IP`, `ports` from the `ports` object in `ARBITRIUM_PORTS_MAPPING` (JSON), `location` from `ARBITRIUM_DEPLOYMENT_LOCATION` (JSON), and `fqdn` = `<request_id>.pr.edgegap.net`. Fill a missing `link` with `<fqdn>:<external>`. This is what the Edgegap Unity SDK does.
- `tickets`: at least one ticket of a player on this server, from `MM_TICKET_<id>` or an earlier backfill's `assigned_ticket`, with every attribute the profile requires and `backfill_group_size` replaced by the sizes the server has room for. These tickets are how the new group is checked against the profile's rules (latency, skill, mode), so use real players' tickets.

Responses (`POST` and `GET /backfills/{id}`) return `id`, `profile`, `tickets`, `status` and `assigned_ticket`. While waiting, `assigned_ticket` is `null`. When a group matched, `status` is `ASSIGNED` and `assigned_ticket` holds the new player's ticket (`id`, `player_ip`, `group_id`, `attributes`, `status: HOST_ASSIGNED`). `DELETE /backfills/{id}` closes one. A `404` means it expired or was removed.

## 4. The server loop

```typescript
// Runs only on matchmaker deployments (MM_MATCH_PROFILE set). Engine-agnostic sketch, not run as written.
const MM = process.env.MATCHMAKER_URL!, AUTH = process.env.MATCHMAKER_TOKEN!;
const MAX_PLAYERS = 16, MAX_OPEN = 3, GRACE_MS = 60_000;

type Seat = { ticket: Ticket; connectedAs?: string; assignedAt: number };
const seats = new Map<string, Seat>();          // ticket id -> seat (matched or backfilled)
const open = new Set<string>();                 // backfill ids
let stopping = false;

for (const id of JSON.parse(process.env.MM_TICKET_IDS!))
  seats.set(id, { ticket: JSON.parse(process.env[`MM_TICKET_${id}`]!), assignedAt: Date.now() });

async function tick(assignment: Assignment) {   // every ~2 s
  if (stopping) return;
  for (const [id, s] of seats)                  // matched players who never came
    if (!s.connectedAs && Date.now() - s.assignedAt > GRACE_MS) seats.delete(id);

  const free = MAX_PLAYERS - seats.size;        // connected + on their way
  const want = seats.size === 0 ? 0 : Math.min(free, MAX_OPEN);   // needs one real ticket
  while (open.size < want) open.add(await createBackfill(assignment, free));
  while (open.size > want) await deleteBackfill(first(open));

  for (const id of [...open]) {
    const r = await fetch(`${MM}/backfills/${id}`, { headers: { Authorization: AUTH } });
    if (r.status === 404) { open.delete(id); continue; }              // expired: reopened next tick
    const b = await r.json();
    if (b.status === "ASSIGNED" && b.assigned_ticket) {
      open.delete(id);
      seats.set(b.assigned_ticket.id, { ticket: b.assigned_ticket, assignedAt: Date.now() });
    }
  }
}

function createBackfill(assignment: Assignment, free: number) {
  const sizes = Array.from({ length: Math.min(free, 4) }, (_, i) => String(Math.min(free, 4) - i)); // ["4","3","2","1"]
  const tickets = Object.fromEntries([...seats].slice(0, 8).map(([id, s]) =>
    [id, { ...s.ticket, attributes: { ...s.ticket.attributes, backfill_group_size: sizes } }]));
  return post(`${MM}/backfills`, { profile: process.env.MM_MATCH_PROFILE, attributes: { assignment }, tickets })
    .then(b => b.id);
}

// On connect: the client sends its ticket id; mark seats.get(id).connectedAs = connectionId.
// On disconnect: seats.delete(ticketId) frees the seat; the next tick opens a backfill for it.
```

Choices worth explaining to the developer:
- **A few open backfills, not one per seat.** Each can seat one group; three in parallel fill quickly without flooding the matchmaker (create-backfill is the tightest rate limit: 5/s on free tier).
- **Count players on their way as taken.** A matched or backfilled player needs seconds to connect. Without this the server oversells seats.
- **Reopen on expiry.** Backfills live for `ticket_expiration_period` (30 s in the pack's configs); the loop simply opens a new one when a poll returns 404 or a cancelled or expired status.
- **Large parties:** limit the sizes the server offers to the party sizes the game allows, and to the free seats on one team for team games (one backfill per team missing players).

## 5. Shutdown

Delete every open backfill before the server stops itself, then stop the deployment. A backfill left open keeps sending players to a server that no longer exists, until it expires.

- Game end or empty server: set `stopping`, delete all open backfills (wait a few seconds for the responses), then call `ARBITRIUM_DELETE_URL`.
- External stop (dashboard, API, max duration): the container gets SIGTERM. Handle it and delete backfills if the engine lets you. The Unity Linux player exits on SIGTERM without running `OnDestroy`, so its backfills linger until they expire; that player's connection times out and the next Find Match works.

## 6. Edge cases

| Situation | Handling |
|---|---|
| A joining player sends a ticket ID the server wasn't given | reject, or admit and log (Megacity admits them: the seat may have expired a moment earlier) |
| A backfill is `ASSIGNED` while the server is stopping | the player is sent to a closing server; log it. Closing backfills first keeps this rare |
| Every original player left | no real ticket left to send: stop opening backfills and let the server stop |
| Create returns 429 | back off a few seconds; don't retry in a tight loop |
| Create returns 400 | a required rule attribute is missing from the tickets sent (e.g. `beacons` on a latency profile): copy the full attributes from the injected tickets |
