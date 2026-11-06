import { ALL_SKILLS } from "../net/loadout";
import Phaser from "phaser";
import { groundCircle, rect, ShapePainter, wedge } from "./shapes";
import { CELL, GREYED, worldToScreen, type FxEvent, type GreyedKind, type SkillDef } from "@broken-ash/shared";
import { DEPTH_GLOW, FxKit, type Handle, type Ramp } from "./fxkit";
import { rampOf, SpellFx } from "./spells";
import { Scars } from "./scars";
import { Tools } from "./recipes/tools";
import { recipeFor } from "./recipes";
import { ENEMY } from "./recipes/enemies";
import type { Ctx, Recipe } from "./recipes/types";
import { Gore, type CorpseMode } from "./gore";
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
  /** How a corpse is left: gone (torn apart), charred, shocked, rotted or drained pale. */
  corpse(id: string, mode: CorpseMode): void;
  /** A short camera punch-in (executions). */
  punch(amount: number, ms: number): void;
  /** Which beat of a basic-attack chain a fighter's last basic was (0, 1, 2). */
  beatOf(id: string): number;
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
  private gore: Gore | null = null;
  private scars: Scars | null = null;
  /** The beats skill recipes are made of (recipes/tools.ts). */
  readonly tools: Tools;
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
    this.tools = new Tools(this.kit, scene, layer, { shake: hooks.shake, flashScreen: hooks.flashScreen, freeze: hooks.freeze });
  }

  /**
   * Where and how a skill is used, for its recipe: the caster's feet and weapon hand now, the aim,
   * the hit shape's size, the far end (a cone's tip, a line's end, a thrown circle's centre).
   */
  private ctx(skill: SkillDef, caster: string, wx: number, wy: number, aim: number, o: { tx?: number; ty?: number; radius?: number; dashed?: boolean } = {}): Ctx {
    const loc = this.hooks.locate(caster);
    const feet = loc ? { x: loc.x, y: loc.y } : worldToScreen(wx, wy);
    const height = loc?.height ?? 120;
    const sh = skill.shape;
    const range = sh.kind === "cone" ? sh.range : 0;
    const length = sh.kind === "line" ? sh.length : sh.kind === "projectile" ? sh.range : 0;
    const reach = range || length;
    const sx = o.dashed ? worldToScreen(wx, wy) : feet;
    return {
      t: this.tools,
      skill,
      ramp: rampOf(skill),
      caster,
      x: sx.x,
      y: sx.y,
      hx: feet.x + Math.cos(aim) * 14,
      hy: feet.y - height * 0.42 + Math.sin(aim) * 6,
      aim,
      range,
      arc: sh.kind === "cone" ? sh.arc : 0,
      length,
      width: sh.kind === "line" ? sh.width : 0,
      radius: o.radius ?? (sh.kind === "circle" ? sh.radius : 0),
      tx: o.tx ?? sx.x + Math.cos(aim) * reach * CELL,
      ty: o.ty ?? sx.y + Math.sin(aim) * reach * CELL,
      beat: this.hooks.beatOf(caster),
      dashed: !!o.dashed,
      follow: () => {
        const l = this.hooks.locate(caster);
        return l ? { x: l.x, y: l.y } : null;
      },
    };
  }

  /** The blood layer covers the map (called once the map is known). */
  initGore(mapW: number, mapH: number) {
    this.scars?.destroy();
    this.scars = new Scars(this.scene, this.layer, mapW, mapH);
    this.tools.scars = this.scars;
    this.gore?.destroy();
    this.gore = new Gore(this.scene, this.layer, this.kit, mapW, mapH);
    this.gore.reduced = settings.gore === "reduced";
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
        // The wind-up shows on the caster at once; the blow itself after it.
        recipeFor(skill.id, e.vfx)?.windup?.(this.ctx(skill, e.id, e.x, e.y, e.aim));
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
      case "zone": {
        this.shapes.zone(e.x, e.y, e.radius, e.duration, this.hooks.accentOf(e.owner));
        const sk = SKILLS.get(e.skill);
        const r = sk ? recipeFor(sk.id) : undefined;
        if (sk && r?.zone) {
          const p = worldToScreen(e.x, e.y);
          r.zone(this.ctx(sk, e.owner, e.x, e.y, 0, { tx: p.x, ty: p.y, radius: e.radius }), e.duration * 1000);
        } else this.spells.zone(sk, e.x, e.y, e.radius, e.duration);
        break;
      }
      case "area": {
        this.shapes.circle(e.x, e.y, e.radius, this.hooks.accentOf(e.owner));
        const sk = SKILLS.get(e.skill);
        const r = sk ? recipeFor(sk.id, e.vfx) : undefined;
        if (sk && r?.land) {
          const p = worldToScreen(e.x, e.y);
          const from = this.hooks.locate(e.owner);
          const aim = from ? Math.atan2(p.y - from.y, p.x - from.x) : 0;
          r.land(this.ctx(sk, e.owner, e.x, e.y, aim, { tx: p.x, ty: p.y, radius: e.radius }));
        } else if (sk) this.spells.area({ ...sk, vfx: e.vfx || sk.vfx }, e.x, e.y, e.radius);
        break;
      }
      case "phase":
        this.hooks.playSound("sfx_tapper_roar", 1);
        this.hooks.banner(e.title, e.sub);
        this.hooks.shake(0.012, 500);
        break;
      case "eaten": {
        // The body is gone: torn and swallowed, blood where it lay.
        this.hooks.corpse(e.id, "gone");
        const p = worldToScreen(e.x, e.y);
        this.gore?.spray(p.x, p.y, 10, 0, 0, 30, 0.8);
        this.gore?.gib("gib_chunk/blood/0", p.x, p.y, 12, 0, 0, 0.6);
        this.hooks.playSound("sfx_gore", 0.7, p);
        break;
      }
      case "lever":
        this.hooks.playSound("sfx_slam", 0.35, undefined);
        break;
      case "opened":
        // Iron grinding open somewhere in the area.
        this.hooks.playSound("sfx_gate_bang", 0.8);
        this.hooks.shake(0.006, 600);
        break;
      case "unitAtk": {
        const r = ENEMY[`${e.kind}_${e.atk}`];
        const def = GREYED[e.kind as GreyedKind]?.attacks.find((a) => a.id === e.atk);
        if (r?.blow && def) {
          const sh = def.shape;
          const p = worldToScreen(e.x, e.y);
          const a = worldToScreen(e.ax, e.ay);
          r.blow({
            t: this.tools,
            id: e.id,
            x: p.x,
            y: p.y,
            aim: e.aim,
            ax: a.x,
            ay: a.y,
            range: sh.kind === "cone" ? sh.range : 0,
            arc: sh.kind === "cone" ? sh.arc : 0,
            length: sh.kind === "line" ? sh.length : 0,
            width: sh.kind === "line" ? sh.width : 0,
            radius: sh.kind === "circle" ? sh.radius : 0,
          });
        } else this.spells.unitAttack(e.kind, e.atk, e.x, e.y, e.aim, e.ax, e.ay);
        break;
      }
      case "hit":
        this.hit(e);
        break;
      case "death":
        this.death(e);
        break;
      case "burst":
        this.ring(e.x, e.y, e.radius, 0x80b040, 450, 0.6);
        this.hooks.playSound("sfx_burst", 0.8, worldToScreen(e.x, e.y));
        this.bloodSpray(e.x, e.y, 26, 0x5a7a20);
        break;
      case "execute": {
        // The finisher: everything holds for a heartbeat, the camera leans in, a red flash, and
        // the blow (the death that follows always tears the body).
        this.hooks.playSound("sfx_execute", 1);
        this.hooks.freeze(e.id, 160);
        this.hooks.freeze(e.by, 160);
        this.hooks.punch(0.12, 420);
        this.hooks.shake(0.012, 280);
        this.hooks.flashScreen(0x7a0a06, 200);
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
    this.gore?.update(delta);
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
    const recipe = recipeFor(skill.id, vfx);
    if (recipe?.release) {
      const dashed = sh.kind === "line" && skill.effects.some((e) => e.kind === "dash" && e.distance > 0);
      if (sh.kind === "cone") this.shapes.cone(ox, oy, aim, sh.range, sh.arc, accent);
      else if (sh.kind === "line") this.shapes.line(dashed ? x : ox, dashed ? y : oy, aim, sh.length, sh.width, accent);
      else if (sh.kind === "circle" && sh.at === "self") this.shapes.circle(ox, oy, sh.radius, accent);
      recipe.release(this.ctx(skill, caster, dashed ? x : ox, dashed ? y : oy, aim, { dashed }));
      return;
    }
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
    // An enemy's shot (a crossbow quarrel) has no skill of its own: its recipe is the enemy's.
    const enemy = ENEMY[e.skill]?.bolt;
    const skill =
      SKILLS.get(e.skill) ??
      (enemy ? ({ id: e.skill, name: e.skill, description: "", cooldown: 0, cost: 0, windup: 0, shape: { kind: "projectile", speed: e.speed, range: e.range, radius: e.radius }, effects: [], vfx: e.vfx, sfx: "", anim: "attack" } as unknown as SkillDef) : undefined);
    const recipe: Recipe | undefined = enemy ? { sig: e.skill, bolt: enemy } : skill ? recipeFor(skill.id, e.vfx) : undefined;
    const rb = recipe?.bolt;
    const c = skill && rb ? this.ctx(skill, e.owner, e.x, e.y, e.aim) : null;
    const old = this.spells.projectile(skill, e.vfx || skill?.vfx || "");
    const look = rb && c ? { anim: this.tools.pick(rb.anim.split("/")[0], (rb.anim.split("/")[1] ?? "steel") as Ramp), scale: rb.scale ?? 1, trail: rb.trail ?? null, spin: !!rb.spin, ramp: c.ramp } : old;
    let lastTail = 0;
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
    if (rb?.launch && c) rb.launch(c, last.x, last.y - lift);
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
        if (rb?.tail && c && now - lastTail > (rb.every ?? 60)) {
          lastTail = now;
          rb.tail(c, last.x, last.y);
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
        if (rb?.impact && c) {
          const p = worldToScreen(x, y);
          rb.impact(c, p.x, p.y);
        } else this.spells.impact(x, y, look.ramp, look.scale > 1.5);
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
    if (e.kind === "damage" && e.blk) {
      // Turned by a shield: sparks and a clang, no blood; the damage that got through still shows.
      this.hooks.flash(e.id, (e.dx ?? 0) * 0.5, (e.dy ?? 0) * 0.5);
      this.spells.hit(loc, "crush", -(e.dx ?? 0), -(e.dy ?? 0), true);
      this.hooks.playSound("sfx_blade_heavy", 0.7, loc);
    } else if (e.kind === "damage") {
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
      // Blood out the far side of the wound (fire and lightning cauterise: less of it).
      const dry = e.cause === "fire" || e.cause === "shock";
      this.gore?.hit(loc.x, loc.y, loc.height, e.dx ?? 0, e.dy ?? 0, !!e.big && !dry);
      if (e.big && !dry && Math.random() < 0.5) this.gore?.pool(loc.x + (Math.random() - 0.5) * 30, loc.y + (Math.random() - 0.5) * 20, 0.5);
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

  /** A spray of blood (bursts, other effects). */
  bloodSpray(x: number, y: number, n: number, _color: number) {
    const p = worldToScreen(x, y);
    this.gore?.spray(p.x, p.y, 30, 0, 0, n);
  }

  /**
   * A death, broken the way it was dealt (gore.ts): torn apart by cuts, crushes and executions,
   * charred by fire, blackened by lightning, melted by rot, drained by spirits; otherwise a body that
   * bleeds out where it fell.
   */
  private death(e: Extract<FxEvent, { t: "death" }>) {
    const p = worldToScreen(e.x, e.y);
    const dx = e.dx ?? 0;
    const dy = e.dy ?? 0;
    const skin = /cross|arms|march|human/.test(e.kind ?? "") ? "human" : "grey";
    this.hooks.playSound("sfx_greyed_death", 0.7, p);
    const g = this.gore;
    if (!g) return;
    const full = settings.gore === "full";
    const cause = e.cause ?? "cut";
    const torn = full && e.gore && (cause === "exec" || cause === "crush" || cause === "cut" || cause === "claw" || cause === "pierce" || cause === "blood");
    if (cause === "fire") {
      this.hooks.corpse(e.id, "charred");
      this.kit.emit(26, () => ({ x: p.x + (Math.random() - 0.5) * 40, y: p.y + (Math.random() - 0.5) * 20, z: Math.random() * 30, vx: (Math.random() - 0.5) * 30, vy: 0, vz: 30 + Math.random() * 60, drag: 0.02, max: 1 + Math.random(), size: 1, color: 0xffc23c, color2: 0x3a2a24 }));
      g.pool(p.x, p.y, 0.6, 0x302420);
      return;
    }
    if (cause === "shock") {
      this.hooks.corpse(e.id, "shocked");
      this.kit.emit(18, () => ({ x: p.x + (Math.random() - 0.5) * 30, y: p.y, z: 20 + Math.random() * 30, vx: (Math.random() - 0.5) * 20, vy: 0, vz: 25 + Math.random() * 40, drag: 0.03, max: 1.2, size: 2, color: 0x54485e, color2: 0x1a1420, glow: false }));
      this.kit.play("crackle/lightning", p.x, p.y - 20, { scale: 2, fps: 14 });
      return;
    }
    if (cause === "rot") {
      this.hooks.corpse(e.id, "rotted");
      g.pool(p.x, p.y, 1.1, 0x9ac060);
      this.kit.play("cloud/poison", p.x, p.y - 10, { scale: 1.6, fps: 9, loop: true, duration: 1600, alpha: 0.6 });
      return;
    }
    if (cause === "spirit") {
      this.hooks.corpse(e.id, "pale");
      for (let i = 0; i < 3; i++) this.kit.play("mote/spirit", p.x + (i - 1) * 12, p.y - 30 - i * 8, { scale: 2, fps: 8, loop: true, duration: 900 });
      g.pool(p.x, p.y, 0.7);
      return;
    }
    if (!torn) {
      // Bled out where it fell.
      g.spray(p.x, p.y, 34, dx, dy, e.gore ? 34 : 14, e.gore ? 1.1 : 0.8);
      g.pool(p.x, p.y, e.gore ? 1.25 : 0.85);
      return;
    }
    this.hooks.playSound("sfx_gore", 0.9, p);
    const off = (part: string) => `gib_${part}/${skin}/0`;
    const bit = (part: string) => `gib_${part}/blood/0`;
    const neck = () => ({ x: p.x, y: p.y - 4 });
    if (cause === "crush" || (e.ok ?? 0) > 1.2) {
      // Burst: the body comes apart.
      this.hooks.corpse(e.id, "gone");
      g.gib(off("torso"), p.x, p.y, 26, dx, dy, 0.6);
      g.gib(off("head"), p.x, p.y, 44, dx, dy, 1.3);
      g.gib(off("arm"), p.x, p.y, 30, dx, dy, 1.1);
      g.gib(off("arm"), p.x, p.y, 30, -dy, dx, 1.0);
      g.gib(off("leg"), p.x, p.y, 14, dy, -dx, 0.9);
      for (const b of ["guts", "ribs", "chunk", "chunk", "chunk", "shard", "shard"]) g.gib(bit(b), p.x, p.y, 24, dx, dy, 1.2);
      g.spray(p.x, p.y, 30, dx, dy, 70, 1.5);
      g.pool(p.x, p.y, 1.6);
      this.hooks.shake(0.008, 180);
      return;
    }
    if (cause === "exec" || Math.random() < 0.6) {
      // Beheaded: the head flies, the body falls in pieces, the neck pumps.
      this.hooks.corpse(e.id, "gone");
      g.gib(off("head"), p.x, p.y, 44, dx, dy, 1.2);
      g.gib(off("torso"), p.x, p.y, 20, dx, dy, 0.25);
      g.gib(off("arm"), p.x, p.y, 26, -dy, dx, 0.5);
      g.gib(off("leg"), p.x, p.y, 10, dy, -dx, 0.35);
      g.gib(bit("chunk"), p.x, p.y, 40, dx, dy, 1);
      g.pump(neck, cause === "exec" ? 1400 : 900, dx, dy);
      g.spray(p.x, p.y, 40, dx, dy, 50, 1.3);
      g.pool(p.x, p.y, 1.5);
      return;
    }
    // An arm off: the body stays where it fell, the arm lands beside it.
    g.gib(off("arm"), p.x, p.y, 30, dx, dy, 1.1);
    g.gib(bit("chunk"), p.x, p.y, 30, dx, dy, 1);
    g.pump(neck, 700, dx, dy);
    g.spray(p.x, p.y, 30, dx, dy, 40, 1.2);
    g.pool(p.x, p.y, 1.35);
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
