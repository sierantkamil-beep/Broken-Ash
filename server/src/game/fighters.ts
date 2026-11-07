import type { HitCause } from "@broken-ash/shared";
import type { Body, BodyType, CharacterLook, EnemyAttack, EnemyDef, Faction, InputFrame, PathDef, PeopleId, Picks, SkillDef, StatusId, WeaponId } from "@broken-ash/shared";

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
  /** The last blow taken (direction and cause), so a death knows how the body breaks. */
  lastHit?: { dx: number; dy: number; cause: HitCause };
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
  /** The weapon in hand; its mastery tree gives skills 0–2 (shared/src/loadout.ts). */
  weapon: WeaponId;
  /** Weapon-skill damage dealt with each weapon type (mastery XP), saved on the host. */
  mastery: Partial<Record<WeaponId, number>>;
  /** Tree choices per weapon. */
  picks: Partial<Record<WeaponId, Picks>>;
  /** The resolved skill bar: weapon basic, RMB, key 1, then the path's three signature skills. */
  skills: SkillDef[];
  /** Experience, the level it makes, and the talents chosen (shared/src/progress.ts). */
  xp: number;
  level: number;
  talents: string[];
  /** Damage taken (1 = all; armour lowers it), run speed and status damage, from talents and items. */
  taken: number;
  speed: number;
  statusMul: Partial<Record<StatusId, number>>;
  /** Appearance (skin, dyes, armour and gear pieces). */
  appearance: CharacterLook;
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
  /** A grab in progress: the id of the fighter held. */
  grabbed?: string;
  /** Boss phases crossed so far; a heal being channelled (seconds left, hp per second); rage (wind-up and cooldown factor). */
  phase?: number;
  channel?: number;
  channelHeal?: number;
  rage?: number;
  /** Eating a corpse: which, and for how long so far. */
  eating?: string;
  eatT?: number;
}

export function fighterPos(this: { body?: Body; x?: number; y?: number }) {
  return this.body ? { x: this.body.x, y: this.body.y } : { x: this.x!, y: this.y! };
}
