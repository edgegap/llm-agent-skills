// Connect N WebSocket clients to a game server, send each a join message, hold for S seconds,
// then print how many messages of each type every client got. Catches the most common bug in
// AI-written servers: state snapshots that stop after the first one (players look frozen).
//
//   npm install ws   (or run from the server folder, which already has it)
//   node ws-check.cjs <ws-or-wss-url> '<join message JSON>' [clients=2] [seconds=5]
//   node ws-check.cjs wss://abc123.pr.edgegap.net:31160/ws '{"type":"join","room":"TEST1","name":"BOT"}'
//
// Expect the snapshot/state type at roughly the server's send rate × seconds for every client.
const WebSocket = require(require.resolve('ws', { paths: [process.cwd(), __dirname] }));
const [url, joinJson, n = '2', secs = '5'] = process.argv.slice(2);
if (!url || !joinJson) { console.error('usage: node ws-check.cjs <url> <join JSON> [clients] [seconds]'); process.exit(2); }
const counts = [];
const socks = Array.from({ length: Number(n) }, (_, i) => {
  counts[i] = {};
  const ws = new WebSocket(url);
  ws.on('open', () => ws.send(joinJson.replace(/"BOT"/, `"BOT${i}"`)));
  ws.on('message', (d) => { let t = 'non-json'; try { t = JSON.parse(d).type ?? JSON.parse(d).t ?? 'no-type'; } catch {} counts[i][t] = (counts[i][t] || 0) + 1; });
  ws.on('error', (e) => console.error(`client ${i}: ${e.message}`));
  return ws;
});
setTimeout(() => {
  console.log(JSON.stringify({ url, seconds: Number(secs), perClient: counts }, null, 1));
  socks.forEach((s) => s.close());
  setTimeout(() => process.exit(0), 500);
}, Number(secs) * 1000);
