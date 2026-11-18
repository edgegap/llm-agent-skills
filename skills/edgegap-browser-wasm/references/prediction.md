# Prediction, reconciliation and interpolation

Contents
1. Why predict
2. The predictor (template: `assets/client/prediction.ts`)
3. Fixed-step loop on the client
4. Interpolating everyone else
5. What still mispredicts, and when to stop

## 1. Why predict

Without prediction, a key press moves the player's own body only after a round trip plus up to one tick of queueing: 60-150 ms online, which feels like steering through syrup. With prediction the body moves the same frame, and the server's answer corrects it only when they disagree. Other players are not predicted: they are drawn slightly in the past, which is smooth and nearly always right.

## 2. The predictor

The client keeps its own small physics world with the **same** setup code as the server (`shared/physics.ts`): the static arena and the local player's body. Nothing else.

```ts
step(input) {                       // every client tick
  previous = body.translation();
  applyInput(R, world, body, input); world.step();
  pending.push(input);
}

reconcile(ack, server) {            // every snapshot
  const before = body.translation();
  pending = pending.filter(i => i.seq > ack);
  set body pose, linvel, angvel from server.self;
  for (const input of pending) { applyInput(R, world, body, input); world.step(); }
  const error = before - body.translation();
  if (|error| > 3) snap (respawn, teleport); else visualOffset += error;
}
```

- `ack` is the last input the server applied, so replaying `pending` brings the server's past state to the client's present.
- The server must send the **velocities** of the player's own body (`linvel`, `angvel`): replaying from a pose alone gives a different result.
- `visualOffset` is added when drawing and decays every frame (`*= exp(-dt * 12)`), so a correction slides in over ~100 ms instead of popping. Shift `previous` by the same error so the between-ticks interpolation stays consistent.
- Keep `pending` bounded (the sample keeps 120 inputs, 4 s) for the case where snapshots stop.

Rapier note: `body.translation()` returns a new object each call, so storing it is safe. Rapier is deterministic on one platform for the same inputs; server (Node, x86-64) and browser builds of the same version agree closely enough that steady-state corrections are invisible in the sample, but don't rely on bit-exact cross-platform determinism.

## 3. Fixed-step loop on the client

```ts
accumulator += dt;
while (accumulator >= TICK_DT && steps < 5) {
  const input = readInput();            // {seq: ++seq, x, z, jump}
  conn.send({t: "input", ...input});
  predictor.step(input);
  accumulator -= TICK_DT;
}
draw own body at lerp(previous, current, accumulator / TICK_DT) + visualOffset
```

Same tick rate as the server (one input per server tick), so a replayed input means the same thing on both sides. A hidden tab runs no animation frames: no inputs are sent, which the server treats as "no force" ticks. Keep the 5 s heartbeat on a timer so the connection isn't taken for dead.

## 4. Interpolating everyone else

- Keep the last ~60 snapshots.
- Estimate server time from the tick: `clockOffset = EMA(performance.now() - tick * TICK_MS)` (factor 0.05). Arrival times jitter; ticks don't.
- `renderTick = (now - clockOffset - 100 ms) / TICK_MS`; find the snapshots `a.tick ≤ renderTick < b.tick`; lerp positions and slerp quaternions by `(renderTick - a.tick) / (b.tick - a.tick)`.
- 100 ms (3 ticks at 30 Hz) absorbs one or two late snapshots. Raise it for mobile networks.

## 5. What still mispredicts, and when to stop

- Pushing another player or a prop: the client world doesn't have them, so the server's result differs and the correction is eased in. Including other bodies in the client world as kinematic bodies at their interpolated pose is possible, but they are 100 ms in the past, so it rarely helps; the sample keeps it simple.
- Dropped inputs (server queue cap): a small correction.
- Respawns: snap (the `> 3 m` rule).

Press P in the sample to toggle prediction and compare. If corrections are visible all the time, the shared module differs between sides (different tuning, a stale build: rebuild the server after changing `shared/`).
