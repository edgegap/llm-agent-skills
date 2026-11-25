# `assets/server/edgegap-deploy.mjs`

Template file. Write the content of the code block below, without the fences, to `edgegap-deploy.mjs`.

```js
#!/usr/bin/env node
// Start one Edgegap deployment of a game server near you (direct mode, no matchmaker) and print the URL clients connect to.
// Runs on your machine or backend only: EDGEGAP_API_TOKEN controls your whole Edgegap organization,
// so it never goes into a game client or the server image.
//
//   EDGEGAP_API_TOKEN=<token> node edgegap/deploy.mjs <app> <version> [player IP ...]
//   EDGEGAP_API_TOKEN=<token> node edgegap/deploy.mjs --stop <request_id>
//
// Without player IPs, your own public IP is used, so the server is placed near you.

const API = "https://api.edgegap.com";
const raw = process.env.EDGEGAP_API_TOKEN;
if (!raw) fail("Set EDGEGAP_API_TOKEN (dashboard: User Settings > Tokens).");
const headers = {
  Authorization: raw.startsWith("token ") ? raw : `token ${raw}`,
  "Content-Type": "application/json",
};

const args = process.argv.slice(2);
if (args[0] === "--stop") {
  if (!args[1]) fail("Usage: --stop <request_id>");
  const res = await fetch(`${API}/v1/stop/${encodeURIComponent(args[1])}`, { method: "DELETE", headers });
  console.log(res.ok || res.status === 410 ? `Stopping ${args[1]}` : `Stop failed: HTTP ${res.status} ${await res.text()}`);
  process.exit(res.ok || res.status === 410 ? 0 : 1);
}

const [app, version, ...ips] = args;
if (!app || !version) fail("Usage: node edgegap/deploy.mjs <app> <version> [player IP ...]");
if (ips.length === 0) ips.push((await (await fetch("https://api.ipify.org")).text()).trim());

const res = await fetch(`${API}/v2/deployments`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    application: app,
    version,
    users: ips.map((ip) => ({ user_type: "ip_address", user_data: { ip_address: ip } })),
    tags: [app, "direct"],
  }),
});
if (!res.ok) fail(`Deploy failed: HTTP ${res.status} ${await res.text()}`);
const { request_id } = await res.json();
console.log(`Deployment ${request_id} starting near ${ips.join(", ")}...`);

for (let delay = 2000; ; delay = Math.min(delay * 1.5, 10000)) {
  await new Promise((r) => setTimeout(r, delay));
  const s = await (await fetch(`${API}/v1/status/${request_id}`, { headers })).json();
  if (s.error) fail(`Deployment ${request_id} failed: ${s.error_detail ?? s.current_status}`);
  if (!s.running) continue;
  const port = s.ports?.gameport?.external;
  const url = `wss://${s.fqdn}:${port}`;
  console.log(`
Ready in ${s.location?.city ?? "?"}, ${s.location?.country ?? "?"}: ${url}

  Play: open the game page with ?server=${encodeURIComponent(url)}

The server stops itself after the match, or when everyone has left. Stop it now with:
  node edgegap/deploy.mjs --stop ${request_id}`);
  break;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
```
