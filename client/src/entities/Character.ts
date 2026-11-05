import Phaser from "phaser";
import { BALANCE, depthOf, directionIndex, worldToScreen } from "@broken-ash/shared";
import type { AudioDirector } from "../audio/AudioDirector";

const IDLE_FPS = 6;
/** Cells travelled per run-cycle frame: matches the stride of the rendered run, so feet don't slide. */
const STRIDE_PER_FRAME = 0.21;

export interface CharacterState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  dodgeT: number;
}

/** A player on screen: rendered sprite, a soft blob shadow, a name tag, footsteps. */
export class Character {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private anim: "idle" | "run" | "roll" = "idle";
  private frameF = 0;
  private lastX = 0;
  private lastY = 0;
  private wasRolling = false;
  screen = { x: 0, y: 0 };
  depth = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly look: string,
    name: string,
    showName: boolean,
    private readonly audio: AudioDirector,
    private readonly groundAt: (x: number, y: number) => string | null,
  ) {
    this.shadow = scene.add.image(0, 0, "fx", "shadow").setScale(0.62, 0.62);
    this.sprite = scene.add.sprite(0, 0, "chars", `ashbound_${look}/idle/0/0`);
    this.label = scene.add
      .text(0, 0, name, { fontFamily: "Cormorant Garamond", fontSize: "20px", color: "#d9cfc1", stroke: "#000000", strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setVisible(showName)
      .setDepth(9.7e6);
    layer.add([this.shadow, this.sprite, this.label]);
  }

  update(s: CharacterState, delta: number) {
    const dt = delta / 1000;
    const scr = worldToScreen(s.x, s.y);
    this.screen = scr;
    this.depth = depthOf(s.x, s.y) + 50;
    this.sprite.setPosition(scr.x, scr.y).setDepth(this.depth);
    this.shadow.setPosition(scr.x, scr.y).setDepth(this.depth - 1);
    // Name tags keep the same on-screen size whatever the zoom.
    this.label.setPosition(scr.x, scr.y - 150).setScale(1 / this.scene.cameras.main.zoom);

    const moved = Math.hypot(s.x - this.lastX, s.y - this.lastY);
    this.lastX = s.x;
    this.lastY = s.y;
    const speed = Math.hypot(s.vx, s.vy);
    const dir = directionIndex(s.facing);

    let frame: number;
    if (s.dodgeT > 0) {
      if (!this.wasRolling) this.audio.play("sfx_dodge", 0.55, scr);
      this.anim = "roll";
      frame = Math.min(7, Math.floor((1 - s.dodgeT / BALANCE.dodge.duration) * 8));
      this.shadow.setScale(0.7, 0.6);
    } else if (speed > 0.35) {
      const before = Math.floor(this.frameF);
      if (this.anim !== "run") this.frameF = 0;
      this.anim = "run";
      this.frameF = (this.frameF + moved / STRIDE_PER_FRAME) % 8;
      frame = Math.floor(this.frameF);
      // Feet touch down on frames 1 and 5 of the run cycle.
      if (frame !== before && (frame === 1 || frame === 5)) this.footstep(s.x, s.y, scr);
      this.shadow.setScale(0.62, 0.62);
    } else {
      if (this.anim !== "idle") this.frameF = 0;
      this.anim = "idle";
      this.frameF = (this.frameF + dt * IDLE_FPS) % 6;
      frame = Math.floor(this.frameF);
      this.shadow.setScale(0.62, 0.62);
    }
    this.wasRolling = s.dodgeT > 0;
    this.sprite.setFrame(`ashbound_${this.look}/${this.anim}/${dir}/${frame}`);
  }

  private footstep(x: number, y: number, at: { x: number; y: number }) {
    const ground = this.groundAt(Math.floor(x), Math.floor(y));
    const soft = ground === "moss" || ground === "dirt";
    const key = `sfx_step_${soft ? "soft" : "stone"}_${Phaser.Math.Between(0, 3)}`;
    this.audio.play(key, soft ? 0.22 : 0.28, at, Phaser.Math.FloatBetween(0.92, 1.08));
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.label.destroy();
  }
}
