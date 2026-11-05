import Phaser from "phaser";
import { depthOf, directionIndex, GREYED, worldToScreen, type GreyedKind } from "@broken-ash/shared";
import { atlasOr, ensureAtlas, greyedKey } from "../assets/atlases";
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

const STRIDE_PER_FRAME = 0.2;

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
      if (ok) this.atlas = key;
    });
    const big = view.kind === "tapper";
    this.shadow = scene.add.image(0, 0, "fx", "shadow").setScale(big ? 1.1 : 0.65, big ? 1.0 : 0.6);
    this.sprite = scene.add.sprite(0, 0, this.atlas ?? "fx", this.atlas ? "idle/0/0" : "shadow");
    // Thralls are the same dead, bound by a Lantern-Keeper: a pale spirit-light tint.
    if (view.faction === "players") this.sprite.setTint(0xb8d8e8);
    this.bar = scene.add.graphics();
    layer.add([this.shadow, this.sprite, this.bar]);
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
    if (!this.atlas) {
      this.atlas = atlasOr(this.scene, greyedKey(this.view.kind), ["shambler_greyed"]);
      if (!this.atlas) return;
    }
    const v = this.view;
    const dir = directionIndex(v.facing);
    if (this.dead) {
      const f = Math.min(5, Math.floor((now - this.deathStart) / 110));
      this.sprite.setTexture(this.atlas, `death/${dir}/${f}`);
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
      anim = "hit";
      frame = 1;
    } else if (v.state === "windup" && v.atk) {
      const atk = this.def.attacks.find((a) => a.id === v.atk);
      anim = atk?.anim ?? "attack";
      const k = 1 - v.atkT / Math.max(0.01, v.atkTotal);
      frame = Math.min(2, Math.floor(k * 3));
    } else if (v.state === "recover") {
      const atk = this.def.attacks[0];
      anim = atk?.anim ?? "attack";
      frame = 4;
    } else if (Math.hypot(s.vx, s.vy) > 0.2) {
      anim = "run";
      this.frameF = (this.frameF + moved / STRIDE_PER_FRAME) % 8;
      frame = Math.floor(this.frameF);
    } else {
      this.frameF = (this.frameF + delta / 1000 * 5) % 6;
      frame = Math.floor(this.frameF);
    }
    this.sprite.setTexture(this.atlas, `${anim}/${dir}/${frame}`);
    if (this.hitFlash > 0) {
      this.hitFlash -= delta;
      this.sprite.setTintFill(0xffe8e0);
    } else if (v.faction === "players") this.sprite.setTint(0xb8d8e8);
    else this.sprite.clearTint();

    // Health bar above the head (only once hurt, so a fresh horde isn't a wall of bars).
    this.bar.clear();
    if (v.hp < v.hpMax && v.kind !== "tapper") {
      const w = 54;
      const y = scr.y - (v.kind === "bloated" ? 150 : 140);
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
