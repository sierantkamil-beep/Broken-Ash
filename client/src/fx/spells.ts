import { CELL, worldToScreen, type PathId, type SkillDef, type WeaponId } from "@broken-ash/shared";
import { DEPTH_GROUND, FxKit, RAMP_COLORS, type Ramp } from "./fxkit";

/**
 * Every skill's effect, built from its data: the element comes from the weapon (a talisman burns, a
 * lantern haunts) or, for a path's own skills, from the path (Ash is fire, Storm lightning, Graves
 * spirit…); the look from the skill's shape and its vfx key. A skill can also have a hand-made
 * recipe (the signature skills do). The exact hit shape is still drawn underneath (shapes.ts), so
 * the spectacle never hides what actually hits.
 */

export const PATH_RAMP: Record<PathId, Ramp> = {
  thorn: "blood",
  bark: "nature",
  blood: "blood",
  ash: "fire",
  storm: "lightning",
  graves: "spirit",
  dusk: "dusk",
  sting: "poison",
};
const WEAPON_RAMP: Record<WeaponId, Ramp> = {
  blades: "steel",
  glaive: "steel",
  greatblade: "steel",
  brush: "blood",
  talismans: "fire",
  fan: "wind",
  lantern: "spirit",
  bow: "steel",
  knives: "steel",
};
const WEAPONS = Object.keys(WEAPON_RAMP) as WeaponId[];
const PATHS = Object.keys(PATH_RAMP) as PathId[];

/** A skill's element: its weapon's, its path's, or what its look says (fire is fire on any path). */
export function rampOf(skill: SkillDef): Ramp {
  const v = skill.vfx;
  if (skill.fire || /fire|pyre|ignite|phoenix|talisman/.test(v)) return "fire";
  if (/lightning|tempest|ward$|static/.test(v)) return "lightning";
  if (/rot|poison|smoke|boil$|antidote|dart|curse/.test(v)) return "poison";
  if (/wisp|soul|toll|flare|raise|feast|spirit|procession/.test(v)) return "spirit";
  if (/gust|gale|wind|cyclone|blink/.test(v)) return "wind";
  if (/roots|grove|bark|snare/.test(v)) return "nature";
  if (/blood|drink|veil|needle|lance|sigil|seal|flood|slash_red|oath/.test(v)) return "blood";
  const owner = skill.id.split("_")[0];
  if ((WEAPONS as string[]).includes(owner)) return WEAPON_RAMP[owner as WeaponId];
  if ((PATHS as string[]).includes(owner)) return PATH_RAMP[owner as PathId];
  return "steel";
}

const has = (v: string, ...w: string[]) => w.some((x) => v.includes(x));
/** The baked ramps of an animation family, so a recipe falls back gracefully (tools/fx/build.py SET). */
const pick = (kit: FxKit, fam: string, ramp: Ramp, ...fallback: Ramp[]) => {
  for (const r of [ramp, ...fallback, "steel", "gold"] as Ramp[]) if (kit.has(`${fam}/${r}`)) return `${fam}/${r}`;
  return `${fam}/${ramp}`;
};
/** Art pixels per world cell (32) at the slash art's radius of 56 px. */
const SLASH_R = 56;
const ART_CELL = CELL / 2;

export interface Feel {
  shake(intensity: number, ms: number): void;
  flashScreen(color: number, ms: number): void;
  freeze(id: string, ms: number): void;
}

export class SpellFx {
  constructor(
    private readonly kit: FxKit,
    private readonly feel: Feel,
  ) {}

  private s(x: number, y: number, z = 0) {
    return worldToScreen(x, y, z);
  }

  /** Embers, sparks, motes: a spray of glowing pixels. */
  private sparks(x: number, y: number, ramp: Ramp, n: number, speed = 160, lift = 20, aim?: number, spread = Math.PI * 2) {
    const c = RAMP_COLORS[ramp];
    this.kit.emit(n, () => {
      const a = aim === undefined ? Math.random() * Math.PI * 2 : aim + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + Math.random() * 0.8);
      return { x, y, z: lift, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 40 + Math.random() * 90, gravity: 260, drag: 0.06, max: 0.35 + Math.random() * 0.35, size: Math.random() < 0.3 ? 2 : 1, color: c.hot, color2: c.dark };
    });
  }

  /** Embers rising and drifting (fire, spirit flames, motes). */
  private rise(x: number, y: number, ramp: Ramp, n: number, radiusPx: number) {
    const c = RAMP_COLORS[ramp];
    this.kit.emit(n, () => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radiusPx;
      return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, z: Math.random() * 10, vx: (Math.random() - 0.5) * 20, vy: 0, vz: 30 + Math.random() * 50, drag: 0.02, max: 0.6 + Math.random() * 0.8, size: 1, color: c.hot, color2: c.dark };
    });
  }

  /**
   * Makes a skill's big shapes ahead of time (in idle moments), so the first cast doesn't hitch while
   * its smear or blast is drawn.
   */
  warm(skill: SkillDef) {
    const ramp = rampOf(skill);
    const sh = skill.shape;
    const P = this.kit.proc;
    if (sh.kind === "cone") P.get("slash", ramp, sh.range * ART_CELL, sh.arc);
    if (sh.kind === "circle") {
      const R = sh.radius * ART_CELL;
      P.get("ring", ramp, R);
      if (ramp === "fire") P.get("explosion", "fire", R);
      if (has(skill.vfx, "whirl", "reap", "spin", "moon", "enso")) P.get("slash", ramp, R, 360);
      if (has(skill.vfx, "seal", "sigil", "roots", "snare", "curse", "drink", "boil")) P.get("sigil", ramp === "nature" ? "nature" : ramp, R);
    }
    for (const e of skill.effects) if (e.kind === "zone" && (ramp === "lightning" || ramp === "nature" || ramp === "blood")) P.get("sigil", ramp, e.radius * ART_CELL);
  }

  // ------------------------------------------------------------------------------- casts

  /** Cones: a blade smear the size and width of the real wedge, in the skill's element. */
  cone(skill: SkillDef, ox: number, oy: number, aim: number, range: number, arc: number, casterId: string) {
    const v = skill.vfx;
    const ramp = rampOf(skill);
    const p = this.s(ox, oy);
    const cy = p.y - 18; // the swing is at chest height, not on the feet
    const swing = (flip: boolean, delay = 0, k = 1, rotOff = 0) =>
      this.kit.shape("slash", ramp, range * ART_CELL * k, p.x, cy, { arc, rot: aim + rotOff, fps: 30, flipY: flip, delay });
    if (has(v, "flurry")) {
      swing(false, 0, 0.85, -0.2);
      swing(true, 70, 0.9, 0.15);
      swing(false, 140, 1, 0);
    } else if (has(v, "cross")) {
      swing(false);
      swing(true, 90);
    } else if (has(v, "gust", "gale")) {
      // Wind: no blade, streaks blown out across the cone.
      for (let i = 0; i < (has(v, "gale") ? 7 : 4); i++) {
        const a = aim + (Math.random() - 0.5) * ((arc * Math.PI) / 180) * 0.9;
        this.kit.play(pick(this.kit, "streak", "wind"), p.x, cy, { rot: a, scaleX: (range * ART_CELL) / 96, scaleY: 0.6, fps: 26, delay: i * 25, alpha: 0.85 });
      }
      this.sparks(p.x + Math.cos(aim) * range * CELL * 0.6, cy + Math.sin(aim) * range * CELL * 0.6, "wind", 14, 220, 10, aim, 0.9);
    } else if (has(v, "hook")) {
      this.kit.play(pick(this.kit, "streak", ramp), p.x, cy, { rot: aim, scaleX: (range * ART_CELL) / 96, scaleY: 0.7, fps: 28 });
    } else if (has(v, "flood")) {
      swing(false, 0, 1);
      this.sparks(p.x + Math.cos(aim) * range * CELL * 0.7, cy + Math.sin(aim) * range * CELL * 0.7, "blood", 26, 200, 14, aim, 1.2);
    } else if (has(v, "feast")) {
      swing(false);
      this.kit.play("hands/spirit", p.x + Math.cos(aim) * range * CELL * 0.6, p.y + Math.sin(aim) * range * CELL * 0.6, { scale: 1.3, fps: 16 });
    } else swing(false);
    const heavy = has(v, "cleave", "overhead", "harvest", "slash_red") || arc >= 120;
    // Glints where the blade ends its arc, and a flash of light from the swing.
    const end = aim + ((arc * Math.PI) / 360) * 0.9;
    this.sparks(p.x + Math.cos(end) * range * CELL, cy + Math.sin(end) * range * CELL, ramp === "steel" ? "gold" : ramp, heavy ? 10 : 5, 140, 16);
    this.kit.light(p.x + Math.cos(aim) * range * CELL * 0.5, cy + Math.sin(aim) * range * CELL * 0.5, range * CELL * 1.1, RAMP_COLORS[ramp === "steel" ? "steel" : ramp].mid, 0.6, 220);
    if (has(v, "overhead", "cleave")) {
      this.kit.shape("ring", "steel", 44 * (0.6), p.x + Math.cos(aim) * range * CELL * 0.7, p.y + Math.sin(aim) * range * CELL * 0.7, { fps: 26, depth: DEPTH_GROUND, delay: 80 });
      this.feel.shake(0.006, 140);
      this.feel.freeze(casterId, 60);
    }
  }

  /** Lines: thrusts and dashes as spears of light; lightning as a real bolt. */
  line(skill: SkillDef, ox: number, oy: number, aim: number, length: number, width: number, dashed: boolean) {
    const v = skill.vfx;
    const ramp = rampOf(skill);
    const p = this.s(ox, oy);
    const ex = ox + Math.cos(aim) * length;
    const ey = oy + Math.sin(aim) * length;
    const e = this.s(ex, ey);
    if (ramp === "lightning" || has(v, "lightning")) {
      this.kit.lightning(p.x, p.y - 26, e.x, e.y - 20, 260, RAMP_COLORS.lightning.mid, Math.max(1, width));
      this.kit.shape("ring", "lightning", 44 * (0.5), e.x, e.y, { fps: 30, depth: DEPTH_GROUND });
      this.sparks(e.x, e.y, "lightning", 18, 220, 20);
      this.kit.light((p.x + e.x) / 2, (p.y + e.y) / 2, length * CELL * 0.8, RAMP_COLORS.lightning.hot, 1.4, 260);
      this.feel.flashScreen(0xc8d0ff, 90);
      this.feel.shake(0.006, 140);
      return;
    }
    const scaleX = (length * ART_CELL) / 96;
    // A spear of light, slim whatever the hit's width (the shape underneath shows the width).
    const scaleY = width >= 1.4 ? 1 : 0.75;
    if (dashed) {
      // The body's path: a shadow afterimage under a bright streak, dust kicked at the start.
      this.kit.play(pick(this.kit, "streak", "shadow"), p.x, p.y - 20, { rot: aim, scaleX, scaleY: scaleY * 1.3, fps: 22, add: false, alpha: 0.7 });
      this.sparks(p.x, p.y, "wind", 10, 90, 4, aim + Math.PI, 1.4);
    }
    this.kit.play(pick(this.kit, "streak", ramp, "steel"), p.x, p.y - 20, { rot: aim, scaleX, scaleY, fps: 26 });
    this.sparks(e.x, e.y - 18, ramp === "steel" ? "gold" : ramp, 8, 150, 18, aim, 1.0);
    this.kit.light((p.x + e.x) / 2, (p.y + e.y) / 2 - 20, length * CELL * 0.6, RAMP_COLORS[ramp].mid, 0.6, 200);
    if (has(v, "heavy", "sunder", "charge")) {
      this.kit.shape("ring", "steel", 44 * (0.7), e.x, e.y, { fps: 26, depth: DEPTH_GROUND });
      this.feel.shake(0.007, 160);
    }
  }

  /** Circles around the caster: whirls, novas, quakes, bells, buffs with a burst. */
  nova(skill: SkillDef, ox: number, oy: number, radius: number, casterId: string) {
    const v = skill.vfx;
    const ramp = rampOf(skill);
    const p = this.s(ox, oy);
    const ringScale = (radius * ART_CELL) / 44;
    if (has(v, "whirl", "reap", "spin")) {
      this.kit.shape("slash", ramp, SLASH_R * ((radius * ART_CELL) / SLASH_R), p.x, p.y - 16, { arc: 360, fps: 30 });
      this.kit.shape("slash", ramp, SLASH_R * ((radius * ART_CELL) / SLASH_R * 0.8), p.x, p.y - 16, { arc: 360, fps: 30, delay: 90, flipY: true, alpha: 0.7 });
      this.sparks(p.x, p.y - 16, ramp === "steel" ? "gold" : ramp, 16, 260, 16);
    } else if (has(v, "quake")) {
      this.kit.shape("ring", "steel", 44 * (ringScale), p.x, p.y, { fps: 22, depth: DEPTH_GROUND });
      this.kit.shape("ring", "nature", 44 * (ringScale * 0.7), p.x, p.y, { fps: 22, depth: DEPTH_GROUND, delay: 60 });
      this.dust(p.x, p.y, radius * CELL, 26);
      this.feel.shake(0.012, 260);
      this.feel.freeze(casterId, 80);
    } else if (has(v, "ignite", "nova_fire", "vent")) {
      this.kit.shape("explosion", "fire", 34 * ((radius * ART_CELL) / 30), p.x, p.y - 10, { fps: 24 });
      this.kit.shape("ring", "fire", 44 * (ringScale), p.x, p.y, { fps: 24, depth: DEPTH_GROUND });
      this.sparks(p.x, p.y, "fire", 30, 280, 16);
      this.rise(p.x, p.y, "fire", 20, radius * CELL * 0.8);
      this.kit.light(p.x, p.y, radius * CELL * 2.2, RAMP_COLORS.fire.mid, 1.6, 500);
      this.feel.shake(0.01, 220);
    } else if (has(v, "drink", "boil_blood")) {
      this.kit.shape("ring", "blood", 44 * (ringScale), p.x, p.y, { fps: 20, depth: DEPTH_GROUND });
      this.kit.shape("sigil", "blood", 36 * (ringScale * 1.1), p.x, p.y, { fps: 14, depth: DEPTH_GROUND, alpha: 0.9 });
      // Blood pulled in from all around towards the caster.
      const c = RAMP_COLORS.blood;
      this.kit.emit(36, () => {
        const a = Math.random() * Math.PI * 2;
        const r = radius * CELL * (0.6 + Math.random() * 0.4);
        return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, z: 6, vx: -Math.cos(a) * r * 2.2, vy: -Math.sin(a) * r * 2.2, vz: 40, drag: 0.04, max: 0.45, size: Math.random() < 0.4 ? 2 : 1, color: c.hot, color2: c.dark };
      });
      this.kit.light(p.x, p.y, radius * CELL * 1.6, RAMP_COLORS.blood.mid, 1.0, 400);
    } else if (has(v, "toll", "flare")) {
      this.kit.shape("ring", "spirit", 44 * (ringScale), p.x, p.y, { fps: 20, depth: DEPTH_GROUND });
      this.kit.shape("ring", "spirit", 44 * (ringScale * 0.8), p.x, p.y, { fps: 20, depth: DEPTH_GROUND, delay: 150 });
      if (has(v, "flare")) this.kit.play("pillar/spirit", p.x, p.y, { scale: 1.4, fps: 18 });
      this.rise(p.x, p.y, "spirit", 24, radius * CELL);
      this.kit.light(p.x, p.y, radius * CELL * 2, RAMP_COLORS.spirit.mid, 1.2, 500);
    } else if (has(v, "smoke")) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const r = radius * CELL * (i % 3 === 0 ? 0.2 : 0.6);
        this.kit.play("cloud/shadow", p.x + Math.cos(a) * r, p.y + Math.sin(a) * r - 8, { scale: 1.6, fps: 10, loop: true, duration: 1600, add: false, alpha: 0.85, delay: i * 30 });
      }
    } else if (has(v, "grove")) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.kit.play("roots/nature", p.x + Math.cos(a) * radius * CELL * 0.7, p.y + Math.sin(a) * radius * CELL * 0.7, { scale: 1, fps: 16, add: false, delay: i * 40 });
      }
      this.kit.shape("ring", "nature", 44 * (ringScale), p.x, p.y, { fps: 20, depth: DEPTH_GROUND });
    } else if (has(v, "cyclone", "updraft")) {
      this.kit.shape("cyclone", "wind", 32 * ((radius * ART_CELL) / 32), p.x, p.y - 10, { fps: 22, loop: true, duration: 700, alpha: 0.9 });
      this.sparks(p.x, p.y, "wind", 18, 240, 8);
    } else if (has(v, "blink")) {
      this.kit.play("cloud/shadow", p.x, p.y - 12, { scale: 1.5, fps: 14, loop: true, duration: 500, add: false, alpha: 0.8 });
      this.kit.shape("ring", "wind", 44 * (ringScale), p.x, p.y, { fps: 26, depth: DEPTH_GROUND });
    } else if (has(v, "moon", "enso")) {
      this.kit.shape("slash", ramp === "steel" ? "steel" : ramp, SLASH_R * ((radius * ART_CELL) / SLASH_R), p.x, p.y - 14, { arc: 360, fps: 22 });
      this.kit.shape("ring", "dusk", 44 * (ringScale), p.x, p.y, { fps: 20, depth: DEPTH_GROUND });
    } else {
      this.kit.shape("ring", ramp, 44 * (ringScale), p.x, p.y, { fps: 22, depth: DEPTH_GROUND });
      this.sparks(p.x, p.y, ramp, 16, 220, 10);
    }
  }

  /** Buffs on yourself: a pillar of the element's light, a ring at the feet, and the buff's own sign. */
  aura(skill: SkillDef, ox: number, oy: number, follow: () => { x: number; y: number } | null) {
    const v = skill.vfx;
    const ramp = rampOf(skill);
    const p = this.s(ox, oy);
    if (has(v, "raise")) {
      for (const dx of [-38, 38]) this.kit.play("hands/spirit", p.x + dx, p.y + 10, { scale: 1.4, fps: 14 });
      this.kit.shape("ring", "spirit", 44 * (1.6), p.x, p.y, { fps: 18, depth: DEPTH_GROUND });
      this.rise(p.x, p.y, "spirit", 30, 70);
      this.kit.light(p.x, p.y, 220, RAMP_COLORS.spirit.mid, 1.3, 700);
      return;
    }
    if (has(v, "fade")) {
      this.kit.play("cloud/shadow", p.x, p.y - 20, { scale: 1.8, fps: 12, loop: true, duration: 700, add: false, alpha: 0.85 });
      this.kit.play("cloud/shadow", p.x + 14, p.y - 6, { scale: 1.3, fps: 12, loop: true, duration: 600, add: false, alpha: 0.7, delay: 60 });
      return;
    }
    this.kit.play(pick(this.kit, "pillar", ramp, "gold"), p.x, p.y, { scale: 1.2, fps: 18 });
    this.kit.shape("ring", ramp, 44 * (0.9), p.x, p.y, { fps: 20, depth: DEPTH_GROUND });
    if (has(v, "bark", "veil", "ward")) {
      const fam = pick(this.kit, "bubble", ramp === "blood" ? "blood" : ramp === "lightning" ? "lightning" : "nature");
      this.kit.play(fam, p.x, p.y - 34, { scale: 1.6, fps: 12, loop: true, duration: 1400, alpha: 0.85, follow, dy: -34 });
      if (ramp === "lightning") this.kit.lightning(p.x - 30, p.y - 60, p.x + 30, p.y - 10, 200);
    }
    this.rise(p.x, p.y, ramp, 18, 26);
    this.kit.light(p.x, p.y - 30, 200, RAMP_COLORS[ramp].mid, 1.0, 600, follow);
  }

  /** Circles thrown onto a spot (the server's landing point): blasts, storms, seals, volleys. */
  area(skill: SkillDef, x: number, y: number, radius: number) {
    const v = skill.vfx;
    const ramp = rampOf(skill);
    const p = this.s(x, y);
    const ringScale = (radius * ART_CELL) / 44;
    if (has(v, "pyre", "burst_fire", "ring_fire") || (ramp === "fire" && !has(v, "ward"))) {
      this.kit.shape("explosion", "fire", 34 * ((radius * ART_CELL) / 30), p.x, p.y - 12, { fps: 22 });
      this.kit.shape("ring", "fire", 44 * (ringScale), p.x, p.y, { fps: 22, depth: DEPTH_GROUND });
      this.sparks(p.x, p.y, "fire", 34, 300, 20);
      this.kit.light(p.x, p.y, radius * CELL * 2.6, RAMP_COLORS.fire.mid, 1.8, 600);
      this.feel.shake(0.009, 220);
    } else if (has(v, "tempest")) {
      // Lightning out of the sky onto the area, several strikes.
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * radius * CELL;
        const tx = p.x + Math.cos(a) * r;
        const ty = p.y + Math.sin(a) * r;
        setTimeout(() => {
          this.kit.lightning(tx + (Math.random() - 0.5) * 40, ty - 260, tx, ty, 180);
          this.sparks(tx, ty, "lightning", 10, 180, 6);
          this.kit.light(tx, ty, 180, RAMP_COLORS.lightning.hot, 1.2, 180);
        }, i * 70);
      }
      this.kit.shape("ring", "lightning", 44 * (ringScale), p.x, p.y, { fps: 22, depth: DEPTH_GROUND });
      this.feel.flashScreen(0xc8d0ff, 110);
      this.feel.shake(0.008, 260);
    } else if (has(v, "volley", "barrage", "rain")) {
      // Arrows (or knives) raining down into the circle.
      const knives = has(v, "knives");
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * radius * CELL;
        const tx = p.x + Math.cos(a) * r;
        const ty = p.y + Math.sin(a) * r;
        this.kit.play(knives ? "knife/steel" : "arrow/steel", tx - 30, ty - 120, { rot: Math.atan2(120, 30), fps: 1, delay: i * 25, add: false });
        setTimeout(() => this.sparks(tx, ty, "gold", 3, 90, 2), 140 + i * 25);
      }
      this.kit.shape("ring", ramp, 44 * (ringScale), p.x, p.y, { fps: 20, depth: DEPTH_GROUND, delay: 140 });
    } else if (has(v, "roots", "snare", "seal", "sigil")) {
      const sigilRamp = has(v, "roots", "snare") ? "nature" : ramp;
      this.kit.shape("sigil", sigilRamp, 36 * (ringScale), p.x, p.y, { fps: 14, depth: DEPTH_GROUND, loop: true, duration: 900 });
      if (has(v, "roots", "snare")) for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        this.kit.play("roots/nature", p.x + Math.cos(a) * radius * CELL * 0.55, p.y + Math.sin(a) * radius * CELL * 0.55, { scale: 1, fps: 18, add: false, delay: i * 35 });
      }
      this.kit.light(p.x, p.y, radius * CELL * 1.6, RAMP_COLORS[sigilRamp as Ramp].mid, 0.8, 600);
    } else if (has(v, "curse")) {
      this.kit.shape("sigil", "spirit", 36 * (ringScale), p.x, p.y, { fps: 14, depth: DEPTH_GROUND, loop: true, duration: 900 });
      this.kit.play("hands/shadow", p.x, p.y + 8, { scale: 1.4, fps: 14, add: false });
    } else if (has(v, "mine")) {
      this.kit.shape("explosion", "fire", 34 * (1.4), p.x, p.y - 10, { fps: 24 });
    } else {
      this.kit.shape("ring", ramp, 44 * (ringScale), p.x, p.y, { fps: 22, depth: DEPTH_GROUND });
      this.sparks(p.x, p.y, ramp, 20, 220, 12);
      this.kit.light(p.x, p.y, radius * CELL * 1.8, RAMP_COLORS[ramp].mid, 1.0, 400);
    }
  }

  /** Lingering ground: fire, poison clouds, storms, seals, held for the zone's whole duration. */
  zone(skill: SkillDef | undefined, x: number, y: number, radius: number, duration: number) {
    const v = skill?.vfx ?? "";
    const ramp = skill ? rampOf(skill) : "poison";
    const p = this.s(x, y);
    const ms = duration * 1000;
    const R = radius * CELL;
    const spots = Math.max(5, Math.round(radius * radius * 1.6));
    const scatter = (fn: (sx: number, sy: number, i: number) => void) => {
      for (let i = 0; i < spots; i++) {
        const a = i * 2.39996;
        const r = Math.sqrt((i + 0.5) / spots) * R * 0.85;
        fn(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, i);
      }
    };
    if (ramp === "fire") {
      scatter((sx, sy, i) => this.kit.play("flames/fire", sx, sy, { scale: 1, fps: 12, loop: true, duration: ms, delay: i * 20 }));
      this.kit.light(p.x, p.y, R * 2.2, RAMP_COLORS.fire.mid, 1.3, ms);
      this.emberLoop(p.x, p.y, R, "fire", ms);
    } else if (ramp === "lightning") {
      this.kit.shape("sigil", "lightning", 36 * (radius * ART_CELL / 36), p.x, p.y, { fps: 12, loop: true, duration: ms, depth: DEPTH_GROUND, alpha: 0.8 });
      const strikes = Math.floor(duration * 3);
      for (let i = 0; i < strikes; i++)
        setTimeout(() => {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * R;
          this.kit.lightning(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r - 220, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 140);
        }, (i / strikes) * ms);
      this.kit.light(p.x, p.y, R * 1.8, RAMP_COLORS.lightning.mid, 0.8, ms);
    } else if (ramp === "spirit" || ramp === "poison" || has(v, "rot", "smoke")) {
      const r2: Ramp = has(v, "smoke") ? "shadow" : ramp === "spirit" ? "spirit" : "poison";
      scatter((sx, sy, i) => this.kit.play(`cloud/${r2}`, sx, sy - 6, { scale: 1.5, fps: 9, loop: true, duration: ms, alpha: r2 === "shadow" ? 0.8 : 0.55, add: r2 !== "shadow", depth: DEPTH_GROUND + 1, delay: i * 30 }));
      if (r2 !== "shadow") this.emberLoop(p.x, p.y, R, r2, ms);
    } else if (ramp === "wind" || has(v, "cyclone")) {
      this.kit.shape("cyclone", "wind", 32 * (radius * ART_CELL / 32), p.x, p.y - 8, { fps: 16, loop: true, duration: ms, alpha: 0.75 });
    } else if (ramp === "nature" || has(v, "grove", "snare")) {
      this.kit.shape("sigil", "nature", 36 * (radius * ART_CELL / 36), p.x, p.y, { fps: 10, loop: true, duration: ms, depth: DEPTH_GROUND, alpha: 0.75 });
      scatter((sx, sy, i) => i % 2 === 0 && this.kit.play("vines/nature", sx, sy, { scale: 1, fps: 8, loop: true, duration: ms, add: false }));
    } else {
      this.kit.shape("sigil", ramp, 36 * (radius * ART_CELL / 36), p.x, p.y, { fps: 12, loop: true, duration: ms, depth: DEPTH_GROUND, alpha: 0.85 });
      this.kit.light(p.x, p.y, R * 1.5, RAMP_COLORS[ramp].mid, 0.7, ms);
    }
  }

  /** Embers or motes drifting up over a lingering area for its duration. */
  private emberLoop(x: number, y: number, R: number, ramp: Ramp, ms: number) {
    const n = Math.floor(ms / 120);
    for (let i = 0; i < n; i++) setTimeout(() => this.rise(x, y, ramp, 2, R), i * 120);
  }

  // ------------------------------------------------------------------------------- projectiles

  /** The flying sprite for a bolt and the trail it leaves; returns per-frame updater and impact. */
  projectile(skill: SkillDef | undefined, vfx: string) {
    const ramp = skill ? rampOf(skill) : "steel";
    const v = vfx;
    let anim: string;
    let scale = 1;
    let trail: Ramp | null = null;
    let spin = false;
    if (has(v, "arrow")) anim = has(v, "mark") || ramp === "dusk" ? "arrow/dusk" : "arrow/steel";
    else if (has(v, "knife")) anim = ramp === "poison" ? "knife/poison" : "knife/steel";
    else if (has(v, "dart")) {
      anim = "knife/poison";
      trail = "poison";
    } else if (has(v, "needle", "lance")) {
      anim = "needle/blood";
      scale = has(v, "lance") ? 2 : 1;
      trail = "blood";
    } else if (has(v, "talisman")) {
      anim = "talisman/fire";
      trail = "fire";
      spin = true;
    } else if (has(v, "phoenix")) {
      anim = "orb/fire";
      scale = 3;
      trail = "fire";
    } else if (has(v, "wind_blade")) {
      anim = "slash80/wind";
      scale = 0.35;
      spin = true;
      trail = "wind";
    } else {
      anim = `orb/${["fire", "spirit", "blood", "wind", "poison", "lightning", "nature", "dusk"].includes(ramp) ? ramp : "spirit"}`;
      scale = has(v, "procession", "chain", "soul") ? 1.4 : 1.1;
      trail = ramp;
    }
    return { anim, scale, trail, spin, ramp };
  }

  trailPuff(x: number, y: number, ramp: Ramp, big: boolean) {
    const c = RAMP_COLORS[ramp];
    this.kit.emit(big ? 3 : 1, () => ({ x: x + (Math.random() - 0.5) * 6, y, z: 22 + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 10, vz: 10, drag: 0.08, max: big ? 0.55 : 0.3, size: big && Math.random() < 0.5 ? 2 : 1, color: c.hot, color2: c.dark }));
  }

  impact(x: number, y: number, ramp: Ramp, big: boolean) {
    const p = this.s(x, y);
    if (ramp === "fire" && big) {
      this.kit.shape("explosion", "fire", 34 * (1.2), p.x, p.y - 16, { fps: 26 });
      this.kit.light(p.x, p.y, 220, RAMP_COLORS.fire.mid, 1.4, 350);
      this.feel.shake(0.005, 120);
    } else this.kit.play(pick(this.kit, "sparks", ramp, "gold"), p.x, p.y - 22, { scale: big ? 1.4 : 1, fps: 28 });
    this.sparks(p.x, p.y, ramp === "steel" ? "gold" : ramp, big ? 14 : 6, 160, 22);
  }

  // ------------------------------------------------------------------------------- hits

  /** A blow landing on a fighter: sparks of its element, a flash of light, hit-stop on heavy blows. */
  hit(at: { x: number; y: number; height: number }, cause: string | undefined, dx: number, dy: number, big: boolean) {
    const y = at.y - Math.min(40, at.height * 0.45);
    const ramp: Ramp = cause === "fire" ? "fire" : cause === "shock" ? "lightning" : cause === "rot" ? "poison" : cause === "spirit" ? "spirit" : cause === "blood" ? "blood" : cause === "crush" ? "steel" : "gold";
    this.kit.play(pick(this.kit, "sparks", ramp, "gold"), at.x, y, { scale: big ? 1.5 : 1, fps: 30, rot: Math.atan2(dy, dx) });
    if (cause === "shock") this.kit.play("crackle/lightning", at.x, y, { scale: 1.6, fps: 16 });
    if (cause === "crush" && big) this.kit.shape("ring", "steel", 44 * (0.45), at.x, at.y, { fps: 26, depth: DEPTH_GROUND });
    this.sparks(at.x, at.y, ramp, big ? 10 : 4, 170, Math.min(40, at.height * 0.45), Math.atan2(dy, dx), 1.4);
    if (big) this.kit.light(at.x, y, 140, RAMP_COLORS[ramp].hot, 0.9, 140);
  }

  /** A status detonated on a target (Żniwo tearing open every bleed, Zapłon igniting poison…). */
  detonate(at: { x: number; y: number; height: number }, status: string) {
    const ramp: Ramp = status === "burn" ? "fire" : status === "poison" ? "poison" : status === "static" ? "lightning" : status === "mark" ? "dusk" : "blood";
    const y = at.y - 24;
    if (ramp === "fire" || ramp === "poison") this.kit.shape("explosion", ramp, 34 * (1.1), at.x, y, { fps: 26 });
    else this.kit.shape("ring", ramp, 44 * (0.8), at.x, at.y, { fps: 26, depth: DEPTH_GROUND });
    if (ramp === "lightning") this.kit.lightning(at.x, at.y - 220, at.x, at.y - 10, 180);
    this.sparks(at.x, y, ramp, 22, 240, 20);
    this.kit.light(at.x, y, 200, RAMP_COLORS[ramp].mid, 1.4, 260);
  }

  // ------------------------------------------------------------------------------- enemy blows

  unitAttack(kind: string, atk: string, x: number, y: number, aim: number, ax: number, ay: number) {
    const p = this.s(x, y);
    if (atk === "slam" || atk === "burst") {
      const t = kind === "tapper" ? this.s(ax, ay) : p;
      this.kit.shape("ring", "blood", 44 * (kind === "tapper" ? 1.5 : 1.1), t.x, t.y, { fps: 22, depth: DEPTH_GROUND });
      this.dust(t.x, t.y, kind === "tapper" ? 140 : 90, 22);
      this.feel.shake(kind === "tapper" ? 0.014 : 0.006, 220);
      return;
    }
    if (atk === "pounce") {
      this.kit.play("streak/shadow", p.x, p.y - 18, { rot: aim, scaleX: 2.6 * ART_CELL / 96, scaleY: 0.7, fps: 24, add: false, alpha: 0.6 });
      return;
    }
    // Claws, chops and sweeps: a dirty smear.
    const big = kind === "tapper";
    const def = atk === "sweep" ? 220 : 90;
    this.kit.shape("slash", "blood", big ? 3 * ART_CELL : 1.6 * ART_CELL, p.x, p.y - 20, { arc: def, rot: aim, fps: 28, alpha: 0.85 });
    if (big) this.feel.shake(0.007, 160);
  }

  /** Dust and grit kicked up from the ground (slams, quakes, landings). */
  private dust(x: number, y: number, R: number, n: number) {
    this.kit.emit(n, () => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * R * 0.5;
      const v = 60 + Math.random() * 120;
      return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, z: 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 80 + Math.random() * 120, gravity: 420, drag: 0.04, max: 0.6, size: Math.random() < 0.4 ? 2 : 1, color: 0x8a7f72, color2: 0x3a342e, glow: false };
    });
  }
}

