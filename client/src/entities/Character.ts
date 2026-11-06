import Phaser from "phaser";
import { BALANCE, DEFAULT_LOOKS, depthOf, directionIndex, PATHS, worldToScreen, type CharacterLook, type PathId, type SkillDef, type WeaponId } from "@broken-ash/shared";
import { ALL_SKILLS } from "../net/loadout";
import type { AudioDirector } from "../audio/AudioDirector";
import { gearFor, recolorAtlas } from "../assets/recolor";
import { atlasMeta, atlasOr, charKey, ensureAtlas, resolveAnim, type AtlasMeta } from "../assets/atlases";

const IDLE_FPS = 6;

/** The texture key of a body dressed in a look. */
const dressedKey = (body: string, look: CharacterLook) => `body_${body}@${look.skin}.${look.cloth}.${look.trim}.${look.armour}`;
/** Gear sprites rotate in this many steps (tools/pixellab/parts.py ANGLES). */
const ANGLES = 32;
/** Which gear sprites each weapon shows in the main and off hand (parts.py WEAPON_PARTS). */
const WEAPON_PARTS: Record<WeaponId, [string | null, string | null]> = {
  blades: ["katana", "wakizashi"],
  glaive: ["glaive", null],
  greatblade: ["nodachi", null],
  brush: ["brush", null],
  talismans: ["talismans", "talismans"],
  fan: ["fan", null],
  lantern: ["lantern", null],
  bow: [null, "bow"],
  knives: ["knife", "knife"],
};
const angleFrame = (a: number) => ((Math.round(a / ((2 * Math.PI) / ANGLES)) % ANGLES) + ANGLES) % ANGLES;
/** Worn gear (head, shoulders, cape) is pre-turned in this many steps (parts.py TURNS). */
const TURNS = 16;
const turnFrame = (a: number) => ((Math.round(a / ((2 * Math.PI) / TURNS)) % TURNS) + TURNS) % TURNS;
/** Cells travelled per full run cycle: matches the stride of the drawn run, so feet don't slide. */
const STRIDE_PER_CYCLE = 1.9;
const DEATH_FRAME_MS = 110;
/** Cape swing per run frame: a pendulum, so it never jumps from one side straight to the other. */
const CAPE_SWAY = [0, 1, 2, 1];

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
  private look: CharacterLook;
  private weapon: WeaponId;
  private gear: string | null = null;
  private readonly cape: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly shoulderL: Phaser.GameObjects.Image;
  private readonly shoulderR: Phaser.GameObjects.Image;
  private readonly weaponMain: Phaser.GameObjects.Image;
  private readonly weaponOff: Phaser.GameObjects.Image;
  private bar: SkillDef[] = [];
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
    // The shared PixelLab body, dressed in the look; older per-path renders stand in until it loads.
    this.look = DEFAULT_LOOKS[path];
    this.weapon = PATHS[path].homeWeapons[0];
    const legacy = charKey(path, body);
    this.atlas = atlasOr(scene, dressedKey(body, this.look), [legacy, charKey(path, body === "male" ? "female" : "male"), "thorn_male", "blood_female"]);
    void ensureAtlas(scene, `body_${body}`).then((ok) => {
      if (ok) this.dress();
      else
        void ensureAtlas(scene, legacy).then((ok2) => {
          if (ok2) this.useAtlas(legacy);
        });
    });
    const part = () => scene.add.image(0, 0, "fx", "shadow").setVisible(false);
    this.cape = part();
    this.head = part();
    this.shoulderL = part();
    this.shoulderR = part();
    this.weaponMain = part();
    this.weaponOff = part();
    layer.add([this.cape, this.head, this.shoulderL, this.shoulderR, this.weaponMain, this.weaponOff]);
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

  /** Changes what the character wears (the body is re-dyed, gear re-coloured). */
  setLook(look: CharacterLook) {
    if (JSON.stringify(look) === JSON.stringify(this.look)) return;
    this.look = look;
    this.dress();
  }

  setWeapon(weapon: WeaponId) {
    this.weapon = weapon;
  }

  private dress() {
    const src = `body_${this.body}`;
    if (!this.scene.textures.exists(src)) return;
    const key = dressedKey(this.body, this.look);
    if (recolorAtlas(this.scene, src, this.look, key)) this.useAtlas(key);
    this.gear = gearFor(this.scene, this.look);
  }

  private useAtlas(key: string | null) {
    this.atlas = key;
    this.meta = atlasMeta(this.scene, key);
    this.sprite.setScale(this.meta.scale);
  }

  /** Plays a skill's animation: its wind-up spread over the cast time, the strike on release. */
  /** The player's current bar (resolved skills: their wind-ups and moves). */
  setBar(skills: SkillDef[]) {
    this.bar = skills;
  }

  playCast(skillId: string) {
    const skill = this.bar.find((s) => s.id === skillId) ?? ALL_SKILLS.get(skillId);
    if (!skill) return;
    const now = this.scene.time.now;
    const windup = skill.windup * 1000;
    this.action = { anim: this.skillAnim(skill.anim), start: now, dur: windup + 320, strikeAt: windup };
  }

  /**
   * The shared bodies have two attack moves, a weapon strike and a spell cast; a path's skills use
   * the one that fits it (melee strikes, magic and ranged cast). Sets with their own per-skill clips
   * (the older renders) keep them.
   */
  private skillAnim(anim: string): string {
    if (anim === "strike" || anim === "cast") return anim;
    if (this.atlas && this.scene.textures.get(this.atlas).has(`${anim}/0/0`)) return anim;
    return PATHS[this.path].type === "melee" ? "strike" : "cast";
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
    // Whole screen pixels: the body and everything pinned to it share this origin.
    this.sprite.setPosition(Math.round(scr.x), Math.round(scr.y)).setDepth(this.depth);
    this.shadow.setPosition(scr.x, scr.y).setDepth(this.depth - 1);
    this.label.setPosition(scr.x, scr.y - this.meta.height - 14).setScale(1 / this.scene.cameras.main.zoom);
    if (!this.atlas) {
      const k = atlasOr(this.scene, dressedKey(this.body, this.look), [charKey(this.path, this.body), "thorn_male", "blood_female"]);
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
    this.placeGear(name, dir, frame, scr);
  }

  /**
   * The paper doll: head piece, shoulders, cape and weapons pinned to this frame's anchors, each
   * in front of or behind the body depending on which way the character faces.
   */
  private placeGear(name: string, dir: number, frame: number, scr: { x: number; y: number }) {
    const parts = [this.cape, this.head, this.shoulderL, this.shoulderR, this.weaponMain, this.weaponOff];
    const a = this.meta.anchors?.[name];
    const gear = this.gear;
    if (!a || !gear) {
      for (const p of parts) p.setVisible(false);
      return;
    }
    const sc = this.meta.scale;
    // Body and gear share one whole-pixel origin (the sprite's own position), and anchors are whole
    // art pixels from the feet: every part lands on the body's pixel grid and moves with it.
    const ox = this.sprite.x;
    const oy = this.sprite.y;
    const at = (x: number | null, y: number | null) => ({ x: ox + (x ?? 0) * sc, y: oy + (y ?? 0) * sc });
    const mirror = dir >= 5;
    // The body's own turn this frame (roll, fall): worn gear turns with it. A mirrored frame is the
    // turned part flipped, which is the part turned the other way.
    const rot = a[17] ?? 0;
    const turn = turnFrame(mirror ? -rot : rot);
    const view = dir === 2 || dir === 6 ? "side" : dir >= 3 && dir <= 5 ? "back" : "front";
    const away = view === "back";
    const d = this.depth;
    const show = (img: Phaser.GameObjects.Image, frameName: string, p: { x: number; y: number }, depth: number, flip = mirror) => {
      if (!this.scene.textures.get(gear).has(frameName)) return img.setVisible(false);
      return img.setTexture(gear, frameName).setPosition(p.x, p.y).setScale(sc).setFlipX(flip).setDepth(depth).setVisible(true);
    };
    const L = this.look;

    // Head piece on the head anchor (the mask has nothing to show from behind).
    if (L.head === "none" || (L.head === "mask" && away)) this.head.setVisible(false);
    else show(this.head, `h/${L.head}/${view}/${turn}`, at(a[6], a[7]), d + 0.3);

    // Shoulders: plates on both shoulders, or a fur mantle on the neck.
    if (L.shoulders === "sode") {
      // One plate picture for both shoulders, the right one flipped. A mirrored frame's rotation is
      // already the source's negated, so the source turn is recovered before picking the frame.
      const srcRot = mirror ? -rot : rot;
      show(this.shoulderL, `s/sode/${turnFrame(srcRot)}`, at(a[13], a[14]), d + 0.2, false);
      show(this.shoulderR, `s/sode/${turnFrame(-srcRot)}`, at(a[15], a[16]), d + 0.2, true);
    } else if (L.shoulders === "fur") {
      show(this.shoulderL, `${view === "side" ? "s/fur_side" : "s/fur_front"}/${turn}`, at(a[9], (a[10] ?? 0) + 2), d + 0.2);
      this.shoulderR.setVisible(false);
    } else {
      this.shoulderL.setVisible(false);
      this.shoulderR.setVisible(false);
    }

    // Cape from the neck: behind the body unless we see the back. It swings back and forth with the
    // run (0, 1, 2, 1 …), never snapping from one side to the other.
    if (L.cape < 0) this.cape.setVisible(false);
    else {
      const sway = this.anim === "run" ? CAPE_SWAY[frame % CAPE_SWAY.length] : 1;
      show(this.cape, `c/${view}/${sway}/${turn}`, at(a[9], a[10]), away ? d + 0.15 : d - 0.5);
    }

    // Weapons: in hand whenever the frame has hands (standing, running, striking, casting); stowed
    // across the back only while rolling or down. A mirrored frame shows the source frame's weapon
    // flipped about the grip, exactly like the body's pixels, so the blade's edge stays on its side
    // and the weapon never drifts off the hand.
    const [main, off] = WEAPON_PARTS[this.weapon];
    const handFront = !away;
    // Angles in the gear atlas are the source (unmirrored) picture's; a mirrored anchor angle a is
    // the source's π − a.
    const src = (ang: number) => (mirror ? Math.PI - ang : ang);
    const place = (img: Phaser.GameObjects.Image, part: string | null, hx: number | null, hy: number | null, ang: number | null, front: boolean, stowSide: number) => {
      if (!part) return img.setVisible(false);
      if (hx !== null && hy !== null && ang !== null) {
        // A bow is held upright, whatever the arm does.
        const angle = part === "bow" ? 0.15 : src(ang);
        return show(img, `w/${part}/${angleFrame(angle)}`, at(hx, hy), front ? d + 0.4 : d - 0.4);
      }
      // Stowed: across the back, hilt over the shoulder, turning with the body (roll, fall).
      const ax = (a[11] ?? 0) + (mirror ? -stowSide : stowSide) * 2;
      const ay = (a[12] ?? 0) - 3;
      const stow = part === "bow" ? -0.5 : -2.25;
      return show(img, `w/${part}/${angleFrame(stow + stowSide * 0.25 + (mirror ? -rot : rot))}`, at(ax, ay), away ? d + 0.35 : d - 0.6);
    };
    place(this.weaponMain, main, a[0], a[1], a[2], handFront, 0);
    place(this.weaponOff, off, a[3], a[4], a[5], handFront && view !== "side", main ? 1 : 0);
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
    for (const p of [this.cape, this.head, this.shoulderL, this.shoulderR, this.weaponMain, this.weaponOff]) p.destroy();
    this.sprite.destroy();
    this.shadow.destroy();
    this.label.destroy();
  }
}
