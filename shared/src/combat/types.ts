/**
 * Combat data model: skills are data (shape + effects), interpreted by server/src/game/Combat.ts.
 * Inspired by Dinusie's SkillDef/SkillEffect/StatusId model, rewritten for free movement: shapes are
 * aimed in continuous space instead of tile patterns.
 */
export type PathId = "thorn" | "bark" | "blood" | "ash" | "storm" | "graves" | "dusk" | "sting";
export type BodyType = "male" | "female";
export type PeopleId = "lacquer" | "thorn" | "bark" | "reed" | "dusk" | "ember" | "wind" | "lantern";
export type Faction = "players" | "greyed";

export type StatusId = "bleed" | "burn" | "poison" | "slow" | "rooted" | "shield" | "stealth" | "mark" | "haste" | "static" | "weaken" | "stagger";

export type Shape =
  /** A wedge in front of the caster. */
  | { kind: "cone"; range: number; arc: number }
  /** A disc around the caster, or at the aimed point (up to `reach` away). */
  | { kind: "circle"; radius: number; at: "self" | "aim"; reach?: number }
  /** A rectangle from the caster along the aim. */
  | { kind: "line"; length: number; width: number }
  /** Bolts that fly; `count` > 1 fans them out over `spread` degrees. */
  | { kind: "projectile"; speed: number; range: number; radius: number; pierce?: boolean; count?: number; spread?: number }
  /** Only the caster (buffs). */
  | { kind: "self" };

export type Effect =
  | { kind: "damage"; amount: number; poise?: number }
  | { kind: "status"; status: StatusId; duration: number; value?: number; target?: "enemy" | "self" | "partner" }
  | { kind: "heal"; amount: number; target: "self" | "partner" | "both" }
  | { kind: "knockback"; distance: number }
  /** The caster dashes along the aim (before the hit is resolved). */
  | { kind: "dash"; distance: number }
  | { kind: "resource"; amount: number }
  /** Consumes a status on the target for bonus damage: the co-op combos. */
  | { kind: "detonate"; status: StatusId; damage: number }
  /** Heals the caster for a fraction of the damage dealt (only against targets with `onlyIf`). */
  | { kind: "lifesteal"; fraction: number; onlyIf?: StatusId }
  /** Raises Greyed thralls that fight for the caster. */
  | { kind: "summon"; count: number; duration: number }
  /** Leaves a lingering area (burning ground, poison cloud, roots). */
  | { kind: "zone"; radius: number; duration: number; dps: number; status?: StatusId; statusDuration?: number };

export type SkillAnim = "attack" | "skill1" | "skill2";

export interface SkillDef {
  id: string;
  /** Player-facing (Polish). */
  name: string;
  description: string;
  /** Seconds. */
  cooldown: number;
  /** Path resource spent (or gained, if negative). */
  cost: number;
  /** Health spent (Path of Blood). */
  hpCost?: number;
  /** Seconds between pressing and the hit (the wind-up of the animation). */
  windup: number;
  shape: Shape;
  effects: Effect[];
  anim: SkillAnim;
  /** Visual effect and sound keys (client). */
  vfx: string;
  sfx: string;
}

export interface ResourceDef {
  id: string;
  name: string;
  max: number;
  start: number;
  /** Per second; negative decays. */
  regen: number;
  /** Gained per enemy hit with any skill. */
  onHit?: number;
  /** Gained per cell moved (Storm). */
  onMove?: number;
  /** Gained when an enemy dies nearby (Graves). */
  onDeathNearby?: number;
  /** Heat: skills add instead of spend; at max you overheat (Ash). */
  heat?: boolean;
}

export interface PathDef {
  id: PathId;
  name: string;
  /** The people the path comes from (design.md §1). */
  people: PeopleId;
  type: "melee" | "magic" | "ranged";
  hp: number;
  /** Multiplier on run speed. */
  speed: number;
  resource: ResourceDef;
  /** Player-facing description of the path's self-sustain and co-op combo. */
  blurb: string;
  sustain: string;
  combo: string;
  skills: SkillDef[];
}

export const STATUS_INFO: Record<StatusId, { name: string; harmful: boolean }> = {
  bleed: { name: "Krwawienie", harmful: true },
  burn: { name: "Płonięcie", harmful: true },
  poison: { name: "Trucizna", harmful: true },
  slow: { name: "Spowolnienie", harmful: true },
  rooted: { name: "Unieruchomienie", harmful: true },
  shield: { name: "Osłona", harmful: false },
  stealth: { name: "Ukrycie", harmful: false },
  mark: { name: "Naznaczenie", harmful: true },
  haste: { name: "Pęd", harmful: false },
  static: { name: "Ładunek statyczny", harmful: true },
  weaken: { name: "Klątwa", harmful: true },
  stagger: { name: "Zachwianie", harmful: true },
};
