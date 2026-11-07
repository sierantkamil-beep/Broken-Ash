import { Room, type Client } from "@colyseus/core";
import { MAX_PLAYERS, MSG, PATCH_HZ, SIM_DT, type JoinOptions } from "@broken-ash/shared";
import type { Profiles } from "../game/Profiles.js";
import type { Story } from "../game/Story.js";
import { World } from "../game/World.js";
import type { PlayerSim } from "../game/fighters.js";
import { PlayerState, UnitState, WorldState } from "../schema/WorldState.js";

const round = (v: number, step: number) => Math.round(v / step) * step;

/**
 * Thin network layer: forwards validated messages to the World and mirrors its state into the
 * schema. All game rules live in game/World.ts and its modules. Visual events (hits, casts,
 * deaths) go out as one MSG.fx batch per step; anything a late joiner must see is schema state.
 */
export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS;
  private world!: World;
  private profiles: Profiles | null = null;
  private story: Story | null = null;

  onCreate(opts: { profiles?: Profiles; story?: Story } = {}) {
    this.profiles = opts.profiles ?? null;
    this.story = opts.story ?? null;
    // Pick the story up where you left it: the same flags, the same area.
    this.world = new World(this.story?.data.area, Date.now(), this.story?.data.flags ?? []);
    this.world.onStory = () => this.story?.save(this.world.flags, this.world.map.id);
    this.state = new WorldState();
    this.state.mapId = this.world.map.id;
    this.setPatchRate(1000 / PATCH_HZ);
    // Fixed step: exactly the dt the clients predict with.
    this.setSimulationInterval(() => this.tick(), SIM_DT * 1000);

    this.onMessage(MSG.input, (client, msg: unknown) => {
      const frames = msg && typeof msg === "object" ? (msg as { frames?: unknown }).frames : undefined;
      this.world.queueInputs(client.sessionId, frames);
    });
    this.onMessage(MSG.skip, (client) => this.world.voteSkip(client.sessionId));
    this.onMessage(MSG.choice, (client, msg: unknown) => this.world.pickChoice(client.sessionId, msg));
    this.onMessage(MSG.talent, (client, msg: unknown) => {
      if (!this.world.setTalents(client.sessionId, msg)) return;
      const p = this.world.players.get(client.sessionId);
      if (p) {
        this.mirrorLoadout(p);
        this.save(p);
      }
    });
    this.onMessage(MSG.loadout, (client, msg: unknown) => {
      if (!this.world.setLoadout(client.sessionId, msg)) return;
      const p = this.world.players.get(client.sessionId);
      const s = this.state.players.get(client.sessionId);
      if (p && s) {
        // The bar may have changed length: rebuild the cooldown mirror.
        s.cd.clear();
        for (let i = 0; i < p.cds.length; i++) s.cd.push(0);
        this.mirrorLoadout(p);
        this.save(p);
      }
    });
    // Unknown message types are ignored instead of crashing the room.
    this.onMessage("*", () => {});
  }

  onJoin(client: Client, options: Partial<JoinOptions>) {
    const saved = typeof options?.name === "string" ? this.profiles?.get(options.name) : undefined;
    const p = this.world.addPlayer(client.sessionId, options ?? {}, saved ?? {});
    const s = new PlayerState();
    s.id = p.id;
    s.name = p.name;
    s.look = p.look;
    s.path = p.path.id;
    s.body = p.bodyType;
    s.people = p.people;
    for (let i = 0; i < p.cds.length; i++) s.cd.push(0);
    this.state.players.set(client.sessionId, s);
    this.mirrorLoadout(p);
    this.save(p);
    this.sync();
  }

  onLeave(client: Client) {
    const p = this.world.players.get(client.sessionId);
    if (p) this.save(p);
    this.world.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.sync();
  }

  private tick() {
    this.world.step(SIM_DT);
    this.sync();
    const fx = this.world.drainFx();
    if (fx.length) this.broadcast(MSG.fx, fx);
    // A level-up is worth saving at once (a crash shouldn't eat an evening's progress).
    for (const e of fx) {
      if (e.t !== "mastery" && e.t !== "levelUp") continue;
      const p = this.world.players.get(e.id);
      if (!p) continue;
      this.save(p);
      if (e.t === "levelUp") this.mirrorLoadout(p);
    }
  }

  /** Weapon, picks, mastery and look into the schema (not every tick: they change rarely). */
  private mirrorLoadout(p: PlayerSim) {
    const s = this.state.players.get(p.id);
    if (!s) return;
    s.weapon = p.weapon;
    s.picks = JSON.stringify(p.picks[p.weapon] ?? {});
    s.mastery = JSON.stringify(p.mastery);
    s.appearance = JSON.stringify(p.appearance);
    s.level = p.level;
    s.talents = JSON.stringify(p.talents);
  }

  private save(p: PlayerSim) {
    this.profiles?.put({ name: p.name, path: p.path.id, weapon: p.weapon, look: p.appearance, mastery: p.mastery, picks: p.picks, xp: Math.floor(p.xp), talents: p.talents });
  }

  private sync() {
    const w = this.world;
    const c = w.cinematic;
    this.state.cinematic = c?.id ?? "";
    this.state.cinematicElapsed = c ? Math.round(c.elapsedMs) : 0;
    this.state.skipVotes = c?.votes.size ?? 0;
    this.state.phase = w.phase;
    this.state.wave = w.wave + 1;
    this.state.waveTitle = w.activeEncounter()?.title ?? "";
    this.state.mapId = w.map.id;
    const flags = [...w.flags].sort().join(",");
    if (this.state.flags !== flags) this.state.flags = flags;
    this.state.choicePicks = c ? [...c.picks].map(([id, o]) => `${id}:${o}`).join(",") : "";
    this.state.chosen = c?.chosen ?? -1;
    this.state.wipeT = Math.max(0, round(w.wipeT, 0.1));

    for (const p of w.players.values()) {
      const s = this.state.players.get(p.id);
      if (!s) continue;
      const b = p.body;
      s.x = b.x;
      s.y = b.y;
      s.vx = b.vx;
      s.vy = b.vy;
      s.facing = b.facing;
      s.stamina = b.stamina;
      s.sinceSpend = b.sinceSpend;
      s.dodgeT = b.dodgeT;
      s.dodgeCd = b.dodgeCd;
      s.dodgeDx = b.dodgeDx;
      s.dodgeDy = b.dodgeDy;
      s.lastSeq = p.lastSeq;
      s.hp = Math.ceil(p.hp);
      s.hpMax = p.hpMax;
      s.res = round(p.res, 0.5);
      s.resMax = p.path.resource.max;
      for (let i = 0; i < p.cds.length; i++) {
        const v = round(p.cds[i], 0.05);
        if (s.cd[i] !== v) s.cd[i] = v;
      }
      s.cast = p.cast ? p.skills[p.cast.slot].id : "";
      s.castT = p.cast ? round(p.cast.t, 0.05) : 0;
      s.st = [...p.statuses.keys()].sort().join(",");
      s.shield = Math.round(p.statuses.get("shield")?.value ?? 0);
      s.downed = p.downed;
      s.xp = Math.floor(p.xp);
      s.downT = round(p.downT, 0.1);
      s.revive = round(p.reviveHeld / 2, 0.05);
      // Mastery XP grows with every hit: mirror it a few times a second, rounded, not every step.
      const m = JSON.stringify(Object.fromEntries(Object.entries(p.mastery).map(([k, v]) => [k, Math.floor(v ?? 0)])));
      if (s.mastery !== m && (w.time * 4) % 1 < SIM_DT * 4) s.mastery = m;
    }

    for (const id of [...this.state.units.keys()]) if (!w.units.has(id)) this.state.units.delete(id);
    for (const u of w.units.values()) {
      let s = this.state.units.get(u.id);
      if (!s) {
        s = new UnitState();
        s.id = u.id;
        s.kind = u.kind;
        s.faction = u.faction;
        s.hpMax = u.hpMax;
        this.state.units.set(u.id, s);
      }
      s.x = u.x;
      s.y = u.y;
      s.vx = u.vx;
      s.vy = u.vy;
      s.facing = u.facing;
      s.hp = Math.ceil(u.hp);
      s.state = u.state;
      s.stagger = round(u.staggerT, 0.1);
      s.st = [...u.statuses.keys()].sort().join(",");
      s.atk = u.attack?.id ?? "";
      s.atkT = u.attack ? round(u.t, 0.05) : 0;
      s.atkTotal = u.attack?.windup ?? 0;
      s.aim = u.aim;
      s.ax = u.ax;
      s.ay = u.ay;
    }
  }
}
