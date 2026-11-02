// Local emulator of the Edgegap relay protocol, for offline tests of the transport only.
// It is NOT the Edgegap relay: no geo-selection, no NAT traversal, no billing. Always do the
// real end-to-end test against an Edgegap relay session before shipping.
//
//   node tools/local-relay.js [--loss 20]
//
// Prints the endpoints and tokens to pass to the sample:
//   host:    -relayAddress 127.0.0.1 -relayPort 41000 -sessionToken 1000 -userToken 1
//   clients: -client -relayAddress 127.0.0.1 -relayPort 41001 -sessionToken 1000 -userToken 2 (or 3, 4)

'use strict';

const dgram = require('node:dgram');

const SERVER_PORT = 41000;
const CLIENT_PORT = 41001;
const SESSION_TOKEN = 1000;
const HOST_TOKEN = 1;
const CLIENT_TOKENS = [2, 3, 4];
const lossIndex = process.argv.indexOf('--loss');
const LOSS = lossIndex > 0 ? Number(process.argv[lossIndex + 1]) : 0;

const PING = 1;
const DATA = 2;
const STATE = { Checking: 1, Valid: 2, Invalid: 3 };

const server = dgram.createSocket('udp4');
const client = dgram.createSocket('udp4');
let host = null;                 // { address, port }
const clients = new Map();       // userToken -> { address, port, connectionId }
let nextConnectionId = 100;

function dropped() { return LOSS > 0 && Math.random() * 100 < LOSS; }

function header(msg) {
  if (msg.length < 9) return null;
  return { user: msg.readUInt32LE(0), session: msg.readUInt32LE(4), type: msg[8] };
}

server.on('message', (msg, rinfo) => {
  const h = header(msg);
  if (!h) return;
  const valid = h.session === SESSION_TOKEN && h.user === HOST_TOKEN;
  if (h.type === PING) {
    if (valid) host = { address: rinfo.address, port: rinfo.port };
    server.send(Buffer.from([PING, valid ? STATE.Valid : STATE.Invalid]), rinfo.port, rinfo.address);
    return;
  }
  if (h.type !== DATA || !valid || msg.length < 13) return;
  const connectionId = msg.readUInt32LE(9);
  for (const c of clients.values()) {
    if (c.connectionId === connectionId && !dropped()) {
      client.send(Buffer.concat([Buffer.from([DATA]), msg.subarray(13)]), c.port, c.address);
    }
  }
});

client.on('message', (msg, rinfo) => {
  const h = header(msg);
  if (!h) return;
  const valid = h.session === SESSION_TOKEN && CLIENT_TOKENS.includes(h.user);
  if (h.type === PING) {
    if (valid) {
      const known = clients.get(h.user);
      clients.set(h.user, { address: rinfo.address, port: rinfo.port, connectionId: known ? known.connectionId : nextConnectionId++ });
    }
    client.send(Buffer.from([PING, valid ? STATE.Valid : STATE.Invalid]), rinfo.port, rinfo.address);
    return;
  }
  if (h.type !== DATA || !valid || !host) return;
  const c = clients.get(h.user);
  if (!c || dropped()) return;
  const id = Buffer.alloc(4);
  id.writeUInt32LE(c.connectionId);
  server.send(Buffer.concat([Buffer.from([DATA]), id, msg.subarray(9)]), host.port, host.address);
});

server.bind(SERVER_PORT, () => client.bind(CLIENT_PORT, () => {
  for (const socket of [server, client]) { socket.setRecvBufferSize(1 << 20); socket.setSendBufferSize(1 << 20); }
  console.log(`local relay emulator: server port ${SERVER_PORT}, client port ${CLIENT_PORT}, session token ${SESSION_TOKEN}, loss ${LOSS}%`);
  console.log(`host user token ${HOST_TOKEN}, client user tokens ${CLIENT_TOKENS.join(', ')}`);
}));
