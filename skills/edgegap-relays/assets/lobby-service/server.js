// Minimal lobby service for the LightNet + Edgegap relay sample.
//
// It holds the Edgegap relay token (never ship it in the game), creates one relay session
// per lobby with the host's public IP, authorizes each joining player's IP, and hands every
// player the relay address and tokens their game needs. Node 18+, no dependencies.
//
//   POST   /lobbies                -> host: create lobby + relay session
//   POST   /lobbies/:code/join     -> client: authorize on the lobby's relay session
//   GET    /lobbies/:code          -> lobby info (no tokens)
//   DELETE /lobbies/:code          -> host (X-Host-Secret): close lobby + delete relay session
//   GET    /health

'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

loadDotEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 8080);
const API_URL = (process.env.EDGEGAP_API_URL || 'https://api.edgegap.com').replace(/\/$/, '');
const RELAY_TOKEN = (process.env.EDGEGAP_RELAY_TOKEN || '').trim();
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const LOBBY_TTL_MINUTES = Number(process.env.LOBBY_TTL_MINUTES || 120);
const MAX_PLAYERS_LIMIT = Number(process.env.MAX_PLAYERS_LIMIT || 16);
const READY_TIMEOUT_MS = 30000;

if (!RELAY_TOKEN) {
  console.error('EDGEGAP_RELAY_TOKEN is not set (environment or lobby-service/.env). ' +
    'Relay sessions need a relay profile token from the Edgegap dashboard; a regular API token gets 401/403.');
  process.exit(1);
}

/** code -> { code, hostSecret, sessionId, maxPlayers, players: [{ip, token, role}], relay, sessionToken, createdAt } */
const lobbies = new Map();
let publicIpCache = null;

// ------------------------------------------------------------------ Edgegap API

async function edgegap(method, urlPath, body) {
  const res = await fetch(API_URL + urlPath, {
    method,
    headers: {
      Authorization: RELAY_TOKEN.toLowerCase().startsWith('token ') ? RELAY_TOKEN : `token ${RELAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const err = new Error(`Edgegap ${method} ${urlPath} -> ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function createRelaySession(hostIp) {
  const created = await edgegap('POST', '/v1/relays/sessions', { users: [{ ip: hostIp }] });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const session = await edgegap('GET', `/v1/relays/sessions/${created.session_id}`);
    if (session.ready && session.relay) return session;
    if (session.error) throw new Error(`Relay session ${created.session_id} failed: ${session.error}`);
    await sleep(1000);
  }
  await deleteRelaySession(created.session_id);
  throw new Error(`Relay session ${created.session_id} was not ready after ${READY_TIMEOUT_MS / 1000}s`);
}

async function deleteRelaySession(sessionId) {
  try {
    await edgegap('DELETE', `/v1/relays/sessions/${sessionId}`);
    console.log(`deleted relay session ${sessionId}`);
  } catch (e) {
    if (e.status !== 404) console.warn(`could not delete relay session ${sessionId}: ${e.message}`);
  }
}

// ------------------------------------------------------------------ helpers

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function isPrivate(ip) {
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80)/i.test(ip);
}

async function ownPublicIp() {
  if (!publicIpCache) {
    const res = await fetch('https://api.ipify.org');
    publicIpCache = (await res.text()).trim();
  }
  return publicIpCache;
}

// The relay picks its location from the players' public IPs and only accepts authorized ones.
// When the lobby runs on your own machine (local dev), players reach it from a private or
// loopback address, so use this machine's public IP: you and your LAN share it.
async function playerIp(req) {
  let ip = req.socket.remoteAddress || '';
  if (TRUST_PROXY && req.headers['x-forwarded-for']) {
    ip = String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  ip = ip.replace(/^::ffff:/, '');
  if (isPrivate(ip)) ip = await ownPublicIp();
  return ip;
}

function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
  } while (lobbies.has(code));
  return code;
}

function ticket(lobby, player, extra) {
  return {
    code: lobby.code,
    session_id: lobby.sessionId,
    role: player.role,
    relay_ip: lobby.relay.ip,
    relay_host: lobby.relay.host,
    relay_port: player.role === 'host' ? lobby.relay.ports.server.port : lobby.relay.ports.client.port,
    session_token: lobby.sessionToken,
    user_token: player.token,
    ...extra,
  };
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10000) throw Object.assign(new Error('body too large'), { status: 413 });
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function closeLobby(lobby, reason) {
  lobbies.delete(lobby.code);
  console.log(`lobby ${lobby.code} closed (${reason})`);
  await deleteRelaySession(lobby.sessionId);
}

// ------------------------------------------------------------------ routes

async function hostLobby(req, res) {
  const body = await readJson(req);
  const maxPlayers = Math.max(2, Math.min(MAX_PLAYERS_LIMIT, Number(body.max_players) || 4));
  const ip = await playerIp(req);
  const session = await createRelaySession(ip);
  const host = session.session_users[0];
  const lobby = {
    code: newCode(),
    hostSecret: crypto.randomBytes(16).toString('hex'),
    sessionId: session.session_id,
    sessionToken: session.authorization_token,
    relay: session.relay,
    maxPlayers,
    players: [{ ip: host.ip_address, token: host.authorization_token, role: 'host' }],
    createdAt: Date.now(),
  };
  lobbies.set(lobby.code, lobby);
  console.log(`lobby ${lobby.code}: relay session ${lobby.sessionId} on ${lobby.relay.host} (host ${ip})`);
  send(res, 201, ticket(lobby, lobby.players[0], { host_secret: lobby.hostSecret }));
}

async function joinLobby(req, res, code) {
  const lobby = lobbies.get(code);
  if (!lobby) return send(res, 404, { error: `No lobby with code ${code}.` });
  if (lobby.players.length >= lobby.maxPlayers) return send(res, 409, { error: `Lobby ${code} is full.` });

  const ip = await playerIp(req);
  const result = await edgegap('POST', '/v1/relays/sessions:authorize-user', { session_id: lobby.sessionId, user_ip: ip });
  const user = result.session_user;
  const player = { ip: user.ip_address, token: user.authorization_token, role: 'client' };
  lobby.players.push(player);
  console.log(`lobby ${code}: player ${lobby.players.length}/${lobby.maxPlayers} joined (${ip})`);
  send(res, 200, ticket(lobby, player));
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type,X-Host-Secret',
    });
    return res.end();
  }
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, lobbies: lobbies.size });
  if (req.method === 'POST' && url.pathname === '/lobbies') return hostLobby(req, res);

  if (parts[0] === 'lobbies' && parts[1]) {
    const code = parts[1].toUpperCase();
    if (req.method === 'POST' && parts[2] === 'join' && parts.length === 3) return joinLobby(req, res, code);
    if (parts.length === 2 && req.method === 'GET') {
      const lobby = lobbies.get(code);
      if (!lobby) return send(res, 404, { error: `No lobby with code ${code}.` });
      return send(res, 200, { code, players: lobby.players.length, max_players: lobby.maxPlayers, relay_host: lobby.relay.host });
    }
    if (parts.length === 2 && req.method === 'DELETE') {
      const lobby = lobbies.get(code);
      if (!lobby) return send(res, 404, { error: `No lobby with code ${code}.` });
      if (req.headers['x-host-secret'] !== lobby.hostSecret) return send(res, 403, { error: 'Only the host can close the lobby.' });
      await closeLobby(lobby, 'host closed it');
      return send(res, 204);
    }
  }
  send(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    console.error(e.message);
    send(res, e.status && e.status < 500 ? e.status : 502, { error: e.message });
  });
});

// Relay sessions bill while open: close lobbies nobody closed.
setInterval(() => {
  const cutoff = Date.now() - LOBBY_TTL_MINUTES * 60000;
  for (const lobby of lobbies.values()) {
    if (lobby.createdAt < cutoff) closeLobby(lobby, 'expired');
  }
}, 60000).unref();

async function shutdown() {
  console.log('shutting down, deleting open relay sessions...');
  server.close();
  await Promise.all([...lobbies.values()].map((l) => closeLobby(l, 'service stopped')));
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => console.log(`relay lobby service listening on :${PORT}`));
