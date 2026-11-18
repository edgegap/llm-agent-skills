// Everything the client and the server must agree on: tick rate, arena, physics tuning and the
// wire format. Both sides import this file, so a change here can't leave them out of sync.

/** Simulation ticks per second. The server steps Rapier at this rate and sends one snapshot per tick. */
export const TICK_HZ = 30;
export const TICK_DT = 1 / TICK_HZ;

/** Default port of the game server (WebSocket + HTTP health check on the same port). */
export const DEFAULT_PORT = 7777;

/** How far behind the newest snapshot the client draws other players and crates, in ms. */
export const INTERPOLATION_DELAY_MS = 100;

export const ARENA = {
  /** Half the width of the square floor, in metres. */
  halfSize: 12,
  wallHeight: 1.2,
  wallThickness: 0.5,
  /** Below this height a player has fallen out and respawns. */
  killY: -10,
};

export const PLAYER = {
  radius: 0.5,
  density: 1.5,
  /** Horizontal impulse applied per tick while a direction key is held. */
  moveImpulse: 0.35,
  jumpImpulse: 4.5,
  /** Horizontal speed cap, metres per second. */
  maxSpeed: 7,
  linearDamping: 0.6,
  angularDamping: 0.8,
  friction: 0.9,
  restitution: 0.2,
};

export const CRATE = {
  count: 10,
  halfExtent: 0.5,
  density: 0.6,
  friction: 0.7,
};

export const MAX_PLAYERS = 8;
export const MAX_NAME_LENGTH = 16;

/** Static obstacles, shared so the client can build the same Rapier colliders for prediction. */
export const PILLARS: ReadonlyArray<{ x: number; z: number; halfX: number; halfY: number; halfZ: number }> = [
  { x: -5, z: -5, halfX: 0.75, halfY: 1, halfZ: 0.75 },
  { x: 5, z: 5, halfX: 0.75, halfY: 1, halfZ: 0.75 },
  { x: 5, z: -5, halfX: 1.5, halfY: 0.4, halfZ: 0.75 },
  { x: -5, z: 5, halfX: 0.75, halfY: 0.4, halfZ: 1.5 },
];

export const PLAYER_COLORS = [0xff5a5f, 0x3fa7ff, 0xffc53d, 0x4cd964, 0xb57bff, 0xff8a3d, 0x2ee6d6, 0xf26bd0];

// ---------------------------------------------------------------------------------------------
// Wire format. JSON over one WebSocket. `t` is the message type.
// ---------------------------------------------------------------------------------------------

/** One player input for one tick. x/z are the movement direction, each in [-1, 1]. */
export interface InputCmd {
  seq: number;
  x: number;
  z: number;
  jump: boolean;
}

export type ClientMessage =
  | { t: "hello"; name: string }
  | ({ t: "input" } & InputCmd)
  | { t: "ping" };

/** Position + rotation of one body: [x, y, z, qx, qy, qz, qw]. */
export type Pose = [number, number, number, number, number, number, number];

/** Full physics state of the receiving player's own ball, for client-side reconciliation. */
export interface SelfState {
  pose: Pose;
  linvel: [number, number, number];
  angvel: [number, number, number];
}

export interface PlayerInfo {
  id: number;
  name: string;
  color: number;
}

export interface Snapshot {
  t: "snapshot";
  tick: number;
  /** Highest input `seq` the server has applied for the receiving player. */
  ack: number;
  /** Poses of every player ball, keyed by player id. */
  players: Array<[number, ...Pose]>;
  /** Poses of every crate, in a fixed order. */
  crates: Pose[];
  /** The receiving player's own ball, with velocities. Absent until it has spawned. */
  self?: SelfState;
}

export type ServerMessage =
  | { t: "welcome"; id: number; tick: number; tickHz: number; players: PlayerInfo[] }
  | { t: "join"; player: PlayerInfo }
  | { t: "leave"; id: number }
  | Snapshot
  | { t: "error"; message: string };

/** Clamp an untrusted number into [min, max]; NaN and non-numbers become 0. */
export function clampNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

/** Round to 3 decimals to keep snapshots small. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
