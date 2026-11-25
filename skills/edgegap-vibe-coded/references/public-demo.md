# A public demo that stays up

A vibe-coded game often ends up on a public page (GitHub Pages, itch.io, the AI tool's own hosting) with a Play online button anyone can press. The shape that keeps cost proportional to play: **the matchmaker runs all the time, every game server is short-lived.**

## 1. Servers that stop fast

Set on the app version (all read by the `edgegap-threejs` room, `server.md` §3 and §7):

| Setting | Value | Why |
|---|---|---|
| `REQUIRE_TICKET` | `1` | Only players the matchmaker sent can join, so nobody keeps a server alive by connecting to its address directly. |
| `FIRST_JOIN_TIMEOUT_S` | `45` | Matched players who never connect (closed the tab while the server booted). |
| `EMPTY_TIMEOUT_S` | `10` | Everyone left. |
| `IDLE_TIMEOUT_S` | `75` | Closed tabs can keep their WebSocket open for minutes; a client that sends nothing at all (no input, no heartbeat) gets disconnected. The page must send a heartbeat from a timer (`net.js` in `edgegap-threejs` does, every 5 s): hidden tabs send no input, and without it a player who switched tabs is dropped. |
| `RESULTS_SECONDS` | `8` | Results screen, then stop. |
| Restart policy | `never` | A crashed match should end, not restart half-played. |
| Max duration | 30 minutes | The backstop if everything above fails. |

Measured on Edgegap (Thin Ice Tussle, 2026-11-04): a match both players left stopped about 12 s later; a match left in two background tabs stopped at 48 s; a finished match stopped about 11 s after its end.

Tell the developer what still costs money when nobody plays: the matchmaker. Deployments cost only while they run.

## 2. Tier limits to say before launch

- **Free tier:** the matchmaker stops about 3 hours after each start (the Thin Ice Tussle one stopped resolving in DNS at that point), and one deployment can run at a time, so a second pair of players waits or fails. Fine for a test with friends, not for a link posted publicly.
- A matchmaker that must stay up, and several matches at once, need a paid tier. Point the developer to the pricing page rather than quoting prices.
- After the matchmaker is stopped and started again, check that the URL and Auth Token in the page's `config.js` still match the dashboard.

## 3. Abuse and caps

The Edgegap matchmaker has no setting for a maximum number of concurrent deployments, and no per-IP or per-player ticket limit. Server Browser has a minimum number of instances but no maximum. If the developer wants "at most 2-3 servers at once":
- Say it is not a matchmaker setting.
- The option is a small gate service in front of the matchmaker (a Cloudflare Worker or similar holding the matchmaker token, counting live deployments and rate-limiting by IP). It changes where the page sends tickets. Offer it; don't build it unless asked.
- Without a gate, the protections are the quick-stop settings above and `REQUIRE_TICKET=1`.

## 4. The page

- Put every page origin in the matchmaker's `allowed_cors_origins` (localhost for testing, the public host). A missing origin shows as a CORS error on Find Match.
- Play online up front, solo one click away. A queue timer and Cancel, so waiting never looks frozen; a lone player is matched with bots after the expansion delay (20 s in the samples).
- A splash page can run a bots-only match behind the menu with the shared rules file: it costs nothing and shows the game before anyone presses a button.
- A contact or feedback link if the demo is for a company.
- The matchmaker's client Auth Token sits in the page by design (it gives no account access). The Edgegap API token, registry credentials and CI secrets never do.

## 5. Going public

Before making the repo public: run a secret scanner over the whole history (`gitleaks detect`). The only expected hit is the matchmaker client token in `client/config.js`. GitHub Pages on a private repo isn't available on every GitHub plan, so making the repo public may have to come first.

After it is live: two players on two different networks (a phone on mobile data and a laptop is enough), then `edgegap_list_deployments` once nobody is playing to confirm nothing is left running.
