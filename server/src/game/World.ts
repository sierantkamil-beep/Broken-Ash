import {
  BALANCE,
  CINEMATICS,
  CollisionGrid,
  GATE_ASSAULT,
  GREYED,
  MAPS,
  MAX_NAME_LENGTH,
  newBody,
  PATHS,
  PEOPLES,
  sanitizeInput,
  START_MAP,
  stepBody,
  type AreaMap,
  type BodyType,
  type FxEvent,
  type PathId,
  type PeopleId,
} from "@broken-ash/shared";
import {
  addStatus,
  dealDamage,
  foesOf,
  gainResource,
  heal,
  speedOf,
  startCast,
  tickCasts,
  tickProjectiles,
  tickStatuses,
  tickZones,
  type Arena,
  type Projectile,
  type Zone,
} from "./Combat.js";
import type { Fighter, PlayerSim, UnitSim } from "./fighters.js";
import { FlowField } from "./Pathing.js";
import { makeUnit, thrallDef, tickUnits } from "./Units.js";

export interface RunningCinematic {
  id: string;
  elapsedMs: number;
  votes: Set<string>;
}

export interface JoinRequest {
  name?: unknown;
  path?: unknown;
  body?: unknown;
  people?: unknown;
}

/** Burst allowance after a lag spike, in steps. */
const MAX_CREDIT = 10;
const C = BALANCE.combat;

export type Phase = "waiting" | "break" | "fight" | "victory";

/**
 * The authoritative simulation for one area. Network-free and deterministic, so it is unit tested
 * directly; rooms/WorldRoom.ts only forwards messages and mirrors state into the schema.
 */
export class World implements Arena {
  readonly map: AreaMap;
  readonly grid: CollisionGrid;
  readonly players = new Map<string, PlayerSim>();
  readonly units = new Map<string, UnitSim>();
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  fx: FxEvent[] = [];
  time = 0;
  cinematic: RunningCinematic | null = null;
  /** The gate assault: waiting for the players, a break between waves, a wave in progress, or won. */
  phase: Phase = "waiting";
  wave = -1;
  phaseT = 0;
  /** Both players down: everyone gets up when this reaches 0. */
  wipeT = 0;
  /** Set false in tests that want an empty courtyard. */
  encounter = true;
  private readonly seenIntro = new Set<string>();
  private readonly fields = new Map<string, { field: FlowField; cell: number; at: number }>();
  private pendingSpawns: { kind: keyof typeof GREYED; at: number }[] = [];

  /** Seeded randomness: the simulation (and the balance tests) play out the same on every machine. */
  private seed: number;

  constructor(mapId = START_MAP, seed = Date.now()) {
    this.seed = seed >>> 0;
    const map = MAPS[mapId];
    if (!map) throw new Error(`unknown map ${mapId}`);
    this.map = map;
    this.grid = CollisionGrid.fromMap(map);
  }

  // ------------------------------------------------------------------------- players

  addPlayer(id: string, req: JoinRequest | string): PlayerSim {
    const r: JoinRequest = typeof req === "string" ? { name: req } : req;
    const taken = new Set([...this.players.values()].map((p) => `${p.body.x},${p.body.y}`));
    const spawn = this.map.spawns.find((s) => !taken.has(`${s.x},${s.y}`)) ?? this.map.spawns[0];
    const look = [...this.players.values()].some((o) => o.look === "a") ? "b" : "a";
    const pathId: PathId = typeof r.path === "string" && r.path in PATHS ? (r.path as PathId) : "thorn";
    const path = PATHS[pathId];
    const body = newBody(spawn.x, spawn.y);
    const p: PlayerSim = {
      id,
      name: sanitizeName(r.name),
      look,
      path,
      bodyType: r.body === "female" ? "female" : ("male" as BodyType),
      people: (PEOPLES.some((x) => x.id === r.people) ? r.people : path.people) as PeopleId,
      body,
      queue: [],
      lastSeq: 0,
      credit: 0,
      faction: "players",
      radius: BALANCE.player.radius,
      hp: path.hp,
      hpMax: path.hp,
      statuses: new Map(),
      poise: 9999,
      poiseMax: 9999,
      staggerT: 0,
      dead: false,
      sinceHit: 99,
      dotClock: 0,
      res: path.resource.start,
      cds: path.skills.map(() => 0),
      cast: null,
      silenceT: 0,
      downed: false,
      downT: 0,
      reviveHeld: 0,
      act: false,
      aim: Math.PI / 4,
      aimDist: 3,
      pos() {
        return { x: body.x, y: body.y };
      },
    };
    this.players.set(id, p);

    // Joining mid-scene needs nothing special: the cinematic is synced state, so the newcomer
    // starts it at the same moment as the partner.
    if (!this.cinematic && this.map.introCinematic && !this.seenIntro.has(this.map.id)) {
      this.seenIntro.add(this.map.id);
      this.startCinematic(this.map.introCinematic);
    }
    return p;
  }

  removePlayer(id: string) {
    this.players.delete(id);
    if (this.cinematic) {
      this.cinematic.votes.delete(id);
      if (this.players.size === 0) this.cinematic = null;
      else this.checkSkip();
    }
    if (this.players.size === 0) this.resetEncounter();
  }

  /** Queues input frames from a client. Untrusted: malformed, old or excess frames are dropped. */
  queueInputs(id: string, raw: unknown) {
    const p = this.players.get(id);
    if (!p || !Array.isArray(raw)) return;
    for (const r of raw.slice(0, BALANCE.net.maxQueuedInputs)) {
      const f = sanitizeInput(r);
      const newest = p.queue.length ? p.queue[p.queue.length - 1].seq : p.lastSeq;
      if (!f || f.seq <= newest) continue;
      if (p.queue.length >= BALANCE.net.maxQueuedInputs) p.queue.shift();
      p.queue.push(f);
    }
  }

  // ------------------------------------------------------------------------- cinematics

  startCinematic(id: string) {
    if (!CINEMATICS[id]) throw new Error(`unknown cinematic ${id}`);
    this.cinematic = { id, elapsedMs: 0, votes: new Set() };
  }

  /** A player wants to skip. The scene ends once every player present agrees. */
  voteSkip(id: string) {
    if (!this.cinematic || !this.players.has(id)) return;
    this.cinematic.votes.add(id);
    this.checkSkip();
  }

  private checkSkip() {
    const c = this.cinematic;
    if (c && this.players.size > 0 && [...this.players.keys()].every((id) => c.votes.has(id))) this.cinematic = null;
  }

  // ------------------------------------------------------------------------- the step

  step(dt: number) {
    this.time += dt;
    if (this.cinematic) {
      this.cinematic.elapsedMs += dt * 1000;
      if (this.cinematic.elapsedMs >= CINEMATICS[this.cinematic.id].durationMs) this.cinematic = null;
    }
    for (const p of this.players.values()) {
      p.credit = Math.min(MAX_CREDIT, p.credit + 1);
      // During a cinematic nobody moves: inputs are acknowledged and dropped.
      if (this.cinematic) {
        if (p.queue.length) p.lastSeq = p.queue[p.queue.length - 1].seq;
        p.queue.length = 0;
        continue;
      }
      let n = 0;
      p.act = false;
      while (p.queue.length && p.credit >= 1 && n < BALANCE.net.maxInputsPerStep) {
        const f = p.queue.shift()!;
        const x0 = p.body.x;
        const y0 = p.body.y;
        const free = !p.downed && p.staggerT <= 0 && !p.statuses.has("rooted");
        stepBody(p.body, f, dt, this.grid, p.downed ? 0.25 : speedOf(p, p.path.speed), free);
        if (p.path.resource.onMove) gainResource(p, Math.hypot(p.body.x - x0, p.body.y - y0) * p.path.resource.onMove);
        if (f.aim !== undefined) p.aim = f.aim;
        if (f.aimDist !== undefined) p.aimDist = f.aimDist;
        if (f.act) p.act = true;
        if (f.cast !== undefined) startCast(this, p, f.cast, p.aim, p.aimDist);
        p.lastSeq = f.seq;
        p.credit -= 1;
        n++;
      }
    }
    if (this.cinematic) return;

    tickCasts(this, dt);
    tickProjectiles(this, dt);
    tickZones(this, dt);
    tickStatuses(this, dt);
    this.tickSustain(dt);
    if (this.encounter) tickUnits(this, dt, (t) => this.fieldTo(t));
    this.tickInteractions(dt);
    this.tickEncounter(dt);
  }

  /** Resources and each path's own way of staying alive (design.md §4). */
  private tickSustain(dt: number) {
    for (const p of this.players.values()) {
      if (p.downed) continue;
      const r = p.path.resource;
      if (r.max > 0) p.res = Math.max(0, Math.min(r.max, p.res + r.regen * dt));
      switch (p.path.id) {
        case "storm":
          if (p.res >= C.stormShieldAt) {
            const sh = p.statuses.get("shield");
            if ((sh?.value ?? 0) < 30) addStatus(p, "shield", 2, (sh?.value ?? 0) + C.stormShieldRate * dt, p.id);
          }
          break;
        case "graves": {
          const thralls = [...this.units.values()].filter((u) => u.owner === p.id && !u.dead).length;
          if (thralls) heal(this, p, p.hpMax * C.gravesDrain * thralls * dt, false);
          break;
        }
        case "dusk":
          if (p.statuses.has("stealth")) heal(this, p, p.hpMax * C.duskStealthHeal * dt, false);
          break;
      }
    }
  }

  /** F: revive a downed partner, or execute a staggered enemy. Bleeding out and wipes. */
  private tickInteractions(dt: number) {
    const list = [...this.players.values()];
    for (const p of list) {
      if (p.downed) {
        p.downT -= dt;
        const helper = list.find((o) => o !== p && !o.downed && o.act && near(o, p, C.interactRange));
        p.reviveHeld = helper ? p.reviveHeld + dt : Math.max(0, p.reviveHeld - dt * 2);
        if (p.reviveHeld >= C.reviveTime) {
          p.downed = false;
          p.hp = p.hpMax * C.reviveHealth;
          p.reviveHeld = 0;
          this.fx.push({ t: "revived", id: p.id });
        }
        continue;
      }
      if (!p.act) continue;
      const victim = [...this.units.values()].find((u) => !u.dead && u.faction === "greyed" && u.staggerT > 0 && near(p, u, C.interactRange + u.radius));
      if (victim) {
        this.fx.push({ t: "execute", by: p.id, id: victim.id });
        // Bosses can't be finished in one blow; an execution tears a chunk off instead.
        const amount = victim.def.boss ? victim.hpMax * 0.12 : victim.hp + victim.hpMax * 0.5;
        victim.staggerT = 0;
        victim.statuses.delete("stagger");
        dealDamage(this, p, victim, amount, 0);
        for (const o of list) if (!o.downed) heal(this, o, o.hpMax * C.executionHeal);
      }
    }
    const alive = list.filter((p) => !p.downed);
    if (list.length && !alive.length) {
      if (this.wipeT <= 0) this.wipeT = C.wipeDelay;
      this.wipeT -= dt;
      if (this.wipeT <= 0) this.wipe();
    }
  }

  /** Both of you fell: get up at the spawn, and the current wave starts over. */
  private wipe() {
    this.wipeT = 0;
    for (const [i, p] of [...this.players.values()].entries()) {
      const s = this.map.spawns[i % this.map.spawns.length];
      Object.assign(p.body, newBody(s.x, s.y));
      p.downed = false;
      p.hp = p.hpMax;
      p.statuses.clear();
      p.res = p.path.resource.start;
    }
    this.units.clear();
    this.projectiles = [];
    this.zones = [];
    this.pendingSpawns = [];
    if (this.phase === "fight") {
      this.wave = Math.max(-1, this.wave - 1);
      this.phase = "break";
      this.phaseT = C.waveDelay;
    }
  }

  // ------------------------------------------------------------------------- the gate assault

  private resetEncounter() {
    this.phase = "waiting";
    this.wave = -1;
    this.units.clear();
    this.pendingSpawns = [];
  }

  private tickEncounter(dt: number) {
    if (!this.encounter || this.players.size === 0) return;
    this.phaseT -= dt;
    if (this.phase === "waiting") {
      this.phase = "break";
      this.phaseT = C.waveDelay;
      return;
    }
    if (this.phase === "break" && this.phaseT <= 0) {
      this.wave++;
      if (this.wave >= GATE_ASSAULT.length) this.wave = 0;
      const w = GATE_ASSAULT[this.wave];
      if (this.wave === 0) this.fx.push({ t: "gate" });
      this.fx.push({ t: "wave", n: this.wave + 1, title: w.title });
      let at = this.time + 0.8;
      for (const s of w.spawns) for (let i = 0; i < s.count; i++) this.pendingSpawns.push({ kind: s.kind, at: (at += 0.45) });
      this.phase = "fight";
      return;
    }
    if (this.phase === "fight") {
      for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
        const s = this.pendingSpawns[i];
        if (this.time < s.at) continue;
        this.pendingSpawns.splice(i, 1);
        // Through the vermilion gate, fanning out a little.
        const u = makeUnit(GREYED[s.kind], 14.5 + (this.random() - 0.5) * 0.8, 0.9 + this.random() * 0.4);
        this.units.set(u.id, u);
      }
      const greyed = [...this.units.values()].filter((u) => u.faction === "greyed" && !u.dead);
      if (!greyed.length && !this.pendingSpawns.length) {
        if (this.wave === GATE_ASSAULT.length - 1) {
          this.phase = "victory";
          this.phaseT = C.victoryHold;
          this.fx.push({ t: "victory" });
        } else {
          this.phase = "break";
          this.phaseT = C.waveDelay;
        }
      }
    }
    if (this.phase === "victory" && this.phaseT <= 0) {
      this.phase = "break";
      this.wave = -1;
      this.phaseT = C.waveDelay;
    }
  }

  // ------------------------------------------------------------------------- Arena callbacks

  summon(owner: PlayerSim, count: number, duration: number) {
    for (let i = 0; i < count; i++) {
      const a = owner.body.facing + (i - (count - 1) / 2) * 0.9;
      const u = makeUnit(thrallDef(), owner.body.x + Math.cos(a) * 1.2, owner.body.y + Math.sin(a) * 1.2, "players", "thrall");
      u.life = duration;
      u.owner = owner.id;
      if (this.grid.blocked(Math.floor(u.x), Math.floor(u.y))) Object.assign(u, { x: owner.body.x, y: owner.body.y });
      this.units.set(u.id, u);
    }
  }

  killed(victim: Fighter, killer: Fighter | undefined, overkill: number) {
    const p = victim as PlayerSim;
    if (p.path) {
      // Players aren't killed: they go down and bleed out until revived (or everyone falls).
      p.hp = 0;
      p.downed = true;
      p.downT = C.bleedOut;
      p.cast = null;
      p.statuses.clear();
      this.fx.push({ t: "downed", id: p.id });
      return;
    }
    const u = victim as UnitSim;
    u.dead = true;
    const pos = u.pos();
    this.fx.push({ t: "death", id: u.id, gore: overkill > u.hpMax * C.goreOverkill || !!u.def.deathBurst, x: pos.x, y: pos.y });
    if (u.def.deathBurst && u.faction === "greyed") {
      const b = u.def.deathBurst;
      this.fx.push({ t: "burst", x: pos.x, y: pos.y, radius: b.radius });
      for (const f of foesOf(this, u.faction)) {
        const fp = f.pos();
        if (Math.hypot(fp.x - pos.x, fp.y - pos.y) <= b.radius + f.radius) {
          dealDamage(this, u, f, b.damage, 0);
          addStatus(f, b.status, b.duration, b.value, u.id);
        }
      }
    }
    this.units.delete(u.id);
    if (u.faction === "greyed") {
      // Graves feeds on the dead nearby.
      for (const pl of this.players.values()) {
        if (pl.path.resource.onDeathNearby && near(pl, u, 7)) gainResource(pl, pl.path.resource.onDeathNearby);
      }
    }
    void killer;
  }

  /** A flow field towards a fighter, rebuilt when they change cell (at most twice a second). */
  private fieldTo(t: Fighter) {
    const p = t.pos();
    const cell = Math.floor(p.y) * this.map.width + Math.floor(p.x);
    const cur = this.fields.get(t.id);
    if (cur && (cur.cell === cell || this.time - cur.at < 0.5)) return cur.field;
    const field = new FlowField(this.grid, p.x, p.y);
    this.fields.set(t.id, { field, cell, at: this.time });
    return field;
  }

  /** mulberry32: small, fast, and the same sequence everywhere for a given seed. */
  random(): number {
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns and clears the visual events of this step. */
  drainFx(): FxEvent[] {
    const e = this.fx;
    this.fx = [];
    return e;
  }
}

function near(a: Fighter, b: Fighter, range: number) {
  const p = a.pos();
  const q = b.pos();
  return Math.hypot(p.x - q.x, p.y - q.y) <= range;
}

export function sanitizeName(raw: unknown): string {
  // Strip control characters and collapse whitespace; names are shown above heads and in chat.
  const name = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
  return name || "Popielny";
}
