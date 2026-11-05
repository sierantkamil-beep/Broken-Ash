import type { Shape, StatusId } from "../combat/types.js";

export type GreyedKind = "shambler" | "runner" | "bloated" | "tapper";

export interface EnemyAttack {
  id: string;
  /** Telegraph time: the shape glows on the ground this long before it lands. */
  windup: number;
  shape: Shape;
  damage: number;
  status?: { id: StatusId; duration: number; value?: number };
  /** Starts only when the target is this close. */
  range: number;
  cooldown: number;
  /** Which animation (attack/skill1/skill2). */
  anim: "attack" | "skill1" | "skill2";
}

export interface EnemyDef {
  kind: GreyedKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  /** Poise: damage of this much (weighted by each hit's poise value) staggers it. */
  poise: number;
  aggro: number;
  attacks: EnemyAttack[];
  /** Bursts on death (the Bloated). */
  deathBurst?: { radius: number; damage: number; status: StatusId; duration: number; value: number };
  boss?: boolean;
}

/**
 * The Greyed (design.md §1): the dead who rise near the roots. Every attack is telegraphed on the
 * ground; learning the wind-ups is the point (design.md §5).
 */
export const GREYED: Record<GreyedKind, EnemyDef> = {
  shambler: {
    kind: "shambler",
    name: "Szary",
    hp: 85,
    speed: 1.5,
    radius: 0.35,
    poise: 45,
    aggro: 14,
    attacks: [{ id: "claw", windup: 0.7, shape: { kind: "cone", range: 1.6, arc: 100 }, damage: 14, range: 1.4, cooldown: 1.4, anim: "attack" }],
  },
  runner: {
    kind: "runner",
    name: "Szybki Szary",
    hp: 48,
    speed: 3.3,
    radius: 0.3,
    poise: 25,
    aggro: 16,
    attacks: [{ id: "pounce", windup: 0.5, shape: { kind: "line", length: 2.6, width: 0.9 }, damage: 11, status: { id: "bleed", duration: 3, value: 2 }, range: 2.3, cooldown: 1.6, anim: "attack" }],
  },
  bloated: {
    kind: "bloated",
    name: "Rozdęty",
    hp: 120,
    speed: 1.15,
    radius: 0.45,
    poise: 70,
    aggro: 12,
    attacks: [{ id: "slam", windup: 1.0, shape: { kind: "circle", radius: 1.9, at: "self" }, damage: 18, status: { id: "poison", duration: 4, value: 3 }, range: 1.6, cooldown: 2.2, anim: "attack" }],
    deathBurst: { radius: 2.3, damage: 16, status: "poison", duration: 5, value: 4 },
  },
  tapper: {
    kind: "tapper",
    name: "Upuszczacz",
    // A long fight for two: about a minute and a half of dodging his telegraphs.
    hp: 6500,
    speed: 1.35,
    radius: 0.75,
    poise: 420,
    aggro: 30,
    boss: true,
    attacks: [
      { id: "chop", windup: 0.9, shape: { kind: "cone", range: 3, arc: 70 }, damage: 34, status: { id: "bleed", duration: 4, value: 4 }, range: 2.6, cooldown: 2.4, anim: "attack" },
      { id: "sweep", windup: 1.2, shape: { kind: "cone", range: 3.4, arc: 220 }, damage: 26, range: 3.0, cooldown: 6, anim: "skill1" },
      { id: "slam", windup: 1.4, shape: { kind: "circle", radius: 2.6, at: "aim", reach: 6 }, damage: 40, status: { id: "slow", duration: 2, value: 0.4 }, range: 6, cooldown: 7, anim: "skill2" },
    ],
  },
};

export interface Wave {
  /** Player-facing banner. */
  title: string;
  spawns: { kind: GreyedKind; count: number }[];
}

/**
 * The night of the escape: the Greyed break through Soramei's vermilion gate in waves, then the
 * Tapper himself comes for his runaway stock.
 */
export const GATE_ASSAULT: Wave[] = [
  { title: "Brama pęka", spawns: [{ kind: "shambler", count: 5 }] },
  { title: "Szybcy", spawns: [{ kind: "runner", count: 4 }, { kind: "shambler", count: 3 }] },
  { title: "Rozdęci", spawns: [{ kind: "bloated", count: 2 }, { kind: "runner", count: 3 }, { kind: "shambler", count: 3 }] },
  { title: "Upuszczacz", spawns: [{ kind: "tapper", count: 1 }, { kind: "shambler", count: 2 }] },
];
