import Phaser from "phaser";
import { BALANCE, WEAPONS, type CharacterLook, type PathId, type WeaponId } from "@broken-ash/shared";
import { Character } from "../../entities/Character";
import type { AudioDirector } from "../../audio/AudioDirector";

/**
 * The character screen's live preview: a small Phaser game of its own showing the real paper doll —
 * the same body atlas, recolour, armour and gear as in play — idling, running, attacking or rolling,
 * turnable through all eight directions.
 */
export interface PreviewSpec {
  path: PathId;
  body: string;
  weapon: WeaponId;
  look: CharacterLook;
}

const SILENT = { play() {} } as unknown as AudioDirector;
export type PreviewMode = "idle" | "run" | "attack" | "roll";

class PreviewScene extends Phaser.Scene {
  private doll: Character | null = null;
  private spec: PreviewSpec | null = null;
  private layer!: Phaser.GameObjects.Layer;
  private facing = Math.PI * 0.25;
  private x = 0;
  private y = 0;
  private mode: PreviewMode = "idle";
  private modeT = 0;
  private ready = false;

  constructor() {
    super("preview");
  }

  preload() {
    this.load.atlas("gear", "assets/gear/gear.webp", "assets/gear/gear.json");
    this.load.atlas("fx", "assets/sprites/fx.png", "assets/sprites/fx.json");
  }

  create() {
    this.textures.get("gear").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.layer = this.add.layer();
    this.cameras.main.setZoom(2).setRoundPixels(true);
    this.ready = true;
    if (this.spec) {
      const s = this.spec;
      this.spec = null;
      this.show(s);
    }
  }

  show(spec: PreviewSpec) {
    const rebuild = !this.doll || !this.spec || this.spec.path !== spec.path || this.spec.body !== spec.body;
    this.spec = spec;
    if (!this.ready) return;
    if (rebuild) {
      this.doll?.destroy();
      this.doll = new Character(this, this.layer, spec.path, spec.body, "", false, SILENT, () => null);
    }
    this.doll!.setLook(spec.look);
    this.doll!.setWeapon(spec.weapon);
  }

  turn(step: number) {
    this.facing += (step * Math.PI) / 4;
  }

  act(mode: PreviewMode) {
    this.mode = mode;
    this.modeT = 0;
    if (mode === "attack" && this.doll && this.spec) {
      const w = WEAPONS[this.spec.weapon];
      this.doll.setBar([w.basic]);
      this.doll.playCast(w.basic.id);
    }
  }

  update(_t: number, delta: number) {
    if (!this.doll) return;
    const dt = delta / 1000;
    this.modeT += dt;
    let vx = 0;
    let vy = 0;
    let dodgeT = 0;
    if (this.mode === "run") {
      // Running on the spot: the doll moves, the camera follows, the ground is empty.
      vx = Math.cos(this.facing) * BALANCE.player.speed;
      vy = Math.sin(this.facing) * BALANCE.player.speed;
      this.x += vx * dt;
      this.y += vy * dt;
    } else if (this.mode === "roll") {
      const k = this.modeT % 1.2;
      dodgeT = k < BALANCE.dodge.duration ? BALANCE.dodge.duration - k : 0;
    } else if (this.mode === "attack" && this.modeT > 1.1) {
      this.act("attack");
    }
    this.doll.update({ x: this.x, y: this.y, vx, vy, facing: this.facing, dodgeT }, delta);
    const s = this.doll.screen;
    this.cameras.main.centerOn(s.x, s.y - 34);
  }
}

export class Preview {
  private readonly game: Phaser.Game;
  private scene: PreviewScene | null = null;
  private pending: PreviewSpec | null = null;

  constructor(parent: HTMLElement) {
    this.game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent,
      transparent: true,
      scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 400, height: parent.clientHeight || 400 },
      render: { antialias: false, pixelArt: true, roundPixels: true },
      audio: { noAudio: true },
      scene: [PreviewScene],
    });
    this.game.events.once(Phaser.Core.Events.READY, () => {
      this.scene = this.game.scene.getScene("preview") as PreviewScene;
      if (this.pending) this.scene.show(this.pending);
    });
  }

  show(spec: PreviewSpec) {
    this.pending = spec;
    this.scene?.show(spec);
  }

  turn(step: number) {
    this.scene?.turn(step);
  }

  act(mode: PreviewMode) {
    this.scene?.act(mode);
  }

  pause(on: boolean) {
    if (on) this.game.loop.sleep();
    else this.game.loop.wake();
  }
}
