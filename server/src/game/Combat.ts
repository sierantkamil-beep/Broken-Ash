import {
  aimLanding,
  BALANCE,
  moveWithCollision,
  shapeHits,
  type CollisionGrid,
  type Effect,
  type Faction,
  type FxEvent,
  type Shape,
  type SkillDef,
  type StatusId,
  type WeaponId,
  masteryLevel,
} from "@broken-ash/shared";
import type { Fighter, PlayerSim, Status, UnitSim } from "./fighters.js";

const C = BALANCE.combat;
const DOTS: StatusId[] = ["bleed", "burn", "poison"];
/** Damage-over-time caps (dps), so stacking stays strong but bounded. */
const DOT_CAP = 24;

export interface Projectile {
  /** Names the bolt in fx events, so clients can end its visual where it really stopped. */
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  left: number;
  radius: number;
  pierce: boolean;
  hit: Set<string>;
  src: string;
  faction: Faction;
  skill: SkillDef;
}

export interface Zone {
  x: number;
  y: number;
  radius: number;
  until: number;
  dps: number;
  status?: StatusId;
  statusDuration?: number;
  src: string;
  faction: Faction;
  clock: number;
}

/** What the combat rules need from the world. */
export interface Arena {
  time: number;
  grid: CollisionGrid;
  players: Map<string, PlayerSim>;
  units: Map<string, UnitSim>;
  projectiles: Projectile[];
  zones: Zone[];
  fx: FxEvent[];
  summon(owner: PlayerSim, count: number, duration: number): void;
  killed(victim: Fighter, killer: Fighter | undefined, overkill: number): void;
}

export function fighters(a: Arena): Fighter[] {
  return [...a.players.values(), ...a.units.values()];
}

export function fighterById(a: Arena, id: string): Fighter | undefined {
  return a.players.get(id) ?? a.units.get(id);
}

export function partnerOf(a: Arena, p: PlayerSim): PlayerSim | undefined {
  for (const o of a.players.values()) if (o !== p) return o;
  return undefined;
}

/** Can this fighter be hit right now? */
export function targetable(f: Fighter): boolean {
  if (f.dead) return false;
  const p = f as PlayerSim;
  if (p.body && (p.downed || isRolling(p))) return false;
  return true;
}

function isRolling(p: PlayerSim): boolean {
  return p.body.dodgeT > BALANCE.dodge.duration - BALANCE.dodge.iframes;
}

/** Enemies of a faction that can be hit. Stealthed players are ignored by the Greyed. */
export function foesOf(a: Arena, faction: Faction): Fighter[] {
  return fighters(a).filter((f) => f.faction !== faction && targetable(f));
}

// ----------------------------------------------------------------------------- statuses

export function addStatus(f: Fighter, id: StatusId, duration: number, value: number, source: string) {
  if (f.dead) return;
  const cur = f.statuses.get(id);
  if (DOTS.includes(id)) {
    // Damage over time stacks (up to a cap) and refreshes.
    const v = Math.min(DOT_CAP, (cur?.value ?? 0) + value);
    f.statuses.set(id, { t: Math.max(cur?.t ?? 0, duration), value: v, source });
  } else if (id === "shield") {
    f.statuses.set(id, { t: Math.max(cur?.t ?? 0, duration), value: Math.max(cur?.value ?? 0, value), source });
  } else {
    f.statuses.set(id, { t: Math.max(cur?.t ?? 0, duration), value: Math.max(cur?.value ?? 0, value), source });
  }
}

/** Movement multiplier from statuses (and the path's own speed for players). */
export function speedOf(f: Fighter, base = 1): number {
  if (f.statuses.has("rooted") || f.staggerT > 0) return 0;
  let m = base;
  const slow = f.statuses.get("slow");
  if (slow) m *= 1 - Math.min(0.7, slow.value || 0.35);
  const haste = f.statuses.get("haste");
  if (haste) m *= 1 + (haste.value || 0.25);
  return m;
}

export function tickStatuses(a: Arena, dt: number) {
  for (const f of fighters(a)) {
    if (f.dead) continue;
    f.sinceHit += dt;
    if (f.staggerT > 0) f.staggerT = Math.max(0, f.staggerT - dt);
    if (f.sinceHit > 1.5) f.poise = Math.min(f.poiseMax, f.poise + f.poiseMax * C.poiseRegen * dt);
    f.dotClock += dt;
    const tick = f.dotClock >= C.dotTick;
    if (tick) f.dotClock -= C.dotTick;
    for (const [id, s] of f.statuses) {
      s.t -= dt;
      if (tick && DOTS.includes(id) && s.value > 0) {
        const src = fighterById(a, s.source);
        dealDamage(a, src, f, s.value * C.dotTick, 0, { dot: id });
        if (f.dead) break;
      }
      if (s.t <= 0 || (id === "shield" && s.value <= 0)) f.statuses.delete(id);
    }
  }
}

// ----------------------------------------------------------------------------- damage

export interface DamageOpts {
  dot?: StatusId;
  fire?: boolean;
  /** Bonus multiplier from the skill (combos). */
  mult?: number;
}

/** Applies damage after modifiers, shields and invulnerability. Returns the damage actually dealt. */
export function dealDamage(a: Arena, src: Fighter | undefined, target: Fighter, amount: number, poise: number, opts: DamageOpts = {}): number {
  if (!targetable(target) && !opts.dot) return 0;
  if (target.dead) return 0;
  let dmg = amount * (opts.mult ?? 1);
  // Debuffs make the target take more from everyone: the co-op glue.
  if (target.statuses.has("weaken")) dmg *= 1 + C.weakenBonus;
  if (target.statuses.has("rooted")) dmg *= 1 + C.rootedBonus;
  const mark = target.statuses.get("mark");
  if (mark) dmg *= 1 + (mark.value || 0.25);
  dmg = Math.round(dmg * 10) / 10;
  const shield = target.statuses.get("shield");
  if (shield && shield.value > 0) {
    const absorbed = Math.min(shield.value, dmg);
    shield.value -= absorbed;
    dmg -= absorbed;
    if (absorbed > 0) a.fx.push({ t: "hit", id: target.id, amount: Math.round(absorbed), kind: "shield" });
  }
  if (dmg <= 0) return 0;
  const before = target.hp;
  target.hp -= dmg;
  target.sinceHit = 0;
  a.fx.push({ t: "hit", id: target.id, amount: Math.max(1, Math.round(dmg)), kind: opts.dot ? "dot" : "damage", status: opts.dot, big: dmg >= target.hpMax * 0.15 });

  // Poise: enough heavy hits stagger (and expose to an execution).
  if (poise > 0 && target.staggerT <= 0) {
    target.poise -= poise;
    if (target.poise <= 0) {
      target.poise = target.poiseMax;
      target.staggerT = C.staggerTime;
      addStatus(target, "stagger", C.staggerTime, 1, src?.id ?? "");
      const u = target as UnitSim;
      if (u.state) {
        u.state = "recover";
        u.attack = null;
        u.t = C.staggerTime;
      }
    }
  }

  const sp = src as PlayerSim | undefined;
  if (sp?.path) {
    // Sustains that feed on damage dealt.
    if (opts.dot === "bleed" && sp.path.id === "thorn") heal(a, sp, dmg * C.thornBleedHeal, false);
    if ((opts.fire || opts.dot === "burn") && sp.path.id === "ash") heal(a, sp, dmg * C.ashFireHeal, false);
    if (!opts.dot && sp.path.resource.onHit) gainResource(sp, sp.path.resource.onHit);
  }
  const tp = target as PlayerSim;
  if (tp.path?.id === "bark" && !opts.dot) {
    const sh = tp.statuses.get("shield");
    const add = Math.min(C.barkShieldCap - (sh?.value ?? 0), dmg * C.barkShieldOnHit);
    if (add > 0) addStatus(tp, "shield", 4, (sh?.value ?? 0) + add, tp.id);
  }
  if (target.hp <= 0) {
    target.hp = 0;
    a.killed(target, src, dmg - before);
  }
  return dmg;
}

export function heal(a: Arena, f: Fighter, amount: number, show = true) {
  if (f.dead || (f as PlayerSim).downed || amount <= 0) return;
  const before = f.hp;
  f.hp = Math.min(f.hpMax, f.hp + amount);
  if (show && f.hp - before >= 1) a.fx.push({ t: "hit", id: f.id, amount: Math.round(f.hp - before), kind: "heal" });
}

export function gainResource(p: PlayerSim, amount: number) {
  const r = p.path.resource;
  if (r.max <= 0) return;
  p.res = Math.max(0, Math.min(r.max, p.res + amount));
}

// ----------------------------------------------------------------------------- casting

/** Can this skill be cast now? (Cooldown, resource, health, state.) */
export function canCast(p: PlayerSim, slot: number): boolean {
  const skill = p.skills[slot];
  if (!skill || p.dead || p.downed || p.cast || p.silenceT > 0 || p.staggerT > 0) return false;
  if (p.body.dodgeT > 0) return false;
  if (p.cds[slot] > 0) return false;
  const r = p.path.resource;
  if (r.heat) return true;
  if (skill.cost > 0 && p.res < skill.cost) return false;
  if (skill.hpCost && p.hp <= skill.hpCost + 1) return false;
  return true;
}

export function startCast(a: Arena, p: PlayerSim, slot: number, aim: number, aimDist: number) {
  if (!canCast(p, slot)) return false;
  const skill = p.skills[slot];
  p.cds[slot] = skill.cooldown;
  const r = p.path.resource;
  if (r.heat) {
    p.res += skill.cost;
    if (p.res >= r.max) {
      // Overheat: the fire turns on you.
      p.res = r.max * 0.5;
      p.silenceT = C.overheatSilence;
      addStatus(p, "burn", 3, 8, p.id);
      a.fx.push({ t: "overheat", id: p.id });
    }
    p.res = Math.max(0, p.res);
  } else if (skill.cost) gainResource(p, -skill.cost);
  if (skill.hpCost) p.hp = Math.max(1, p.hp - skill.hpCost);
  p.statuses.delete("stealth");
  p.body.facing = aim;
  p.cast = { slot, t: skill.windup, aim, aimDist };
  a.fx.push({ t: "cast", id: p.id, skill: skill.id, vfx: skill.vfx, aim, x: p.body.x, y: p.body.y });
  if (skill.windup <= 0) releaseCast(a, p);
  return true;
}

export function tickCasts(a: Arena, dt: number) {
  for (const p of a.players.values()) {
    for (let i = 0; i < p.cds.length; i++) p.cds[i] = Math.max(0, p.cds[i] - dt);
    if (p.silenceT > 0) p.silenceT = Math.max(0, p.silenceT - dt);
    if (!p.cast) continue;
    if (p.downed || p.staggerT > 0) {
      p.cast = null;
      continue;
    }
    p.cast.t -= dt;
    if (p.cast.t <= 0) releaseCast(a, p);
  }
}

function releaseCast(a: Arena, p: PlayerSim) {
  const c = p.cast!;
  p.cast = null;
  const skill = p.skills[c.slot];
  const once = skill.effects.filter(isOnce);
  const each = skill.effects.filter((e) => !isOnce(e));
  // A forward dash with a line shape cuts through everything along its path; any other dash
  // (a leap back, a gust that leaves a vortex behind) hits where you stood, then moves you.
  const dashE = once.find((e) => e.kind === "dash");
  const through = !!dashE && dashE.kind === "dash" && dashE.distance > 0 && skill.shape.kind === "line";
  const origin = { x: p.body.x, y: p.body.y };
  if (through && dashE?.kind === "dash") dash(a, p, c.aim, dashE.distance);
  const landing = skill.shape.kind === "circle" && skill.shape.at === "aim" ? aimLanding(p.body, c.aim, { x: p.body.x + Math.cos(c.aim) * c.aimDist, y: p.body.y + Math.sin(c.aim) * c.aimDist }, skill.shape.reach ?? 6) : origin;
  for (const e of once) if (e.kind !== "dash") applyOnce(a, p, skill, e, landing);

  if (skill.shape.kind === "circle") a.fx.push({ t: "area", skill: skill.id, vfx: skill.vfx, x: landing.x, y: landing.y, radius: skill.shape.radius, owner: p.id });
  if (skill.shape.kind === "projectile") {
    spawnBolts(a, p, skill, c.aim);
  } else if (skill.shape.kind !== "self") {
    for (const f of foesOf(a, p.faction)) {
      const fp = f.pos();
      if (shapeHits(skill.shape, origin, c.aim, fp.x, fp.y, f.radius, landing)) {
        applyToTarget(a, p, f, each, skill, c.aim);
      }
    }
  }
  if (dashE && dashE.kind === "dash" && !through) dash(a, p, c.aim, dashE.distance);
}

/** Effects that happen once per cast (on the caster, partner or ground), not once per target hit. */
function isOnce(e: Effect): boolean {
  if (e.kind === "status") return e.target === "self" || e.target === "partner";
  return e.kind === "dash" || e.kind === "resource" || e.kind === "summon" || e.kind === "zone" || e.kind === "heal";
}

let boltIds = 0;

function spawnBolts(a: Arena, p: PlayerSim, skill: SkillDef, aim: number) {
  const s = skill.shape as Extract<Shape, { kind: "projectile" }>;
  const n = s.count ?? 1;
  const spread = ((s.spread ?? 0) * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const ang = n === 1 ? aim : aim - spread / 2 + (spread * i) / (n - 1);
    const sx = p.body.x + Math.cos(ang) * 0.4;
    const sy = p.body.y + Math.sin(ang) * 0.4;
    const id = (boltIds = (boltIds + 1) % 1e9);
    a.projectiles.push({ id, x: sx, y: sy, dx: Math.cos(ang), dy: Math.sin(ang), speed: s.speed, left: s.range, radius: s.radius, pierce: !!s.pierce, hit: new Set(), src: p.id, faction: p.faction, skill });
    a.fx.push({ t: "bolt", id, skill: skill.id, vfx: skill.vfx, x: sx, y: sy, aim: ang, speed: s.speed, range: s.range, radius: s.radius, owner: p.id });
  }
}

export function tickProjectiles(a: Arena, dt: number) {
  for (let i = a.projectiles.length - 1; i >= 0; i--) {
    const b = a.projectiles[i];
    const step = b.speed * dt;
    b.x += b.dx * step;
    b.y += b.dy * step;
    b.left -= step;
    let done = b.left <= 0 || a.grid.blocked(Math.floor(b.x), Math.floor(b.y));
    if (!done) {
      const src = fighterById(a, b.src);
      for (const f of foesOf(a, b.faction)) {
        if (b.hit.has(f.id)) continue;
        const fp = f.pos();
        if (Math.hypot(fp.x - b.x, fp.y - b.y) <= f.radius + b.radius) {
          b.hit.add(f.id);
          if (src) applyToTarget(a, src as PlayerSim, f, b.skill.effects.filter((e) => !isOnce(e)), b.skill, Math.atan2(b.dy, b.dx));
          if (!b.pierce) {
            done = true;
            break;
          }
        }
      }
    }
    if (done) {
      a.projectiles.splice(i, 1);
      // Without this the client flew every bolt its full range, through enemies and walls.
      a.fx.push({ t: "boltEnd", id: b.id, x: b.x, y: b.y });
    }
  }
}

function applyToTarget(a: Arena, p: PlayerSim, f: Fighter, effects: Effect[], skill: SkillDef, aim: number) {
  let dealt = 0;
  const fire = !!skill.fire;
  for (const e of effects) {
    if (f.dead) break;
    switch (e.kind) {
      case "damage":
        dealt += dealDamage(a, p, f, e.amount, e.poise ?? 0, { fire });
        break;
      case "status":
        if ((e.target ?? "enemy") === "enemy") addStatus(f, e.status, e.duration, e.value ?? defaultValue(e.status), p.id);
        else if (e.target === "self") addStatus(p, e.status, e.duration, e.value ?? defaultValue(e.status), p.id);
        else {
          const partner = partnerOf(a, p);
          if (partner) addStatus(partner, e.status, e.duration, e.value ?? defaultValue(e.status), p.id);
        }
        break;
      case "detonate": {
        const s = f.statuses.get(e.status);
        if (s) {
          // Consume the status: the bigger the stack, the bigger the burst.
          f.statuses.delete(e.status);
          dealt += dealDamage(a, p, f, e.damage * (1 + Math.min(1.5, s.value / 8)), 20, { fire: e.status === "burn" });
        }
        break;
      }
      case "knockback":
        break;
      case "lifesteal":
        if (!e.onlyIf || f.statuses.has(e.onlyIf)) heal(a, p, dealt * e.fraction);
        break;
    }
  }
  const kb = effects.find((e) => e.kind === "knockback");
  if (kb && kb.kind === "knockback" && !f.dead) push(a, f, Math.cos(aim), Math.sin(aim), kb.distance);
  if (skill.weapon && dealt > 0) gainMastery(a, p, skill.weapon, dealt);
}

/** Weapon-skill damage is mastery XP for that weapon type; a new level is announced. */
export function gainMastery(a: Arena, p: PlayerSim, weapon: WeaponId, xp: number) {
  const before = p.mastery[weapon] ?? 0;
  const after = before + xp;
  p.mastery[weapon] = after;
  const lvl = masteryLevel(after);
  if (lvl > masteryLevel(before)) a.fx.push({ t: "mastery", id: p.id, weapon, level: lvl });
}

function defaultValue(id: StatusId): number {
  switch (id) {
    case "slow":
      return 0.35;
    case "haste":
      return 0.25;
    case "mark":
      return 0.25;
    case "bleed":
    case "burn":
    case "poison":
      return 3;
    default:
      return 1;
  }
}

function applyOnce(a: Arena, p: PlayerSim, skill: SkillDef, e: Effect, at: { x: number; y: number }) {
  switch (e.kind) {
    case "resource":
      gainResource(p, e.amount);
      break;
    case "summon":
      a.summon(p, e.count, e.duration);
      break;
    case "zone":
      a.zones.push({ x: at.x, y: at.y, radius: e.radius, until: a.time + e.duration, dps: e.dps, status: e.status, statusDuration: e.statusDuration, src: p.id, faction: p.faction, clock: 0 });
      a.fx.push({ t: "zone", skill: skill.id, vfx: skill.vfx, x: at.x, y: at.y, radius: e.radius, duration: e.duration, owner: p.id });
      break;
    case "heal": {
      const partner = partnerOf(a, p);
      if (e.target === "self" || e.target === "both") heal(a, p, e.amount);
      if ((e.target === "partner" || e.target === "both") && partner) heal(a, partner, e.amount);
      break;
    }
    case "status": {
      const value = e.value ?? defaultValue(e.status);
      if (e.target === "self") addStatus(p, e.status, e.duration, value, p.id);
      else if (e.target === "partner") {
        const partner = partnerOf(a, p);
        if (partner && !partner.downed) addStatus(partner, e.status, e.duration, value, p.id);
      }
      break;
    }
  }
}

function dash(a: Arena, p: PlayerSim, aim: number, distance: number) {
  const dir = Math.sign(distance);
  const b = p.body;
  moveWithCollision(b, Math.cos(aim) * distance, Math.sin(aim) * distance, a.grid);
  b.vx = Math.cos(aim) * dir * 2;
  b.vy = Math.sin(aim) * dir * 2;
  if (distance < 0) b.facing = aim;
}

/** Shoves a fighter (knockback), stopping at walls. */
export function push(a: Arena, f: Fighter, dx: number, dy: number, distance: number) {
  const u = f as UnitSim;
  const body = (f as PlayerSim).body ?? u;
  const r = f.radius;
  moveWithCollision(body as { x: number; y: number; vx: number; vy: number }, dx * distance, dy * distance, a.grid, r);
}

export function tickZones(a: Arena, dt: number) {
  for (let i = a.zones.length - 1; i >= 0; i--) {
    const z = a.zones[i];
    if (a.time >= z.until) {
      a.zones.splice(i, 1);
      continue;
    }
    z.clock += dt;
    if (z.clock < C.dotTick) continue;
    z.clock -= C.dotTick;
    const src = fighterById(a, z.src);
    for (const f of foesOf(a, z.faction)) {
      const fp = f.pos();
      if (Math.hypot(fp.x - z.x, fp.y - z.y) > z.radius + f.radius) continue;
      if (z.dps > 0) dealDamage(a, src, f, z.dps * C.dotTick, 2, { fire: z.status === "burn" });
      if (z.status) addStatus(f, z.status, z.statusDuration ?? 1, defaultValue(z.status), z.src);
    }
  }
}

/** Shapes of the Greyed's attacks use the same hit test; the landing point is locked at wind-up. */
export function unitAttackHits(u: UnitSim, f: Fighter): boolean {
  const fp = f.pos();
  return !!u.attack && shapeHits(u.attack.shape, u, u.aim, fp.x, fp.y, f.radius, { x: u.ax, y: u.ay });
}
