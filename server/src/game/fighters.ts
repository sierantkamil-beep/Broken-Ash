import type { Body, EnemyAttack, EnemyDef, Faction, InputFrame, PathDef, PeopleId, StatusId, BodyType } from "@broken-ash/shared";

/** A status on a fighter. `value` is dps for damage-over-time, the remaining shield, a % for slow/haste... */
export interface Status {
  t: number;
  value: number;
  /** Who applied it (damage-over-time credit, Thorn's bleed heal). */
  source: string;
}

/** Anything that can be hit: players, the Greyed, thralls. */
export interface Fighter {
  id: string;
  faction: Faction;
  radius: number;
  hp: number;
  hpMax: number;
  statuses: Map<StatusId, Status>;
  poise: number;
  poiseMax: number;
  /** Seconds left staggered (helpless, executable). */
  staggerT: number;
  dead: boolean;
  /** Seconds since last hit (poise regeneration). */
  sinceHit: number;
  /** Accumulates time for damage-over-time ticks. */
  dotClock: number;
  pos(): { x: number; y: number };
}

export interface CastState {
  slot: number;
  /** Seconds until the skill lands. */
  t: number;
  aim: number;
  aimDist: number;
}

export interface PlayerSim extends Fighter {
  name: string;
  look: "a" | "b";
  path: PathDef;
  bodyType: BodyType;
  people: PeopleId;
  body: Body;
  queue: InputFrame[];
  lastSeq: number;
  /** Input credit: one per simulation step, so a client can't move faster by sending more inputs. */
  credit: number;
  res: number;
  cds: number[];
  cast: CastState | null;
  /** Silenced (overheat): no skills. */
  silenceT: number;
  downed: boolean;
  downT: number;
  /** Progress of a partner reviving this player (seconds held). */
  reviveHeld: number;
  /** F held this step. */
  act: boolean;
  /** Last aim from input (for skills cast without a fresh aim). */
  aim: number;
  aimDist: number;
}

export interface UnitSim extends Fighter {
  kind: EnemyDef["kind"] | "thrall";
  def: EnemyDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  state: "idle" | "chase" | "windup" | "recover";
  target: string | null;
  attack: EnemyAttack | null;
  /** Wind-up / recovery time left. */
  t: number;
  /** Locked aim and landing point of the current attack (telegraph). */
  aim: number;
  ax: number;
  ay: number;
  cds: Record<string, number>;
  /** Thralls: seconds until they crumble; owner gets their drain. */
  life?: number;
  owner?: string;
}

export function fighterPos(this: { body?: Body; x?: number; y?: number }) {
  return this.body ? { x: this.body.x, y: this.body.y } : { x: this.x!, y: this.y! };
}
