import Phaser from "phaser";
import { depthOf, directionIndex, GREYED, worldToScreen, type GreyedKind } from "@broken-ash/shared";
import { atlasMeta, atlasOr, ensureAtlas, greyedKey, resolveAnim, type AtlasMeta } from "../assets/atlases";
import { Interpolation } from "../net/Interpolation";

/** The synced unit fields (server/src/schema/WorldState.ts UnitState). */
export interface UnitView {
  id: string;
  kind: string;
  faction: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  hpMax: number;
  state: string;
  stagger: number;
  st: string;
  atk: string;
  atkT: number;
  atkTotal: number;
  aim: number;
  ax: number;
  ay: number;
}

/** Cells per full walk cycle of a Greyed (a shorter, shuffling stride than the players'). */
const STRIDE_PER_CYCLE = 1.6;

/**
 * A Greyed (or a Graves thrall) on screen: interpolated position, walk/attack/stagger animations,
 * a health bar, and after death a corpse that stays where it fell.
 */
export class UnitSprite {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;
  readonly interp = new Interpolation();
  private atlas: string | null;
  private meta!: AtlasMeta;
  private frameF = 0;
  private lastX = 0;
  private lastY = 0;
  private hitFlash = 0;
  view: UnitView;
  screen = { x: 0, y: 0 };
  depth = 0;
  dead = false;
  private deathStart = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    view: UnitView,
  ) {
    this.view = view;
    const key = greyedKey(view.kind);
    this.atlas = atlasOr(scene, key, ["shambler_greyed"]);
    void ensureAtlas(scene, key).then((ok) => {
      if (ok) this.useAtlas(key);
    });
    const big = view.kind === "tapper";
    this.shadow = scene.add.image(0, 0, "fx", "shadow").setScale(big ? 1.5 : 0.9);
    this.sprite = scene.add.sprite(0, 0, this.atlas ?? "fx", this.atlas ? "idle/0/0" : "shadow");
    // Thralls are the same dead, bound by a Lantern-Keeper: a pale spirit-light tint.
    if (view.faction === "players") this.sprite.setTint(0xb8d8e8);
    this.bar = scene.add.graphics();
    layer.add([this.shadow, this.sprite, this.bar]);
    this.useAtlas(this.atlas);
  }

  private useAtlas(key: string | null) {
    this.atlas = key;
    this.meta = atlasMeta(this.scene, key);
    this.sprite.setScale(this.meta.scale);
  }

  /** How tall the unit stands on screen (for health bars and hit effects). */
  get height() {
    if (this.meta.pixel) return this.meta.height;
    // Rendered atlases: the standing frame's pixels above its feet (the pivot), so a re-render at a
    // new size or camera moves the bar with it.
    const f = this.atlas ? this.scene.textures.getFrame(this.atlas, "idle/0/0") : null;
    if (f && f.pivotY > 0) return Math.round(f.pivotY * f.height * this.meta.scale) + 6;
    return this.view.kind === "tapper" ? 220 : this.view.kind === "bloated" ? 150 : 140;
  }

  get def() {
    return GREYED[(this.view.kind === "thrall" ? "shambler" : this.view.kind) as GreyedKind];
  }

  hit() {
    this.hitFlash = 90;
  }

  /** Death: play the fall once, then lie there as a corpse (drawn flat, under the living). */
  die() {
    this.dead = true;
    this.deathStart = this.scene.time.now;
    this.bar.clear();
    this.sprite.clearTint();
    if (this.view.faction === "players") {
      // A thrall crumbles to ash instead of leaving a body.
      this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, duration: 600, onComplete: () => this.destroy() });
    }
  }

  update(now: number, delta: number) {
    const v = this.view;
    if (!this.atlas) {
      this.useAtlas(atlasOr(this.scene, greyedKey(this.view.kind), ["shambler_greyed"]));
      if (!this.atlas) {
        // No sprite yet, but the position still matters (aiming, effects, sounds).
        const s = this.interp.sample(now);
        if (s) this.screen = worldToScreen(s.x, s.y);
        return;
      }
    }
    const atlas = this.atlas;
    const count = (a: string) => this.meta.anims[a] ?? 1;
    const dir = directionIndex(v.facing);
    if (this.dead) {
      const death = resolveAnim(this.scene, atlas, "death");
      const f = Math.min(count(death) - 1, Math.floor((now - this.deathStart) / 110));
      this.sprite.setTexture(atlas, `${death}/${dir}/${f}`);
      // Corpses lie on the ground: under anyone standing.
      this.sprite.setDepth(this.depth - 2e6);
      this.shadow.setVisible(false);
      return;
    }
    const s = this.interp.sample(now) ?? { x: v.x, y: v.y, vx: v.vx, vy: v.vy, facing: v.facing, dodgeT: 0, t: now };
    const scr = worldToScreen(s.x, s.y);
    this.screen = scr;
    this.depth = depthOf(s.x, s.y) + 40;
    this.sprite.setPosition(scr.x, scr.y).setDepth(this.depth);
    this.shadow.setPosition(scr.x, scr.y).setDepth(this.depth - 1);
    const moved = Math.hypot(s.x - this.lastX, s.y - this.lastY);
    this.lastX = s.x;
    this.lastY = s.y;

    let anim = "idle";
    let frame = 0;
    if (v.stagger > 0) {
      anim = resolveAnim(this.scene, atlas, "hit");
      frame = Math.min(1, count(anim) - 1);
    } else if (v.state === "windup" && v.atk) {
      const atk = this.def.attacks.find((a) => a.id === v.atk);
      anim = resolveAnim(this.scene, atlas, atk?.anim ?? "attack");
      // The wind-up plays the first half of the clip, so the strike lands as the telegraph fills.
      const half = Math.max(1, Math.floor(count(anim) / 2));
      const k = 1 - v.atkT / Math.max(0.01, v.atkTotal);
      frame = Math.min(half - 1, Math.floor(k * half));
    } else if (v.state === "recover") {
      anim = resolveAnim(this.scene, atlas, this.def.attacks[0]?.anim ?? "attack");
      frame = count(anim) - 1;
    } else if (Math.hypot(s.vx, s.vy) > 0.2) {
      anim = "run";
      const n = count(anim);
      this.frameF = (this.frameF + (moved / STRIDE_PER_CYCLE) * n) % n;
      frame = Math.floor(this.frameF);
    } else {
      const n = count(anim);
      this.frameF = (this.frameF + (delta / 1000) * 5) % n;
      frame = Math.floor(this.frameF);
    }
    this.sprite.setTexture(atlas, `${anim}/${dir}/${frame}`);
    if (this.hitFlash > 0) {
      this.hitFlash -= delta;
      this.sprite.setTintFill(0xffe8e0);
    } else if (v.faction === "players") this.sprite.setTint(0xb8d8e8);
    else this.sprite.clearTint();

    // Health bar above the head (only once hurt, so a fresh horde isn't a wall of bars).
    this.bar.clear();
    if (v.hp < v.hpMax && v.kind !== "tapper") {
      const w = 54;
      const y = scr.y - this.height;
      this.bar.fillStyle(0x000000, 0.6).fillRect(scr.x - w / 2 - 1, y - 1, w + 2, 6);
      this.bar.fillStyle(v.faction === "players" ? 0x8cc0d8 : 0xa8231a, 1).fillRect(scr.x - w / 2, y, (w * v.hp) / v.hpMax, 4);
      if (v.stagger > 0) this.bar.fillStyle(0xf0d070, 1).fillRect(scr.x - w / 2, y - 4, w, 2);
      this.bar.setDepth(9.65e6);
    }
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.bar.destroy();
  }
}
