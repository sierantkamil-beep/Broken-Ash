import { ALL_SKILLS } from "../net/loadout";
import Phaser from "phaser";
import { DEPTH_INK, DEPTH_INK_GROUND, InkPlayer } from "./ink/compose";
import { blot, paint, splatter } from "./ink/ink";
import { CELL, PATHS, worldToScreen, type FxEvent, type SkillDef } from "@broken-ash/shared";
import { settings } from "../settings";

const SKILLS: Map<string, SkillDef> = ALL_SKILLS;

interface Live {
  until: number;
  update(now: number): void;
  destroy(): void;
}

/** A world-space ring on the ground (the top-down ground is drawn flat, so it stays round). */
function groundEllipse(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
  const c = worldToScreen(x, y);
  g.fillEllipse(c.x, c.y, r * 2 * CELL, r * 2 * CELL);
  return c;
}

function strokeGroundEllipse(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
  const c = worldToScreen(x, y);
  g.strokeEllipse(c.x, c.y, r * 2 * CELL, r * 2 * CELL);
}

/** A world-space wedge as screen points. */
function wedge(x: number, y: number, aim: number, range: number, arcDeg: number, inner = 0): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  const half = (arcDeg * Math.PI) / 360;
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const a = aim - half + (2 * half * i) / n;
    const p = worldToScreen(x + Math.cos(a) * range, y + Math.sin(a) * range);
    pts.push(new Phaser.Math.Vector2(p.x, p.y));
  }
  for (let i = n; i >= 0; i--) {
    const a = aim - half + (2 * half * i) / n;
    const p = worldToScreen(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
    pts.push(new Phaser.Math.Vector2(p.x, p.y));
  }
  return pts;
}

function rect(x: number, y: number, aim: number, length: number, width: number): Phaser.Math.Vector2[] {
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

export interface VfxHooks {
  /** Screen position (feet) and sprite height of a fighter, if on screen. */
  locate(id: string): { x: number; y: number; wx: number; wy: number; height: number } | null;
  flash(id: string): void;
  playSound(key: string, volume: number, at?: { x: number; y: number }): void;
  shake(intensity: number, ms: number): void;
  banner(title: string, sub?: string): void;
  isMe(id: string): boolean;
  /** The ink accent of a caster's path (shadow-ink skill visuals). */
  accentOf(id: string): number;
}

/**
 * Turns the server's combat events into things you see: slashes, bolts, burning ground, lightning,
 * blood. Purely cosmetic — the server already decided what hit.
 */
export class Vfx {
  private live: Live[] = [];
  private decals = 0;
  private readonly ink: InkPlayer;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly hooks: VfxHooks,
  ) {
    this.ink = new InkPlayer(scene, layer);
  }

  handle(e: FxEvent) {
    switch (e.t) {
      case "cast": {
        const skill = SKILLS.get(e.skill);
        if (!skill) return;
        this.hooks.playSound(`sfx_${skill.sfx}`, 0.6, worldToScreen(e.x, e.y));
        // Melee and self shapes show when they land (after the wind-up).
        this.scene.time.delayedCall(skill.windup * 1000, () => this.castShape(skill, e.vfx || skill.vfx, e.x, e.y, e.aim, e.id));
        break;
      }
      case "bolt":
        this.bolt(e.vfx, e.x, e.y, e.aim, e.speed, e.range, this.hooks.accentOf(e.owner));
        break;
      case "zone":
        this.ink.zone(e.vfx, worldToScreen(e.x, e.y), e.radius, e.duration, this.hooks.accentOf(e.owner));
        break;
      case "area":
        this.ink.circle(e.radius, e.vfx, worldToScreen(e.x, e.y), this.hooks.accentOf(e.owner));
        break;
      case "hit":
        this.hit(e);
        break;
      case "death":
        this.death(e.x, e.y, e.gore);
        break;
      case "burst":
        this.ring(e.x, e.y, e.radius, 0x80b040, 450, 0.6);
        this.hooks.playSound("sfx_burst", 0.8, worldToScreen(e.x, e.y));
        this.bloodSpray(e.x, e.y, 26, 0x5a7a20);
        break;
      case "execute": {
        const t = this.hooks.locate(e.id);
        this.hooks.playSound("sfx_execute", 1);
        this.hooks.shake(0.01, 260);
        if (t) {
          this.bloodSpray(t.wx, t.wy, 60, 0x7a0606);
          this.bloodPool(t.wx, t.wy, 1.2);
        }
        this.scene.cameras.main.flash(180, 120, 10, 6);
        break;
      }
      case "downed":
        this.hooks.playSound("sfx_downed", 0.9);
        break;
      case "revived":
        this.hooks.playSound("sfx_revive", 0.8);
        break;
      case "wave":
        this.hooks.playSound(e.title === "Upuszczacz" ? "sfx_tapper_roar" : "sfx_horn", 0.9);
        this.hooks.banner(e.title, e.title === "Upuszczacz" ? "Zarządca upustu przyszedł po swój towar" : `Fala ${e.n}`);
        break;
      case "victory":
        this.hooks.playSound("sfx_victory", 1);
        this.hooks.banner("Przetrwaliście tę noc", "Brama Soramei wciąż stoi");
        break;
      case "gate":
        this.hooks.playSound("sfx_gate_bang", 1);
        this.hooks.shake(0.012, 600);
        break;
      case "overheat":
        if (this.hooks.isMe(e.id)) this.hooks.banner("Przegrzanie!", "Żar zwraca się przeciw tobie");
        break;
    }
  }

  /**
   * Paints a bar's ink in idle moments, one skill at a time, so nobody's first cast stutters.
   * Called when a player's bar changes (join, weapon or picks).
   */
  warm(skills: SkillDef[], accent: number) {
    const queue = [...skills];
    const next = () => {
      const s = queue.shift();
      if (!s) return;
      this.ink.warm(s, s.vfx, accent);
      const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
      if (idle) idle(next);
      else setTimeout(next, 50);
    };
    next();
  }

  private add(l: Live) {
    this.live.push(l);
  }

  update(now: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      if (now >= l.until) {
        l.destroy();
        this.live.splice(i, 1);
      } else l.update(now);
    }
  }

  private graphics(depth = 9.3e6, blend = Phaser.BlendModes.ADD) {
    const g = this.scene.add.graphics().setDepth(depth).setBlendMode(blend);
    this.layer.add(g);
    return g;
  }

  /** Melee, line and self skills, in shadow-ink, where they land (after the wind-up). */
  private castShape(skill: SkillDef, vfx: string, x: number, y: number, aim: number, caster: string) {
    const loc = this.hooks.locate(caster);
    const at = loc ? { x: loc.x, y: loc.y } : worldToScreen(x, y);
    const accent = this.hooks.accentOf(caster);
    const sh = skill.shape;
    if (sh.kind === "cone") this.ink.arc(skill, vfx, at, aim, accent);
    else if (sh.kind === "line") {
      // Dashes start where the caster stood; the server has already moved them.
      const from = sh.length && skill.effects.some((e) => e.kind === "dash" && e.distance > 0) ? worldToScreen(x, y) : at;
      this.ink.line(skill, vfx, from, aim, accent);
      if (vfx.includes("lightning")) this.hooks.shake(0.004, 120);
    } else if (sh.kind === "circle" && sh.at === "self") this.ink.circle(sh.radius, vfx, at, accent);
    else if (sh.kind === "self") this.ink.aura(vfx, at, accent);
  }

  /** An expanding ring on the ground (whirls, quakes, novas, bells). */
  ring(x: number, y: number, radius: number, color: number, dur = 380, alpha = 0.7) {
    const g = this.graphics();
    const start = this.scene.time.now;
    this.add({
      until: start + dur,
      update: (now) => {
        const k = (now - start) / dur;
        g.clear();
        g.lineStyle(10 * (1 - k) + 2, color, alpha * (1 - k));
        strokeGroundEllipse(g, x, y, radius * (0.35 + 0.65 * Math.sqrt(k)));
        g.fillStyle(color, 0.18 * (1 - k));
        groundEllipse(g, x, y, radius * (0.35 + 0.65 * Math.sqrt(k)));
      },
      destroy: () => g.destroy(),
    });
  }

  /** A projectile: an ink comet in flight, shedding drops that dry on the ground where it passed. */
  private bolt(vfx: string, x: number, y: number, aim: number, speed: number, range: number, accent: number) {
    const big = /lance|phoenix|heavy|chain|procession/.test(vfx);
    const c = this.ink.comet(vfx, aim, accent, big);
    const img = this.scene.add.image(0, 0, c.key, 0).setOrigin(c.ox / c.w, c.oy / c.h).setScale(2).setDepth(DEPTH_INK);
    this.layer.add(img);
    const drop = paint(this.scene, `drop|${accent}`, [...blot(0, 0, 2.2, 1, 0, true), ...splatter(0, 0, 3, 3, 2, 0.1)], { accent, frames: 6, reveal: 0.2 });
    const start = this.scene.time.now;
    const life = (range / speed) * 1000;
    const height = 70;
    let lastDrop = 0;
    this.add({
      until: start + life,
      update: (now) => {
        const t = (now - start) / 1000;
        const d = Math.min(range, t * speed);
        const p = worldToScreen(x + Math.cos(aim) * d, y + Math.sin(aim) * d);
        img.setPosition(Math.round(p.x), Math.round(p.y - height));
        if (now - lastDrop > (big ? 45 : 90)) {
          lastDrop = now;
          const g = this.scene.add.image(Math.round(p.x - drop.ox * 2), Math.round(p.y - height * 0.15 - drop.oy * 2), drop.key, 0).setOrigin(0, 0).setScale(2).setDepth(DEPTH_INK_GROUND + 0.5);
          this.layer.add(g);
          let f = 0;
          this.scene.time.addEvent({ delay: 70, repeat: drop.frames, callback: () => (++f >= drop.frames ? g.destroy() : g.setFrame(f)) });
        }
      },
      destroy: () => img.destroy(),
    });
  }

  private hit(e: Extract<FxEvent, { t: "hit" }>) {
    const loc = this.hooks.locate(e.id);
    if (!loc) return;
    if (e.kind === "damage") {
      this.hooks.flash(e.id);
      this.hooks.playSound(e.big ? "sfx_gore" : "sfx_hit_flesh", e.big ? 0.6 : 0.35, loc);
      this.bloodSpray(loc.wx, loc.wy, e.big ? 22 : 9, 0x7a0606);
      if (e.big || Math.random() < 0.25) this.bloodPool(loc.wx + (Math.random() - 0.5) * 0.6, loc.wy + (Math.random() - 0.5) * 0.6, e.big ? 0.8 : 0.45);
    }
    // Floating numbers: damage white (big ones gold), damage over time tinted, heals green, shields blue.
    const color = e.kind === "heal" ? "#7ad07a" : e.kind === "shield" ? "#8ab8f0" : e.kind === "dot" ? (e.status === "burn" ? "#ff9a40" : e.status === "poison" ? "#9ad050" : "#d04a40") : e.big ? "#f0c860" : "#f0e8e0";
    const txt = this.scene.add
      .text(loc.x + Phaser.Math.Between(-14, 14), loc.y - loc.height, e.kind === "heal" ? `+${e.amount}` : String(e.amount), {
        fontFamily: "Cormorant Garamond",
        fontSize: e.big ? "34px" : e.kind === "dot" ? "20px" : "26px",
        fontStyle: "bold",
        color,
        stroke: "#000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(9.8e6)
      .setResolution(2)
      .setScale(1 / this.scene.cameras.main.zoom);
    this.layer.add(txt);
    this.scene.tweens.add({ targets: txt, y: txt.y - 50, alpha: 0, duration: 800, ease: "Cubic.easeOut", onComplete: () => txt.destroy() });
  }

  /** Droplets thrown from a wound; with reduced gore, a few dark sparks instead. */
  bloodSpray(x: number, y: number, n: number, color: number) {
    const count = settings.gore === "reduced" ? Math.ceil(n / 4) : n;
    const s = worldToScreen(x, y);
    for (let i = 0; i < count; i++) {
      const img = this.scene.add.image(s.x, s.y - 70, "fx", "ember").setTint(color).setScale(Phaser.Math.FloatBetween(0.5, 1.2)).setDepth(9.36e6);
      this.layer.add(img);
      const a = Math.random() * Math.PI * 2;
      const v = Phaser.Math.FloatBetween(40, 140);
      this.scene.tweens.add({
        targets: img,
        x: s.x + Math.cos(a) * v,
        y: { from: s.y - 70, to: s.y + Math.sin(a) * v },
        alpha: { from: 1, to: 0.2 },
        duration: Phaser.Math.Between(300, 600),
        ease: "Quad.easeIn",
        onComplete: () => img.destroy(),
      });
    }
  }

  /** A blood decal that stays on the ground (the courtyard keeps a record of the night). */
  bloodPool(x: number, y: number, scale: number) {
    if (settings.gore === "reduced") return;
    const s = worldToScreen(x, y);
    const img = this.scene.add.image(s.x, s.y, "props", `blood_pool_${Phaser.Math.Between(0, 3)}`).setScale(scale * 0.2).setAlpha(0.95).setDepth(-9e5 + this.decals++ * 0.01);
    this.layer.add(img);
    this.scene.tweens.add({ targets: img, scale, duration: 900, ease: "Cubic.easeOut" });
  }

  private death(x: number, y: number, gore: boolean) {
    this.hooks.playSound("sfx_greyed_death", 0.7, worldToScreen(x, y));
    this.bloodPool(x, y, gore ? 1.3 : 0.9);
    if (gore && settings.gore === "full") {
      this.hooks.playSound("sfx_gore", 0.9, worldToScreen(x, y));
      this.bloodSpray(x, y, 50, 0x6a0404);
      // Gibs: dark chunks thrown out that land and stay.
      const s = worldToScreen(x, y);
      for (let i = 0; i < 7; i++) {
        const img = this.scene.add.image(s.x, s.y - 60, "fx", "petal_0").setTint(0x3a0404).setScale(Phaser.Math.FloatBetween(1.2, 2)).setDepth(-8e5);
        this.layer.add(img);
        const a = Math.random() * Math.PI * 2;
        const d = Phaser.Math.FloatBetween(60, 170);
        this.scene.tweens.add({ targets: img, x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, angle: Phaser.Math.Between(-360, 360), duration: 500, ease: "Quad.easeOut" });
      }
    }
  }
}

/** Red telegraphs on the ground for the Greyed's coming attacks: they fill as the blow nears. */
export class Telegraphs {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.g = scene.add.graphics().setDepth(-6e5);
    layer.add(this.g);
  }

  draw(units: { x: number; y: number; atk: string; atkT: number; atkTotal: number; aim: number; ax: number; ay: number; shape?: import("@broken-ash/shared").Shape }[]) {
    const g = this.g;
    g.clear();
    for (const u of units) {
      if (!u.shape) continue;
      const k = 1 - u.atkT / Math.max(0.01, u.atkTotal);
      const sh = u.shape;
      let pts: Phaser.Math.Vector2[] | null = null;
      if (sh.kind === "cone") pts = wedge(u.x, u.y, u.aim, sh.range, sh.arc);
      else if (sh.kind === "line") pts = rect(u.x, u.y, u.aim, sh.length, sh.width);
      if (pts) {
        g.fillStyle(0x8a1208, 0.22);
        g.fillPoints(pts, true);
        g.lineStyle(2, 0xd0301c, 0.7);
        g.strokePoints(pts, true);
        const inner = sh.kind === "cone" ? wedge(u.x, u.y, u.aim, sh.range * k, sh.arc) : sh.kind === "line" ? rect(u.x, u.y, u.aim, sh.length * k, sh.width) : null;
        if (inner) {
          g.fillStyle(0xc0281a, 0.3);
          g.fillPoints(inner, true);
        }
      } else if (sh.kind === "circle") {
        const cx = sh.at === "aim" ? u.ax : u.x;
        const cy = sh.at === "aim" ? u.ay : u.y;
        g.fillStyle(0x8a1208, 0.22);
        groundEllipse(g, cx, cy, sh.radius);
        g.lineStyle(2, 0xd0301c, 0.7);
        strokeGroundEllipse(g, cx, cy, sh.radius);
        g.fillStyle(0xc0281a, 0.3);
        groundEllipse(g, cx, cy, sh.radius * k);
      }
    }
  }
}
