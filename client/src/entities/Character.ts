import Phaser from "phaser";
import { BALANCE, DEFAULT_LOOKS, depthOf, directionIndex, PATHS, worldToScreen, type CharacterLook, type PathId, type SkillDef, type WeaponId } from "@broken-ash/shared";
import { ALL_SKILLS } from "../net/loadout";
import type { AudioDirector } from "../audio/AudioDirector";
import { gearFor, recolorAtlas } from "../assets/recolor";
import { atlasMeta, atlasOr, charKey, ensureAtlas, resolveAnim, type AtlasMeta } from "../assets/atlases";
import { RAMP_COLORS } from "../fx/fxkit";
import { CHAIN_WINDOW, inStroke, MOVES, poseAt, REACH, SKILL_MOTION, strokeAngle, WEAPON_TRAIL, type Pose, type SkillMotion } from "./moves";

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
  /** A one-shot animation (cast, hit) and when it ends; a skill's move when it has one (moves.ts). */
  private action: { anim: string; start: number; dur: number; strikeAt: number; motion?: SkillMotion; aim?: number } | null = null;
  /** The pose of the move being played this frame (null when none). */
  private pose: Pose | null = null;
  private poseT = 0;
  /** The upper body when a move throws it forward on its own (the legs stay planted). */
  private readonly upperSprite: Phaser.GameObjects.Sprite;
  /** The blade's trail: recent hand → tip segments per hand, drawn as a fading ribbon. */
  private readonly trailGfx: Phaser.GameObjects.Graphics;
  private trail: { main: { hx: number; hy: number; tx: number; ty: number; at: number }[]; off: { hx: number; hy: number; tx: number; ty: number; at: number }[] } = { main: [], off: [] };
  private lastGhost = 0;
  private facing = 0;
  /** Basic attacks in a row step through the weapon's chain (0, 1, 2). */
  private chainIdx = 0;
  private lastBasicEnd = -1e9;
  private downedAt = -1;
  private frozenUntil = 0;
  screen = { x: 0, y: 0 };
  depth = 0;
  /** A fixed clock for automated filmstrips (tools/e2e/moves.cjs); null in play. */
  testNow: number | null = null;
  /** Automated filmstrips hold the weapon they're showing (the game would reset it from the loadout). */
  testWeapon: WeaponId | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
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
    this.shadow = scene.add.image(0, 0, "fx", "shadow").setScale(0.9);
    this.sprite = scene.add.sprite(0, 0, this.atlas ?? "fx", this.atlas ? "idle/0/0" : "shadow");
    this.label = scene.add
      .text(0, 0, name, { fontFamily: "Cormorant Garamond", fontSize: "20px", color: "#d9cfc1", stroke: "#000000", strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setVisible(showName)
      .setDepth(9.7e6);
    this.upperSprite = scene.add.sprite(0, 0, this.atlas ?? "fx", this.atlas ? "idle/0/0" : "shadow").setVisible(false);
    this.trailGfx = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    layer.add([this.shadow, this.sprite, this.upperSprite, this.trailGfx, this.label]);
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
    this.weapon = this.testWeapon ?? weapon;
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
    const now = this.testNow ?? this.scene.time.now;
    const windup = skill.windup * 1000;
    let motion = SKILL_MOTION[skill.id];
    if (motion?.chain) {
      // Basic attacks in quick succession play the chain's next beat (visual only).
      this.chainIdx = now - this.lastBasicEnd < CHAIN_WINDOW * 1000 ? (this.chainIdx + 1) % (motion.chain.length + 1) : 0;
      if (this.chainIdx > 0) motion = motion.chain[this.chainIdx - 1];
    } else this.chainIdx = 0;
    if (motion && this.meta.pixel && this.meta.anchors) {
      const dur = windup + MOVES[motion.move].recover;
      this.action = { anim: "move", start: now, dur, strikeAt: windup, motion, aim: this.facing };
      if (SKILL_MOTION[skill.id]?.chain) this.lastBasicEnd = now + dur;
      return;
    }
    this.action = { anim: this.skillAnim(skill.anim), start: now, dur: windup + 320, strikeAt: windup };
  }

  /** Which beat of the basic-attack chain the last basic was (0 first, 2 the finisher). */
  get chainBeat() {
    return this.chainIdx;
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

  /** Hit-stop: the pose holds for a beat when a heavy blow lands (dealt or taken). */
  freeze(ms: number) {
    this.frozenUntil = Math.max(this.frozenUntil, this.scene.time.now + ms);
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
    let dir = directionIndex(s.facing);
    this.facing = s.facing;
    const now = this.testNow ?? this.scene.time.now;
    this.pose = null;
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
    } else if (this.action?.motion && now - this.action.start < this.action.dur) {
      // A skill's move: the pose timeline over the wind-up and the release (moves.ts).
      this.downedAt = -1;
      const a = this.action;
      const el = now - a.start;
      const t = el < a.strikeAt ? el / Math.max(1, a.strikeAt) : 1 + (el - a.strikeAt) / Math.max(1, a.dur - a.strikeAt);
      const pose = poseAt(MOVES[a.motion!.move], Math.min(2, t));
      this.pose = pose;
      this.poseT = t;
      anim = resolveAnim(this.scene, atlas, pose.clip);
      frame = Math.max(0, Math.min(count(anim) - 1, Math.round(pose.f)));
      // The move faces where the skill was aimed; a spin turns through the directions.
      dir = (((directionIndex(a.aim ?? s.facing) + Math.round(pose.turn)) % 8) + 8) % 8;
    } else if (this.action && !this.action.motion && now - this.action.start < this.action.dur) {
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
    const frozen = now < this.frozenUntil;
    if (!frozen && (this.sprite.texture.key !== atlas || this.sprite.frame.name !== name)) this.sprite.setTexture(atlas, name);
    this.carry(scr, now);
    // Gear follows the frame actually shown (during hit-stop that's the held one).
    const shown = this.sprite.frame.name;
    const parts = shown.split("/");
    this.placeGear(shown, Number(parts[1] ?? dir), Number(parts[2] ?? frame), scr);
  }

  /** Where the move carries the body this frame: the facing it was aimed at, in screen pixels per art pixel. */
  private moveFrame() {
    const p = this.pose;
    const aim = this.action?.aim ?? this.facing;
    const fx = Math.cos(aim);
    const fy = Math.sin(aim);
    return { p, fx, fy, aim };
  }

  /**
   * Places the body for this frame's pose: carried forward or aside, lifted, leaning into the facing
   * (seen sideways it's a tilt; seen from the front or back a lean doesn't show and the upper body
   * dips instead), squashed into the ground, the upper body thrown forward on its own.
   */
  private carry(scr: { x: number; y: number }, now: number) {
    const sc = this.meta.scale;
    const { p, fx, fy } = this.moveFrame();
    const up = this.upperSprite;
    if (!p) {
      this.sprite.setRotation(0).setScale(sc).setCrop();
      up.setVisible(false);
      this.shadow.setScale(0.9);
      this.trailGfx.clear();
      this.trail = { main: [], off: [] };
      return;
    }
    const ox = Math.round(scr.x + (fx * p.fwd - fy * p.side) * sc);
    const oy = Math.round(scr.y + (fy * p.fwd + fx * p.side) * sc - p.lift * sc);
    const lean = ((p.lean * Math.PI) / 180) * fx;
    this.sprite.setPosition(ox, oy).setRotation(lean).setScale(sc, sc * p.squash);
    this.shadow.setScale(0.9 * Math.max(0.55, 1 - p.lift / 30));
    // The upper body on its own: the same frame cropped at the waist, shifted along the facing.
    const a = this.meta.anchors?.[this.sprite.frame.name];
    if (p.upper && a) {
      const f = this.sprite.frame;
      const waistRel = this.waistOf(a);
      const row = Math.max(1, Math.min(f.cutHeight - 1, Math.round(f.pivotY * f.cutHeight + waistRel)));
      this.sprite.setCrop(0, row, f.cutWidth, f.cutHeight - row);
      up.setTexture(this.sprite.texture.key, f.name)
        .setCrop(0, 0, f.cutWidth, row)
        .setPosition(ox + Math.round(fx * p.upper) * sc, oy + Math.round(fy * p.upper * 0.5 + Math.abs(fy) * Math.abs(p.upper) * 0.3) * sc)
        .setRotation(lean)
        .setScale(sc, sc * p.squash)
        .setDepth(this.sprite.depth + 0.01)
        .setTint(0xffffff)
        .setVisible(true);
    } else {
      this.sprite.setCrop();
      up.setVisible(false);
    }
    // Afterimages: dark copies of the body left along a dash.
    const m = this.action?.motion;
    if (m?.ghosts && this.poseT >= 1 && this.poseT <= 1.45 && now - this.lastGhost > 40) {
      this.lastGhost = now;
      const g = this.scene.add
        .image(this.sprite.x, this.sprite.y, this.sprite.texture.key, this.sprite.frame.name)
        .setScale(sc, sc * p.squash)
        .setRotation(lean)
        .setDepth(this.sprite.depth - 2)
        .setTintFill(RAMP_COLORS[m.trail ?? "shadow"].dark)
        .setAlpha(0.55);
      this.layer.add(g);
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 280, onComplete: () => g.destroy() });
    }
  }

  /** The waist, relative to the feet (art px): below the chest by as much as the chest is below the neck. */
  private waistOf(a: (number | null)[]) {
    const neckY = a[10] ?? -40;
    const torsoY = a[12] ?? -30;
    return torsoY + (torsoY - neckY) * 1.1;
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
    // A move carries the anchors as it carries the body: the upper body's shift, the squash and the
    // lean about the feet.
    const mv = this.moveFrame();
    const pose = mv.p;
    const lean = pose ? ((pose.lean * Math.PI) / 180) * mv.fx : 0;
    const waist = pose?.upper ? this.waistOf(a) : -1e9;
    const at = (x: number | null, y: number | null) => {
      let px = x ?? 0;
      let py = y ?? 0;
      if (pose) {
        if (py < waist) {
          px += Math.round(mv.fx * pose.upper);
          py += Math.round(mv.fy * pose.upper * 0.5 + Math.abs(mv.fy) * Math.abs(pose.upper) * 0.3);
        }
        py *= pose.squash;
        if (lean) [px, py] = [px * Math.cos(lean) - py * Math.sin(lean), px * Math.sin(lean) + py * Math.cos(lean)];
      }
      return { x: ox + px * sc, y: oy + py * sc };
    };
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
    // A move's strokes swing the weapon along its own arc around the aim; otherwise it's held as the
    // frame holds it (turned with the lean).
    const m = this.action?.motion;
    // Strokes are written for a figure facing right; facing left they're mirrored, like the body.
    const side = Math.cos(mv.aim) < -0.01 ? -1 : 1;
    const swing = (hand: "main" | "off", ang: number | null) => {
      const r = pose && m ? strokeAngle(m.strokes, hand, this.poseT) : null;
      const s = r === null ? null : r * side;
      if (s !== null) return mv.aim + s;
      return ang === null ? null : ang + lean;
    };
    const mainAng = swing("main", a[2]);
    const offAng = swing("off", a[5]);
    // Mid-stroke the fist travels with the blade, round the shoulder at arm's length, so the cut
    // reads even where the drawn arm is somewhere else.
    const orbit = (hand: "main" | "off", hx: number | null, hy: number | null): [number | null, number | null] => {
      const r = pose && m ? strokeAngle(m.strokes, hand, this.poseT) : null;
      const s = r === null ? null : r * side;
      if (s === null || hx === null || hy === null || this.poseT < 1) return [hx, hy];
      const sx = a[11] ?? hx;
      const sy = ((a[10] ?? hy) + (a[12] ?? hy)) / 2;
      const ang = mv.aim + s;
      const k = 0.75;
      return [Math.round(hx + (sx + Math.cos(ang) * 10 - hx) * k), Math.round(hy + (sy + Math.sin(ang) * 8 - hy) * k)];
    };
    const [mx, my] = orbit("main", a[0], a[1]);
    const [fx2, fy2] = orbit("off", a[3], a[4]);
    place(this.weaponMain, main, mx, my, mainAng, handFront, 0);
    place(this.weaponOff, off, fx2, fy2, offAng, handFront && view !== "side", main ? 1 : 0);
    for (const img of [this.cape, this.head, this.shoulderL, this.shoulderR]) img.setRotation(lean);
    this.drawTrail(m, main, off, [mx, my, null, fx2, fy2], at, mainAng, offAng);
  }

  /** The blade's trail: a ribbon of the last ~100 ms of hand → tip, in the skill's colour, fading. */
  private drawTrail(
    m: SkillMotion | undefined,
    main: string | null,
    off: string | null,
    a: (number | null)[],
    at: (x: number | null, y: number | null) => { x: number; y: number },
    mainAng: number | null,
    offAng: number | null,
  ) {
    const g = this.trailGfx;
    g.clear();
    if (!m || !this.pose) return;
    const now = this.testNow ?? this.scene.time.now;
    const sc = this.meta.scale;
    const ramp = RAMP_COLORS[m.trail ?? WEAPON_TRAIL[this.weapon]];
    const sample = (hand: "main" | "off", part: string | null, hx: number | null, hy: number | null, ang: number | null) => {
      const list = this.trail[hand];
      if (part && hx !== null && hy !== null && ang !== null && inStroke(m.strokes, hand, this.poseT)) {
        const h = at(hx, hy);
        const reach = (REACH[part] ?? 10) * sc;
        list.push({ hx: h.x + Math.cos(ang) * reach * 0.6, hy: h.y + Math.sin(ang) * reach * 0.6, tx: h.x + Math.cos(ang) * reach * 1.08, ty: h.y + Math.sin(ang) * reach * 1.08, at: now });
      }
      while (list.length && now - list[0].at > 110) list.shift();
      g.setDepth(this.depth + 0.5);
      for (let i = 1; i < list.length; i++) {
        const p = list[i - 1];
        const q = list[i];
        const k = 1 - (now - q.at) / 110;
        // Pixel grid: the ribbon's corners on whole art pixels.
        const r = (v: number) => Math.round(v / sc) * sc;
        g.fillStyle(ramp.mid, 0.45 * k);
        g.fillTriangle(r(p.hx), r(p.hy), r(p.tx), r(p.ty), r(q.tx), r(q.ty));
        g.fillTriangle(r(p.hx), r(p.hy), r(q.tx), r(q.ty), r(q.hx), r(q.hy));
        // The edge itself: a bright line along the path of the tip.
        g.lineStyle(sc, ramp.hot, 0.9 * k);
        g.lineBetween(r(p.tx), r(p.ty), r(q.tx), r(q.ty));
      }
    };
    sample("main", main, a[0], a[1], mainAng);
    sample("off", off, a[3], a[4], offAng);
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
    this.upperSprite.destroy();
    this.trailGfx.destroy();
    this.sprite.destroy();
    this.shadow.destroy();
    this.label.destroy();
  }
}
