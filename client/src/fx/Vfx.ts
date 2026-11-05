import Phaser from "phaser";
import { PATHS, worldToScreen, type FxEvent, type SkillDef } from "@broken-ash/shared";
import { settings } from "../settings";

/** Look of each skill's visual (SkillDef.vfx). */
const STYLE: Record<string, { color: number; kind: "arc" | "ring" | "bolt" | "line" | "aura" | "zone" | "bolt_big"; size?: number }> = {
  slash: { color: 0xe8e2d8, kind: "arc" },
  slash_red: { color: 0xd02018, kind: "arc", size: 1.3 },
  dash_slash: { color: 0xf0e8e0, kind: "line" },
  whirl: { color: 0xe0d8d0, kind: "ring" },
  cleave: { color: 0xd8c8a8, kind: "arc", size: 1.4 },
  oath: { color: 0xc8a050, kind: "aura" },
  roots: { color: 0x6a4a28, kind: "ring" },
  quake: { color: 0xa88a60, kind: "ring", size: 1.3 },
  bark: { color: 0x7a5a30, kind: "aura" },
  grove: { color: 0x5a7a30, kind: "zone" },
  blood_bolt: { color: 0xb0100c, kind: "bolt" },
  blood_lance: { color: 0xd0140e, kind: "bolt_big" },
  sigil: { color: 0xb0100c, kind: "zone" },
  drink: { color: 0xc01010, kind: "ring" },
  veil: { color: 0x8a0a10, kind: "aura" },
  flood: { color: 0x9a0a0c, kind: "arc", size: 1.8 },
  fire_bolt: { color: 0xff7a2a, kind: "bolt" },
  pyre: { color: 0xff6a20, kind: "zone" },
  ignite: { color: 0xffa040, kind: "ring", size: 1.4 },
  nova_fire: { color: 0xff6a20, kind: "ring", size: 1.2 },
  phoenix: { color: 0xff8a30, kind: "bolt_big" },
  gust: { color: 0xc8e0f0, kind: "arc" },
  lightning: { color: 0xa8d0ff, kind: "line" },
  blink: { color: 0xc8e0f0, kind: "ring" },
  gale: { color: 0xd8e8f0, kind: "arc", size: 1.6 },
  ward: { color: 0x8ab8f0, kind: "aura" },
  tempest: { color: 0x8ab8ff, kind: "zone" },
  wisp: { color: 0xa8d8e8, kind: "bolt" },
  raise: { color: 0x9ad0e0, kind: "aura" },
  curse: { color: 0x6a3a8a, kind: "ring" },
  rot: { color: 0x6a8a3a, kind: "zone" },
  toll: { color: 0xa8d8e8, kind: "ring", size: 1.3 },
  feast: { color: 0x8ad0c0, kind: "arc", size: 1.3 },
  arrow: { color: 0xe0d0b0, kind: "bolt" },
  arrow_mark: { color: 0xf0c040, kind: "bolt" },
  arrow_heavy: { color: 0xf0e0c0, kind: "bolt_big" },
  volley: { color: 0xd8c8a0, kind: "ring" },
  snare: { color: 0x8a7a50, kind: "zone" },
  fade: { color: 0x404860, kind: "aura" },
  knife: { color: 0xc8d0d8, kind: "bolt" },
  dart: { color: 0x80c040, kind: "bolt" },
  smoke: { color: 0x606870, kind: "zone" },
  boil: { color: 0x80c040, kind: "ring", size: 1.2 },
  antidote: { color: 0x80d080, kind: "aura" },
};

const SKILLS = new Map<string, SkillDef>(Object.values(PATHS).flatMap((p) => p.skills.map((s) => [s.id, s] as const)));

interface Live {
  until: number;
  update(now: number): void;
  destroy(): void;
}

/** Projects a world-space ring onto the iso ground. */
function groundEllipse(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
  const c = worldToScreen(x, y);
  g.fillEllipse(c.x, c.y, r * 2 * 90.5, r * 2 * 45.25);
  return c;
}

function strokeGroundEllipse(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
  const c = worldToScreen(x, y);
  g.strokeEllipse(c.x, c.y, r * 2 * 90.5, r * 2 * 45.25);
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
}

/**
 * Turns the server's combat events into things you see: slashes, bolts, burning ground, lightning,
 * blood. Purely cosmetic — the server already decided what hit.
 */
export class Vfx {
  private live: Live[] = [];
  private decals = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly hooks: VfxHooks,
  ) {}

  handle(e: FxEvent) {
    switch (e.t) {
      case "cast": {
        const skill = SKILLS.get(e.skill);
        if (!skill) return;
        this.hooks.playSound(`sfx_${skill.sfx}`, 0.6, worldToScreen(e.x, e.y));
        // Melee and self shapes show when they land (after the wind-up).
        this.scene.time.delayedCall(skill.windup * 1000, () => this.castShape(skill, e.x, e.y, e.aim, e.id));
        break;
      }
      case "bolt":
        this.bolt(e.skill, e.x, e.y, e.aim, e.speed, e.range);
        break;
      case "zone":
        this.zone(e.skill, e.x, e.y, e.radius, e.duration);
        break;
      case "area":
        this.areaBurst(e.skill, e.x, e.y, e.radius);
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

  private castShape(skill: SkillDef, x: number, y: number, aim: number, caster: string) {
    const st = STYLE[skill.vfx] ?? { color: 0xffffff, kind: "arc" };
    const loc = this.hooks.locate(caster);
    const cx = loc?.wx ?? x;
    const cy = loc?.wy ?? y;
    const sh = skill.shape;
    if (sh.kind === "cone") this.arc(cx, cy, aim, sh.range * (st.size && st.kind === "arc" ? 1 : 1), sh.arc, st.color, st.size ?? 1);
    else if (sh.kind === "line") {
      if (skill.vfx === "lightning") this.lightning(cx, cy, aim, sh.length, st.color);
      else this.streak(cx, cy, aim, sh.length, sh.width, st.color);
    } else if (sh.kind === "circle" && sh.at === "self") this.ring(cx, cy, sh.radius, st.color, 380, 0.75);
    else if (sh.kind === "self") this.aura(caster, st.color);
  }

  /** A sweeping crescent: the edge of a blade (or a wave of blood, a gust). */
  private arc(x: number, y: number, aim: number, range: number, arcDeg: number, color: number, size: number) {
    const g = this.graphics();
    const start = this.scene.time.now;
    const dur = 220 * size;
    this.add({
      until: start + dur,
      update: (now) => {
        const k = (now - start) / dur;
        g.clear();
        const sweep = Math.min(1, k * 1.6);
        const half = arcDeg / 2;
        const a0 = aim - (half * Math.PI) / 180;
        const a1 = a0 + ((arcDeg * Math.PI) / 180) * sweep;
        const pts = wedge(x, y, (a0 + a1) / 2, range, ((a1 - a0) * 180) / Math.PI, range * 0.55);
        g.fillStyle(color, 0.55 * (1 - k));
        g.fillPoints(pts, true);
      },
      destroy: () => g.destroy(),
    });
  }

  private streak(x: number, y: number, aim: number, length: number, width: number, color: number) {
    const g = this.graphics();
    const start = this.scene.time.now;
    this.add({
      until: start + 260,
      update: (now) => {
        const k = (now - start) / 260;
        g.clear();
        g.fillStyle(color, 0.5 * (1 - k));
        g.fillPoints(rect(x - Math.cos(aim) * length * 0.8, y - Math.sin(aim) * length * 0.8, aim, length, width * (1 - k * 0.6)), true);
      },
      destroy: () => g.destroy(),
    });
  }

  private lightning(x: number, y: number, aim: number, length: number, color: number) {
    const g = this.graphics(9.5e6);
    const start = this.scene.time.now;
    this.hooks.shake(0.004, 120);
    this.add({
      until: start + 240,
      update: (now) => {
        g.clear();
        const alpha = 1 - (now - start) / 240;
        for (const [w, a] of [[6, 0.35], [2, 1]] as const) {
          g.lineStyle(w, color, a * alpha);
          g.beginPath();
          let px = x;
          let py = y;
          const s0 = worldToScreen(px, py);
          g.moveTo(s0.x, s0.y - 60);
          for (let i = 1; i <= 10; i++) {
            const t = (i / 10) * length;
            const j = i < 10 ? (Math.random() - 0.5) * 0.7 : 0;
            px = x + Math.cos(aim) * t - Math.sin(aim) * j;
            py = y + Math.sin(aim) * t + Math.cos(aim) * j;
            const s = worldToScreen(px, py);
            g.lineTo(s.x, s.y - 60);
          }
          g.strokePath();
        }
      },
      destroy: () => g.destroy(),
    });
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

  private aura(caster: string, color: number) {
    const g = this.graphics();
    const start = this.scene.time.now;
    this.add({
      until: start + 700,
      update: (now) => {
        const loc = this.hooks.locate(caster);
        if (!loc) return;
        const k = (now - start) / 700;
        g.clear();
        g.lineStyle(4, color, 0.8 * (1 - k));
        for (let i = 0; i < 3; i++) {
          const r = 0.5 + ((k + i / 3) % 1) * 0.5;
          const h = ((k + i / 3) % 1) * 120;
          g.strokeEllipse(loc.x, loc.y - h, r * 90, r * 45);
        }
      },
      destroy: () => g.destroy(),
    });
  }

  private areaBurst(skill: string, x: number, y: number, radius: number) {
    const s = SKILLS.get(skill);
    const st = s ? STYLE[s.vfx] : undefined;
    if (!st) return;
    this.ring(x, y, radius, st.color, 420, 0.8);
    if (s?.vfx === "volley") for (let i = 0; i < 14; i++) this.scene.time.delayedCall(i * 25, () => this.dropStreak(x + (Math.random() - 0.5) * radius * 1.6, y + (Math.random() - 0.5) * radius * 1.6, st.color));
  }

  private dropStreak(x: number, y: number, color: number) {
    const g = this.graphics();
    const start = this.scene.time.now;
    const s = worldToScreen(x, y);
    this.add({
      until: start + 180,
      update: (now) => {
        const k = (now - start) / 180;
        g.clear();
        g.lineStyle(2, color, 1 - k);
        g.lineBetween(s.x, s.y - 300 * (1 - k), s.x, s.y - 300 * (1 - k) + 40);
      },
      destroy: () => g.destroy(),
    });
  }

  private bolt(skill: string, x: number, y: number, aim: number, speed: number, range: number) {
    const s = SKILLS.get(skill);
    const st = (s && STYLE[s.vfx]) ?? { color: 0xffffff, kind: "bolt" as const };
    const big = st.kind === "bolt_big";
    const img = this.scene.add.image(0, 0, "fx", "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(st.color).setScale(big ? 0.4 : 0.18).setDepth(9.35e6);
    const core = this.scene.add.image(0, 0, "fx", "ember").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffffff).setScale(big ? 2.2 : 1.3).setDepth(9.36e6);
    this.layer.add([img, core]);
    const trail = this.graphics();
    const start = this.scene.time.now;
    const life = (range / speed) * 1000;
    const height = 70;
    this.add({
      until: start + life,
      update: (now) => {
        const t = (now - start) / 1000;
        const d = Math.min(range, t * speed);
        const wx = x + Math.cos(aim) * d;
        const wy = y + Math.sin(aim) * d;
        const p = worldToScreen(wx, wy);
        img.setPosition(p.x, p.y - height);
        core.setPosition(p.x, p.y - height);
        const tail = worldToScreen(x + Math.cos(aim) * Math.max(0, d - (big ? 2.2 : 1.2)), y + Math.sin(aim) * Math.max(0, d - (big ? 2.2 : 1.2)));
        trail.clear();
        trail.lineStyle(big ? 10 : 4, st.color, 0.55);
        trail.lineBetween(tail.x, tail.y - height, p.x, p.y - height);
      },
      destroy: () => {
        img.destroy();
        core.destroy();
        trail.destroy();
      },
    });
  }

  private zone(skill: string, x: number, y: number, radius: number, duration: number) {
    const s = SKILLS.get(skill);
    const st = (s && STYLE[s.vfx]) ?? { color: 0xffffff, kind: "zone" as const };
    const g = this.graphics(-5e5, Phaser.BlendModes.ADD);
    const start = this.scene.time.now;
    const dur = duration * 1000;
    const fire = s?.vfx === "pyre";
    this.add({
      until: start + dur,
      update: (now) => {
        const k = (now - start) / dur;
        const fade = Math.min(1, (now - start) / 200, (dur - (now - start)) / 400);
        g.clear();
        const pulse = 0.85 + 0.15 * Math.sin(now / 120);
        g.fillStyle(st.color, 0.22 * fade * pulse);
        groundEllipse(g, x, y, radius);
        g.lineStyle(3, st.color, 0.6 * fade);
        strokeGroundEllipse(g, x, y, radius);
        if (fire && Math.random() < 0.6) this.ember(x + (Math.random() - 0.5) * radius * 1.4, y + (Math.random() - 0.5) * radius * 1.4, 0xff8030);
        void k;
      },
      destroy: () => g.destroy(),
    });
  }

  private ember(x: number, y: number, color: number) {
    const s = worldToScreen(x, y);
    const img = this.scene.add.image(s.x, s.y, "fx", "ember").setBlendMode(Phaser.BlendModes.ADD).setTint(color).setDepth(9.36e6);
    this.layer.add(img);
    this.scene.tweens.add({ targets: img, y: s.y - Phaser.Math.Between(40, 110), alpha: 0, duration: Phaser.Math.Between(500, 900), onComplete: () => img.destroy() });
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
        y: { from: s.y - 70, to: s.y + Math.sin(a) * v * 0.5 },
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
        this.scene.tweens.add({ targets: img, x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d * 0.5, angle: Phaser.Math.Between(-360, 360), duration: 500, ease: "Quad.easeOut" });
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
