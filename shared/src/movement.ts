import { BALANCE } from "./balance.js";
import { screenDirToWorld } from "./view.js";
import type { CollisionGrid } from "./map.js";

/**
 * One player's movement state. The server and the predicting client both step it with
 * `stepBody`, so given the same inputs they arrive at the same place.
 */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** World-space facing angle (radians). */
  facing: number;
  stamina: number;
  /** Seconds since stamina was last spent (regen starts after a delay). */
  sinceSpend: number;
  /** Remaining dodge time; > 0 while rolling. */
  dodgeT: number;
  dodgeCd: number;
  dodgeDx: number;
  dodgeDy: number;
}

/** One fixed simulation step of player intent. mx/my are screen directions in {-1, 0, 1}. */
export interface InputFrame {
  seq: number;
  mx: number;
  my: number;
  dodge: boolean;
  /** World-space aim angle (radians) and distance (cells) to the cursor. */
  aim?: number;
  aimDist?: number;
  /** Skill slot pressed this frame (0 basic … 5), if any. */
  cast?: number;
  /** F held: revive a downed partner / execute a staggered enemy. */
  act?: boolean;
}

export function newBody(x: number, y: number): Body {
  return { x, y, vx: 0, vy: 0, facing: Math.PI / 2, stamina: BALANCE.player.staminaMax, sinceSpend: 99, dodgeT: 0, dodgeCd: 0, dodgeDx: 0, dodgeDy: 0 };
}

/** Clamps untrusted input to the allowed shape. */
export function sanitizeInput(raw: unknown): InputFrame | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.seq !== "number" || !Number.isInteger(r.seq) || r.seq < 0) return null;
  const axis = (v: unknown) => (v === 1 || v === -1 ? v : 0);
  const f: InputFrame = { seq: r.seq, mx: axis(r.mx), my: axis(r.my), dodge: r.dodge === true };
  if (typeof r.aim === "number" && Number.isFinite(r.aim)) f.aim = Math.atan2(Math.sin(r.aim), Math.cos(r.aim));
  if (typeof r.aimDist === "number" && Number.isFinite(r.aimDist)) f.aimDist = Math.max(0, Math.min(20, r.aimDist));
  if (typeof r.cast === "number" && Number.isInteger(r.cast) && r.cast >= 0 && r.cast <= 5) f.cast = r.cast;
  if (r.act === true) f.act = true;
  return f;
}

export function isInvulnerable(b: Body): boolean {
  return b.dodgeT > BALANCE.dodge.duration - BALANCE.dodge.iframes;
}

/**
 * Advances a body one step. `speedMul` scales running (slows, haste, a path's speed; 0 = rooted);
 * dodging is allowed only when `canDodge` (not rooted, downed or staggered).
 */
export function stepBody(b: Body, input: InputFrame, dt: number, grid: CollisionGrid, speedMul = 1, canDodge = true): void {
  const P = BALANCE.player;
  const D = BALANCE.dodge;
  const dir = screenDirToWorld(input.mx, input.my);
  const moving = dir.x !== 0 || dir.y !== 0;

  b.dodgeCd = Math.max(0, b.dodgeCd - dt);
  b.sinceSpend += dt;
  if (b.sinceSpend >= P.staminaRegenDelay) b.stamina = Math.min(P.staminaMax, b.stamina + P.staminaRegen * dt);

  // Start a dodge: in the held direction, or the way you're facing when standing still.
  if (input.dodge && canDodge && b.dodgeT <= 0 && b.dodgeCd <= 0 && b.stamina >= D.cost) {
    const dx = moving ? dir.x : Math.cos(b.facing);
    const dy = moving ? dir.y : Math.sin(b.facing);
    b.dodgeT = D.duration;
    b.dodgeDx = dx;
    b.dodgeDy = dy;
    b.stamina -= D.cost;
    b.sinceSpend = 0;
    b.facing = Math.atan2(dy, dx);
  }

  if (b.dodgeT > 0) {
    // Ease-out burst: fast at the start, settling into a run. The integral over the roll equals D.distance.
    const t = 1 - b.dodgeT / D.duration;
    const speed = (D.distance / D.duration) * 2 * (1 - t);
    b.vx = b.dodgeDx * speed;
    b.vy = b.dodgeDy * speed;
    b.dodgeT = Math.max(0, b.dodgeT - dt);
    if (b.dodgeT === 0) b.dodgeCd = D.cooldown;
  } else {
    const tx = dir.x * P.speed * speedMul;
    const ty = dir.y * P.speed * speedMul;
    const rate = (moving ? P.accel : P.decel) * dt;
    b.vx = approach(b.vx, tx, rate);
    b.vy = approach(b.vy, ty, rate);
    if (moving && speedMul > 0) b.facing = Math.atan2(dir.y, dir.x);
  }

  moveWithCollision(b, b.vx * dt, b.vy * dt, grid);
}

function approach(v: number, target: number, rate: number): number {
  return v < target ? Math.min(target, v + rate) : Math.max(target, v - rate);
}

/**
 * Moves a circle through the grid, sliding along walls. Each axis is resolved separately, in
 * sub-steps no longer than a quarter cell, so fast dodges can't tunnel through a wall.
 */
export function moveWithCollision(b: { x: number; y: number; vx: number; vy: number }, dx: number, dy: number, grid: CollisionGrid, r: number = BALANCE.player.radius): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.25));
  for (let i = 0; i < steps; i++) {
    b.x += dx / steps;
    if (overlaps(b.x, b.y, r, grid)) {
      b.x -= dx / steps;
      b.vx = 0;
    }
    b.y += dy / steps;
    if (overlaps(b.x, b.y, r, grid)) {
      b.y -= dy / steps;
      b.vy = 0;
    }
  }
}

/** Does a circle at (x, y) overlap any blocked cell? */
export function overlaps(x: number, y: number, r: number, grid: CollisionGrid): boolean {
  const x0 = Math.floor(x - r);
  const x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r);
  const y1 = Math.floor(y + r);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (!grid.blocked(cx, cy)) continue;
      const nx = Math.max(cx, Math.min(x, cx + 1));
      const ny = Math.max(cy, Math.min(y, cy + 1));
      if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
    }
  }
  return false;
}

/** Copies the fields the client needs to rewind its prediction to a server snapshot. */
export function copyBody(into: Body, from: Body): void {
  into.x = from.x;
  into.y = from.y;
  into.vx = from.vx;
  into.vy = from.vy;
  into.facing = from.facing;
  into.stamina = from.stamina;
  into.sinceSpend = from.sinceSpend;
  into.dodgeT = from.dodgeT;
  into.dodgeCd = from.dodgeCd;
  into.dodgeDx = from.dodgeDx;
  into.dodgeDy = from.dodgeDy;
}
