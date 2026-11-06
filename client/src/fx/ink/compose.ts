import Phaser from "phaser";
import { worldToScreen, type SkillDef } from "@broken-ash/shared";
import { ART, blot, enso, paint, rng, splatter, stroke, type Dab } from "./ink";

/**
 * Ink compositions for skills: each turns a skill's real geometry (the cone, line or circle the
 * server hits with, projected onto the iso ground) into brush dabs, then plays the painted strip.
 * Compositions are cached per shape, direction (16 steps) and accent, so a repeated cast costs
 * nothing.
 */

const DIRS = 16;
const bucket = (aim: number) => ((Math.round(aim / ((2 * Math.PI) / DIRS)) % DIRS) + DIRS) % DIRS;
const bucketAngle = (b: number) => (b * 2 * Math.PI) / DIRS;

/** World offset (cells) → art pixels on screen, relative to the effect's origin. */
function art(dx: number, dy: number) {
  const s = worldToScreen(dx, dy);
  const o = worldToScreen(0, 0);
  return { x: (s.x - o.x) / ART, y: (s.y - o.y) / ART };
}

/**
 * Ink sits above the night lighting (Lighting DEPTH_LIGHT 9.5e6): it's a graphic brush mark, and
 * black ink with a pale rim under the night multiply would vanish away from the lanterns. Strokes in
 * the air go over everything; ground marks just above the light layer.
 */
export const DEPTH_INK = 9.55e6;
export const DEPTH_INK_GROUND = 9.51e6;

/** How a vfx key reads (the skill's shape decides the rest). */
const has = (vfx: string, ...words: string[]) => words.some((w) => vfx.includes(w));

export interface Played {
  img: Phaser.GameObjects.Image;
  until: number;
}

export class InkPlayer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {}

  /** Plays a painted strip at a screen point over `dur` ms (optionally lifted off the ground). */
  play(id: string, dabs: Dab[], at: { x: number; y: number }, dur: number, accent: number, depth: number, o: { frames?: number; reveal?: number; hold?: number; lift?: number } = {}) {
    const p = paint(this.scene, `${id}|${accent}`, dabs, { accent, frames: o.frames, reveal: o.reveal, hold: o.hold });
    const img = this.scene.add
      .image(Math.round(at.x - p.ox * ART), Math.round(at.y - p.oy * ART - (o.lift ?? 0)), p.key, 0)
      .setOrigin(0, 0)
      .setScale(ART)
      .setDepth(depth);
    this.layer.add(img);
    // The clock starts at the first tick, not now: painting a new stroke can take a frame or two,
    // and the effect should still play from its first brush mark.
    let start = -1;
    const ev = this.scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (start < 0) start = this.scene.time.now;
        const k = (this.scene.time.now - start) / dur;
        if (k >= 1) {
          ev.remove();
          img.destroy();
          return;
        }
        img.setFrame(Math.min(p.frames - 1, Math.floor(k * p.frames)));
      },
    });
    return img;
  }

  /** Paints a skill's ink ahead of time (every direction), so its first cast has no hitch. */
  warm(skill: SkillDef, vfx: string, accent: number) {
    const at = { x: -1e5, y: -1e5 };
    const sh = skill.shape;
    const kill = (img: Phaser.GameObjects.Image | undefined) => img?.destroy();
    for (let b = 0; b < DIRS; b++) {
      const aim = bucketAngle(b);
      if (sh.kind === "cone") kill(this.arc(skill, vfx, at, aim, accent));
      else if (sh.kind === "line") kill(this.line(skill, vfx, at, aim, accent));
      else if (sh.kind === "projectile") this.comet(vfx, aim, accent, /lance|phoenix|heavy|chain|procession/.test(vfx));
      else break;
    }
    if (sh.kind === "circle") kill(this.circle(sh.radius, vfx, at, accent));
    if (sh.kind === "self") kill(this.aura(vfx, at, accent));
    for (const e of skill.effects) if (e.kind === "zone") kill(this.zone(vfx, at, e.radius, e.duration, accent));
  }

  // ----------------------------------------------------------------------------- per shape

  /** Cones: one crescent stroke across the wedge (two crossing for a cross cut, three for a flurry). */
  arc(skill: SkillDef, vfx: string, at: { x: number; y: number }, aim: number, accent: number): Phaser.GameObjects.Image | undefined {
    if (skill.shape.kind !== "cone") return;
    const b = bucket(aim);
    const a = bucketAngle(b);
    const range = skill.shape.range;
    const half = (skill.shape.arc * Math.PI) / 360;
    const wide = has(vfx, "flood", "gale", "cleave", "feast");
    const strokes = has(vfx, "flurry") ? 3 : has(vfx, "cross") ? 2 : 1;
    const id = `arc|${vfx}|${b}|${range}|${skill.shape.arc}`;
    const dabs: Dab[] = [];
    for (let s = 0; s < strokes; s++) {
      const pts = [];
      const r = range * (0.72 - s * 0.12);
      const n = 18;
      const tilt = strokes === 2 ? (s ? 0.35 : -0.35) : 0;
      for (let i = 0; i <= n; i++) {
        // Sweep across the wedge: from one edge to the other, bulging out in the middle.
        const u = i / n;
        const ang = a - half + 2 * half * u + tilt * (u - 0.5);
        const rr = r * (0.82 + 0.18 * Math.sin(u * Math.PI)) + (strokes === 3 ? s * 0.15 : 0);
        pts.push(art(Math.cos(ang) * rr, Math.sin(ang) * rr));
      }
      if (s % 2) pts.reverse();
      dabs.push(...stroke(pts, wide ? 12 : 8.5, { seed: s + 3, dry: has(vfx, "gust", "gale") ? 0.7 : 0.3, t0: s * 0.22, t1: 0.55 + s * 0.22 }));
    }
    if (wide || has(vfx, "red", "flood")) {
      const tip = art(Math.cos(a) * range * 0.8, Math.sin(a) * range * 0.8);
      dabs.push(...splatter(tip.x, tip.y, 10, 9, b, 0.4));
    }
    return this.play(id, dabs, at, 520, accent, DEPTH_INK, { reveal: 0.3, lift: 22 });
  }

  /** Lines: a straight brush stroke (dashes and thrusts), or a jagged one for lightning. */
  line(skill: SkillDef, vfx: string, from: { x: number; y: number }, aim: number, accent: number): Phaser.GameObjects.Image | undefined {
    if (skill.shape.kind !== "line") return;
    const b = bucket(aim);
    const a = bucketAngle(b);
    const len = skill.shape.length;
    const id = `line|${vfx}|${b}|${len}`;
    const pts = [];
    const n = 14;
    const jag = has(vfx, "lightning");
    const rand = rng(b + 5);
    for (let i = 0; i <= n; i++) {
      const d = (len * i) / n;
      const j = jag && i > 0 && i < n ? (rand() - 0.5) * 0.9 : 0;
      pts.push(art(Math.cos(a) * d - Math.sin(a) * j, Math.sin(a) * d + Math.cos(a) * j));
    }
    const dabs = stroke(pts, jag ? 3.2 : has(vfx, "heavy", "sunder", "charge") ? 11 : 8, { seed: b, dry: jag ? 0.15 : 0.45, press: 0.06 });
    if (jag) dabs.push(...splatter(pts[n].x, pts[n].y, 6, 6, b));
    return this.play(id, dabs, from, jag ? 360 : 480, accent, DEPTH_INK, { reveal: jag ? 0.15 : 0.3, lift: jag ? 50 : 18 });
  }

  /** Circles around the caster or at the landing point: an enso, a burst of splatter, or a seal. */
  circle(radius: number, vfx: string, at: { x: number; y: number }, accent: number) {
    const rx = art(radius, 0).x;
    const r = art(radius * 0.7071, radius * 0.7071);
    const ry = Math.abs(r.y) || rx / 2;
    const ex = Math.hypot(r.x, 0) + rx * 0.0;
    const id = `circle|${vfx}|${radius}`;
    let dabs: Dab[];
    if (has(vfx, "quake", "burst", "mine", "ignite", "nova", "vent", "boil", "drink", "flare", "toll", "overhead")) {
      dabs = [...enso(0, 0, rx * 0.55, ry * 0.55, 6, 0.4, 2, Math.PI * 1.4), ...splatter(0, 0, rx * 0.9, 26, radius * 10)].map((d) => ({ ...d, r: d.r * 1.4 }));
    } else if (has(vfx, "sigil", "seal", "ring", "curse", "snare", "ward")) {
      // A seal: a closed circle with strokes across it.
      dabs = [...enso(0, 0, rx * 0.85, ry * 0.85, 2.6, 1.2, 4, Math.PI * 2), ...stroke([{ x: -rx * 0.55, y: -ry * 0.2 }, { x: rx * 0.55, y: ry * 0.2 }], 2.2, { t0: 0.4, t1: 0.7, seed: 9 }), ...stroke([{ x: -rx * 0.2, y: ry * 0.5 }, { x: rx * 0.15, y: -ry * 0.55 }], 2.2, { t0: 0.55, t1: 0.85, seed: 10 })];
    } else if (has(vfx, "roots", "grove")) {
      dabs = roots(rx, ry, 7);
    } else if (has(vfx, "volley", "rain", "barrage")) {
      dabs = [];
      const rand = rng(17);
      for (let i = 0; i < 14; i++) {
        const x = (rand() - 0.5) * rx * 1.6;
        const y = (rand() - 0.5) * ry * 1.6;
        const t0 = rand() * 0.5;
        dabs.push(...stroke([{ x: x + 2, y: y - 12 }, { x, y }], 1.6, { t0, t1: t0 + 0.15, seed: i, dry: 0.1 }), ...splatter(x, y, 3, 2, i, t0 + 0.15));
      }
    } else {
      // Whirls and the rest: an enso around the point.
      dabs = enso(0, 0, rx * 0.9, ry * 0.9, 8, Math.PI * 0.2, 5);
    }
    void ex;
    return this.play(id, dabs, at, 620, accent, DEPTH_INK_GROUND + 1, { reveal: 0.4 });
  }

  /** Self buffs: an enso at the feet and ink smoke rising off the body. */
  aura(vfx: string, at: { x: number; y: number }, accent: number) {
    const id = `aura|${vfx}`;
    const dabs: Dab[] = [...enso(0, 0, 30, 15, 4, 0.5, 6)];
    const rand = rng(vfx.length);
    for (let i = 0; i < 5; i++) {
      const x = (rand() - 0.5) * 22;
      const t0 = 0.2 + rand() * 0.4;
      const pts = [];
      for (let k = 0; k <= 6; k++) pts.push({ x: x + Math.sin(k * 0.9 + i) * 3, y: -6 - k * 7 });
      dabs.push(...stroke(pts, 3.4, { t0, t1: t0 + 0.35, seed: i + 20, dry: 0.6, press: 0.3 }));
    }
    return this.play(id, dabs, at, 900, accent, DEPTH_INK, { reveal: 0.5 });
  }

  /** Ground zones: a pool of ink that holds for the zone's life, then dries. */
  zone(vfx: string, at: { x: number; y: number }, radius: number, duration: number, accent: number) {
    const rx = art(radius, 0).x;
    const ry = rx / 2;
    const id = `zone|${vfx}|${radius}`;
    let dabs: Dab[];
    if (has(vfx, "sigil", "seal", "ring")) dabs = [...enso(0, 0, rx * 0.9, ry * 0.9, 2.4, 0, 8, Math.PI * 2), ...blot(0, 0, rx * 0.5, 3, 0.2)];
    else if (has(vfx, "roots", "grove", "snare")) dabs = [...roots(rx, ry, 9), ...blot(0, 0, rx * 0.35, 4)];
    else dabs = [...blot(0, 0, rx * 0.9, 12), ...splatter(0, 0, rx, 14, 13, 0.3)];
    return this.play(id, dabs, at, duration * 1000, accent, DEPTH_INK_GROUND, { frames: 14, reveal: 0.08, hold: 0.85 });
  }

  /** A projectile: an ink comet (head and tail) facing its flight, painted per direction. */
  comet(vfx: string, aim: number, accent: number, big: boolean) {
    const b = bucket(aim);
    const a = bucketAngle(b);
    const id = `comet|${vfx}|${b}|${big}`;
    const len = big ? 1.4 : has(vfx, "arrow", "needle", "knife", "dart") ? 0.9 : 0.6;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const d = -len + (len * i) / 8;
      pts.push(art(Math.cos(a) * d, Math.sin(a) * d));
    }
    const dabs = stroke(pts.reverse(), big ? 6.5 : has(vfx, "arrow", "needle", "knife", "dart") ? 2.6 : 4.4, { seed: b, dry: 0.5, press: 0.05 }).map((d) => ({ ...d, t: 0 }));
    return paint(this.scene, `${id}|${accent}`, dabs, { accent, frames: 1, reveal: 1 });
  }
}

/** Branching strokes from the middle: roots, thorns, snares. */
function roots(rx: number, ry: number, seed: number): Dab[] {
  const rand = rng(seed);
  const out: Dab[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand() * 0.5;
    const pts = [{ x: 0, y: 0 }];
    let x = 0;
    let y = 0;
    for (let k = 1; k <= 5; k++) {
      x += Math.cos(a + (rand() - 0.5) * 0.8) * rx * 0.18;
      y += Math.sin(a + (rand() - 0.5) * 0.8) * ry * 0.18;
      pts.push({ x, y });
    }
    out.push(...stroke(pts, 4, { seed: i, t0: rand() * 0.2, t1: 0.6, dry: 0.3 }));
  }
  return out;
}
