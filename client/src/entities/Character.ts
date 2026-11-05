import Phaser from "phaser";
import { BALANCE, depthOf, directionIndex, PATHS, worldToScreen, type PathId } from "@broken-ash/shared";
import type { AudioDirector } from "../audio/AudioDirector";
import { atlasOr, charKey, ensureAtlas } from "../assets/atlases";

/** Frame counts per animation (tools/art/anims.py FRAMES). */
export const ANIM_FRAMES: Record<string, number> = { idle: 6, run: 8, roll: 6, hit: 3, death: 6, attack: 6, skill1: 6, skill2: 6 };
const IDLE_FPS = 6;
/** Cells travelled per run-cycle frame: matches the stride of the rendered run, so feet don't slide. */
const STRIDE_PER_FRAME = 0.24;

export interface CharacterState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  dodgeT: number;
  downed?: boolean;
}

/**
 * A player on screen: the rendered sprite for their path and body, a soft blob shadow, a name tag,
 * footsteps, and the animation choice (idle / run / roll / casting / hit / downed).
 */
export class Character {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private atlas: string | null;
  private anim = "idle";
  private frameF = 0;
  private lastX = 0;
  private lastY = 0;
  private wasRolling = false;
  /** A one-shot animation (cast, hit) and when it ends. */
  private action: { anim: string; start: number; dur: number; strikeAt: number } | null = null;
  private downedAt = -1;
  screen = { x: 0, y: 0 };
  depth = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    readonly path: PathId,
    readonly body: string,
    name: string,
    showName: boolean,
    private readonly audio: AudioDirector,
    private readonly groundAt: (x: number, y: number) => string | null,
  ) {
    const key = charKey(path, body);
    this.atlas = atlasOr(scene, key, [charKey(path, body === "male" ? "female" : "male"), "thorn_male", "blood_female"]);
    void ensureAtlas(scene, key).then((ok) => {
      if (ok) this.atlas = key;
    });
    this.shadow = scene.add.image(0, 0, "fx", "shadow").setScale(0.62, 0.62);
    this.sprite = scene.add.sprite(0, 0, this.atlas ?? "fx", this.atlas ? "idle/0/0" : "shadow");
    this.label = scene.add
      .text(0, 0, name, { fontFamily: "Cormorant Garamond", fontSize: "20px", color: "#d9cfc1", stroke: "#000000", strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setVisible(showName)
      .setDepth(9.7e6);
    layer.add([this.shadow, this.sprite, this.label]);
  }

  /** Plays a skill's animation: its wind-up spread over the cast time, the strike on release. */
  playCast(skillId: string) {
    const skill = PATHS[this.path].skills.find((s) => s.id === skillId);
    if (!skill) return;
    const now = this.scene.time.now;
    const windup = skill.windup * 1000;
    this.action = { anim: skill.anim, start: now, dur: windup + 320, strikeAt: windup };
  }

  playHit() {
    if (this.action && this.action.anim !== "hit") return;
    this.action = { anim: "hit", start: this.scene.time.now, dur: 260, strikeAt: 0 };
  }

  update(s: CharacterState, delta: number) {
    const dt = delta / 1000;
    const scr = worldToScreen(s.x, s.y);
    this.screen = scr;
    this.depth = depthOf(s.x, s.y) + 50;
    this.sprite.setPosition(scr.x, scr.y).setDepth(this.depth);
    this.shadow.setPosition(scr.x, scr.y).setDepth(this.depth - 1);
    this.label.setPosition(scr.x, scr.y - 160).setScale(1 / this.scene.cameras.main.zoom);
    if (!this.atlas) {
      const k = atlasOr(this.scene, charKey(this.path, this.body), ["thorn_male", "blood_female"]);
      if (!k) return;
      this.atlas = k;
    }

    const moved = Math.hypot(s.x - this.lastX, s.y - this.lastY);
    this.lastX = s.x;
    this.lastY = s.y;
    const speed = Math.hypot(s.vx, s.vy);
    const dir = directionIndex(s.facing);
    const now = this.scene.time.now;
    let frame: number;
    let anim: string;

    if (s.downed) {
      if (this.downedAt < 0) this.downedAt = now;
      anim = "death";
      frame = Math.min(5, Math.floor((now - this.downedAt) / 110));
      this.action = null;
    } else if (s.dodgeT > 0) {
      this.downedAt = -1;
      if (!this.wasRolling) this.audio.play("sfx_dodge", 0.55, scr);
      anim = "roll";
      frame = Math.min(5, Math.floor((1 - s.dodgeT / BALANCE.dodge.duration) * 6));
      this.action = null;
    } else if (this.action && now - this.action.start < this.action.dur) {
      this.downedAt = -1;
      const a = this.action;
      anim = a.anim;
      const t = now - a.start;
      if (a.anim === "hit") frame = Math.min(2, Math.floor((t / a.dur) * 3));
      // Wind-up frames 0–2 across the cast time, then strike and follow-through 3–5.
      else if (t < a.strikeAt) frame = Math.min(2, Math.floor((t / Math.max(1, a.strikeAt)) * 3));
      else frame = Math.min(5, 3 + Math.floor(((t - a.strikeAt) / (a.dur - a.strikeAt)) * 3));
    } else {
      this.downedAt = -1;
      this.action = null;
      if (speed > 0.35) {
        const before = Math.floor(this.frameF);
        if (this.anim !== "run") this.frameF = 0;
        anim = "run";
        this.frameF = (this.frameF + moved / STRIDE_PER_FRAME) % 8;
        frame = Math.floor(this.frameF);
        // Feet touch down on frames 1 and 5 of the run cycle.
        if (frame !== before && (frame === 1 || frame === 5)) this.footstep(s.x, s.y, scr);
      } else {
        if (this.anim !== "idle") this.frameF = 0;
        anim = "idle";
        this.frameF = (this.frameF + dt * IDLE_FPS) % 6;
        frame = Math.floor(this.frameF);
      }
    }
    this.anim = anim;
    this.wasRolling = s.dodgeT > 0;
    const name = `${anim}/${dir}/${frame}`;
    if (this.sprite.texture.key !== this.atlas || this.sprite.frame.name !== name) this.sprite.setTexture(this.atlas, name);
  }

  private footstep(x: number, y: number, at: { x: number; y: number }) {
    const ground = this.groundAt(Math.floor(x), Math.floor(y));
    const soft = ground === "moss" || ground === "dirt";
    const key = `sfx_step_${soft ? "soft" : "stone"}_${Phaser.Math.Between(0, 3)}`;
    this.audio.play(key, soft ? 0.22 : 0.28, at, Phaser.Math.FloatBetween(0.92, 1.08));
  }

  flash(color = 0xffffff) {
    this.sprite.setTintFill(color);
    this.scene.time.delayedCall(70, () => this.sprite.clearTint());
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.label.destroy();
  }
}
