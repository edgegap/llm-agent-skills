// Online mode for a claude.ai artifact page, from netcode-sample-claude-star-snatch (verified on
// Edgegap 2026-11-20). Paste it inside the artifact's own client code (the IIFE or module that
// draws), after the page's `world`, `running`, `HUMAN`, `find()`, `handle()`, `colorOf()` and
// `showStart()` exist. Names below are Star Snatch's: map them to the artifact's own.
//
// Needs at the top of the module script:
//   import { LOCAL_PORT, autoplay, cancelMatchmaking, directServer, findMatch, joinServer, loadConfig } from "./online.js";
// and the @edgegap/sdk import map in <head> (see edgegap-threejs assets/client/index.html).
//
// What to change in the artifact's code besides pasting this:
//  - the human's id: `var HUMAN = 'human'` stays a var; online it becomes the server's player id.
//  - Enter/Space "restart" keys must only restart in solo mode (`mode === 'solo'`).
//  - every place that puts a player name into innerHTML goes through esc().
//  - the start screen gets Play vs bots / Find match / Local server buttons, a #status line and a Cancel button.
//  - the frame loop gets the block at the end of this file (send input, ease ships).

  // Online: names come from other players, so never put them in the page unescaped.
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }
  function setStatus(text) {
    var el = document.getElementById('status');
    if (el) el.textContent = text;
  }

  // ---- Online (added for Edgegap) ----
  // The server runs the same rules (./rules.js) and sends its world 20 times a second. This page
  // sends the four buttons, draws the server's world with the renderer above, and eases ships
  // toward the server's positions so 20 updates a second still look smooth.
  var mode = 'solo', net = null, phase = null;
  var myName = 'Pilot' + Math.floor(Math.random() * 900 + 100);

  async function playOnline(how) {
    if (net) return;
    var buttons = card.querySelectorAll('.buttons button');
    buttons.forEach(function (b) { b.disabled = true; });
    try {
      var url = how === 'direct' ? directServer : how === 'local' ? 'ws://' + location.hostname + ':' + LOCAL_PORT : null;
      var ticket;
      if (how === 'find') {
        var cfg = await loadConfig();
        if (!cfg.matchmakerUrl || !cfg.matchmakerToken) throw new Error('No matchmaker set: fill in client/config.js, or add ?mm=<url>&token=<token> to the page URL');
        document.getElementById('cancel').hidden = false;
        var found = await findMatch(cfg, setStatus);
        url = found.url;
        ticket = found.ticketId;
      }
      setStatus('Connecting...');
      net = await joinServer(url, myName, ticket, { onState: onServerState, onClose: onServerClose, onStatus: setStatus });
      mode = 'online';
      running = false; // the server steps the world now
      HUMAN = net.myId;
      particles = []; rings = []; trails = {}; headings = {}; boardKey = ''; resultsAt = 0;
    } catch (err) {
      net = null;
      showStart(err && err.message ? err.message : 'Could not find a match');
    }
  }

  function onServerState(msg) {
    var s = msg.s, prev = {};
    if (world) world.players.forEach(function (p) { prev[p.id] = p; });
    s.players.forEach(function (p) {
      p.tx = p.x; p.ty = p.y; // where the server says the ship is
      if (prev[p.id]) { p.x = prev[p.id].x; p.y = prev[p.id].y; } // keep drawing from where it was
    });
    world = { arena: RULES.ARENA, winStars: RULES.WIN_STARS, time: s.time, phase: s.phase, winner: s.winner, players: s.players, stars: s.stars };
    handle(s.ev);
    resultsAt = 0;
    if (msg.phase !== phase || msg.phase === 'waiting' || msg.phase === 'countdown') showPhase(msg);
    phase = msg.phase;
  }

  function showPhase(msg) {
    if (msg.phase === 'playing') { overlay.hidden = true; return; }
    if (msg.phase === 'over' && msg.result) {
      card.innerHTML = '<h2>' + esc(msg.result.winner) + '</h2>' +
        '<ul class="ranks">' + msg.result.ranking.map(function (r) {
          var p = find(r.id);
          return '<li><span class="dot" style="background:' + (p ? colorOf(p) : '#fff') + '"></span><span>' +
            esc(r.name) + (r.id === HUMAN ? ' (you)' : '') + '</span><span>' + r.score + ' ★</span></li>';
        }).join('') + '</ul><p>The server closes the match in a few seconds.</p>';
    } else if (msg.phase === 'countdown') {
      card.innerHTML = '<h2>' + (msg.timer || 'Go') + '</h2><p>You are the ship with the white rim.</p>';
    } else {
      card.innerHTML = '<h2>Waiting for players</h2><p>' +
        (msg.waitingFor ? msg.waitingFor + ' more on the way.' : 'Bots fill the empty seats.') + '</p>';
    }
    overlay.hidden = false;
  }

  function onServerClose() {
    net = null; phase = null; mode = 'solo'; HUMAN = 'human';
    newWorld();
    showStart('Match over. Thanks for playing!');
  }

  // Close the socket when the tab goes away, so an empty server stops itself quickly.
  addEventListener('pagehide', function () { if (net) net.close(); });

  // ---- in the frame loop, after the solo step block ----
    if (mode === 'online' && net) {
      net.sendInput(humanInput()); // throttled in online.js
      var ease = Math.min(1, dt * 12);
      world.players.forEach(function (p) {
        if (p.tx === undefined) return;
        p.x += (p.tx - p.x) * ease;
        p.y += (p.ty - p.y) * ease;
      });
    }
