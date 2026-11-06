import { ALL_SKILLS } from "../net/loadout";
import Phaser from "phaser";
import { groundCircle, rect, ShapePainter, wedge } from "./shapes";
import { worldToScreen, type FxEvent, type SkillDef } from "@broken-ash/shared";
import { DEPTH_GLOW, FxKit, type Handle, type Ramp } from "./fxkit";
import { SpellFx } from "./spells";
import type { LightSource } from "../world/Lighting";
import { settings } from "../settings";

const SKILLS: Map<string, SkillDef> = ALL_SKILLS;

interface Live {
  until: number;
  update(now: number): void;
  destroy(): void;
}

export interface VfxHooks {
  /** Screen position (feet) and sprite height of a fighter, if on screen. */
  locate(id: string): { x: number; y: number; wx: number; wy: number; height: number } | null;
  /** The struck flash, with the blow's direction (a kick that way). */
  flash(id: string, dx?: number, dy?: number): void;
  playSound(key: string, volume: number, at?: { x: number; y: number }): void;
  shake(intensity: number, ms: number): void;
  banner(title: string, sub?: string): void;
  isMe(id: string): boolean;
  /** The accent colour of a caster's path (their skill shapes are drawn in it). */
  accentOf(id: string): number;
  /** Hit-stop: holds a fighter's pose for a beat. */
  freeze(id: string, ms: number): void;
  /** A brief full-screen tint (lightning, executions). */
  flashScreen(color: number, ms: number): void;
}

/**
 * Turns the server's combat events into things you see: slashes, bolts, burning ground, lightning,
 * blood. Purely cosmetic — the server already decided what hit.
 */
export class Vfx {
  private live: Live[] = [];
  private decals = 0;
  private readonly shapes: ShapePainter;
  readonly kit: FxKit;
  private readonly spells: SpellFx;
  /** Looping status effects on each fighter (burning, poisoned, bleeding, rooted…), by id then status. */
  private readonly statusFx = new Map<string, Map<string, Handle>>();
  /** Bolts in flight by server id, so a `boltEnd` stops the right one where it really stopped. */
  private readonly bolts = new Map<number, Live & { end(x: number, y: number): void }>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly hooks: VfxHooks,
  ) {
    this.shapes = new ShapePainter(scene, layer);
    this.kit = new FxKit(scene, layer);
    this.spells = new SpellFx(this.kit, { shake: hooks.shake, flashScreen: hooks.flashScreen, freeze: hooks.freeze });
  }

  /** Prepares a bar's effects in idle moments (called when a player's bar changes). */
  warm(skills: SkillDef[]) {
    const queue = [...skills];
    const next = () => {
      const s = queue.shift();
      if (!s) return;
      this.spells.warm(s);
      const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
      if (idle) idle(next);
      else setTimeout(next, 30);
    };
    next();
  }

  /** Temporary lights from effects, for the night lighting. */
  lights(): LightSource[] {
    return this.kit.lights();
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
        this.bolt(e);
        break;
      case "boltEnd":
        this.bolts.get(e.id)?.end(e.x, e.y);
        break;
      case "zone":
        this.shapes.zone(e.x, e.y, e.radius, e.duration, this.hooks.accentOf(e.owner));
        this.spells.zone(SKILLS.get(e.skill), e.x, e.y, e.radius, e.duration);
        break;
      case "area": {
        this.shapes.circle(e.x, e.y, e.radius, this.hooks.accentOf(e.owner));
        const sk = SKILLS.get(e.skill);
        if (sk) this.spells.area({ ...sk, vfx: e.vfx || sk.vfx }, e.x, e.y, e.radius);
        break;
      }
      case "unitAtk":
        this.spells.unitAttack(e.kind, e.atk, e.x, e.y, e.aim, e.ax, e.ay);
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

  private add(l: Live) {
    this.live.push(l);
  }

  update(now: number, delta = 16) {
    this.kit.update(now, delta);
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

  /** Melee, line and self skills as their exact hit shapes, where they land (after the wind-up). */
  castShape(skill: SkillDef, vfx: string, x: number, y: number, aim: number, caster: string) {
    const loc = this.hooks.locate(caster);
    // The caster's world position now (the server resolves the hit from where the body is at release).
    const ox = loc ? loc.wx : x;
    const oy = loc ? loc.wy : y;
    const accent = this.hooks.accentOf(caster);
    const sh = skill.shape;
    // A mastery form can change the look (vfx), never the hit.
    const look = vfx && vfx !== skill.vfx ? { ...skill, vfx } : skill;
    if (sh.kind === "cone") {
      this.shapes.cone(ox, oy, aim, sh.range, sh.arc, accent);
      this.spells.cone(look, ox, oy, aim, sh.range, sh.arc, caster);
    } else if (sh.kind === "line") {
      // Dashes start where the caster stood; the server has already moved them.
      const dashed = skill.effects.some((e) => e.kind === "dash" && e.distance > 0);
      this.shapes.line(dashed ? x : ox, dashed ? y : oy, aim, sh.length, sh.width, accent);
      this.spells.line(look, dashed ? x : ox, dashed ? y : oy, aim, sh.length, sh.width, dashed);
    } else if (sh.kind === "circle" && sh.at === "self") {
      this.shapes.circle(ox, oy, sh.radius, accent);
      this.spells.nova(look, ox, oy, sh.radius, caster);
    } else if (sh.kind === "self") {
      this.spells.aura(look, ox, oy, () => {
        const l = this.hooks.locate(caster);
        return l ? { x: l.x, y: l.y } : null;
      });
    }
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
        groundCircle(g, x, y, radius * (0.35 + 0.65 * Math.sqrt(k)), true);
        g.fillStyle(color, 0.18 * (1 - k));
        groundCircle(g, x, y, radius * (0.35 + 0.65 * Math.sqrt(k)));
      },
      destroy: () => g.destroy(),
    });
  }

  /**
   * A projectile: its sprite (an arrow, a knife, a burning talisman, a spirit wisp…) flying the
   * server's path with a trail of its element, ended by the server's `boltEnd` (a hit, a wall or the
   * end of its range) with an impact, rather than always flying its full range.
   */
  private bolt(e: Extract<FxEvent, { t: "bolt" }>) {
    const skill = SKILLS.get(e.skill);
    const look = this.spells.projectile(skill, e.vfx || skill?.vfx || "");
    const lift = 22;
    const start = this.scene.time.now;
    const shadow = this.scene.add.ellipse(0, 0, 10 * look.scale + 6, 5 * look.scale + 3, 0x000000, 0.35).setDepth(-5e5);
    this.layer.add(shadow);
    const h = this.kit.play(look.anim, 0, 0, { rot: e.aim, scale: look.scale, fps: 16, loop: true, duration: (e.range / e.speed) * 1000 + 400, depth: DEPTH_GLOW });
    let lastTrail = 0;
    let spin = 0;
    const place = (wx: number, wy: number) => {
      const p = worldToScreen(wx, wy);
      shadow.setPosition(Math.round(p.x), Math.round(p.y));
      h?.sprite.setPosition(Math.round(p.x), Math.round(p.y - lift));
      return p;
    };
    let last = place(e.x, e.y);
    this.kit.light(last.x, last.y - lift, 110 * Math.min(2, look.scale), 0xffffff, look.trail ? 0.6 : 0, (e.range / e.speed) * 1000, () => (h ? { x: h.sprite.x, y: h.sprite.y } : null));
    let ended = false;
    const live = {
      // A safety end in case the end event is lost: the full range plus a little.
      until: start + (e.range / e.speed) * 1000 + 250,
      update: (now: number) => {
        if (ended) return;
        const d = Math.min(e.range, ((now - start) / 1000) * e.speed);
        last = place(e.x + Math.cos(e.aim) * d, e.y + Math.sin(e.aim) * d);
        if (look.spin && h) h.sprite.setRotation((spin += 0.35));
        if (look.trail && now - lastTrail > 30) {
          lastTrail = now;
          this.spells.trailPuff(last.x, last.y, look.trail as Ramp, look.scale > 1.5);
        }
      },
      destroy: () => {
        h?.stop();
        h?.sprite.setVisible(false);
        shadow.destroy();
        this.bolts.delete(e.id);
      },
      end: (x: number, y: number) => {
        if (ended) return;
        ended = true;
        place(x, y);
        this.spells.impact(x, y, look.ramp, look.scale > 1.5);
        live.until = this.scene.time.now;
      },
    };
    this.bolts.set(e.id, live);
    this.add(live);
  }

  /**
   * A fighter's statuses as looping effects on their body: flames for burn, bubbles for poison,
   * drips for bleed, sparks for static, vines when rooted, a sigil over a marked head, stars when
   * staggered, a dome for a shield. Called every frame with the synced status list.
   */
  statuses(id: string, st: string, shield = 0) {
    const want = new Set(st ? st.split(",") : []);
    if (shield > 0) want.add("shield");
    let mine = this.statusFx.get(id);
    if (!mine) {
      if (!want.size) return;
      mine = new Map();
      this.statusFx.set(id, mine);
    }
    for (const [k, h] of mine) if (!want.has(k)) {
      h.stop();
      mine.delete(k);
    }
    for (const k of want) {
      if (mine.has(k)) continue;
      const follow = () => {
        const l = this.hooks.locate(id);
        return l ? { x: l.x, y: l.y } : null;
      };
      const loc = this.hooks.locate(id);
      const hgt = loc?.height ?? 120;
      const spec: Record<string, { anim: string; dy: number; scale: number; fps: number; add?: boolean; alpha?: number }> = {
        burn: { anim: "flames/fire", dy: -6, scale: 1.3, fps: 12 },
        poison: { anim: "cloud/poison", dy: -hgt * 0.45, scale: 0.9, fps: 8, alpha: 0.6 },
        bleed: { anim: "drip/blood", dy: -hgt * 0.55, scale: 1.4, fps: 8, add: false },
        static: { anim: "crackle/lightning", dy: -hgt * 0.5, scale: 2, fps: 14 },
        slow: { anim: "mote/wind", dy: -hgt * 0.3, scale: 1.4, fps: 8, alpha: 0.8 },
        rooted: { anim: "vines/nature", dy: -2, scale: 1.6, fps: 8, add: false },
        mark: { anim: "sigil/dusk", dy: -hgt - 14, scale: 0.35, fps: 10 },
        weaken: { anim: "mote/shadow", dy: -hgt * 0.5, scale: 2, fps: 8, add: false, alpha: 0.8 },
        stagger: { anim: "stars/gold", dy: -hgt - 8, scale: 1.6, fps: 10 },
        shield: { anim: "bubble/steel", dy: -hgt * 0.45, scale: (hgt / 44) * 1.05, fps: 10, alpha: 0.45 },
        haste: { anim: "mote/gold", dy: -hgt * 0.3, scale: 1.2, fps: 10, alpha: 0.7 },
      };
      const sp = spec[k];
      if (!sp || !loc) continue;
      const h = this.kit.play(sp.anim, loc.x, loc.y + sp.dy, { scale: sp.scale, fps: sp.fps, loop: true, duration: 3_600_000, follow, dy: sp.dy, add: sp.add, alpha: sp.alpha ?? 1, depth: DEPTH_GLOW - 1 });
      if (h) mine.set(k, h);
    }
    if (!mine.size) this.statusFx.delete(id);
  }

  /** A fighter left (died, disconnected): drop their status effects. */
  forget(id: string) {
    const mine = this.statusFx.get(id);
    if (!mine) return;
    for (const h of mine.values()) h.stop();
    this.statusFx.delete(id);
  }

  private hit(e: Extract<FxEvent, { t: "hit" }>) {
    const loc = this.hooks.locate(e.id);
    if (!loc) return;
    if (e.kind === "damage") {
      this.hooks.flash(e.id, e.dx ?? 0, e.dy ?? 0);
      this.spells.hit(loc, e.cause, e.dx ?? 0, e.dy ?? 0, !!e.big);
      if (e.det) this.spells.detonate(loc, e.det);
      if (e.big) {
        // Hit-stop: both ends of a heavy blow hold for a beat.
        this.hooks.freeze(e.id, 70);
        if (e.src) this.hooks.freeze(e.src, 50);
        this.hooks.shake(0.004, 90);
      }
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
        groundCircle(g, cx, cy, sh.radius);
        g.lineStyle(2, 0xd0301c, 0.7);
        groundCircle(g, cx, cy, sh.radius, true);
        g.fillStyle(0xc0281a, 0.3);
        groundCircle(g, cx, cy, sh.radius * k);
      }
    }
  }
}
