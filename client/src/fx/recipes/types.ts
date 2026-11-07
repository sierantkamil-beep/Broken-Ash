import type { SkillDef } from "@broken-ash/shared";
import type { Ramp } from "../fxkit";
import type { Tools } from "./tools";

/** Where and how a skill is being used, in screen pixels unless named in cells. */
export interface Ctx {
  t: Tools;
  skill: SkillDef;
  /** The skill's element (rampOf). */
  ramp: Ramp;
  caster: string;
  /** The caster's feet now. */
  x: number;
  y: number;
  /** Where the blow's weapon hand is (chest height, a little ahead along the aim). */
  hx: number;
  hy: number;
  aim: number;
  /** The hit shape's size (cells): cone range and arc (degrees), line length and width, circle radius. */
  range: number;
  arc: number;
  length: number;
  width: number;
  radius: number;
  /** The end of a line or the tip of a cone (screen px); the centre of a thrown circle. */
  tx: number;
  ty: number;
  /** Which beat of a basic-attack chain (0, 1, 2: the third is the finisher). */
  beat: number;
  /** Did the caster dash (the line starts where they stood)? */
  dashed: boolean;
  /** The caster's feet as they move (for effects that stay on the body). */
  follow: () => { x: number; y: number } | null;
}

/** How a skill's bolt flies (its sprite, spin, trail) and what it does at the end. */
export interface BoltLook {
  anim: string;
  scale?: number;
  spin?: boolean;
  /** A puff of this element every ~30 ms behind it. */
  trail?: Ramp;
  /** Something extra left behind on the way (ms between, and what). */
  every?: number;
  tail?(c: Ctx, x: number, y: number): void;
  /** As it leaves (a muzzle flash, a string snap), at the launch point. */
  launch?(c: Ctx, x: number, y: number): void;
  /** At the end of its flight (a hit, a wall, the end of its range). */
  impact?(c: Ctx, x: number, y: number): void;
}

/**
 * One skill's whole effect. `sig` names the beats it's made of; a test checks that no two recipes
 * share one, so no two skills look alike.
 */
export interface Recipe {
  sig: string;
  /** The wind-up, on the caster, as the cast begins. */
  windup?(c: Ctx): void;
  /** The release: cones, lines, circles round the caster, buffs (after the wind-up). */
  release?(c: Ctx): void;
  /** A thrown circle's flight from the hand (x0, y0) to where it lands (x1, y1), over `ms`. */
  travel?(c: Ctx, x0: number, y0: number, x1: number, y1: number, ms: number): void;
  /** A circle thrown onto a spot lands (c.tx, c.ty is its centre). */
  land?(c: Ctx): void;
  /** Lingering ground for `ms` (c.tx, c.ty is its centre). */
  zone?(c: Ctx, ms: number): void;
  bolt?: BoltLook;
}
