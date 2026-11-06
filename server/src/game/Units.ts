import { BALANCE, GREYED, moveWithCollision, type EnemyDef, type Faction } from "@broken-ash/shared";
import { addStatus, dealDamage, foesOf, heal, releaseGrab, spawnUnitBolt, speedOf, unitAttackHits, type Arena } from "./Combat.js";
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
    // Boss phases: crossing a threshold shows a banner, starts a channelled heal or a rage.
    const phases = u.def.phases;
    if (phases && (u.phase ?? 0) < phases.length && u.hp / u.hpMax <= phases[u.phase ?? 0].at) {
      const ph = phases[u.phase ?? 0];
      u.phase = (u.phase ?? 0) + 1;
      a.fx.push({ t: "phase", id: u.id, title: ph.title, sub: ph.sub });
      if (ph.heal) {
        u.channel = BALANCE.combat.bossChannel;
        u.channelHeal = (ph.heal * u.hpMax) / BALANCE.combat.bossChannel;
        u.state = "idle";
        u.attack = null;
      }
      if (ph.rage) u.rage = ph.rage;
    }
    if (u.staggerT > 0) {
      // A stagger breaks a channelled heal: the reward for hitting him hard while he drinks.
      u.channel = 0;
      if (u.grabbed) releaseGrab(a, u);
      continue;
    }
    if (u.channel && u.channel > 0) {
      u.channel -= dt;
      heal(a, u, (u.channelHeal ?? 0) * dt, false);
      u.vx = u.vy = 0;
      continue;
    }
    if (u.grabbed) {
      // The hold ends on its own when the victim's rooting runs out.
      const held = a.players.get(u.grabbed) ?? a.units.get(u.grabbed);
      if (!held || held.dead || !held.statuses.has("rooted")) u.grabbed = undefined;
    }
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
    // Corpse-eaters go for the dead when no one is close enough to bite.
    if (u.def.eatsCorpses && eat(a, u, best, dt)) continue;
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
      u.t = attack.windup * (u.rage ?? 1);
      u.aim = Math.atan2(tp.y - u.y, tp.x - u.x);
      u.facing = u.aim;
      const reach = attack.shape.kind === "circle" && attack.shape.at === "aim" ? attack.shape.reach ?? 6 : 0;
      const d = Math.min(reach, Math.hypot(tp.x - u.x, tp.y - u.y));
      u.ax = u.x + Math.cos(u.aim) * d;
      u.ay = u.y + Math.sin(u.aim) * d;
      u.cds[attack.id] = attack.cooldown * (u.rage ?? 1);
      u.vx = u.vy = 0;
      continue;
    }
    // Ranged: back away from a target that comes too close (when the shot isn't ready to fire).
    if (u.def.keepAway && dist < u.def.keepAway - 0.5) {
      const len = Math.hypot(tp.x - u.x, tp.y - u.y) || 1;
      const speed = u.def.speed * speedOf(u) * 0.85;
      u.state = "chase";
      u.vx = (-(tp.x - u.x) / len) * speed;
      u.vy = (-(tp.y - u.y) / len) * speed;
      u.facing = Math.atan2(tp.y - u.y, tp.x - u.x);
      moveWithCollision(u, u.vx * dt, u.vy * dt, a.grid, u.radius);
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

/**
 * A corpse-eater's hunger: with no foe within reach, it walks to the nearest body and eats it,
 * healing and growing. Returns true while it's busy with a corpse.
 */
function eat(a: Arena, u: UnitSim, foeDist: number, dt: number): boolean {
  const E = BALANCE.combat.eater;
  if (foeDist < E.ignoreWithin) {
    u.eating = undefined;
    u.eatT = 0;
    return false;
  }
  let best: { id: string; x: number; y: number } | undefined;
  let bd: number = E.smell;
  for (const c of a.corpses) {
    const d = Math.hypot(c.x - u.x, c.y - u.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  if (!best) return false;
  u.facing = Math.atan2(best.y - u.y, best.x - u.x);
  if (bd > 0.7) {
    const speed = u.def.speed * speedOf(u);
    u.state = "chase";
    u.vx = Math.cos(u.facing) * speed;
    u.vy = Math.sin(u.facing) * speed;
    moveWithCollision(u, u.vx * dt, u.vy * dt, a.grid, u.radius);
    return true;
  }
  u.state = "idle";
  u.vx = u.vy = 0;
  if (u.eating !== best.id) {
    u.eating = best.id;
    u.eatT = 0;
  }
  u.eatT = (u.eatT ?? 0) + dt;
  if (u.eatT >= E.eatTime) {
    a.corpses.splice(a.corpses.indexOf(best), 1);
    a.fx.push({ t: "eaten", id: best.id, by: u.id, x: best.x, y: best.y });
    // It grows on what it eats: more health, a little bigger, healed.
    u.hpMax = Math.round(u.hpMax * (1 + E.grow));
    u.radius = Math.min(E.maxRadius, u.radius * 1.04);
    heal(a, u, u.hpMax * E.heal, true);
    u.eating = undefined;
    u.eatT = 0;
  }
  return true;
}

function strike(a: Arena, u: UnitSim) {
  const at = u.attack!;
  if (at.bolt) {
    spawnUnitBolt(a, u, at);
    u.state = "recover";
    u.t = 0.55;
    u.attack = null;
    return;
  }
  const up = u.pos();
  // So the client can draw the blow itself (a claw rake, a cleaver arc, a slam) where it lands.
  a.fx.push({ t: "unitAtk", id: u.id, kind: u.kind, atk: at.id, aim: u.aim, x: up.x, y: up.y, ax: u.ax, ay: u.ay });
  for (const f of foesOf(a, u.faction)) {
    if (!unitAttackHits(u, f)) continue;
    dealDamage(a, u, f, at.damage, 0, { cause: "claw" });
    if (at.status && !f.dead) addStatus(f, at.status.id, at.status.duration, at.status.value ?? 3, u.id);
    if (at.grab && !f.dead) u.grabbed = f.id;
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
