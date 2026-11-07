import Phaser from "phaser";
import type { LightSource } from "../world/Lighting";
import { ProcFx, type ProcKind } from "./procfx";

/**
 * The effect toolkit every skill, hit and death is built from:
 * - sprites: the pixel animations from tools/fx/build.py (atlas "spells"), played at a point with an
 *   aim, a scale, a blend and a depth, optionally following a fighter;
 * - particles: square pixels with gravity, drag and a height above the ground (sparks, embers, blood
 *   drops that land and leave a stain);
 * - bolts of lightning drawn fresh each time on the pixel grid;
 * - temporary lights that the night lighting picks up (a fireball lights the stones around it).
 * The art is drawn at 1 art px = 2 screen px, like the characters.
 */

export const ART = 2;
/** Emissive effects glow above the night lighting (Lighting DEPTH_LIGHT 9.5e6); ground marks just above it. */
export const DEPTH_GLOW = 9.56e6;
export const DEPTH_GROUND = 9.512e6;
/** Blood and debris sit under the lighting: the night darkens them like everything else on the ground. */
export const DEPTH_GORE_AIR = 9.36e6;

/** Families that are light itself, drawn additively unless told otherwise. */
const GLOWS = /^(sparks|mote|orb|crackle|pillar|bubble)\//;

export type Ramp = "steel" | "blood" | "fire" | "lightning" | "spirit" | "poison" | "wind" | "nature" | "dusk" | "shadow" | "gold";

/** The hottest and the base colour of each ramp (tools/fx/build.py RAMPS): particles and lights. */
export const RAMP_COLORS: Record<Ramp, { hot: number; mid: number; dark: number }> = {
  steel: { hot: 0xdfe8f2, mid: 0x9aacc4, dark: 0x4a5a74 },
  blood: { hot: 0xe0403a, mid: 0xa8121f, dark: 0x5e0812 },
  fire: { hot: 0xffc23c, mid: 0xec7618, dark: 0x962606 },
  lightning: { hot: 0xd4dcff, mid: 0x8e9cf0, dark: 0x3e48b0 },
  spirit: { hot: 0xa6f0d6, mid: 0x52bca6, dark: 0x1a7062 },
  poison: { hot: 0xc4ee6c, mid: 0x7cc23e, dark: 0x365e12 },
  wind: { hot: 0xe8f0f6, mid: 0xb4c2cc, dark: 0x6c7c8c },
  nature: { hot: 0xacd06a, mid: 0x76983a, dark: 0x553614 },
  dusk: { hot: 0xffd88c, mid: 0xdca63c, dark: 0x84540e },
  shadow: { hot: 0x54485e, mid: 0x32283a, dark: 0x1a1420 },
  gold: { hot: 0xffe08a, mid: 0xd8a032, dark: 0x8a5c12 },
};

export interface PlayOpts {
  rot?: number;
  /** Extra scale on top of the art scale (1 = native pixels). */
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  depth?: number;
  add?: boolean;
  /** Frames per second. */
  fps?: number;
  loop?: boolean;
  /** For loops: how long to run (ms); the last 250 ms fade out. */
  duration?: number;
  alpha?: number;
  flipY?: boolean;
  delay?: number;
  /** Keeps the effect on a moving fighter (screen point), or ends it when they're gone. */
  follow?: () => { x: number; y: number } | null;
  dx?: number;
  dy?: number;
}

interface Running {
  sprite: Phaser.GameObjects.Sprite;
  /** Frame name prefix: "<anim>/" for the baked atlas, "" for generated shapes. */
  anim: string;
  frames: number;
  start: number;
  fps: number;
  loop: boolean;
  until: number;
  alpha: number;
  follow?: () => { x: number; y: number } | null;
  dx: number;
  dy: number;
  stopped: boolean;
}

export interface Particle {
  x: number;
  y: number;
  /** Height above the ground (px): drawn that much higher, lands when it reaches 0. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  color: number;
  /** Fades to this colour over its life (embers cooling, sparks dimming). */
  color2?: number;
  glow: boolean;
  onLand?: (x: number, y: number) => void;
  img?: Phaser.GameObjects.Image;
}

export interface Handle {
  stop(): void;
  readonly sprite: Phaser.GameObjects.Sprite;
}

export class FxKit {
  private running: Running[] = [];
  private particles: Particle[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private bolts: { g: Phaser.GameObjects.Graphics; until: number; redraw: (() => void) | null; nextAt: number }[] = [];
  private lightList: (LightSource & { until: number; start: number; base: number; follow?: () => { x: number; y: number } | null })[] = [];
  readonly anims: Record<string, number>;
  private seed = 1;
  readonly proc: ProcFx;
  /** Holds every effect still (the gallery photographs effects mid-flight). */
  hold = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {
    this.proc = new ProcFx(scene);
    const tex = scene.textures.exists("spells") ? scene.textures.get("spells") : null;
    this.anims = (tex?.customData as { meta?: { anims?: Record<string, number> } } | undefined)?.meta?.anims ?? {};
    if (!scene.textures.exists("px")) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
      g.generateTexture("px", 1, 1);
      g.destroy();
    }
  }

  has(anim: string) {
    return anim in this.anims;
  }

  /**
   * A shape generated at its exact size (procfx.ts): a blade smear of radius R art px through `arc`
   * degrees (360: a whirl), a shockwave ring, a ground seal or a cyclone.
   */
  shape(kind: ProcKind, ramp: Ramp, R: number, x: number, y: number, o: PlayOpts & { arc?: number } = {}): Handle | null {
    const t = this.proc.get(kind, ramp, R, o.arc ?? 0);
    return this.start(t.key, "", t.frames, x, y, o, t.px, t.py);
  }

  /** Plays an animation at a screen point. Unknown animations are skipped (art not built yet). */
  play(anim: string, x: number, y: number, o: PlayOpts = {}): Handle | null {
    const frames = this.anims[anim];
    if (!frames) return null;
    return this.start("spells", `${anim}/`, frames, x, y, o);
  }

  private start(texture: string, prefix: string, frames: number, x: number, y: number, o: PlayOpts, ox?: number, oy?: number): Handle | null {
    const now = this.scene.time.now + (o.delay ?? 0);
    const fps = o.fps ?? 24;
    const sx = (o.scaleX ?? o.scale ?? 1) * ART;
    const sy = (o.scaleY ?? o.scale ?? 1) * ART;
    const sprite = this.scene.add
      .sprite(Math.round(x), Math.round(y), texture, `${prefix}0`)
      .setScale(sx, sy)
      .setRotation(o.rot ?? 0)
      .setDepth(o.depth ?? DEPTH_GLOW)
      .setAlpha(o.delay ? 0 : o.alpha ?? 1)
      .setFlipY(!!o.flipY);
    if (ox !== undefined && oy !== undefined) sprite.setOrigin(ox, oy);
    // Pixel-art effects draw opaque with their dark rims (additive blending lost every darker step,
    // leaving only a white-hot tip); things that emit light (sparks, motes, orbs, crackle, pillars,
    // shields) add their light.
    const glow = o.add ?? GLOWS.test(prefix);
    if (glow) sprite.setBlendMode(Phaser.BlendModes.ADD);
    this.layer.add(sprite);
    const r: Running = {
      sprite,
      anim: prefix,
      frames,
      start: now,
      fps,
      loop: !!o.loop,
      // A one-shot ends with its last frame, or sooner when given a duration (a still held briefly).
      until: o.loop ? now + (o.duration ?? 1000) : now + Math.min(o.duration ?? Infinity, (frames / fps) * 1000),
      alpha: o.alpha ?? 1,
      follow: o.follow,
      dx: o.dx ?? 0,
      dy: o.dy ?? 0,
      stopped: false,
    };
    this.running.push(r);
    return {
      sprite,
      stop: () => {
        r.until = Math.min(r.until, this.scene.time.now + 250);
        r.loop = true;
      },
    };
  }

  /** A burst of particles. */
  emit(n: number, make: (i: number) => Partial<Particle> & { x: number; y: number }) {
    for (let i = 0; i < n; i++) {
      const p = make(i);
      this.particles.push({
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 0,
        drag: 0,
        life: 0,
        max: 0.5,
        size: 1,
        color: 0xffffff,
        glow: true,
        ...p,
      });
    }
  }

  /** A short-lived light the night lighting picks up. */
  light(x: number, y: number, radius: number, color: number, intensity: number, ms: number, follow?: () => { x: number; y: number } | null) {
    const now = this.scene.time.now;
    this.lightList.push({ x, y, radius, color, intensity, base: intensity, seed: this.seed++, until: now + ms, start: now, follow });
  }

  /** Lights alive this frame (WorldScene adds them to the scene's lights). */
  lights(): LightSource[] {
    return this.lightList;
  }

  /**
   * A bolt of lightning from (x0, y0) to (x1, y1), jagged on the pixel grid: a white core and an
   * indigo glow, re-forking every 50 ms while it lasts.
   */
  lightning(x0: number, y0: number, x1: number, y1: number, ms = 240, color = RAMP_COLORS.lightning.mid, width = 1) {
    const g = this.scene.add.graphics().setDepth(DEPTH_GLOW + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.layer.add(g);
    const draw = () => {
      g.clear();
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(4, Math.round(len / 18));
      const nx = -(y1 - y0) / (len || 1);
      const ny = (x1 - x0) / (len || 1);
      const pts: [number, number][] = [[x0, y0]];
      for (let i = 1; i < n; i++) {
        const k = i / n;
        const off = (Math.random() - 0.5) * Math.min(26, len * 0.18) * Math.sin(k * Math.PI);
        pts.push([x0 + (x1 - x0) * k + nx * off, y0 + (y1 - y0) * k + ny * off]);
      }
      pts.push([x1, y1]);
      const snap = (v: number) => Math.round(v / ART) * ART;
      for (const [w, c, a] of [[8 * width, color, 0.35], [4 * width, color, 0.8], [2 * width, 0xffffff, 1]] as const) {
        g.lineStyle(w, c, a);
        g.beginPath();
        g.moveTo(snap(pts[0][0]), snap(pts[0][1]));
        for (const [px, py] of pts.slice(1)) g.lineTo(snap(px), snap(py));
        g.strokePath();
      }
      // A fork or two.
      for (let f = 0; f < 2; f++) {
        const i = 1 + Math.floor(Math.random() * (pts.length - 2));
        const [fx, fy] = pts[i];
        const a = Math.atan2(y1 - y0, x1 - x0) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
        const fl = 14 + Math.random() * 22;
        g.lineStyle(2 * width, 0xffffff, 0.8);
        g.lineBetween(snap(fx), snap(fy), snap(fx + Math.cos(a) * fl), snap(fy + Math.sin(a) * fl));
      }
    };
    draw();
    const now = this.scene.time.now;
    this.bolts.push({ g, until: now + ms, redraw: draw, nextAt: now + 50 });
  }

  /**
   * Shows every running effect as it looks `ms` after it started (the gallery photographs effects
   * at a chosen moment, whatever the frame rate of a software-rendered test window).
   */
  seek(ms: number) {
    const now = this.scene.time.now;
    for (const r of this.running) {
      r.start = now - ms;
      r.until = r.loop ? now + 1000 : r.start + (r.frames / r.fps) * 1000;
      r.sprite.setAlpha(r.alpha);
    }
    const hold = this.hold;
    this.hold = false;
    this.update(now, 0);
    this.hold = hold;
  }

  update(_now: number, dtMs: number) {
    if (this.hold) return;
    // One clock for starts and frames (the scene clock), whatever the caller passes.
    const now = this.scene.time.now;
    const dt = Math.min(0.05, dtMs / 1000);
    // Sprites.
    for (let i = this.running.length - 1; i >= 0; i--) {
      const r = this.running[i];
      if (now < r.start) continue;
      if (r.sprite.alpha === 0 && !r.stopped && now - r.start < 20) r.sprite.setAlpha(r.alpha);
      const f = Math.floor(((now - r.start) / 1000) * r.fps);
      if (r.follow) {
        const p = r.follow();
        if (!p) r.until = Math.min(r.until, now);
        else r.sprite.setPosition(Math.round(p.x + r.dx), Math.round(p.y + r.dy));
      }
      if (now >= r.until) {
        r.sprite.destroy();
        this.running.splice(i, 1);
        continue;
      }
      const frame = r.loop ? f % r.frames : Math.min(r.frames - 1, f);
      r.sprite.setFrame(`${r.anim}${frame}`);
      if (r.loop && r.until - now < 250) r.sprite.setAlpha(r.alpha * Math.max(0, (r.until - now) / 250));
      else if (now - r.start < 40) r.sprite.setAlpha(r.alpha);
    }
    // Particles.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.release(p);
        this.particles.splice(i, 1);
        continue;
      }
      const k = Math.pow(1 - p.drag, dt * 60);
      p.vx *= k;
      p.vy *= k;
      p.vz -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z <= 0 && p.gravity > 0) {
        p.z = 0;
        if (p.onLand) {
          p.onLand(p.x, p.y);
          p.onLand = undefined;
          this.release(p);
          this.particles.splice(i, 1);
          continue;
        }
        p.vz = 0;
        p.vx *= 0.5;
        p.vy *= 0.5;
      }
      if (!p.img) p.img = this.acquire(p.glow);
      const t = p.life / p.max;
      const c = p.color2 !== undefined ? Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(p.color), Phaser.Display.Color.ValueToColor(p.color2), 100, t * 100) : null;
      p.img
        .setPosition(Math.round(p.x / ART) * ART, Math.round((p.y - p.z) / ART) * ART)
        .setScale(p.size * ART)
        .setTint(c ? Phaser.Display.Color.GetColor(c.r, c.g, c.b) : p.color)
        .setAlpha(p.glow ? 1 - t * t : 1 - Math.max(0, t - 0.7) / 0.3);
    }
    // Lightning.
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      if (now >= b.until) {
        b.g.destroy();
        this.bolts.splice(i, 1);
      } else if (b.redraw && now >= b.nextAt) {
        b.redraw();
        b.nextAt = now + 50;
      }
    }
    // Lights.
    for (let i = this.lightList.length - 1; i >= 0; i--) {
      const l = this.lightList[i];
      if (now >= l.until) {
        this.lightList.splice(i, 1);
        continue;
      }
      if (l.follow) {
        const p = l.follow();
        if (p) {
          l.x = p.x;
          l.y = p.y;
        }
      }
      const t = (now - l.start) / Math.max(1, l.until - l.start);
      l.intensity = l.base * (1 - t * t);
    }
  }

  private acquire(glow: boolean) {
    const img = this.pool.pop() ?? this.scene.add.image(0, 0, "px").setOrigin(0.5);
    img.setVisible(true).setDepth(glow ? DEPTH_GLOW + 2 : DEPTH_GORE_AIR).setBlendMode(glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    this.layer.add(img);
    return img;
  }

  private release(p: Particle) {
    if (!p.img) return;
    p.img.setVisible(false);
    if (this.pool.length < 600) this.pool.push(p.img);
    else p.img.destroy();
    p.img = undefined;
  }
}
