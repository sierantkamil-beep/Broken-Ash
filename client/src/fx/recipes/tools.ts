import Phaser from "phaser";
import { CELL } from "@broken-ash/shared";
import { DEPTH_GLOW, DEPTH_GROUND, FxKit, RAMP_COLORS, type Handle, type PlayOpts, type Ramp } from "../fxkit";
import type { Scars } from "../scars";

/** Art pixels per world cell: procedural shapes are sized in art pixels. */
const ART_CELL = CELL / 2;

export interface Feel {
  shake(intensity: number, ms: number): void;
  flashScreen(color: number, ms: number): void;
  freeze(id: string, ms: number): void;
}

type P = { x: number; y: number };

/**
 * The beats every skill recipe is composed from (recipes/*.ts): blade smears, rings, seals, blasts,
 * sparks, motes gathering or circling, lightning, beams, chains, rain from the sky, cracks and
 * scorch left on the ground, lights, shake and hit-stop. Positions are screen pixels; sizes of
 * shapes are in cells (the hit shapes' unit) unless named Px.
 */
export class Tools {
  scars: Scars | null = null;

  constructor(
    readonly kit: FxKit,
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    readonly feel: Feel,
  ) {}

  /** Runs `fn` after `ms` on the scene's clock (the gallery's seek follows it). */
  later(ms: number, fn: () => void) {
    if (ms <= 0) fn();
    else this.scene.time.delayedCall(ms, fn);
  }

  /** The baked family in this ramp, or the closest ramp it was baked in. */
  pick(fam: string, ramp: Ramp, ...fallback: Ramp[]) {
    for (const r of [ramp, ...fallback, "steel", "gold", "spirit", "fire"] as Ramp[]) if (this.kit.has(`${fam}/${r}`)) return `${fam}/${r}`;
    return `${fam}/${ramp}`;
  }

  // ----------------------------------------------------------------------------- big shapes

  /** A blade smear of radius R cells over `arc` degrees, centred on `rot`. */
  smear(x: number, y: number, R: number, arc: number, rot: number, ramp: Ramp, o: PlayOpts = {}) {
    return this.kit.shape("slash", ramp, R * ART_CELL, x, y, { arc, rot, fps: 30, ...o });
  }

  ring(x: number, y: number, R: number, ramp: Ramp, o: PlayOpts = {}) {
    return this.kit.shape("ring", ramp, R * ART_CELL, x, y, { fps: 22, depth: DEPTH_GROUND, ...o });
  }

  sigil(x: number, y: number, R: number, ramp: Ramp, o: PlayOpts = {}) {
    return this.kit.shape("sigil", ramp, R * ART_CELL, x, y, { fps: 14, depth: DEPTH_GROUND, ...o });
  }

  boom(x: number, y: number, R: number, ramp: Ramp, o: PlayOpts = {}) {
    return this.kit.shape("explosion", ramp, R * ART_CELL, x, y, { fps: 24, ...o });
  }

  cyclone(x: number, y: number, R: number, ramp: Ramp, o: PlayOpts = {}) {
    return this.kit.shape("cyclone", ramp, R * ART_CELL, x, y, { fps: 22, ...o });
  }

  /** A baked animation (falls back to a near ramp when this one wasn't baked). */
  sprite(fam: string, ramp: Ramp, x: number, y: number, o: PlayOpts = {}): Handle | null {
    return this.kit.play(this.pick(fam, ramp), x, y, o);
  }

  // ----------------------------------------------------------------------------- particles

  /** Sparks, embers, chips: a spray of glowing pixels. */
  sparks(x: number, y: number, ramp: Ramp, n: number, speed = 160, lift = 20, aim?: number, spread = Math.PI * 2, glow = true) {
    const c = RAMP_COLORS[ramp];
    this.kit.emit(n, () => {
      const a = aim === undefined ? Math.random() * Math.PI * 2 : aim + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + Math.random() * 0.8);
      return { x, y, z: lift, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, vz: 40 + Math.random() * 90, gravity: 260, drag: 0.06, max: 0.35 + Math.random() * 0.35, size: Math.random() < 0.3 ? 2 : 1, color: c.hot, color2: c.dark, glow };
    });
  }

  /** Motes drifting up from an area (embers, spirit lights, pollen). */
  rise(x: number, y: number, ramp: Ramp, n: number, radiusPx: number, speed = 1) {
    const c = RAMP_COLORS[ramp];
    this.kit.emit(n, () => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radiusPx;
      return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.8, z: Math.random() * 10, vx: (Math.random() - 0.5) * 20, vy: 0, vz: (30 + Math.random() * 50) * speed, drag: 0.02, max: 0.6 + Math.random() * 0.8, size: 1, color: c.hot, color2: c.dark };
    });
  }

  /** Motes pulled in from a ring towards a point (a wind-up gathering power). */
  gather(x: number, y: number, ramp: Ramp, n: number, radiusPx: number, z = 20, ms = 400) {
    const c = RAMP_COLORS[ramp];
    const t = ms / 1000;
    this.kit.emit(n, () => {
      const a = Math.random() * Math.PI * 2;
      const r = radiusPx * (0.7 + Math.random() * 0.3);
      return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.8, z, vx: (-Math.cos(a) * r) / t, vy: (-Math.sin(a) * r * 0.8) / t, vz: 0, gravity: 0, drag: 0, max: t, size: Math.random() < 0.3 ? 2 : 1, color: c.hot, color2: c.mid };
    });
  }

  /** Motes thrown out of a point in every direction, flat (a burst on the ground). */
  burst(x: number, y: number, ramp: Ramp, n: number, speed = 220, z = 6) {
    const c = RAMP_COLORS[ramp];
    this.kit.emit(n, (i) => {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const v = speed * (0.7 + Math.random() * 0.5);
      return { x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, vz: 20, gravity: 80, drag: 0.08, max: 0.45, size: 1, color: c.hot, color2: c.dark };
    });
  }

  /** Grit and stones kicked up (slams, landings, cracks). */
  dust(x: number, y: number, Rpx: number, n: number, color = 0x8a7f72) {
    this.kit.emit(n, () => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * Rpx * 0.5;
      const v = 60 + Math.random() * 120;
      return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, z: 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 80 + Math.random() * 120, gravity: 420, drag: 0.04, max: 0.6, size: Math.random() < 0.4 ? 2 : 1, color, color2: 0x3a342e, glow: false };
    });
  }

  /** Petals, leaves, paper or feathers: flakes that flutter down and stay on the ground. */
  flakes(x: number, y: number, Rpx: number, n: number, colors: number[], stay = true) {
    this.kit.emit(n, () => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * Rpx;
      const color = colors[Math.floor(Math.random() * colors.length)];
      return {
        x: x + Math.cos(a) * r * 0.3,
        y: y + Math.sin(a) * r * 0.3,
        z: 30 + Math.random() * 30,
        vx: Math.cos(a) * r * 1.4,
        vy: Math.sin(a) * r * 1.1,
        vz: 20 + Math.random() * 40,
        gravity: 90,
        drag: 0.12,
        max: 1.6,
        size: Math.random() < 0.5 ? 2 : 1,
        color,
        glow: false,
        onLand: stay ? (lx: number, ly: number) => this.scars?.dot(lx, ly, 1, color, 0.85) : undefined,
      };
    });
  }

  /** Motes circling a moving point for a while (a charge held, a ward around the body). */
  orbit(at: () => P | null, ramp: Ramp, count: number, radiusPx: number, ms: number, z = 24, speed = 6) {
    const c = RAMP_COLORS[ramp];
    const steps = Math.ceil(ms / 50);
    for (let s = 0; s < steps; s++)
      this.later(s * 50, () => {
        const p = at();
        if (!p) return;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + (s * 50 * speed) / 1000;
          this.kit.emit(1, () => ({ x: p.x + Math.cos(a) * radiusPx, y: p.y + Math.sin(a) * radiusPx * 0.55, z, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, max: 0.12, size: 1, color: c.hot, color2: c.mid }));
        }
      });
  }

  /** A fan of short streaks out from a point (wind, speed lines, a sword's shine). */
  streaks(x: number, y: number, aim: number, lenPx: number, n: number, spread: number, ramp: Ramp, o: PlayOpts = {}) {
    for (let i = 0; i < n; i++) {
      const a = aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread) + (Math.random() - 0.5) * 0.1;
      this.sprite("streak", ramp, x, y, { rot: a, scaleX: lenPx / 192, scaleY: 0.5, fps: 28, delay: i * 18, alpha: 0.9, ...o });
    }
  }

  // ----------------------------------------------------------------------------- lines

  /** A straight beam that flares and thins out (a lance of light, a draining tether). */
  beam(x0: number, y0: number, x1: number, y1: number, ramp: Ramp, widthPx: number, ms = 260, delay = 0) {
    const c = RAMP_COLORS[ramp];
    this.later(delay, () => {
      const g = this.scene.add.graphics().setDepth(DEPTH_GLOW).setBlendMode(Phaser.BlendModes.ADD);
      this.layer.add(g);
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: ms,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          const w = Math.max(2, Math.round((widthPx * (1 - k) * (k < 0.15 ? k / 0.15 : 1)) / 2) * 2);
          g.clear();
          g.lineStyle(w + 4, c.mid, 0.5 * (1 - k));
          g.lineBetween(x0, y0, x1, y1);
          g.lineStyle(Math.max(2, w - 2), c.hot, 0.9 * (1 - k));
          g.lineBetween(x0, y0, x1, y1);
        },
        onComplete: () => g.destroy(),
      });
    });
  }

  /** Links of a chain along a line, appearing one after another, then breaking into sparks. */
  chain(x0: number, y0: number, x1: number, y1: number, ramp: Ramp, links: number, msPer = 18) {
    for (let i = 0; i <= links; i++) {
      const k = i / links;
      const x = x0 + (x1 - x0) * k;
      const y = y0 + (y1 - y0) * k;
      this.later(i * msPer, () => {
        this.sprite("mote", ramp, x, y, { scale: i % 2 ? 1.2 : 0.9, fps: 20 });
        if (i % 3 === 0) this.sparks(x, y + 20, ramp, 2, 60, 20);
      });
    }
  }

  /** Lightning between two points (re-forked while it lasts). */
  lightning(x0: number, y0: number, x1: number, y1: number, ms = 240, width = 1, ramp: Ramp = "lightning") {
    this.kit.lightning(x0, y0, x1, y1, ms, RAMP_COLORS[ramp].mid, width);
  }

  /** A crack racing along the ground from a to b, kicking up grit, and staying. */
  crack(x0: number, y0: number, x1: number, y1: number, msTotal = 220) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 40));
    for (let i = 0; i < n; i++) {
      const ax = x0 + ((x1 - x0) * i) / n;
      const ay = y0 + ((y1 - y0) * i) / n;
      const bx = x0 + ((x1 - x0) * (i + 1)) / n;
      const by = y0 + ((y1 - y0) * (i + 1)) / n;
      this.later((msTotal * i) / n, () => {
        this.scars?.crack(ax, ay, bx, by, i % 2 === 0);
        // The fissure glows as it opens, then it's just a dark crack left in the ground.
        this.beam(ax, ay, bx, by, "dusk", 6, 420);
        this.dust(bx, by, 30, 6, 0xb0a898);
      });
    }
  }

  /** Projectiles falling from the sky onto random spots of a disc (volleys, blade rain). */
  rain(x: number, y: number, Rpx: number, n: number, fam: string, ramp: Ramp, spreadMs: number, onLand?: (lx: number, ly: number) => void, scale = 1.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * Rpx;
      const tx = x + Math.cos(a) * r;
      const ty = y + Math.sin(a) * r * 0.85;
      const delay = (i / n) * spreadMs + Math.random() * 40;
      // Its shadow grows on the ground as it falls.
      this.later(delay, () => {
        const sh = this.scene.add.ellipse(tx, ty, 4, 2, 0x000000, 0.4).setDepth(-5e5);
        this.layer.add(sh);
        this.scene.tweens.add({ targets: sh, scaleX: 3, scaleY: 3, duration: 160, onComplete: () => sh.destroy() });
        const h = this.kit.play(this.pick(fam, ramp), tx - 24, ty - 150, { rot: Math.atan2(150, 24), fps: 1, add: false, scale, duration: 200 });
        if (h) this.scene.tweens.add({ targets: h.sprite, x: tx, y: ty - 6, duration: 160, ease: "Quad.easeIn", onComplete: () => h.stop() });
      });
      this.later(delay + 160, () => {
        this.sparks(tx, ty, ramp === "steel" ? "gold" : ramp, 4, 110, 2);
        this.dust(tx, ty, 10, 3);
        this.scars?.dot(tx, ty, 2, 0x1a1410, 0.8);
        onLand?.(tx, ty);
      });
    }
  }

  /** Something thrown in a high arc from a to b (a fireball, a pot), its shadow sliding beneath. */
  lob(x0: number, y0: number, x1: number, y1: number, fam: string, ramp: Ramp, scale: number, ms: number) {
    const h = this.kit.play(this.pick(fam, ramp), x0, y0, { scale, fps: 16, loop: true, duration: ms + 60 });
    const sh = this.scene.add.ellipse(x0, y0 + 20, 12, 6, 0x000000, 0.35).setDepth(-5e5);
    this.layer.add(sh);
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        const x = x0 + (x1 - x0) * k;
        const y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 90;
        h?.sprite.setPosition(Math.round(x), Math.round(y));
        sh.setPosition(x0 + (x1 - x0) * k, y0 + 20 + (y1 - y0 - 20) * k);
        this.rise(x, y + 20, ramp, 1, 4, 0.3);
      },
      onComplete: () => {
        h?.stop();
        h?.sprite.setVisible(false);
        sh.destroy();
      },
    });
  }

  /** Something racing along the ground from a to b: a sprite stamped every few pixels on the way. */
  runner(x0: number, y0: number, x1: number, y1: number, ms: number, fam: string, ramp: Ramp, every = 26, o: PlayOpts = {}) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.floor(len / every));
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      this.later(ms * k, () => this.sprite(fam, ramp, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, { fps: 20, add: false, ...o }));
    }
  }

  // ----------------------------------------------------------------------------- ground marks

  scorch(x: number, y: number, Rpx: number) {
    this.scars?.blot(x, y, Rpx, 0x140c08, 0.6);
    this.scars?.blot(x, y, Rpx * 0.5, 0x0a0604, 0.5);
  }

  stain(x: number, y: number, Rpx: number, color: number, alpha = 0.5) {
    this.scars?.blot(x, y, Rpx, color, alpha);
  }

  // ----------------------------------------------------------------------------- feel

  light(x: number, y: number, radiusPx: number, ramp: Ramp, intensity = 1, ms = 300, follow?: () => P | null, hot = false) {
    this.kit.light(x, y, radiusPx, hot ? RAMP_COLORS[ramp].hot : RAMP_COLORS[ramp].mid, intensity, ms, follow);
  }

  shake(intensity: number, ms: number) {
    this.feel.shake(intensity, ms);
  }

  flash(color: number, ms: number) {
    this.feel.flashScreen(color, ms);
  }

  freeze(id: string, ms: number) {
    this.feel.freeze(id, ms);
  }

  /** Cells to screen pixels. */
  px(cells: number) {
    return cells * CELL;
  }
}
