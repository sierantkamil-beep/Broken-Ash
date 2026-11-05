import { Room, type Client } from "@colyseus/core";
import { MAX_PLAYERS, MSG, PATCH_HZ, SIM_DT, type JoinOptions } from "@broken-ash/shared";
import { World } from "../game/World.js";
import { PlayerState, WorldState } from "../schema/WorldState.js";

/**
 * Thin network layer: forwards validated messages to the World and mirrors its state into the
 * schema. All game rules live in game/World.ts.
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
    const p = this.world.addPlayer(client.sessionId, options?.name);
    const s = new PlayerState();
    s.id = p.id;
    s.name = p.name;
    s.look = p.look;
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
  }

  private sync() {
    const c = this.world.cinematic;
    this.state.cinematic = c?.id ?? "";
    this.state.cinematicElapsed = c ? Math.round(c.elapsedMs) : 0;
    this.state.skipVotes = c?.votes.size ?? 0;
    for (const p of this.world.players.values()) {
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
    }
  }
}
