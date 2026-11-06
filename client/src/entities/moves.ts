import type { WeaponId } from "@broken-ash/shared";
import type { Ramp } from "../fx/fxkit";

/**
 * How a body moves when it uses a skill. The shared PixelLab bodies have two attack clips (a weapon
 * strike and a spell cast), so a move is built at runtime from their frames:
 * - a pose timeline over the wind-up (t 0 → 1) and the release and recovery (t 1 → 2), each key
 *   naming a frame of strike/cast/idle and how the body is carried: lunging forward, stepping
 *   aside, lifted off the ground, leaning, squashed, the upper body thrown forward on its own, or
 *   turned through the directions (a spin);
 * - the weapon swung along its own arc relative to the aim, leaving a pixel trail;
 * - afterimages for dashes.
 * Moves are shared; the arc, the trail colour and the timing make each skill its own
 * (SKILL_MOTION, one entry per castable skill, tested in moves.test.ts).
 */

export type Clip = "strike" | "cast" | "idle" | "hit";

export interface PoseKey {
  /** 0 → 1 over the wind-up, 1 → 2 over the release and recovery. */
  t: number;
  /** The frame shown from this key on (until the next key that names one). */
  clip?: Clip;
  f?: number;
  /** Art pixels along the facing (+ lunge, − step back), across it (+ to the right), up off the ground. */
  fwd?: number;
  side?: number;
  lift?: number;
  /** Degrees, + leaning into the facing (turning about the feet). */
  lean?: number;
  /** Height scale (1 = none): < 1 crouches into the ground, > 1 stretches up. */
  squash?: number;
  /** Art pixels the upper body is thrown along the facing on its own (legs planted). */
  upper?: number;
  /** Extra eighth-turns of facing (a spin goes 0 → 8). */
  turn?: number;
}

export type MoveId =
  | "slash"
  | "backhand"
  | "thrust"
  | "overhead"
  | "slam"
  | "spin"
  | "leap"
  | "dash"
  | "throw"
  | "draw"
  | "channel"
  | "kneel"
  | "recoil"
  | "raise"
  | "flurry"
  | "push"
  | "drink";

export interface MoveDef {
  keys: PoseKey[];
  /** Milliseconds of release and recovery after the wind-up. */
  recover: number;
}

const S = (t: number, f: number, o: Omit<PoseKey, "t" | "clip" | "f"> = {}): PoseKey => ({ t, clip: "strike", f, ...o });
const C = (t: number, f: number, o: Omit<PoseKey, "t" | "clip" | "f"> = {}): PoseKey => ({ t, clip: "cast", f, ...o });
const K = (t: number, o: Omit<PoseKey, "t">): PoseKey => ({ t, ...o });

/*
 * The frames: strike 0 a deep crouch, 1 the arm drawn back, 2–3 the arm raised high, 4–6 settling
 * back to guard; cast 0–1 a stance, 2–3 gathering low, 4 both arms thrust forward, 5 recovering.
 */
export const MOVES: Record<MoveId, MoveDef> = {
  // A forehand cut: drawn back, then across with a step into it.
  slash: { recover: 300, keys: [S(0, 1, { upper: -1 }), S(1, 1, { upper: -2, lean: -2 }), S(1.1, 4, { fwd: 3, upper: 2, lean: 5 }), S(1.45, 4, { fwd: 3, upper: 1, lean: 3 }), S(1.7, 5), S(2, 6, { fwd: 0, upper: 0, lean: 0 })] },
  // The return cut: the body turns the other way, a little step aside.
  backhand: { recover: 300, keys: [S(0, 4, { side: -1, lean: -3 }), S(1, 4, { side: -1, lean: -4, upper: -1 }), S(1.1, 1, { fwd: 2, side: 2, lean: 5, upper: 2 }), S(1.45, 1, { fwd: 3, side: 2, lean: 3 }), S(2, 6, { fwd: 0, side: 0, lean: 0, upper: 0 })] },
  // A spear thrust: gathered low and back, then everything forward along the line.
  thrust: { recover: 320, keys: [C(0, 2, { upper: -1 }), C(1, 3, { upper: -3, fwd: -2, squash: 0.95 }), C(1.05, 4, { upper: 4, fwd: 6, squash: 1, lean: 6 }), C(1.45, 4, { upper: 3, fwd: 6, lean: 5 }), C(2, 5, { upper: 0, fwd: 0, lean: 0 })] },
  // Raised over the head, stretched tall, then down with the whole body.
  overhead: { recover: 420, keys: [S(0, 2, { squash: 1, lean: -2 }), S(1, 3, { squash: 1.06, lean: -8, fwd: -1 }), S(1.08, 0, { squash: 0.86, lean: 12, fwd: 4, upper: 3 }), S(1.6, 0, { squash: 0.9, lean: 9, fwd: 4 }), S(2, 5, { squash: 1, lean: 0, fwd: 0, upper: 0 })] },
  // Up off the ground, then crashing down into a crouch.
  slam: { recover: 450, keys: [S(0, 0, { squash: 0.92 }), S(0.4, 2, { lift: 2, squash: 1.04 }), S(1, 3, { lift: 9, squash: 1.06, lean: -4 }), S(1.07, 0, { lift: 0, squash: 0.8, lean: 10, upper: 2 }), S(1.6, 0, { squash: 0.86, lean: 6 }), S(2, 5, { squash: 1, lean: 0, upper: 0 })] },
  // A full turn with the arm out.
  spin: { recover: 420, keys: [S(0, 1, { turn: 0, lean: -3 }), S(1, 4, { turn: 0, lean: 4 }), S(1.7, 4, { turn: 8, lean: 4 }), S(2, 6, { turn: 8, lean: 0 })] },
  // Crouch, a leap in an arc, a heavy landing.
  leap: { recover: 480, keys: [S(0, 0, { squash: 0.9 }), S(1, 0, { squash: 0.84, lean: 6 }), S(1.05, 2, { squash: 1.05, lift: 4 }), S(1.35, 3, { lift: 16, lean: -4 }), S(1.62, 0, { lift: 0, squash: 0.82, lean: 10 }), S(2, 5, { squash: 1, lean: 0 })] },
  // Low and forward: the body goes before the blade.
  dash: { recover: 360, keys: [S(0, 0, { lean: 8, squash: 0.94 }), S(1, 1, { lean: 16, squash: 0.92, upper: 2 }), S(1.3, 4, { lean: 14, upper: 3, fwd: 3 }), S(2, 6, { lean: 0, upper: 0, fwd: 0, squash: 1 })] },
  // Wound back over the shoulder, then the arm snaps out.
  throw: { recover: 300, keys: [C(0, 1, { upper: -1 }), C(1, 3, { upper: -3, lean: -6 }), C(1.06, 4, { upper: 3, lean: 7, fwd: 2 }), C(1.5, 4, { upper: 2, lean: 4 }), C(2, 5, { upper: 0, lean: 0, fwd: 0 })] },
  // The bow: drawn and held still, the release kicks back.
  draw: { recover: 280, keys: [C(0, 2, { upper: -1 }), C(1, 3, { upper: -2, lean: -2 }), C(1.04, 4, { upper: 1, fwd: -2, lean: -4 }), C(1.6, 4, { fwd: -1 }), C(2, 5, { upper: 0, fwd: 0, lean: 0 })] },
  // Arms up, lifted a little off the ground, a slow bob, then released forward.
  channel: { recover: 380, keys: [C(0, 2, { lift: 0 }), C(0.5, 3, { lift: 3, squash: 1.03 }), C(1, 3, { lift: 4, squash: 1.05, lean: -3 }), C(1.06, 4, { lift: 2, lean: 6, upper: 2 }), C(1.6, 4, { lift: 1, lean: 3 }), C(2, 5, { lift: 0, lean: 0, upper: 0, squash: 1 })] },
  // Down on one knee, a hand to the ground.
  kneel: { recover: 420, keys: [C(0, 2, { squash: 0.95 }), S(1, 0, { squash: 0.8, lean: 10, upper: 2 }), S(1.5, 0, { squash: 0.78, lean: 12, upper: 3 }), C(2, 5, { squash: 1, lean: 0, upper: 0 })] },
  // A step back out of reach.
  recoil: { recover: 340, keys: [C(0, 1, { fwd: 0 }), C(1, 2, { fwd: -2, lean: -4 }), C(1.25, 4, { fwd: -9, lean: -10, upper: -2 }), C(2, 5, { fwd: 0, lean: 0, upper: 0 })] },
  // A blessing on yourself: arms raised high, standing tall.
  raise: { recover: 400, keys: [S(0, 4, { squash: 1 }), S(1, 3, { squash: 1.07, lift: 2, lean: -5 }), S(1.4, 2, { squash: 1.05, lift: 3, lean: -3 }), S(2, 6, { squash: 1, lift: 0, lean: 0 })] },
  // A storm of cuts: three alternating swings inside the release.
  flurry: { recover: 420, keys: [S(0, 1, { upper: -1 }), S(1, 3, { upper: 2, fwd: 2 }), S(1.2, 4, { upper: 3, fwd: 3, side: 2 }), S(1.4, 2, { upper: 2, fwd: 4, side: -2 }), S(1.6, 3, { upper: 3, fwd: 5, side: 1 }), S(2, 6, { upper: 0, fwd: 0, side: 0 })] },
  // Both palms shoved forward (a wave, a gale).
  push: { recover: 360, keys: [C(0, 2, { upper: -2 }), C(1, 3, { upper: -3, squash: 0.94 }), C(1.06, 4, { upper: 4, fwd: 3, lean: 8, squash: 1 }), C(1.6, 4, { upper: 3, fwd: 3, lean: 6 }), C(2, 5, { upper: 0, fwd: 0, lean: 0 })] },
  // Hunched over, gathering into the body (drinking, feeding, a draw of breath).
  drink: { recover: 420, keys: [K(0, { clip: "hit", f: 1, squash: 0.96 }), C(1, 2, { squash: 0.9, lean: 8, upper: 1 }), C(1.3, 3, { squash: 1.05, lean: -6, upper: -1 }), C(2, 5, { squash: 1, lean: 0, upper: 0 })] },
};

/** One stroke of the weapon: from angle → to angle (degrees, relative to the aim), over release time. */
export interface Stroke {
  from: number;
  to: number;
  /** Release-time window (1 → 2) the stroke takes; before it the weapon waits at `from`. */
  t0?: number;
  t1?: number;
  hand?: "main" | "off";
}

export interface SkillMotion {
  move: MoveId;
  /** How the weapon is swung (absent: it stays in the hand as the frame holds it). */
  strokes?: Stroke[];
  /** The colour of the blade's trail (absent: no trail). */
  trail?: Ramp;
  /** Afterimages left behind (dashes). */
  ghosts?: number;
  /** Extra beats for basic attacks: consecutive basics step through these (a 3-hit chain). */
  chain?: SkillMotion[];
}

const st = (from: number, to: number, t0 = 1, t1 = 1.4, hand: Stroke["hand"] = "main"): Stroke => ({ from, to, t0, t1, hand });

/**
 * Every castable skill: its move, its strokes, its trail. A test checks that each skill has an
 * entry and that no two entries are the same.
 */
export const SKILL_MOTION: Record<string, SkillMotion> = {
  // --- Blades: fast, two-handed, light.
  blades_cut: {
    move: "slash",
    strokes: [st(-75, 70, 1, 1.3)],
    trail: "steel",
    chain: [
      { move: "backhand", strokes: [st(80, -70, 1, 1.28, "off")], trail: "steel" },
      { move: "thrust", strokes: [st(-30, 0, 1, 1.15), st(30, 0, 1, 1.15, "off")], trail: "gold" },
    ],
  },
  blades_draw: { move: "dash", strokes: [st(-150, 40, 1, 1.15)], trail: "steel", ghosts: 4 },
  blades_cross: { move: "slash", strokes: [st(-70, 70, 1, 1.25), st(70, -70, 1.12, 1.4, "off")], trail: "gold" },
  blades_whirl: { move: "spin", strokes: [st(-20, 340, 1, 1.7), st(160, 520, 1, 1.7, "off")], trail: "steel" },
  blades_flurry: { move: "flurry", strokes: [st(-60, 60, 1, 1.15), st(60, -60, 1.18, 1.35, "off"), st(-50, 50, 1.38, 1.55)], trail: "wind" },
  blades_behead: { move: "leap", strokes: [st(-110, 50, 1.35, 1.6)], trail: "blood", ghosts: 3 },

  // --- Glaive: long, sweeping, the shaft turned through the hands.
  glaive_sweep: {
    move: "slash",
    strokes: [st(-90, 60, 1, 1.4)],
    trail: "steel",
    chain: [
      { move: "backhand", strokes: [st(70, -80, 1, 1.4)], trail: "steel" },
      { move: "thrust", strokes: [st(0, 0, 1, 1.2)], trail: "gold" },
    ],
  },
  glaive_thrust: { move: "thrust", strokes: [st(-8, 0, 1, 1.1)], trail: "gold" },
  glaive_vault: { move: "leap", strokes: [st(-160, -20, 1, 1.35), st(-20, 70, 1.5, 1.7)], trail: "wind", ghosts: 2 },
  glaive_reap: { move: "spin", strokes: [st(-60, 300, 1, 1.75)], trail: "nature" },
  glaive_hook: { move: "thrust", strokes: [st(-10, 10, 1, 1.15), st(10, -40, 1.25, 1.55)], trail: "steel" },
  glaive_moon: { move: "spin", strokes: [st(-90, 450, 1, 1.85)], trail: "dusk" },

  // --- Greatblade: slow, heavy, the whole body behind it.
  greatblade_cleave: {
    move: "overhead",
    strokes: [st(-130, 60, 1, 1.25)],
    trail: "steel",
    chain: [
      { move: "backhand", strokes: [st(110, -60, 1, 1.3)], trail: "steel" },
      { move: "slam", strokes: [st(-170, 0, 1, 1.12)], trail: "gold" },
    ],
  },
  greatblade_charge: { move: "dash", strokes: [st(-10, 10, 1, 1.3)], trail: "steel", ghosts: 5 },
  greatblade_overhead: { move: "overhead", strokes: [st(-175, 5, 1, 1.12)], trail: "gold" },
  greatblade_quake: { move: "slam", strokes: [st(-170, 10, 1, 1.1)], trail: "dusk" },
  greatblade_spin: { move: "spin", strokes: [st(-90, 270, 1, 1.75)], trail: "steel" },
  greatblade_sunder: { move: "overhead", strokes: [st(-160, 20, 1, 1.15)], trail: "shadow" },

  // --- Brush: calligraphy in the air, wrist strokes.
  brush_stroke: {
    move: "throw",
    strokes: [st(-60, 20, 1, 1.2)],
    trail: "blood",
    chain: [
      { move: "throw", strokes: [st(60, -20, 1, 1.2)], trail: "blood" },
      { move: "push", strokes: [st(-90, 90, 1, 1.4)], trail: "blood" },
    ],
  },
  brush_lance: { move: "thrust", strokes: [st(-120, 0, 1, 1.25)], trail: "blood" },
  brush_seal: { move: "kneel", strokes: [st(-60, 300, 1, 1.5)], trail: "blood" },
  brush_sigil: { move: "channel", strokes: [st(-90, 270, 1, 1.6)], trail: "fire" },
  brush_glyphs: { move: "throw", strokes: [st(-50, 50, 1, 1.12), st(50, -50, 1.12, 1.24), st(-50, 50, 1.24, 1.36)], trail: "blood" },
  brush_flood: { move: "push", strokes: [st(-120, 120, 1, 1.6)], trail: "blood" },

  // --- Talismans: paper flicked from the fingers.
  talismans_throw: {
    move: "throw",
    strokes: [st(-40, 10, 1, 1.15)],
    trail: "fire",
    chain: [
      { move: "throw", strokes: [st(40, -10, 1, 1.15, "off")], trail: "fire" },
      { move: "push", strokes: [st(-30, 10, 1, 1.15), st(30, -10, 1, 1.15, "off")], trail: "fire" },
    ],
  },
  talismans_fan: { move: "push", strokes: [st(-70, 70, 1, 1.3), st(70, -70, 1, 1.3, "off")], trail: "fire" },
  talismans_ward: { move: "kneel", strokes: [st(0, 360, 1, 1.5)], trail: "fire" },
  talismans_mine: { move: "kneel", strokes: [st(-40, 40, 1, 1.2, "off")], trail: "gold" },
  talismans_chain: { move: "throw", strokes: [st(-100, 30, 1, 1.25)], trail: "fire" },
  talismans_phoenix: { move: "channel", strokes: [st(-170, 10, 1, 1.3), st(170, -10, 1, 1.3, "off")], trail: "fire" },

  // --- Fan: opened and snapped, the wrist and the hips.
  fan_gust: {
    move: "slash",
    strokes: [st(-70, 40, 1, 1.2)],
    trail: "wind",
    chain: [
      { move: "backhand", strokes: [st(70, -40, 1, 1.2)], trail: "wind" },
      { move: "spin", strokes: [st(0, 360, 1, 1.6)], trail: "wind" },
    ],
  },
  fan_blink: { move: "recoil", strokes: [st(-30, -150, 1, 1.3)], trail: "wind", ghosts: 4 },
  fan_blades: { move: "throw", strokes: [st(-100, 60, 1, 1.25)], trail: "steel" },
  fan_gale: { move: "push", strokes: [st(-150, 30, 1, 1.35)], trail: "wind" },
  fan_updraft: { move: "spin", strokes: [st(-90, 630, 1, 1.85)], trail: "wind" },
  fan_cyclone: { move: "channel", strokes: [st(0, 540, 1, 1.8)], trail: "wind" },

  // --- Lantern: swung on its cord, raised, rung.
  lantern_wisp: {
    move: "throw",
    strokes: [st(-30, 30, 1, 1.25)],
    trail: "spirit",
    chain: [
      { move: "throw", strokes: [st(30, -30, 1, 1.25)], trail: "spirit" },
      { move: "raise", strokes: [st(-90, -90, 1, 1.3)], trail: "spirit" },
    ],
  },
  lantern_toll: { move: "slam", strokes: [st(-90, 0, 1, 1.08)], trail: "spirit" },
  lantern_chain: { move: "throw", strokes: [st(-150, 20, 1, 1.3)], trail: "spirit" },
  lantern_rot: { move: "kneel", strokes: [st(30, 30, 1, 1.4)], trail: "poison" },
  lantern_flare: { move: "raise", strokes: [st(-90, -90, 1, 1.5)], trail: "gold" },
  lantern_procession: { move: "channel", strokes: [st(-80, 80, 1, 1.7)], trail: "spirit" },

  // --- Bow: drawn and loosed (the bow stays upright in the hand).
  bow_arrow: {
    move: "draw",
    trail: "wind",
    chain: [
      { move: "draw", trail: "wind" },
      { move: "recoil", trail: "gold" },
    ],
  },
  bow_hunter: { move: "kneel", trail: "gold" },
  bow_split: { move: "draw", strokes: [st(0, 0, 1, 1.1, "off")], trail: "steel" },
  bow_volley: { move: "raise", trail: "wind" },
  bow_pin: { move: "thrust", trail: "nature" },
  bow_barrage: { move: "flurry", trail: "steel" },

  // --- Knives: flicked from the wrist, from both hands.
  knives_throw: {
    move: "throw",
    strokes: [st(-90, 0, 1, 1.12)],
    trail: "steel",
    chain: [
      { move: "throw", strokes: [st(90, 0, 1, 1.12, "off")], trail: "steel" },
      { move: "spin", strokes: [st(0, 360, 1, 1.5), st(180, 540, 1, 1.5, "off")], trail: "steel" },
    ],
  },
  knives_fan: { move: "push", strokes: [st(-80, 40, 1, 1.2), st(80, -40, 1, 1.2, "off")], trail: "steel" },
  knives_dart: { move: "draw", strokes: [st(-20, 0, 1, 1.1)], trail: "poison" },
  knives_hamstring: { move: "dash", strokes: [st(60, -30, 1, 1.15)], trail: "blood", ghosts: 2 },
  knives_ricochet: { move: "backhand", strokes: [st(120, -40, 1, 1.18, "off")], trail: "gold" },
  knives_rain: { move: "raise", strokes: [st(-90, -90, 1, 1.3), st(-90, -90, 1, 1.3, "off")], trail: "steel" },

  // --- The paths' signatures.
  thorn_harvest: { move: "spin", strokes: [st(-120, 360, 1, 1.75)], trail: "blood" },
  thorn_feint: { move: "recoil", strokes: [st(40, -60, 1, 1.25)], trail: "shadow", ghosts: 3 },
  thorn_oath: { move: "raise", strokes: [st(-90, -95, 1, 1.4)], trail: "blood" },
  bark_roots: { move: "kneel", strokes: [st(-20, 80, 1, 1.15)], trail: "nature" },
  bark_hide: { move: "drink", trail: "nature" },
  bark_grove: { move: "slam", strokes: [st(-100, 60, 1, 1.1)], trail: "nature" },
  blood_drink: { move: "drink", trail: "blood" },
  blood_veil: { move: "raise", strokes: [st(-60, -120, 1, 1.4)], trail: "blood" },
  blood_boil: { move: "channel", trail: "blood" },
  ash_pyre: { move: "throw", strokes: [st(-140, -30, 1, 1.2)], trail: "fire" },
  ash_ignite: { move: "push", strokes: [st(-10, 10, 1, 1.1)], trail: "fire" },
  ash_vent: { move: "slam", trail: "fire" },
  storm_bolt: { move: "push", strokes: [st(-100, 0, 1, 1.06)], trail: "lightning" },
  storm_ward: { move: "raise", trail: "lightning" },
  storm_tempest: { move: "channel", trail: "lightning" },
  graves_raise: { move: "kneel", trail: "spirit" },
  graves_curse: { move: "throw", strokes: [st(-90, 0, 1, 1.3)], trail: "shadow" },
  graves_feast: { move: "drink", trail: "spirit" },
  dusk_mark: { move: "draw", trail: "dusk" },
  dusk_snare: { move: "kneel", strokes: [st(60, -60, 1, 1.3)], trail: "dusk" },
  dusk_fade: { move: "recoil", trail: "shadow", ghosts: 5 },
  sting_smoke: { move: "throw", strokes: [st(-20, 70, 1, 1.1)], trail: "shadow" },
  sting_boil: { move: "push", strokes: [st(-60, 20, 1, 1.25)], trail: "poison" },
  sting_antidote: { move: "drink", trail: "poison" },
};

/** How far each weapon part reaches from the hand (art pixels), for the trail. */
export const REACH: Partial<Record<string, number>> = {
  katana: 19,
  wakizashi: 13,
  glaive: 30,
  nodachi: 26,
  brush: 11,
  talismans: 8,
  fan: 10,
  lantern: 9,
  knife: 8,
};

/** Seconds within which another basic attack continues the chain. */
export const CHAIN_WINDOW = 0.9;

/** A weapon's home trail colour (when a skill doesn't name one). */
export const WEAPON_TRAIL: Record<WeaponId, Ramp> = {
  blades: "steel",
  glaive: "steel",
  greatblade: "steel",
  brush: "blood",
  talismans: "fire",
  fan: "wind",
  lantern: "spirit",
  bow: "wind",
  knives: "steel",
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (k: number) => k * k * (3 - 2 * k);

export interface Pose {
  clip: Clip;
  f: number;
  fwd: number;
  side: number;
  lift: number;
  lean: number;
  squash: number;
  upper: number;
  turn: number;
}

/** The pose at time t (0–2) of a move: numbers eased between keys, the frame held from the last key that names one. */
export function poseAt(move: MoveDef, t: number): Pose {
  const keys = move.keys;
  const out: Pose = { clip: keys[0].clip ?? "strike", f: keys[0].f ?? 0, fwd: 0, side: 0, lift: 0, lean: 0, squash: 1, upper: 0, turn: 0 };
  for (const k of keys) {
    if (k.t > t) break;
    if (k.clip) out.clip = k.clip;
    if (k.f !== undefined) out.f = k.f;
  }
  const fields = ["fwd", "side", "lift", "lean", "squash", "upper", "turn"] as const;
  for (const name of fields) {
    // The two keys around t that set this field (a field a key doesn't mention keeps its course).
    let a: PoseKey | null = null;
    let b: PoseKey | null = null;
    for (const k of keys) {
      if (k[name] === undefined) continue;
      if (k.t <= t) a = k;
      else if (!b) b = k;
    }
    const base = name === "squash" ? 1 : 0;
    const av = a ? (a[name] as number) : base;
    if (!b) out[name] = av;
    else {
      const at = a ? a.t : 0;
      const k = Math.min(1, Math.max(0, (t - at) / Math.max(1e-6, b.t - at)));
      // Turns go round at an even speed; everything else eases in and out.
      out[name] = lerp(av, b[name] as number, name === "turn" ? k : smooth(k));
    }
  }
  return out;
}

/** The weapon angle (radians, relative to the aim) a stroke list gives at release time t, or null for the frame's own. */
export function strokeAngle(strokes: Stroke[] | undefined, hand: "main" | "off", t: number): number | null {
  const mine = (strokes ?? []).filter((s) => (s.hand ?? "main") === hand);
  if (!mine.length) return null;
  // Before the first stroke the weapon is raised at its start; after the last it rests at its end
  // until the recovery hands it back to the frame.
  if (t < 1) return (mine[0].from * Math.PI) / 180;
  if (t > 1.85) return null;
  let cur = mine[0];
  for (const s of mine) if (t >= (s.t0 ?? 1)) cur = s;
  const t0 = cur.t0 ?? 1;
  const t1 = cur.t1 ?? 1.4;
  const k = Math.min(1, Math.max(0, (t - t0) / Math.max(1e-6, t1 - t0)));
  // Strokes are fast in the middle (the cut), slow at the ends (the raise and the follow-through).
  return (lerp(cur.from, cur.to, smooth(k)) * Math.PI) / 180;
}

/** Is the weapon mid-stroke at t (moving fast enough to leave a trail)? */
export function inStroke(strokes: Stroke[] | undefined, hand: "main" | "off", t: number): boolean {
  return (strokes ?? []).some((s) => (s.hand ?? "main") === hand && t >= (s.t0 ?? 1) && t <= (s.t1 ?? 1.4) + 0.04 && s.from !== s.to);
}
