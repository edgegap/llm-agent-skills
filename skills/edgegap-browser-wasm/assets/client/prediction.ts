// Client-side prediction of the local player with the same Rapier code the server runs.
//
// The client keeps a tiny Rapier world: the static arena and its own ball. Every tick it applies
// its input right away (no waiting for the server) and remembers the input. When a snapshot
// arrives, it resets the ball to the server's state for the last input the server applied
// (`ack`) and replays the inputs the server hasn't applied yet. If the server agrees, nothing
// visibly changes; if something the client can't see (another player, a crate) got in the way,
// the ball is corrected, and `visualOffset` eases that correction in over a few frames.

import RAPIER from "@dimforge/rapier3d-compat";
import type { InputCmd, SelfState } from "@sample/shared";
import { applyInput, buildArena, createPlayerBody, createWorld, type RigidBody, type World } from "@sample/shared/physics";

type Vec3 = { x: number; y: number; z: number };

export class Predictor {
  private world: World;
  private body: RigidBody;
  private pending: InputCmd[] = [];
  /** Ball position before the latest step, for smooth rendering between 30 Hz ticks. */
  previous: Vec3 = { x: 0, y: 0, z: 0 };
  /** Rendering offset that hides corrections; decays to zero. */
  visualOffset: Vec3 = { x: 0, y: 0, z: 0 };

  constructor() {
    this.world = createWorld(RAPIER);
    buildArena(RAPIER, this.world);
    this.body = createPlayerBody(RAPIER, this.world, 0, 0);
  }

  /** Apply one input locally, now. */
  step(input: InputCmd): void {
    this.previous = this.body.translation();
    applyInput(RAPIER, this.world, this.body, input);
    this.world.step();
    this.pending.push(input);
    if (this.pending.length > 120) this.pending.shift(); // 4 s without an ack: give up on the oldest
  }

  /** Rewind to the server's state and replay the inputs it hasn't applied yet. */
  reconcile(ack: number, server: SelfState): void {
    const before = this.body.translation();
    this.pending = this.pending.filter((i) => i.seq > ack);

    const [x, y, z, qx, qy, qz, qw] = server.pose;
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation({ x: qx, y: qy, z: qz, w: qw }, true);
    this.body.setLinvel({ x: server.linvel[0], y: server.linvel[1], z: server.linvel[2] }, true);
    this.body.setAngvel({ x: server.angvel[0], y: server.angvel[1], z: server.angvel[2] }, true);
    for (const input of this.pending) {
      applyInput(RAPIER, this.world, this.body, input);
      this.world.step();
    }

    const after = this.body.translation();
    const error = { x: before.x - after.x, y: before.y - after.y, z: before.z - after.z };
    if (Math.hypot(error.x, error.y, error.z) > 3) {
      // Respawned or far off: snap instead of sliding across the arena.
      this.visualOffset = { x: 0, y: 0, z: 0 };
      this.previous = after;
    } else {
      this.visualOffset.x += error.x;
      this.visualOffset.y += error.y;
      this.visualOffset.z += error.z;
      this.previous = { x: this.previous.x - error.x, y: this.previous.y - error.y, z: this.previous.z - error.z };
    }
  }

  decayOffset(dt: number): void {
    const k = Math.exp(-dt * 12);
    this.visualOffset.x *= k;
    this.visualOffset.y *= k;
    this.visualOffset.z *= k;
  }

  get position(): Vec3 {
    return this.body.translation();
  }

  get rotation() {
    return this.body.rotation();
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
