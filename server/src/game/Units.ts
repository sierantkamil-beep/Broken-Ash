import { BALANCE, GREYED, moveWithCollision, type EnemyDef, type Faction } from "@broken-ash/shared";
import { addStatus, dealDamage, foesOf, speedOf, unitAttackHits, type Arena } from "./Combat.js";
import type { Fighter, PlayerSim, UnitSim } from "./fighters.js";
import type { FlowField } from "./Pathing.js";

let nextId = 1;

/** A thrall raised by the Path of Graves: a Shambler's body fighting on the players' side. */
export function thrallDef(): EnemyDef {
  const T = BALANCE.combat.thrall;
  return { ...GREYED.shambler, name: "Sługa", hp: T.hp, speed: T.speed, attacks: [{ ...GREYED.shambler.attacks[0], damage: T.damage, windup: 0.45 }] };
}

export function makeUnit(def: EnemyDef, x: number, y: number, faction: Faction = "greyed", kind: UnitSim["kind"] = def.kind): UnitSim {
  const u: UnitSim = {
    id: `u${nextId++}`,
    kind,
    def,
    faction,
    radius: def.radius,
    hp: def.hp,
    hpMax: def.hp,
    statuses: new Map(),
    poise: def.poise,
    poiseMax: def.poise,
    staggerT: 0,
    dead: false,
    sinceHit: 99,
    dotClock: 0,
    x,
    y,
    vx: 0,
    vy: 0,
    facing: Math.PI / 4,
    state: "idle",
    target: null,
    attack: null,
    t: 0,
    aim: 0,
    ax: x,
    ay: y,
    cds: {},
    pos() {
      return { x: this.x, y: this.y };
    },
  };
  return u;
}

/**
 * The Greyed's (and thralls') behaviour: pick the nearest foe, walk the flow field to them, and when
 * an attack is in range, lock its aim and telegraph it for its wind-up before it lands.
 * Stealthed players are invisible to the Greyed; downed players are ignored.
 */
export function tickUnits(a: Arena, dt: number, fields: (target: Fighter) => FlowField | null) {
  for (const u of a.units.values()) {
    if (u.dead) continue;
    for (const k in u.cds) u.cds[k] = Math.max(0, u.cds[k] - dt);
    if (u.life !== undefined) {
      u.life -= dt;
      if (u.life <= 0) {
        u.hp = 0;
        a.killed(u, undefined, 0);
        continue;
      }
    }
    if (u.staggerT > 0) continue;
    const foes = foesOf(a, u.faction).filter((f) => !(f as PlayerSim).statuses.has("stealth"));
    let target: Fighter | undefined;
    let best = u.def.aggro;
    for (const f of foes) {
      const p = f.pos();
      const d = Math.hypot(p.x - u.x, p.y - u.y);
      if (d < best) {
        best = d;
        target = f;
      }
    }
    u.target = target?.id ?? null;

    if (u.state === "windup") {
      u.t -= dt;
      if (u.t <= 0) strike(a, u);
      continue;
    }
    if (u.state === "recover") {
      u.t -= dt;
      if (u.t <= 0) u.state = "idle";
      continue;
    }
    if (!target) {
      u.state = "idle";
      u.vx = u.vy = 0;
      continue;
    }
    const tp = target.pos();
    const dist = Math.hypot(tp.x - u.x, tp.y - u.y) - target.radius - u.radius;
    const attack = u.def.attacks.find((at) => (u.cds[at.id] ?? 0) <= 0 && dist <= at.range);
    if (attack) {
      u.state = "windup";
      u.attack = attack;
      u.t = attack.windup;
      u.aim = Math.atan2(tp.y - u.y, tp.x - u.x);
      u.facing = u.aim;
      const reach = attack.shape.kind === "circle" && attack.shape.at === "aim" ? attack.shape.reach ?? 6 : 0;
      const d = Math.min(reach, Math.hypot(tp.x - u.x, tp.y - u.y));
      u.ax = u.x + Math.cos(u.aim) * d;
      u.ay = u.y + Math.sin(u.aim) * d;
      u.cds[attack.id] = attack.cooldown;
      u.vx = u.vy = 0;
      continue;
    }
    // Walk: the flow field round obstacles, or straight in when close.
    u.state = "chase";
    let dir: { x: number; y: number } | null = null;
    if (Math.hypot(tp.x - u.x, tp.y - u.y) > 1.8) dir = fields(target)?.direction(u.x, u.y) ?? null;
    if (!dir) {
      const len = Math.hypot(tp.x - u.x, tp.y - u.y) || 1;
      dir = { x: (tp.x - u.x) / len, y: (tp.y - u.y) / len };
    }
    const speed = u.def.speed * speedOf(u);
    u.vx = dir.x * speed;
    u.vy = dir.y * speed;
    u.facing = Math.atan2(dir.y, dir.x);
    moveWithCollision(u, u.vx * dt, u.vy * dt, a.grid, u.radius);
  }
  separate(a);
}

function strike(a: Arena, u: UnitSim) {
  const at = u.attack!;
  for (const f of foesOf(a, u.faction)) {
    if (!unitAttackHits(u, f)) continue;
    dealDamage(a, u, f, at.damage, 0);
    if (at.status && !f.dead) addStatus(f, at.status.id, at.status.duration, at.status.value ?? 3, u.id);
  }
  u.state = "recover";
  u.t = 0.55;
  u.attack = null;
}

/** Keeps units from stacking into one blob: overlapping pairs push apart. */
function separate(a: Arena) {
  const list = [...a.units.values()].filter((u) => !u.dead);
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const p = list[i];
      const q = list[j];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy);
      const min = p.radius + q.radius;
      if (d >= min || d === 0) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      moveWithCollision(p, -nx * push, -ny * push, a.grid, p.radius);
      moveWithCollision(q, nx * push, ny * push, a.grid, q.radius);
    }
}
