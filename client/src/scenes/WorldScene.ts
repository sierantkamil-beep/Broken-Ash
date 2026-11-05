import Phaser from "phaser";
import {
  BALANCE,
  CollisionGrid,
  GREYED,
  MAPS,
  MSG,
  PATHS,
  screenToWorld,
  START_MAP,
  worldToScreen,
  type AreaMap,
  type Body,
  type FxEvent,
  type GreyedKind,
  type PathId,
} from "@broken-ash/shared";
import { ensureAtlas, greyedKey } from "../assets/atlases";
import { AudioDirector } from "../audio/AudioDirector";
import { CinematicPlayer } from "../cinematic/CinematicPlayer";
import { Character } from "../entities/Character";
import { UnitSprite, type UnitView } from "../entities/UnitSprite";
import { Telegraphs, Vfx } from "../fx/Vfx";
import { getStateCallbacks, type Room } from "../net";
import { Interpolation } from "../net/Interpolation";
import { Prediction } from "../net/Prediction";
import { $ } from "../ui/dom";
import { Hud } from "../ui/Hud";
import { GroundLayer } from "../world/GroundLayer";
import { Lighting, type LightSource } from "../world/Lighting";
import { Petals } from "../world/Petals";
import { PropLayer } from "../world/PropLayer";

/** The synced player fields (mirror of server/src/schema/WorldState.ts). */
interface PlayerView extends Body {
  id: string;
  name: string;
  look: string;
  path: string;
  body: string;
  lastSeq: number;
  hp: number;
  hpMax: number;
  res: number;
  resMax: number;
  shield: number;
  cd: number[];
  cast: string;
  castT: number;
  st: string;
  downed: boolean;
  downT: number;
  revive: number;
}

interface StateView {
  players: Map<string, PlayerView>;
  units: Map<string, UnitView>;
  cinematic: string;
  cinematicElapsed: number;
  skipVotes: number;
  phase: string;
  wave: number;
}

interface Remote {
  char: Character;
  interp: Interpolation;
  view: PlayerView;
  lastCast: string;
}

/** Zoom during play, relative to a 1080 px tall window: close enough to read the characters, wide enough to see a telegraph coming. */
const PLAY_ZOOM = 0.92;

export class WorldScene extends Phaser.Scene {
  private map!: AreaMap;
  private grid!: CollisionGrid;
  private worldLayer!: Phaser.GameObjects.Layer;
  private overlayLayer!: Phaser.GameObjects.Layer;
  private overlayCam!: Phaser.Cameras.Scene2D.Camera;
  private fog: Phaser.GameObjects.TileSprite[] = [];
  private props!: PropLayer;
  private lighting!: Lighting;
  private petals!: Petals;
  audio!: AudioDirector;
  private cinematic!: CinematicPlayer;
  private colorFx?: Phaser.FX.ColorMatrix;
  private vfx!: Vfx;
  private telegraphs!: Telegraphs;
  private hud = new Hud();

  private room: Room | null = null;
  private state: StateView | null = null;
  private me: { char: Character; pred: Prediction; view: PlayerView; lastCast: string; wasHp: number } | null = null;
  private remotes = new Map<string, Remote>();
  private units = new Map<string, UnitSprite>();
  private corpses: UnitSprite[] = [];
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d" | "f", Phaser.Input.Keyboard.Key>;
  private userZoom = 1;
  private paused = false;
  private titleT = 0;
  private aim = { angle: Math.PI / 4, dist: 3 };
  private groanAt = 0;

  constructor() {
    super("world");
  }

  create() {
    this.map = MAPS[START_MAP];
    this.grid = CollisionGrid.fromMap(this.map);
    this.worldLayer = this.add.layer();
    this.overlayLayer = this.add.layer();
    this.audio = new AudioDirector(this);

    this.worldLayer.add(new GroundLayer(this, this.map).rt);
    this.props = new PropLayer(this, this.map, this.worldLayer);
    this.lighting = new Lighting(this, this.map.ambient, this.worldLayer);
    this.petals = new Petals(this, this.worldLayer);
    this.telegraphs = new Telegraphs(this, this.worldLayer);
    this.vfx = new Vfx(this, this.worldLayer, {
      locate: (id) => this.locate(id),
      flash: (id) => this.flash(id),
      playSound: (k, v, at) => this.audio.play(k, v, at),
      shake: (i, ms) => this.cameras.main.shake(ms, i),
      banner: (t, s) => this.hud.banner(t, s),
      isMe: (id) => id === this.room?.sessionId,
    });

    // Fog drifts in screen space on its own camera, so zoom doesn't stretch it.
    const { width, height } = this.scale;
    for (const [alpha, tint] of [[0.16, 0x9aa8c0], [0.1, 0x6a7890]] as const) {
      const fog = this.add.tileSprite(0, 0, width, height, "fx", "fog").setOrigin(0, 0).setAlpha(alpha).setTint(tint);
      this.overlayLayer.add(fog);
      this.fog.push(fog);
    }
    this.overlayCam = this.cameras.add(0, 0, width, height);
    this.overlayCam.ignore(this.worldLayer);
    this.cameras.main.ignore(this.overlayLayer);

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x050406);
    cam.postFX.addBloom(0xffffff, 1, 1, 1, 0.55, 4);
    cam.postFX.addVignette(0.5, 0.5, 0.88, 0.42);
    this.colorFx = cam.postFX.addColorMatrix();

    this.cinematic = new CinematicPlayer(this, {
      audio: this.audio,
      petals: (n) => this.petals.burst(n),
      baseZoom: () => this.baseZoom(),
      setDesaturation: (a) => {
        this.colorFx?.reset();
        if (a > 0) this.colorFx?.saturate(-a);
      },
      onEnd: () => this.hud.banner(this.map.name, "Akt I · Popiół na czole"),
    });

    const kb = this.input.keyboard!;
    const key = (code: number) => kb.addKey(code, false);
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = { up: key(K.UP), down: key(K.DOWN), left: key(K.LEFT), right: key(K.RIGHT), w: key(K.W), a: key(K.A), s: key(K.S), d: key(K.D), f: key(K.F) };
    kb.on("keydown-SPACE", () => {
      if (this.canAct()) this.me?.pred.pressDodge();
    });
    kb.on("keydown", (e: KeyboardEvent) => {
      const slot = { Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5 }[e.code];
      if (slot !== undefined) this.cast(slot);
    });
    kb.on("keydown-ESC", () => {
      if (!this.room) return;
      if (this.cinematic.playing) this.room.send(MSG.skip);
      else this.game.events.emit("escape");
    });
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.cast(1);
      else if (p.leftButtonDown()) this.cast(0);
    });
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.room && !this.cinematic.playing) this.userZoom = Phaser.Math.Clamp(this.userZoom * (dy > 0 ? 0.92 : 1.08), 0.55, 1.65);
    });
    this.scale.on("resize", (size: Phaser.Structs.Size) => {
      this.overlayCam.setSize(size.width, size.height);
      for (const f of this.fog) f.setSize(size.width, size.height);
    });

    // Preload the enemies' atlases in the background.
    for (const k of ["shambler", "runner", "bloated", "tapper"]) void ensureAtlas(this, greyedKey(k));

    // Title screen: the courtyard at night behind the menu.
    this.audio.playMusic("music_soramei_night", 4000);
    this.audio.playAmbience("amb_night_wind", 3000);
    this.game.events.emit("world-ready", this);
  }

  private baseZoom() {
    return Phaser.Math.Clamp(this.scale.height / 1080, 0.55, 1.6);
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  private canAct() {
    return !!this.me && !this.paused && !this.cinematic.playing && !this.me.view.downed;
  }

  private cast(slot: number) {
    if (!this.canAct()) return;
    this.me!.pred.pressCast(slot);
  }

  /** Called by main.ts once connected. */
  join(room: Room) {
    this.room = room;
    const $s = getStateCallbacks(room);
    const state = room.state as unknown as StateView;
    this.state = state;

    $s(state).players.onAdd((p: PlayerView, key: string) => {
      const mine = key === room.sessionId;
      const path = (p.path in PATHS ? p.path : "thorn") as PathId;
      const char = new Character(this, this.worldLayer, path, p.body, p.name, !mine, this.audio, (x, y) => this.groundAt(x, y));
      if (mine) {
        this.me = { char, pred: new Prediction(this.grid, p.x, p.y), view: p, lastCast: "", wasHp: p.hp };
        this.hud.setPath(path);
        $s(p).onChange(() => this.me?.pred.reconcile(p, p.lastSeq));
      } else {
        const interp = new Interpolation();
        const r: Remote = { char, interp, view: p, lastCast: "" };
        this.remotes.set(key, r);
        const push = () => interp.push({ t: this.time.now, x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: p.facing, dodgeT: p.dodgeT });
        push();
        $s(p).onChange(push);
      }
    });
    $s(state).players.onRemove((_p: PlayerView, key: string) => {
      this.remotes.get(key)?.char.destroy();
      this.remotes.delete(key);
    });
    $s(state).units.onAdd((u: UnitView, key: string) => {
      const sprite = new UnitSprite(this, this.worldLayer, u);
      this.units.set(key, sprite);
      const push = () => sprite.interp.push({ t: this.time.now, x: u.x, y: u.y, vx: u.vx, vy: u.vy, facing: u.facing, dodgeT: 0 });
      push();
      $s(u).onChange(push);
    });
    $s(state).units.onRemove((_u: UnitView, key: string) => {
      const s = this.units.get(key);
      if (!s) return;
      this.units.delete(key);
      s.die();
      if (s.view.faction === "greyed") {
        this.corpses.push(s);
        // The courtyard remembers the night, but not forever: the oldest bodies go first.
        if (this.corpses.length > 60) this.corpses.shift()!.destroy();
      }
    });
    room.onMessage(MSG.fx, (events: FxEvent[]) => {
      for (const e of events) this.vfx.handle(e);
    });
    // The cinematic is synced state: start it (at the partner's moment), end it, show skip votes.
    const syncCinematic = () => {
      if (state.cinematic && !this.cinematic.playing) this.cinematic.start(state.cinematic, state.cinematicElapsed);
      else if (!state.cinematic && this.cinematic.playing) this.cinematic.stop();
      if (state.cinematic) this.cinematic.setSkipVotes(state.skipVotes, state.players.size);
    };
    $s(state).listen("cinematic", syncCinematic);
    $s(state).listen("skipVotes", syncCinematic);
    $s(state).listen("phase", (phase: string) => {
      // The fight has its own music; the night theme returns when the gate holds.
      if (phase === "fight") this.audio.playMusic("music_gate_fight", 2500);
      else if (phase === "victory") this.audio.playMusic("music_soramei_night", 5000);
    });
    syncCinematic();
    $("hud").hidden = false;
    this.time.delayedCall(600, () => {
      if (!this.cinematic.playing) this.hud.banner(this.map.name, "Akt I · Popiół na czole");
    });
  }

  private groundAt(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return null;
    return this.map.groundTypes[this.map.ground[y * this.map.width + x]];
  }

  private locate(id: string) {
    if (this.me && id === this.room?.sessionId) {
      const p = this.me.pred.render();
      return { ...this.me.char.screen, wx: p.x, wy: p.y, height: this.me.char.height };
    }
    const r = this.remotes.get(id);
    if (r) {
      const w = screenToWorld(r.char.screen.x, r.char.screen.y);
      return { ...r.char.screen, wx: w.x, wy: w.y, height: r.char.height };
    }
    const u = this.units.get(id);
    if (u) {
      const w = screenToWorld(u.screen.x, u.screen.y);
      return { ...u.screen, wx: w.x, wy: w.y, height: u.height };
    }
    return null;
  }

  private flash(id: string) {
    if (this.me && id === this.room?.sessionId) this.me.char.playHit();
    this.remotes.get(id)?.char.playHit();
    this.units.get(id)?.hit();
  }

  private intent() {
    if (!this.canAct()) return { mx: 0, my: 0, dodge: false };
    const k = this.keys;
    const mx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const my = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    return { mx, my, dodge: false };
  }

  /** Aim: from your elf to the cursor, in world space. */
  private updateAim() {
    if (!this.me) return;
    const ptr = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    const w = screenToWorld(wp.x, wp.y + 40);
    const p = this.me.pred.render();
    this.aim.angle = Math.atan2(w.y - p.y, w.x - p.x);
    this.aim.dist = Math.hypot(w.x - p.x, w.y - p.y);
  }

  /** What the server will do to your movement (so prediction agrees). */
  private movement(v: PlayerView): { speedMul: number; canDodge: boolean } {
    const st = v.st ? v.st.split(",") : [];
    const path = PATHS[v.path as PathId] ?? PATHS.thorn;
    if (v.downed) return { speedMul: 0.25, canDodge: false };
    if (st.includes("rooted") || st.includes("stagger")) return { speedMul: 0, canDodge: false };
    let m = path.speed;
    if (st.includes("slow")) m *= 0.65;
    if (st.includes("haste")) m *= 1.25;
    return { speedMul: m, canDodge: true };
  }

  update(time: number, delta: number) {
    const cam = this.cameras.main;
    const watchers: { x: number; y: number; depth: number }[] = [];
    const lights: LightSource[] = [...this.props.lights];

    if (this.me && this.room) {
      const v = this.me.view;
      this.updateAim();
      const move = this.movement(v);
      const intent = { ...this.intent(), aim: this.aim.angle, aimDist: this.aim.dist, act: this.keys.f.isDown && !this.paused, ...move };
      // Phaser smooths `delta`; the simulation needs real elapsed time or it runs slow when frames drop.
      const frames = this.me.pred.tick(this.game.loop.rawDelta, intent, !this.cinematic.playing);
      if (frames.length) this.room.send(MSG.input, { frames });
      if (v.cast && v.cast !== this.me.lastCast) this.me.char.playCast(v.cast);
      this.me.lastCast = v.cast;
      const hurt = $("hurt");
      const low = v.hp < v.hpMax * 0.3 && !v.downed ? 0.45 + 0.15 * Math.sin(time / 180) : 0;
      if (v.hp < this.me.wasHp - 0.5 && !v.downed) {
        hurt.style.transition = "none";
        hurt.style.opacity = String(Math.min(1, 0.35 + (this.me.wasHp - v.hp) / v.hpMax * 3));
      } else {
        hurt.style.transition = "opacity 0.35s ease-out";
        hurt.style.opacity = String(low);
      }
      this.me.wasHp = v.hp;
      const pos = this.me.pred.render();
      const b = this.me.pred.body;
      this.me.char.update({ x: pos.x, y: pos.y, vx: b.vx, vy: b.vy, facing: b.facing, dodgeT: b.dodgeT, downed: v.downed }, delta);
      watchers.push({ ...this.me.char.screen, depth: this.me.char.depth });
      const s = this.me.char.screen;
      // A faint cold light that follows each player, so you never lose your elf in the dark.
      lights.push({ x: s.x, y: s.y - 30, radius: 260, color: 0xa8b0d8, intensity: 0.5, seed: 1 });
      this.hud.updateMe({ ...v, stamina: (100 * b.stamina) / BALANCE.player.staminaMax });
    }
    let partner: Remote | null = null;
    for (const r of this.remotes.values()) {
      partner = r;
      const s = r.interp.sample(time);
      if (!s) continue;
      if (r.view.cast && r.view.cast !== r.lastCast) r.char.playCast(r.view.cast);
      r.lastCast = r.view.cast;
      r.char.update({ ...s, downed: r.view.downed }, delta);
      watchers.push({ ...r.char.screen, depth: r.char.depth });
      lights.push({ x: r.char.screen.x, y: r.char.screen.y - 30, radius: 260, color: 0xa8b0d8, intensity: 0.5, seed: 2 });
    }
    this.hud.updatePartner(partner ? { name: partner.view.name, path: partner.view.path, hp: partner.view.hp, hpMax: partner.view.hpMax, downed: partner.view.downed } : null);

    // The Greyed: sprites, telegraphs, the boss bar, the odd groan.
    let boss: UnitView | null = null;
    const tele = [];
    for (const u of this.units.values()) {
      u.update(time, delta);
      // A faint cold glow on each of the dead, so grey bodies on grey stone still read at night.
      lights.push({ x: u.screen.x, y: u.screen.y - 30, radius: u.view.kind === "tapper" ? 240 : 150, color: 0x9aa4b8, intensity: 0.28, seed: 3 });
      if (u.view.kind === "tapper") boss = u.view;
      if (u.view.state === "windup" && u.view.atk) {
        const def = GREYED[(u.view.kind === "thrall" ? "shambler" : u.view.kind) as GreyedKind];
        const p = u.interp.sample(time);
        tele.push({ ...u.view, x: p?.x ?? u.view.x, y: p?.y ?? u.view.y, shape: u.view.faction === "greyed" ? def.attacks.find((a) => a.id === u.view.atk)?.shape : undefined });
      }
    }
    for (const c of this.corpses) c.update(time, delta);
    this.telegraphs.draw(tele);
    this.hud.updateBoss(boss ? { hp: boss.hp, hpMax: boss.hpMax } : null);
    if (this.units.size && time > this.groanAt) {
      const list = [...this.units.values()].filter((u) => u.view.faction === "greyed");
      const u = list[Math.floor(Math.random() * list.length)];
      if (u) this.audio.play(`sfx_groan_${Math.floor(Math.random() * 3)}`, 0.35, u.screen, Phaser.Math.FloatBetween(0.85, 1.1));
      this.groanAt = time + Phaser.Math.Between(2500, 6000);
    }

    $("hud").classList.toggle("cinematic", this.cinematic.playing);
    if (this.cinematic.playing) {
      this.cinematic.update();
    } else if (this.me) {
      const target = this.me.char.screen;
      let zoom = PLAY_ZOOM * this.baseZoom() * this.userZoom;
      const px = this.me.char.pixelScale;
      // Pixel art stays crisp only when each art pixel covers a whole number of screen pixels.
      // Rounded with a bias upward: a small window would otherwise drop to 1:1 and shrink everyone.
      if (px) zoom = Math.max(1, Math.round(zoom * px + 0.3)) / px;
      const next = Phaser.Math.Linear(cam.zoom, zoom, Math.min(1, delta / 250));
      cam.setZoom(Math.abs(next - zoom) < 0.004 ? zoom : next);
      cam.roundPixels = !!px && cam.zoom === zoom;
      // Lead the camera a little towards where you aim, as action RPGs do.
      const lead = worldToScreen(Math.cos(this.aim.angle) * 0.9, Math.sin(this.aim.angle) * 0.9);
      const k = Math.min(1, delta / 140);
      cam.centerOn(Phaser.Math.Linear(cam.midPoint.x, target.x + lead.x, k), Phaser.Math.Linear(cam.midPoint.y, target.y - 40 + lead.y, k));
    } else {
      // Title screen: a slow drift over the courtyard.
      this.titleT += delta / 1000;
      const p = worldToScreen(14 + Math.sin(this.titleT / 23) * 7, 12 + Math.cos(this.titleT / 31) * 6);
      cam.setZoom(0.62 * this.baseZoom());
      cam.roundPixels = false;
      cam.centerOn(p.x, p.y);
    }

    this.vfx.update(time);
    this.props.update(time, delta, watchers);
    this.petals.update(time, delta);
    this.lighting.render(time, lights);
    for (const [i, f] of this.fog.entries()) {
      f.tilePositionX = cam.scrollX * (0.6 + i * 0.3) + time * (0.012 + i * 0.008);
      f.tilePositionY = cam.scrollY * (0.6 + i * 0.3) + time * 0.004;
    }
  }
}
