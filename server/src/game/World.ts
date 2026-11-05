import {
  BALANCE,
  CINEMATICS,
  CollisionGrid,
  MAPS,
  MAX_NAME_LENGTH,
  newBody,
  sanitizeInput,
  START_MAP,
  stepBody,
  type AreaMap,
  type Body,
  type InputFrame,
} from "@broken-ash/shared";

export interface PlayerSim {
  id: string;
  name: string;
  look: "a" | "b";
  body: Body;
  queue: InputFrame[];
  lastSeq: number;
  /** Input credit: one per simulation step, so a client can't move faster by sending more inputs. */
  credit: number;
}

export interface RunningCinematic {
  id: string;
  elapsedMs: number;
  votes: Set<string>;
}

/** Burst allowance after a lag spike, in steps. */
const MAX_CREDIT = 10;

/**
 * The authoritative simulation for one area. Network-free and deterministic, so it is unit tested
 * directly; rooms/WorldRoom.ts only forwards messages and copies state into the schema.
 */
export class World {
  readonly map: AreaMap;
  readonly grid: CollisionGrid;
  readonly players = new Map<string, PlayerSim>();
  cinematic: RunningCinematic | null = null;
  private readonly seenIntro = new Set<string>();

  constructor(mapId = START_MAP) {
    const map = MAPS[mapId];
    if (!map) throw new Error(`unknown map ${mapId}`);
    this.map = map;
    this.grid = CollisionGrid.fromMap(map);
  }

  addPlayer(id: string, rawName: unknown): PlayerSim {
    const taken = new Set([...this.players.values()].map((p) => `${p.body.x},${p.body.y}`));
    const spawn = this.map.spawns.find((s) => !taken.has(`${s.x},${s.y}`)) ?? this.map.spawns[0];
    const look = [...this.players.values()].some((o) => o.look === "a") ? "b" : "a";
    const p: PlayerSim = { id, name: sanitizeName(rawName), look, body: newBody(spawn.x, spawn.y), queue: [], lastSeq: 0, credit: 0 };
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

  step(dt: number) {
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
      while (p.queue.length && p.credit >= 1 && n < BALANCE.net.maxInputsPerStep) {
        const f = p.queue.shift()!;
        stepBody(p.body, f, dt, this.grid);
        p.lastSeq = f.seq;
        p.credit -= 1;
        n++;
      }
    }
  }
}

export function sanitizeName(raw: unknown): string {
  // Strip control characters and collapse whitespace; names are shown above heads and in chat.
  const name = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
  return name || "Popielny";
}
