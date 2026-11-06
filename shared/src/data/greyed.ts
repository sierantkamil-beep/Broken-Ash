import type { Shape, StatusId } from "../combat/types.js";

/**
 * Every enemy kind. The Greyed are the risen dead (they wear what they wore in life: peasants, keep
 * guards, miners, the drowned); the Iron March are living humans from the south.
 */
export type GreyedKind = "shambler" | "runner" | "bloated" | "tapper" | "miner" | "drowned" | "eater" | "crossbow" | "manatarms";

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
  /** A shot: the telegraph is the line it will fly; on release a bolt flies it (dodgeable, blocked by walls). */
  bolt?: { speed: number; range: number; radius: number };
  /** A grab: the victim is held (rooted) until the grabber is struck by the partner or the hold ends. */
  grab?: boolean;
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
  /** Ranged: keeps at least this far from its target, backing off when you close in. */
  keepAway?: number;
  /** A shield: blows from within `arc` degrees of where it faces lose `cut` of their damage (not while staggered). */
  shield?: { arc: number; cut: number };
  /** Eats the dead to heal and grow, when no one is within reach. */
  eatsCorpses?: boolean;
  /** Living humans (blood, not ash; they don't rise). */
  human?: boolean;
  /**
   * Boss phases, crossed as health falls: a banner, then a heal channelled over a few seconds
   * and/or a rage that speeds every wind-up and cooldown.
   */
  phases?: { at: number; title: string; sub: string; heal?: number; rage?: number }[];
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
    // At 60 % he stops to drink from his own pump (break it off: hit him hard); at 30 % he goes berserk.
    phases: [
      { at: 0.6, title: "Upuszczacz pije", sub: "Wysysa żywicę z własnej pompy — przerwijcie mu!", heal: 0.12 },
      { at: 0.3, title: "Szał Upuszczacza", sub: "Pompa rzęzi, ciosy przyspieszają", rage: 0.65 },
    ],
  },
  miner: {
    kind: "miner",
    name: "Szary górnik",
    // Slow and heavy: a pickaxe that hits like a cart.
    hp: 140,
    speed: 1.25,
    radius: 0.38,
    poise: 80,
    aggro: 12,
    attacks: [
      { id: "pick", windup: 1.0, shape: { kind: "line", length: 2.0, width: 1.1 }, damage: 26, status: { id: "bleed", duration: 3, value: 3 }, range: 1.7, cooldown: 2.0, anim: "attack" },
      { id: "quake", windup: 1.3, shape: { kind: "circle", radius: 1.8, at: "self" }, damage: 16, status: { id: "slow", duration: 2, value: 0.35 }, range: 1.4, cooldown: 6, anim: "skill2" },
    ],
  },
  drowned: {
    kind: "drowned",
    name: "Utopiec soków",
    // The drowned grab and hold: alone you're stuck, together you free each other.
    hp: 95,
    speed: 1.7,
    radius: 0.34,
    poise: 40,
    aggro: 13,
    attacks: [
      { id: "grab", windup: 0.8, shape: { kind: "line", length: 1.9, width: 0.8 }, damage: 8, status: { id: "rooted", duration: 3.5 }, range: 1.6, cooldown: 5, anim: "skill1", grab: true },
      { id: "claw", windup: 0.65, shape: { kind: "cone", range: 1.5, arc: 90 }, damage: 12, status: { id: "poison", duration: 3, value: 2 }, range: 1.3, cooldown: 1.4, anim: "attack" },
    ],
  },
  eater: {
    kind: "eater",
    name: "Pożeracz",
    // Fast and frail; leave bodies lying about and it grows into a problem.
    hp: 70,
    speed: 2.6,
    radius: 0.33,
    poise: 30,
    aggro: 14,
    eatsCorpses: true,
    attacks: [
      { id: "bite", windup: 0.5, shape: { kind: "cone", range: 1.4, arc: 70 }, damage: 13, status: { id: "bleed", duration: 4, value: 3 }, range: 1.2, cooldown: 1.2, anim: "attack" },
      { id: "leap", windup: 0.6, shape: { kind: "line", length: 3.0, width: 0.9 }, damage: 15, range: 2.8, cooldown: 4.5, anim: "skill1" },
    ],
  },
  crossbow: {
    kind: "crossbow",
    name: "Kusznik Żelaznej Marchii",
    // Shoots from range and backs away: close the gap, or dodge the bolt's line.
    hp: 75,
    speed: 1.9,
    radius: 0.34,
    poise: 35,
    aggro: 15,
    human: true,
    keepAway: 4.5,
    attacks: [
      { id: "shot", windup: 1.1, shape: { kind: "line", length: 11, width: 0.6 }, damage: 24, range: 10, cooldown: 2.6, anim: "attack", bolt: { speed: 22, range: 11, radius: 0.25 } },
      { id: "kick", windup: 0.5, shape: { kind: "cone", range: 1.3, arc: 80 }, damage: 9, status: { id: "slow", duration: 1.5, value: 0.3 }, range: 1.0, cooldown: 3, anim: "skill2" },
    ],
  },
  manatarms: {
    kind: "manatarms",
    name: "Zbrojny Żelaznej Marchii",
    // Plate and a kite shield: blows to the front glance off; flank him or break his poise.
    hp: 170,
    speed: 1.45,
    radius: 0.4,
    poise: 110,
    aggro: 13,
    human: true,
    shield: { arc: 110, cut: 0.7 },
    attacks: [
      { id: "cut", windup: 0.7, shape: { kind: "cone", range: 1.8, arc: 90 }, damage: 18, range: 1.5, cooldown: 1.5, anim: "attack" },
      { id: "thrust", windup: 0.9, shape: { kind: "line", length: 2.6, width: 0.7 }, damage: 24, status: { id: "bleed", duration: 3, value: 3 }, range: 2.2, cooldown: 4, anim: "skill2" },
      { id: "bash", windup: 0.6, shape: { kind: "cone", range: 1.4, arc: 70 }, damage: 10, status: { id: "slow", duration: 1.5, value: 0.4 }, range: 1.1, cooldown: 5, anim: "skill1" },
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
