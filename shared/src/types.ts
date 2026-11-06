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

/** A transient combat event the server broadcasts for visuals and sound (MSG.fx). */
export type FxEvent =
  /** `vfx` is the skill's look for this caster (a mastery form can change it). */
  | { t: "cast"; id: string; skill: string; vfx: string; aim: number; x: number; y: number }
  | { t: "bolt"; skill: string; vfx: string; x: number; y: number; aim: number; speed: number; range: number; owner: string }
  | { t: "zone"; skill: string; vfx: string; x: number; y: number; radius: number; duration: number; owner: string }
  /** A circle skill landed (where its area is). */
  | { t: "area"; skill: string; vfx: string; x: number; y: number; radius: number; owner: string }
  /** A player's weapon mastery went up. */
  | { t: "mastery"; id: string; weapon: string; level: number }
  | { t: "hit"; id: string; amount: number; kind: "damage" | "dot" | "heal" | "shield"; status?: string; big?: boolean }
  | { t: "death"; id: string; gore: boolean; x: number; y: number }
  | { t: "burst"; x: number; y: number; radius: number }
  | { t: "execute"; by: string; id: string }
  | { t: "downed"; id: string }
  | { t: "revived"; id: string }
  | { t: "wave"; n: number; title: string }
  | { t: "victory" }
  | { t: "gate" }
  | { t: "overheat"; id: string };
