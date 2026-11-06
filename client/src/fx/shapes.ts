import Phaser from "phaser";
import { CELL, worldToScreen } from "@broken-ash/shared";

/**
 * Skill visuals as their exact hit shapes: a cone is the wedge the server tests, a line is the
 * rectangle, a circle has the true radius, all flat on the ground in the caster's path accent. What
 * you see is what hits. (Painted ink came first and was deliberately approximate — 72 % of the range,
 * lifted off the ground, snapped to 16 directions — so it never matched; ink can come back later,
 * one effect at a time, drawn over these shapes.)
 */

/**
 * Above the night lighting (Lighting DEPTH_LIGHT 9.5e6), so the accent colour reads the same next to
 * a lantern and in the dark.
 */
export const DEPTH_FX_GROUND = 9.51e6;
export const DEPTH_FX = 9.55e6;

/** A world-space circle on the ground (the top-down ground is drawn flat, so it stays round). */
export function groundCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, stroke = false) {
  const c = worldToScreen(x, y);
  if (stroke) g.strokeCircle(c.x, c.y, r * CELL);
  else g.fillCircle(c.x, c.y, r * CELL);
  return c;
}

/** A world-space wedge (cone hit test: shared/src/combat/geometry.ts) as screen points. */
export function wedge(x: number, y: number, aim: number, range: number, arcDeg: number, inner = 0): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  const half = (arcDeg * Math.PI) / 360;
  const n = Math.max(6, Math.ceil(arcDeg / 8));
  for (let i = 0; i <= n; i++) {
    const a = aim - half + (2 * half * i) / n;
    const p = worldToScreen(x + Math.cos(a) * range, y + Math.sin(a) * range);
    pts.push(new Phaser.Math.Vector2(p.x, p.y));
  }
  if (inner <= 0) {
    const o = worldToScreen(x, y);
    pts.push(new Phaser.Math.Vector2(o.x, o.y));
    return pts;
  }
  for (let i = n; i >= 0; i--) {
    const a = aim - half + (2 * half * i) / n;
    const p = worldToScreen(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
    pts.push(new Phaser.Math.Vector2(p.x, p.y));
  }
  return pts;
}

/** A world-space rectangle from (x, y) along `aim` (line hit test) as screen points. */
export function rect(x: number, y: number, aim: number, length: number, width: number): Phaser.Math.Vector2[] {
  const nx = -Math.sin(aim) * (width / 2);
  const ny = Math.cos(aim) * (width / 2);
  const ex = x + Math.cos(aim) * length;
  const ey = y + Math.sin(aim) * length;
  return [
    [x + nx, y + ny],
    [ex + nx, ey + ny],
    [ex - nx, ey - ny],
    [x - nx, y - ny],
  ].map(([px, py]) => {
    const s = worldToScreen(px, py);
    return new Phaser.Math.Vector2(s.x, s.y);
  });
}

const FILL = 0.28;
const EDGE = 0.95;
/** A dark under-stroke so a pale accent (Storm's indigo, Dusk's amber) still reads on lit stone. */
const SHADOW = 0x08060a;

/** Draws skills' hit shapes, flashing in and fading out. */
export class ShapePainter {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {}

  /** One shape: drawn by `draw` into a fresh Graphics, shown for `hold` ms, then faded over `fade` ms. */
  private flash(draw: (g: Phaser.GameObjects.Graphics) => void, hold: number, fade: number, depth = DEPTH_FX_GROUND) {
    const g = this.scene.add.graphics().setDepth(depth);
    draw(g);
    this.layer.add(g);
    g.setAlpha(0);
    this.scene.tweens.add({
      targets: g,
      alpha: 1,
      duration: 50,
      onComplete: () => this.scene.tweens.add({ targets: g, alpha: 0, delay: hold, duration: fade, onComplete: () => g.destroy() }),
    });
    return g;
  }

  private outlined(g: Phaser.GameObjects.Graphics, pts: Phaser.Math.Vector2[], accent: number) {
    g.fillStyle(accent, FILL).fillPoints(pts, true);
    g.lineStyle(4, SHADOW, 0.6).strokePoints(pts, true, true);
    g.lineStyle(2, accent, EDGE).strokePoints(pts, true, true);
  }

  cone(x: number, y: number, aim: number, range: number, arc: number, accent: number) {
    return this.flash((g) => this.outlined(g, wedge(x, y, aim, range, arc), accent), 120, 220);
  }

  line(x: number, y: number, aim: number, length: number, width: number, accent: number) {
    return this.flash((g) => this.outlined(g, rect(x, y, aim, length, width), accent), 120, 220);
  }

  circle(x: number, y: number, radius: number, accent: number) {
    return this.flash(
      (g) => {
        g.fillStyle(accent, FILL);
        groundCircle(g, x, y, radius);
        g.lineStyle(4, SHADOW, 0.6);
        groundCircle(g, x, y, radius, true);
        g.lineStyle(2, accent, EDGE);
        groundCircle(g, x, y, radius, true);
      },
      140,
      260,
    );
  }

  /** A buff on yourself: a ring at the feet. */
  aura(x: number, y: number, accent: number) {
    return this.flash(
      (g) => {
        g.lineStyle(4, SHADOW, 0.6);
        groundCircle(g, x, y, 0.55, true);
        g.lineStyle(2, accent, EDGE);
        groundCircle(g, x, y, 0.55, true);
      },
      260,
      300,
    );
  }

  /** Lingering ground: held for its whole duration (a thin edge, a faint fill), then faded. */
  zone(x: number, y: number, radius: number, duration: number, accent: number) {
    return this.flash(
      (g) => {
        g.fillStyle(accent, 0.16);
        groundCircle(g, x, y, radius);
        g.lineStyle(2, accent, 0.7);
        groundCircle(g, x, y, radius, true);
      },
      Math.max(0, duration * 1000 - 300),
      300,
    );
  }

  /** A projectile: a dot of the bolt's real radius, a little off the ground, with a shadow below. */
  bolt(radius: number, accent: number) {
    const r = Math.max(4, radius * CELL);
    const shadow = this.scene.add.graphics().setDepth(DEPTH_FX_GROUND);
    shadow.fillStyle(SHADOW, 0.45).fillEllipse(0, 0, r * 2, r);
    const dot = this.scene.add.graphics().setDepth(DEPTH_FX);
    dot.fillStyle(SHADOW, 0.7).fillCircle(0, 0, r + 2);
    dot.fillStyle(accent, 1).fillCircle(0, 0, r);
    this.layer.add([shadow, dot]);
    return { dot, shadow };
  }
}
