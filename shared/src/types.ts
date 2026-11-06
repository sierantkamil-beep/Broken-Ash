/** Options a client sends when joining the room. */
export interface JoinOptions {
  name: string;
  path?: string;
  body?: string;
  people?: string;
  /** Weapon type (shared/src/data/weapons.ts); validated server-side. */
  weapon?: string;
  /** Appearance (CharacterLook); validated server-side with validLook. */
  look?: unknown;
}

/** How a blow was dealt: it decides how a body breaks (cut, crushed, burned, shocked, rotted, pierced). */
export type HitCause = "cut" | "crush" | "pierce" | "fire" | "shock" | "rot" | "blood" | "spirit" | "claw" | "exec";

/** A transient combat event the server broadcasts for visuals and sound (MSG.fx). */
export type FxEvent =
  /** `vfx` is the skill's look for this caster (a mastery form can change it). */
  | { t: "cast"; id: string; skill: string; vfx: string; aim: number; x: number; y: number }
  | { t: "bolt"; id: number; skill: string; vfx: string; x: number; y: number; aim: number; speed: number; range: number; radius: number; owner: string }
  /** An enemy's blow landing: which attack, from where, which way (and the spot, for aimed slams). */
  | { t: "unitAtk"; id: string; kind: string; atk: string; aim: number; x: number; y: number; ax: number; ay: number }
  /** A boss crossed into a new phase (a banner and a roar). */
  | { t: "phase"; id: string; title: string; sub: string }
  /** A corpse was eaten (it's gone; blood where it lay). */
  | { t: "eaten"; id: string; by: string; x: number; y: number }
  /** A bolt stopped (hit, wall or end of range) at this point. */
  | { t: "boltEnd"; id: number; x: number; y: number }
  | { t: "zone"; skill: string; vfx: string; x: number; y: number; radius: number; duration: number; owner: string }
  /** A circle skill landed (where its area is). */
  | { t: "area"; skill: string; vfx: string; x: number; y: number; radius: number; owner: string }
  /** A player's weapon mastery went up. */
  | { t: "mastery"; id: string; weapon: string; level: number }
  /**
   * Damage, healing or a shield soaking a blow. `src` is who dealt it, (dx, dy) the blow's direction
   * (unit vector, so blood and sparks fly the right way), `cause` how it was dealt, `det` a status
   * the blow detonated.
   */
  | { t: "hit"; id: string; amount: number; kind: "damage" | "dot" | "heal" | "shield"; status?: string; big?: boolean; src?: string; dx?: number; dy?: number; cause?: HitCause; det?: string; blk?: boolean }
  /** `ok` is the overkill as a share of max health; with (dx, dy) and `cause` it picks the gore. */
  | { t: "death"; id: string; gore: boolean; x: number; y: number; dx?: number; dy?: number; cause?: HitCause; ok?: number; kind?: string }
  | { t: "burst"; x: number; y: number; radius: number }
  | { t: "execute"; by: string; id: string }
  | { t: "downed"; id: string }
  | { t: "revived"; id: string }
  | { t: "wave"; n: number; title: string }
  | { t: "victory" }
  | { t: "gate" }
  | { t: "overheat"; id: string };
