import { Room, type Client } from "@colyseus/core";
import { GATE_ASSAULT, MAX_PLAYERS, MSG, PATCH_HZ, SIM_DT, type JoinOptions } from "@broken-ash/shared";
import { World } from "../game/World.js";
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

  onCreate() {
    this.world = new World();
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
    // Unknown message types are ignored instead of crashing the room.
    this.onMessage("*", () => {});
  }

  onJoin(client: Client, options: Partial<JoinOptions>) {
    const p = this.world.addPlayer(client.sessionId, options ?? {});
    const s = new PlayerState();
    s.id = p.id;
    s.name = p.name;
    s.look = p.look;
    s.path = p.path.id;
    s.body = p.bodyType;
    s.people = p.people;
    for (let i = 0; i < p.cds.length; i++) s.cd.push(0);
    this.state.players.set(client.sessionId, s);
    this.sync();
  }

  onLeave(client: Client) {
    this.world.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.sync();
  }

  private tick() {
    this.world.step(SIM_DT);
    this.sync();
    const fx = this.world.drainFx();
    if (fx.length) this.broadcast(MSG.fx, fx);
  }

  private sync() {
    const w = this.world;
    const c = w.cinematic;
    this.state.cinematic = c?.id ?? "";
    this.state.cinematicElapsed = c ? Math.round(c.elapsedMs) : 0;
    this.state.skipVotes = c?.votes.size ?? 0;
    this.state.phase = w.phase;
    this.state.wave = w.wave + 1;
    this.state.waveTitle = w.wave >= 0 ? GATE_ASSAULT[w.wave].title : "";
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
      s.cast = p.cast ? p.path.skills[p.cast.slot].id : "";
      s.castT = p.cast ? round(p.cast.t, 0.05) : 0;
      s.st = [...p.statuses.keys()].sort().join(",");
      s.shield = Math.round(p.statuses.get("shield")?.value ?? 0);
      s.downed = p.downed;
      s.downT = round(p.downT, 0.1);
      s.revive = round(p.reviveHeld / 2, 0.05);
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
