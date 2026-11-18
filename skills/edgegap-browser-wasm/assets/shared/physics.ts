// Rapier setup shared by the server (authoritative simulation) and the client (prediction of the
// local player). Both sides build the same static arena and move a ball with the same code, so
// the client's guess matches the server's result unless something it can't see (another player,
// a crate) got in the way.
//
// Rapier is passed in rather than imported so this file has no side effects and works with the
// one instance each side initialised.

import type RAPIER_NS from "@dimforge/rapier3d-compat";
import { ARENA, PILLARS, PLAYER, TICK_DT, clampNumber, type InputCmd } from "./index.js";

export type Rapier = typeof RAPIER_NS;
export type World = RAPIER_NS.World;
export type RigidBody = RAPIER_NS.RigidBody;

export function createWorld(R: Rapier): World {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = TICK_DT;
  return world;
}

/** Floor, four low walls and the pillars. All fixed colliders, no rigid body needed. */
export function buildArena(R: Rapier, world: World): void {
  const { halfSize, wallHeight, wallThickness } = ARENA;
  world.createCollider(R.ColliderDesc.cuboid(halfSize, 0.5, halfSize).setTranslation(0, -0.5, 0).setFriction(1));
  const h = wallHeight / 2;
  const t = wallThickness / 2;
  const walls: Array<[number, number, number, number]> = [
    [0, halfSize + t, halfSize + wallThickness, t],
    [0, -halfSize - t, halfSize + wallThickness, t],
    [halfSize + t, 0, t, halfSize],
    [-halfSize - t, 0, t, halfSize],
  ];
  for (const [x, z, hx, hz] of walls) {
    world.createCollider(R.ColliderDesc.cuboid(hx, h, hz).setTranslation(x, h, z));
  }
  for (const p of PILLARS) {
    world.createCollider(R.ColliderDesc.cuboid(p.halfX, p.halfY, p.halfZ).setTranslation(p.x, p.halfY, p.z));
  }
}

export function createPlayerBody(R: Rapier, world: World, x: number, z: number): RigidBody {
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(x, PLAYER.radius + 0.5, z)
      .setLinearDamping(PLAYER.linearDamping)
      .setAngularDamping(PLAYER.angularDamping)
      .setCcdEnabled(true)
  );
  world.createCollider(
    R.ColliderDesc.ball(PLAYER.radius)
      .setDensity(PLAYER.density)
      .setFriction(PLAYER.friction)
      .setRestitution(PLAYER.restitution),
    body
  );
  return body;
}

/** True when something solid is just below the ball. */
export function isGrounded(R: Rapier, world: World, body: RigidBody): boolean {
  const p = body.translation();
  const ray = new R.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, PLAYER.radius + 0.08, true, undefined, undefined, undefined, body);
  return hit !== null;
}

/**
 * Apply one tick of player input to a ball. The server calls this with untrusted input from the
 * network, so every field is clamped here, in one place.
 */
export function applyInput(R: Rapier, world: World, body: RigidBody, input: InputCmd): void {
  let x = clampNumber(input.x, -1, 1);
  let z = clampNumber(input.z, -1, 1);
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  if (x !== 0 || z !== 0) {
    body.applyImpulse({ x: x * PLAYER.moveImpulse, y: 0, z: z * PLAYER.moveImpulse }, true);
  }
  if (input.jump === true && isGrounded(R, world, body)) {
    const v = body.linvel();
    if (v.y < 1) body.applyImpulse({ x: 0, y: PLAYER.jumpImpulse, z: 0 }, true);
  }
  // Cap horizontal speed so a held key can't accelerate forever.
  const v = body.linvel();
  const speed = Math.hypot(v.x, v.z);
  if (speed > PLAYER.maxSpeed) {
    const k = PLAYER.maxSpeed / speed;
    body.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true);
  }
}
