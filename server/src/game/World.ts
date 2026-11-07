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
  inRegion,
  type Encounter,
  stepBody,
  type AreaMap,
  type BodyType,
  type FxEvent,
  type PathId,
  type PeopleId,
  type Picks,
  type WeaponId,
  DEFAULT_PICKS,
  isWeapon,
  masteryLevel,
  resolveLoadout,
  validLook,
  validPicks,
  CLEAR_XP,
  KILL_XP,
  levelOf,
  slotOpen,
  statsOf,
  talentBonuses,
  validTalents,
  withBonuses,
  SLOT_UNLOCK,
  pointsAt,
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
  releaseGrab,
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
  /** Each player's pick for the scene's choice (option index), and whether it's been decided. */
  picks: Map<string, number>;
  chosen?: number;
}

/** An encounter of the current area and how far it's got. */
interface EncState {
  def: Encounter;
  state: "idle" | "active" | "cleared";
  wave: number;
  phase: "break" | "fight";
  t: number;
}

export interface JoinRequest {
  name?: unknown;
  path?: unknown;
  body?: unknown;
  people?: unknown;
  weapon?: unknown;
  look?: unknown;
}

/** What the host remembers about a character between sessions (server/src/game/Profiles.ts). */
export interface SavedProgress {
  mastery?: Partial<Record<WeaponId, number>>;
  picks?: Partial<Record<WeaponId, Partial<Picks>>>;
  xp?: number;
  talents?: string[];
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
  map: AreaMap;
  grid: CollisionGrid;
  /** Story flags (choices made, areas cleared, scenes seen). The host saves them (Story.ts). */
  readonly flags = new Set<string>();
  /** Called when a flag is set or the area changes, so the host can save. */
  onStory?: () => void;
  private encs: EncState[] = [];
  /** Seconds both players have stood in an exit (a short beat before the fade). */
  private exitT = 0;
  /** When each lever of the area was last pulled (a lever group's flag needs them all within a window). */
  private readonly levers = new Map<number, number>();
  readonly players = new Map<string, PlayerSim>();
  readonly units = new Map<string, UnitSim>();
  projectiles: Projectile[] = [];
  /** Where the dead lie (corpse-eaters go for them), newest last. */
  corpses: { id: string; x: number; y: number }[] = [];
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
  /** The area's encounters send waves (tests that place their own enemies turn this off). */
  waves = true;
  private readonly fields = new Map<string, { field: FlowField; cell: number; at: number }>();
  private pendingSpawns: { kind: keyof typeof GREYED; at: number }[] = [];

  /** Seeded randomness: the simulation (and the balance tests) play out the same on every machine. */
  private seed: number;

  constructor(mapId = START_MAP, seed = Date.now(), flags: Iterable<string> = []) {
    this.seed = seed >>> 0;
    for (const f of flags) this.flags.add(f);
    const map = MAPS[mapId] ?? MAPS[START_MAP];
    this.map = map;
    this.grid = CollisionGrid.fromMap(map, this.flags);
    this.loadEncounters();
  }

  // ------------------------------------------------------------------------- story and areas

  setFlag(f: string) {
    if (this.flags.has(f)) return;
    this.flags.add(f);
    // A gate opening changes the walls; the paths are recomputed from the new grid.
    if (this.map.props.some((p) => p.until === f)) {
      this.grid = CollisionGrid.fromMap(this.map, this.flags);
      this.fields.clear();
      this.fx.push({ t: "opened", flag: f });
    }
    this.onStory?.();
  }

  private loadEncounters() {
    this.encs = (this.map.encounters ?? []).map((def) => ({ def, state: def.clearFlag && this.flags.has(def.clearFlag) && !def.repeat ? "cleared" : "idle", wave: -1, phase: "break", t: 0 }));
    this.phase = "waiting";
    this.wave = -1;
  }

  /**
   * Both players go to another area: the map is swapped, everyone stands at the arrival spawn, the
   * fighting and the dead stay behind. The area's intro plays the first time.
   */
  travel(mapId: string, spawn = 0) {
    const map = MAPS[mapId];
    if (!map) return;
    this.map = map;
    this.grid = CollisionGrid.fromMap(map, this.flags);
    this.levers.clear();
    this.units.clear();
    this.projectiles = [];
    this.zones = [];
    this.corpses = [];
    this.fields.clear();
    this.pendingSpawns = [];
    this.exitT = 0;
    for (const [i, p] of [...this.players.values()].entries()) {
      const s = map.spawns[(spawn + i) % map.spawns.length];
      Object.assign(p.body, newBody(s.x, s.y));
      p.statuses.clear();
      p.cast = null;
      if (p.downed) {
        p.downed = false;
        p.hp = p.hpMax * C.reviveHealth;
      }
    }
    this.loadEncounters();
    this.fx.push({ t: "arrive", id: map.id, name: map.name });
    this.playIntro();
    this.onStory?.();
  }

  private playIntro() {
    const intro = this.map.introCinematic;
    if (!this.cinematic && intro && !this.flags.has(`seen:${intro}`)) {
      this.setFlag(`seen:${intro}`);
      this.startCinematic(intro);
    }
  }

  /** Exits: both players (those standing) in an open exit for a moment → travel. */
  private tickExits(dt: number) {
    const exits = this.map.exits;
    if (!exits?.length || this.players.size === 0) return;
    const locked = this.encs.some((e) => e.state === "active" && e.def.lock);
    const standing = [...this.players.values()].filter((p) => !p.downed);
    const exit = locked ? undefined : exits.find((x) => (!x.needs || this.flags.has(x.needs)) && standing.length > 0 && standing.every((p) => inRegion(x.region, p.body.x, p.body.y)));
    if (!exit) {
      this.exitT = 0;
      return;
    }
    this.exitT += dt;
    if (this.exitT >= C.exitDwell) this.travel(exit.to, exit.spawn);
  }

  /**
   * F at a lever pulls it. A group's flag is set once every lever of the group was pulled within
   * `leverWindow` seconds: one player can't do it alone, the two must pull together.
   */
  private pullLever(p: PlayerSim): boolean {
    const levers = this.map.levers ?? [];
    const i = levers.findIndex((l) => !this.flags.has(l.flag) && Math.hypot(l.x - p.body.x, l.y - p.body.y) <= C.talkRange);
    if (i < 0) return false;
    const l = levers[i];
    // F is held, so a lever is "pulled" every tick it's held; the click sounds once.
    const last = this.levers.get(i);
    if (last === undefined || this.time - last > 0.3) this.fx.push({ t: "lever", i });
    this.levers.set(i, this.time);
    const group = levers.map((o, j) => [o, j] as const).filter(([o]) => o.group === l.group);
    if (group.every(([, j]) => this.levers.has(j) && this.time - this.levers.get(j)! <= C.leverWindow)) this.setFlag(l.flag);
    return true;
  }

  /** NPCs present in this area given the story so far. */
  npcs() {
    return (this.map.npcs ?? []).filter((n) => (!n.needs || this.flags.has(n.needs)) && (!n.unless || !this.flags.has(n.unless)));
  }

  // ------------------------------------------------------------------------- players

  addPlayer(id: string, req: JoinRequest | string, saved: SavedProgress = {}): PlayerSim {
    const r: JoinRequest = typeof req === "string" ? { name: req } : req;
    const taken = new Set([...this.players.values()].map((p) => `${p.body.x},${p.body.y}`));
    const spawn = this.map.spawns.find((s) => !taken.has(`${s.x},${s.y}`)) ?? this.map.spawns[0];
    const look = [...this.players.values()].some((o) => o.look === "a") ? "b" : "a";
    const pathId: PathId = typeof r.path === "string" && r.path in PATHS ? (r.path as PathId) : "thorn";
    const path = PATHS[pathId];
    const body = newBody(spawn.x, spawn.y);
    // The path's first home weapon unless the player brought another one.
    const weapon: WeaponId = isWeapon(r.weapon) ? r.weapon : path.homeWeapons[0];
    const mastery: Partial<Record<WeaponId, number>> = {};
    for (const [w, xp] of Object.entries(saved.mastery ?? {})) if (isWeapon(w) && typeof xp === "number" && xp >= 0) mastery[w] = Math.min(xp, 1e7);
    const picks: Partial<Record<WeaponId, Picks>> = {};
    for (const [w, pk] of Object.entries(saved.picks ?? {})) if (isWeapon(w)) picks[w] = validPicks(pk, masteryLevel(mastery[w] ?? 0));
    const xp = typeof saved.xp === "number" && saved.xp >= 0 ? Math.min(saved.xp, 1e7) : 0;
    const level = levelOf(xp);
    const p: PlayerSim = {
      id,
      xp,
      level,
      talents: validTalents(path, saved.talents, level),
      taken: 1,
      speed: path.speed,
      statusMul: {},
      name: sanitizeName(r.name),
      look,
      path,
      weapon,
      mastery,
      picks,
      skills: [],
      appearance: validLook(r.look, pathId),
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
      cds: [],
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
    this.rebuildSkills(p);
    this.players.set(id, p);

    // Joining mid-scene needs nothing special: the cinematic is synced state, so the newcomer
    // starts it at the same moment as the partner.
    this.playIntro();
    return p;
  }

  /**
   * Rebuilds a player's bar from their path, weapon, tree picks and mastery, then the talents' (and
   * items') bonuses on top; and the body's numbers (health, armour, speed) from the same bonuses.
   * Cooldowns already running keep running.
   */
  rebuildSkills(p: PlayerSim) {
    const level = masteryLevel(p.mastery[p.weapon] ?? 0);
    const picks = validPicks(p.picks[p.weapon] ?? DEFAULT_PICKS, level);
    p.picks[p.weapon] = picks;
    const bonuses = this.bonusesOf(p);
    p.skills = resolveLoadout(p.path, p.weapon, picks, level).skills.map((s, i) => withBonuses(s, i, bonuses));
    const old = p.cds;
    p.cds = p.skills.map((_, i) => old?.[i] ?? 0);
    p.cast = null;
    const stats = statsOf(p.path, bonuses);
    const ratio = p.hpMax > 0 ? p.hp / p.hpMax : 1;
    p.hpMax = stats.hpMax;
    p.hp = Math.min(p.hpMax, Math.max(p.downed ? 0 : 1, Math.round(p.hpMax * ratio)));
    p.taken = stats.taken;
    p.speed = stats.speed;
    p.statusMul = stats.status;
  }

  /** Everything that adds to a character beyond the path: talents now, equipment too (items.ts). */
  bonusesOf(p: PlayerSim) {
    return talentBonuses(p.path, p.talents);
  }

  /**
   * Experience for both players (kills and won fights are shared). A new level opens bar slots and
   * gives a talent point; the client shows both (fx levelUp).
   */
  grantXp(amount: number) {
    if (amount <= 0) return;
    for (const p of this.players.values()) {
      const before = p.level;
      p.xp += amount;
      p.level = levelOf(p.xp);
      if (p.level === before) continue;
      const opened = SLOT_UNLOCK.flatMap((lvl, slot) => (lvl > before && lvl <= p.level ? [slot] : []));
      this.rebuildSkills(p);
      this.fx.push({ t: "levelUp", id: p.id, level: p.level, slots: opened, points: pointsAt(p.level) - p.talents.length });
      this.onStory?.();
    }
  }

  /** A player spends or changes talents (MSG.talent): untrusted, checked against the tree and level. */
  setTalents(id: string, raw: unknown): boolean {
    const p = this.players.get(id);
    if (!p || this.phase === "fight") return false;
    const list = raw && typeof raw === "object" ? (raw as { talents?: unknown }).talents : undefined;
    const next = validTalents(p.path, list, p.level);
    // Talents are only added outside a bonfire; taking them back (respec) needs the area's fire.
    const removes = p.talents.some((t) => !next.includes(t));
    if (removes && !this.nearBonfire(p)) return false;
    p.talents = next;
    this.rebuildSkills(p);
    return true;
  }

  /** Standing at the area's fire (where you get up after a wipe): respec, later the belt refill. */
  nearBonfire(p: PlayerSim) {
    const b = this.map.bonfire;
    return !!b && Math.hypot(b.x - p.body.x, b.y - p.body.y) <= 2.5;
  }

  /**
   * A player changes weapon or tree picks (MSG.loadout). Untrusted input; only allowed outside a
   * wave so nobody swaps mid-fight. Returns whether anything changed.
   */
  setLoadout(id: string, raw: unknown): boolean {
    const p = this.players.get(id);
    if (!p || this.phase === "fight" || !raw || typeof raw !== "object") return false;
    const r = raw as { weapon?: unknown; picks?: unknown };
    if (isWeapon(r.weapon)) p.weapon = r.weapon;
    if (r.picks && typeof r.picks === "object") p.picks[p.weapon] = validPicks(r.picks as Partial<Picks>, masteryLevel(p.mastery[p.weapon] ?? 0));
    this.rebuildSkills(p);
    return true;
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
    this.cinematic = { id, elapsedMs: 0, votes: new Set(), picks: new Map() };
  }

  /** A player picks an option of the scene's choice (MSG.choice). Untrusted input. */
  pickChoice(id: string, raw: unknown) {
    const c = this.cinematic;
    const def = c ? CINEMATICS[c.id] : undefined;
    const option = raw && typeof raw === "object" ? (raw as { option?: unknown }).option : undefined;
    if (!c || !def?.choice || c.chosen !== undefined || !this.players.has(id)) return;
    if (typeof option !== "number" || !Number.isInteger(option) || option < 0 || option >= def.choice.options.length) return;
    if (c.elapsedMs < def.choice.t) return;
    c.picks.set(id, option);
    // Decided when everyone present picked the same option.
    const picks = [...this.players.keys()].map((pid) => c.picks.get(pid));
    if (picks.every((v) => v === option)) {
      c.chosen = option;
      this.setFlag(def.choice.options[option].flag);
    }
  }

  /** A scene ends (played out or skipped): its flags, its travel, or the chosen option's next scene. */
  private endCinematic() {
    const c = this.cinematic;
    if (!c) return;
    const def = CINEMATICS[c.id];
    this.cinematic = null;
    for (const f of def.onEnd?.flags ?? []) this.setFlag(f);
    const next = (def.choice && c.chosen !== undefined ? def.choice.options[c.chosen].then : undefined) ?? def.onEnd?.next;
    if (def.onEnd?.travel) this.travel(def.onEnd.travel.to, def.onEnd.travel.spawn);
    if (next) this.startCinematic(next);
  }

  /** A player wants to skip. The scene ends once every player present agrees. */
  voteSkip(id: string) {
    if (!this.cinematic || !this.players.has(id)) return;
    this.cinematic.votes.add(id);
    this.checkSkip();
  }

  private checkSkip() {
    const c = this.cinematic;
    // A choice can't be skipped past: the scene skips to the choice and waits there.
    if (!c || this.players.size === 0 || ![...this.players.keys()].every((id) => c.votes.has(id))) return;
    const def = CINEMATICS[c.id];
    if (def.choice && c.chosen === undefined) {
      c.elapsedMs = Math.max(c.elapsedMs, def.choice.t);
      c.votes.clear();
      return;
    }
    this.endCinematic();
  }

  // ------------------------------------------------------------------------- the step

  step(dt: number) {
    this.time += dt;
    if (this.cinematic) {
      const def = CINEMATICS[this.cinematic.id];
      const waiting = def.choice && this.cinematic.chosen === undefined && this.cinematic.elapsedMs >= def.choice.t;
      if (!waiting) this.cinematic.elapsedMs += dt * 1000;
      if (this.cinematic.elapsedMs >= def.durationMs) this.endCinematic();
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
        stepBody(p.body, f, dt, this.grid, p.downed ? 0.25 : speedOf(p, p.speed), free);
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
    this.tickExits(dt);
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
      // F next to someone with something to say plays their scene (when no one is fighting).
      const npc = !this.encs.some((e) => e.state === "active") ? this.npcs().find((n) => n.scene && Math.hypot(n.x - p.body.x, n.y - p.body.y) <= C.talkRange) : undefined;
      if (npc?.scene && !this.cinematic) {
        this.startCinematic(npc.scene);
        return;
      }
      if (this.pullLever(p)) continue;
      const victim = [...this.units.values()].find((u) => !u.dead && u.faction === "greyed" && u.staggerT > 0 && near(p, u, C.interactRange + u.radius));
      if (victim) {
        this.fx.push({ t: "execute", by: p.id, id: victim.id });
        // Bosses can't be finished in one blow; an execution tears a chunk off instead.
        const amount = victim.def.boss ? victim.hpMax * 0.12 : victim.hp + victim.hpMax * 0.5;
        victim.staggerT = 0;
        victim.statuses.delete("stagger");
        dealDamage(this, p, victim, amount, 0, { cause: "exec" });
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
      const b = this.map.bonfire;
      const s = b ? { x: b.x + (i ? 0.8 : -0.8), y: b.y + 0.6 } : this.map.spawns[i % this.map.spawns.length];
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
    // The fight in progress starts its current wave over.
    for (const e of this.encs) if (e.state === "active" && e.phase === "fight") {
      e.wave = Math.max(-1, e.wave - 1);
      e.phase = "break";
      e.t = C.waveDelay;
    }
  }

  // ------------------------------------------------------------------------- the gate assault

  private resetEncounter() {
    this.units.clear();
    this.pendingSpawns = [];
    this.loadEncounters();
  }

  /** The waves and the banner of the encounter being fought (the HUD and music follow it). */
  activeEncounter(): { title: string; wave: number } | null {
    const e = this.encs.find((x) => x.state === "active");
    return e && e.wave >= 0 ? { title: e.def.waves[e.wave].title, wave: e.wave } : null;
  }

  /**
   * The area's fights: each waits for its trigger, then sends its waves with a breather between,
   * and once won sets its flag (and may play a scene). The courtyard's gate assault is one of these.
   */
  private tickEncounter(dt: number) {
    if (!this.encounter || !this.waves || this.players.size === 0) return;
    const standing = [...this.players.values()].filter((p) => !p.downed);
    for (const e of this.encs) {
      if (e.state === "cleared") continue;
      if (e.state === "idle") {
        if (e.def.needs && !this.flags.has(e.def.needs)) continue;
        if (this.encs.some((x) => x.state === "active")) continue;
        const triggered = !e.def.trigger || standing.some((p) => inRegion(e.def.trigger!, p.body.x, p.body.y));
        if (!triggered) continue;
        e.state = "active";
        e.wave = -1;
        e.phase = "break";
        e.t = C.waveDelay;
      }
      e.t -= dt;
      if (e.phase === "break" && e.t <= 0) {
        e.wave++;
        const w = e.def.waves[e.wave];
        if (e.wave === 0 && e.def.gate) this.fx.push({ t: "gate" });
        this.fx.push({ t: "wave", n: e.wave + 1, title: w.title });
        let at = this.time + 0.8;
        for (const s of w.spawns) for (let i = 0; i < s.count; i++) this.pendingSpawns.push({ kind: s.kind, at: (at += 0.45) });
        e.phase = "fight";
      }
      if (e.phase === "fight") {
        for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
          const s = this.pendingSpawns[i];
          if (this.time < s.at) continue;
          this.pendingSpawns.splice(i, 1);
          const from = e.def.spawnAt[Math.floor(this.random() * e.def.spawnAt.length)];
          const u = makeUnit(GREYED[s.kind], from.x + (this.random() - 0.5) * 0.8, from.y + (this.random() - 0.5) * 0.8);
          this.units.set(u.id, u);
        }
        const foes = [...this.units.values()].filter((u) => u.faction === "greyed" && !u.dead);
        if (!foes.length && !this.pendingSpawns.length) {
          if (e.wave === e.def.waves.length - 1) {
            this.fx.push({ t: "victory" });
            if (e.def.clearFlag) this.setFlag(e.def.clearFlag);
            this.grantXp(CLEAR_XP);
            if (e.def.repeat) {
              e.state = "idle";
              e.wave = -1;
            } else e.state = "cleared";
            if (e.def.clearCinematic && !this.cinematic) this.startCinematic(e.def.clearCinematic);
          } else {
            e.phase = "break";
            e.t = C.waveDelay;
          }
        }
      }
    }
    // Mirrored for the schema (the HUD's wave banner, the fight music).
    const act = this.encs.find((x) => x.state === "active");
    this.phase = act ? (act.phase === "fight" ? "fight" : "break") : "waiting";
    this.wave = act ? act.wave : -1;
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
    if (u.faction === "greyed") this.grantXp(KILL_XP[u.kind] ?? 10);
    const pos = u.pos();
    if (u.grabbed) releaseGrab(this, u);
    if (u.kind !== "thrall") {
      this.corpses.push({ id: u.id, x: pos.x, y: pos.y });
      if (this.corpses.length > 80) this.corpses.shift();
    }
    const lh = u.lastHit;
    this.fx.push({
      t: "death",
      id: u.id,
      gore: overkill > u.hpMax * C.goreOverkill || !!u.def.deathBurst || lh?.cause === "exec",
      x: pos.x,
      y: pos.y,
      dx: lh ? Math.round(lh.dx * 100) / 100 : 0,
      dy: lh ? Math.round(lh.dy * 100) / 100 : 0,
      cause: lh?.cause,
      ok: Math.round((overkill / u.hpMax) * 100) / 100,
      kind: u.kind,
    });
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
