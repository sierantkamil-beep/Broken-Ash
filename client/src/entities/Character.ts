import Phaser from "phaser";
import { BALANCE, depthOf, directionIndex, PATH_LOOKS, PATHS, worldToScreen, type PathId } from "@broken-ash/shared";
import type { AudioDirector } from "../audio/AudioDirector";
import { recolorAtlas } from "../assets/recolor";
import { atlasMeta, atlasOr, charKey, ensureAtlas, resolveAnim, type AtlasMeta } from "../assets/atlases";

const IDLE_FPS = 6;

/** The texture key of a body dressed in a path's look. */
const dressedKey = (path: PathId, body: string) => `body_${body}@${path}`;
/** Cells travelled per full run cycle: matches the stride of the drawn run, so feet don't slide. */
const STRIDE_PER_CYCLE = 1.9;
const DEATH_FRAME_MS = 110;

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
  private meta!: AtlasMeta;
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
    // The shared PixelLab body, dressed in the path's look; older per-path renders stand in until it loads.
    const bodyKey = `body_${body}`;
    const legacy = charKey(path, body);
    this.atlas = atlasOr(scene, dressedKey(path, body), [legacy, charKey(path, body === "male" ? "female" : "male"), "thorn_male", "blood_female"]);
    void ensureAtlas(scene, bodyKey).then((ok) => {
      if (ok && recolorAtlas(scene, bodyKey, PATH_LOOKS[path], dressedKey(path, body))) this.useAtlas(dressedKey(path, body));
      else
        void ensureAtlas(scene, legacy).then((ok2) => {
          if (ok2) this.useAtlas(legacy);
        });
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
    this.useAtlas(this.atlas);
  }

  /** How tall the figure stands on screen (name tag, hit effects). */
  get height() {
    return this.meta.height;
  }

  /** Pixel-art set and its scale, for whole-pixel camera zoom. */
  get pixelScale(): number | null {
    return this.meta.pixel ? this.meta.scale : null;
  }

  private useAtlas(key: string | null) {
    this.atlas = key;
    this.meta = atlasMeta(this.scene, key);
    this.sprite.setScale(this.meta.scale);
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
    this.label.setPosition(scr.x, scr.y - this.meta.height - 14).setScale(1 / this.scene.cameras.main.zoom);
    if (!this.atlas) {
      const k = atlasOr(this.scene, dressedKey(this.path, this.body), [charKey(this.path, this.body), "thorn_male", "blood_female"]);
      if (!k) return;
      this.useAtlas(k);
    }
    const atlas = this.atlas!;
    const count = (a: string) => this.meta.anims[a] ?? 1;

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
      anim = resolveAnim(this.scene, atlas, "death");
      frame = Math.min(count(anim) - 1, Math.floor((now - this.downedAt) / DEATH_FRAME_MS));
      this.action = null;
    } else if (s.dodgeT > 0) {
      this.downedAt = -1;
      if (!this.wasRolling) this.audio.play("sfx_dodge", 0.55, scr);
      anim = resolveAnim(this.scene, atlas, "roll");
      const n = count(anim);
      frame = Math.min(n - 1, Math.floor((1 - s.dodgeT / BALANCE.dodge.duration) * n));
      this.action = null;
    } else if (this.action && now - this.action.start < this.action.dur) {
      this.downedAt = -1;
      const a = this.action;
      anim = resolveAnim(this.scene, atlas, a.anim);
      const n = count(anim);
      const t = now - a.start;
      // The first half of the clip is the wind-up, spread over the cast time; the rest is the
      // strike and follow-through after release.
      const half = Math.max(1, Math.floor(n / 2));
      if (a.anim === "hit" || a.strikeAt <= 0) frame = Math.min(n - 1, Math.floor((t / a.dur) * n));
      else if (t < a.strikeAt) frame = Math.min(half - 1, Math.floor((t / a.strikeAt) * half));
      else frame = Math.min(n - 1, half + Math.floor(((t - a.strikeAt) / (a.dur - a.strikeAt)) * (n - half)));
    } else {
      this.downedAt = -1;
      this.action = null;
      if (speed > 0.35) {
        anim = "run";
        const n = count(anim);
        if (this.anim !== "run") this.frameF = 0;
        const before = Math.floor(this.frameF);
        this.frameF = (this.frameF + (moved / STRIDE_PER_CYCLE) * n) % n;
        frame = Math.floor(this.frameF);
        // Feet touch down twice per cycle.
        if (frame !== before && (frame === 0 || frame === Math.floor(n / 2))) this.footstep(s.x, s.y, scr);
      } else {
        anim = "idle";
        const n = count(anim);
        if (this.anim !== "idle") this.frameF = 0;
        this.frameF = (this.frameF + dt * IDLE_FPS) % n;
        frame = Math.floor(this.frameF);
      }
    }
    this.anim = anim;
    this.wasRolling = s.dodgeT > 0;
    const name = `${anim}/${dir}/${frame}`;
    if (this.sprite.texture.key !== atlas || this.sprite.frame.name !== name) this.sprite.setTexture(atlas, name);
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
