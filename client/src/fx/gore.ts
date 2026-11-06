import Phaser from "phaser";
import { CELL } from "@broken-ash/shared";
import { ART, DEPTH_GORE_AIR, FxKit } from "./fxkit";

/**
 * Gore. Blood flies the way the blow went, lands and stays; bodies break the way they were killed:
 * - a cut that kills with room to spare takes a head or an arm off, an execution always does, and the
 *   neck pumps for a second;
 * - a crushing blow bursts the body into parts (torso, limbs, ribs, guts, bone);
 * - fire chars the corpse and leaves it smoking, lightning blackens it, rot melts it into a pool,
 *   spirit drains it pale.
 * Everything that lands (drops, pools, smears, settled parts) is stamped into one blood layer under
 * the lighting, so a battlefield keeps every stain for the visit at no cost per frame.
 */

export type CorpseMode = "gone" | "charred" | "shocked" | "rotted" | "pale";

const BLOODS = [0x5e0812, 0x7a0a14, 0x9a1220, 0x6a0a10];
const DEPTH_BLOOD_LAYER = -9.5e5;

interface Gib {
  img: Phaser.GameObjects.Image;
  frame: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  rot: number;
  bounces: number;
  life: number;
}

export class Gore {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private gibs: Gib[] = [];
  private pumps: { until: number; next: number; at: () => { x: number; y: number } | null; dx: number; dy: number }[] = [];
  /** Reduced gore: sprays only (no parts, no dismembering, fewer stains). */
  reduced = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly kit: FxKit,
    mapW: number,
    mapH: number,
  ) {
    // Art resolution (half the screen pixels), shown at 2×: stains are on the same pixel grid as everything else.
    this.rt = scene.add.renderTexture(0, 0, (mapW * CELL) / ART, (mapH * CELL) / ART).setOrigin(0, 0).setScale(ART).setDepth(DEPTH_BLOOD_LAYER);
    this.rt.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    layer.add(this.rt);
  }

  /** A stain on the ground: one or a few art pixels of blood (or another colour). */
  private stain(x: number, y: number, size: number, color: number, alpha = 0.95) {
    this.rt.stamp("px", undefined, Math.round(x / ART), Math.round(y / ART), { scale: size, tint: color, alpha, originX: 0.5, originY: 0.5 });
  }

  /** Blood flung from a wound at height `z`, the way the blow went: drops that land and stay. */
  spray(x: number, y: number, z: number, dx: number, dy: number, n: number, force = 1) {
    const count = this.reduced ? Math.ceil(n / 3) : n;
    const base = dx || dy ? Math.atan2(dy, dx) : null;
    this.kit.emit(count, () => {
      const a = base === null ? Math.random() * Math.PI * 2 : base + (Math.random() - 0.5) * 1.3;
      const v = (60 + Math.random() * 220) * force;
      const color = BLOODS[Math.floor(Math.random() * BLOODS.length)];
      return {
        x,
        y,
        z,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.8,
        vz: 30 + Math.random() * 140 * force,
        gravity: 520,
        drag: 0.015,
        max: 2,
        size: Math.random() < 0.55 ? 2 : 1,
        color,
        glow: false,
        // A drop splats: a stain with a fleck or two beside it.
        onLand: this.reduced
          ? undefined
          : (lx: number, ly: number) => {
              this.stain(lx, ly, Math.random() < 0.4 ? 3 : 2, color);
              if (Math.random() < 0.5) this.stain(lx + (Math.random() - 0.5) * 10, ly + (Math.random() - 0.5) * 6, 1, color);
            },
      };
    });
  }

  /** A pool spreading under a body, then kept in the blood layer. */
  pool(x: number, y: number, scale: number, tint = 0xffffff) {
    if (this.reduced) return;
    const frame = `blood_pool_${Phaser.Math.Between(0, 3)}`;
    const img = this.scene.add.image(x, y, "props", frame).setScale(scale * 0.2).setDepth(DEPTH_BLOOD_LAYER + 1).setTint(tint).setAngle(Phaser.Math.Between(0, 3) * 90);
    this.layer.add(img);
    this.scene.tweens.add({
      targets: img,
      scale,
      duration: 1800,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.rt.stamp("props", frame, img.x / ART, img.y / ART, { scale: scale / ART, tint, angle: img.angle, originX: 0.5, originY: 0.5 });
        img.destroy();
      },
    });
  }

  /** A body part thrown from (x, y): it arcs, tumbles, bounces, slides leaving a smear, then lies there. */
  gib(frame: string, x: number, y: number, z: number, dx: number, dy: number, force = 1) {
    if (this.reduced || !this.kit.has(frame.replace(/\/0$/, ""))) return;
    const a = (dx || dy ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * 1.6;
    const v = (90 + Math.random() * 200) * force;
    const img = this.scene.add.image(x, y - z, "spells", frame).setScale(ART).setDepth(DEPTH_GORE_AIR + 1);
    this.layer.add(img);
    this.gibs.push({ img, frame, x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, vz: 120 + Math.random() * 180 * force, spin: (Math.random() - 0.5) * 18, rot: Math.random() * 6, bounces: 0, life: 0 });
    // Bodies on the ground cap at a few dozen moving parts; the oldest settle at once.
    if (this.gibs.length > 48) this.settle(this.gibs.shift()!);
  }

  /** A severed neck or limb pumping blood for a while. */
  pump(at: () => { x: number; y: number } | null, ms: number, dx = 0, dy = -1) {
    if (this.reduced) return;
    const now = this.scene.time.now;
    this.pumps.push({ until: now + ms, next: now, at, dx, dy });
  }

  private settle(g: Gib) {
    this.rt.stamp("spells", g.frame, g.x / ART, g.y / ART, { angle: Phaser.Math.RadToDeg(g.rot), originX: 0.5, originY: 0.5 });
    g.img.destroy();
  }

  update(dtMs: number) {
    const dt = Math.min(0.05, dtMs / 1000);
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      g.life += dt;
      g.vz -= 700 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;
      g.rot += g.spin * dt;
      if (g.z <= 0) {
        g.z = 0;
        // A wet thud: a splat where it lands, then a short bounce or a slide with a smear.
        this.stain(g.x, g.y, 3, BLOODS[1], 0.9);
        if (g.bounces < 1 && Math.abs(g.vz) > 120) {
          g.vz = -g.vz * 0.3;
          g.vx *= 0.5;
          g.vy *= 0.5;
          g.spin *= 0.5;
          g.bounces++;
        } else {
          g.vz = 0;
          g.vx *= Math.pow(0.02, dt);
          g.vy *= Math.pow(0.02, dt);
          g.spin *= Math.pow(0.02, dt);
          if (Math.hypot(g.vx, g.vy) > 20) this.stain(g.x, g.y, 2, BLOODS[0], 0.8);
        }
      }
      g.img.setPosition(Math.round(g.x / ART) * ART, Math.round((g.y - g.z) / ART) * ART).setRotation(g.rot);
      if ((g.z === 0 && Math.hypot(g.vx, g.vy) < 6) || g.life > 3) {
        this.settle(g);
        this.gibs.splice(i, 1);
      }
    }
    const now = this.scene.time.now;
    for (let i = this.pumps.length - 1; i >= 0; i--) {
      const p = this.pumps[i];
      if (now >= p.until) {
        this.pumps.splice(i, 1);
        continue;
      }
      if (now >= p.next) {
        const at = p.at();
        if (at) this.spray(at.x, at.y, 18, p.dx, p.dy, 7, 0.7);
        p.next = now + 140;
      }
    }
  }

  /** A blow landing: a mist of blood out the far side, a few drops below. */
  hit(x: number, y: number, h: number, dx: number, dy: number, big: boolean) {
    this.spray(x, y, Math.min(46, h * 0.45), dx, dy, big ? 22 : 8, big ? 1.1 : 0.7);
  }
}
