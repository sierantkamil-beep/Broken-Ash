import Phaser from "phaser";
import {
  CollisionGrid,
  MAPS,
  MSG,
  START_MAP,
  worldToScreen,
  type AreaMap,
  type Body,
} from "@broken-ash/shared";
import { AudioDirector } from "../audio/AudioDirector";
import { CinematicPlayer } from "../cinematic/CinematicPlayer";
import { Character } from "../entities/Character";
import { getStateCallbacks, type Room } from "../net";
import { Interpolation } from "../net/Interpolation";
import { Prediction } from "../net/Prediction";
import { $ } from "../ui/dom";
import { GroundLayer } from "../world/GroundLayer";
import { Lighting, type LightSource } from "../world/Lighting";
import { Petals } from "../world/Petals";
import { PropLayer } from "../world/PropLayer";

/** The synced player fields (mirror of server/src/schema/WorldState.ts). */
interface PlayerView extends Body {
  id: string;
  name: string;
  look: string;
  lastSeq: number;
}

interface Remote {
  char: Character;
  interp: Interpolation;
}

/** Zoom during play, relative to a 1080 px tall window. */
const PLAY_ZOOM = 0.82;

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

  private room: Room | null = null;
  private me: { char: Character; pred: Prediction } | null = null;
  private remotes = new Map<string, Remote>();
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private userZoom = 1;
  private paused = false;
  private titleT = 0;

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
      onEnd: () => this.showAreaToast(),
    });

    const kb = this.input.keyboard!;
    const key = (code: number) => kb.addKey(code, false);
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = { up: key(K.UP), down: key(K.DOWN), left: key(K.LEFT), right: key(K.RIGHT), w: key(K.W), a: key(K.A), s: key(K.S), d: key(K.D) };
    kb.on("keydown-SPACE", () => {
      if (!this.cinematic.playing && !this.paused) this.me?.pred.pressDodge();
    });
    kb.on("keydown-ESC", () => {
      if (!this.room) return;
      if (this.cinematic.playing) this.room.send(MSG.skip);
      else this.game.events.emit("escape");
    });
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.room && !this.cinematic.playing) this.userZoom = Phaser.Math.Clamp(this.userZoom * (dy > 0 ? 0.92 : 1.08), 0.7, 1.35);
    });
    this.scale.on("resize", (size: Phaser.Structs.Size) => {
      this.overlayCam.setSize(size.width, size.height);
      for (const f of this.fog) f.setSize(size.width, size.height);
    });

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

  /** Called by main.ts once connected. */
  join(room: Room) {
    this.room = room;
    const $s = getStateCallbacks(room);
    const state = room.state as { players: Map<string, PlayerView>; cinematic: string; cinematicElapsed: number; skipVotes: number };

    $s(state).players.onAdd((p: PlayerView, key: string) => {
      const mine = key === room.sessionId;
      const char = new Character(this, this.worldLayer, p.look, p.name, !mine, this.audio, (x, y) => this.groundAt(x, y));
      if (mine) {
        this.me = { char, pred: new Prediction(this.grid, p.x, p.y) };
        $s(p).onChange(() => this.me?.pred.reconcile(p, p.lastSeq));
      } else {
        const interp = new Interpolation();
        this.remotes.set(key, { char, interp });
        const push = () => interp.push({ t: this.time.now, x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: p.facing, dodgeT: p.dodgeT });
        push();
        $s(p).onChange(push);
      }
    });
    $s(state).players.onRemove((_p: PlayerView, key: string) => {
      this.remotes.get(key)?.char.destroy();
      this.remotes.delete(key);
    });
    // The cinematic is synced state: start it (at the partner's moment), end it, show skip votes.
    const syncCinematic = () => {
      if (state.cinematic && !this.cinematic.playing) this.cinematic.start(state.cinematic, state.cinematicElapsed);
      else if (!state.cinematic && this.cinematic.playing) this.cinematic.stop();
      if (state.cinematic) this.cinematic.setSkipVotes(state.skipVotes, state.players.size);
    };
    $s(state).listen("cinematic", syncCinematic);
    $s(state).listen("skipVotes", syncCinematic);
    syncCinematic();
    $("hud").hidden = false;
    // If no cinematic starts right away, greet with the area name.
    this.time.delayedCall(600, () => {
      if (!this.cinematic.playing) this.showAreaToast();
    });
  }

  private showAreaToast() {
    const t = $("area-toast");
    (t.querySelector(".name") as HTMLElement).textContent = this.map.name;
    (t.querySelector(".sub") as HTMLElement).textContent = "Akt I · Popiół na czole";
    t.classList.add("show");
    this.time.delayedCall(4200, () => t.classList.remove("show"));
  }

  private groundAt(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return null;
    return this.map.groundTypes[this.map.ground[y * this.map.width + x]];
  }

  private intent() {
    if (this.paused || this.cinematic.playing) return { mx: 0, my: 0, dodge: false };
    const k = this.keys;
    const mx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const my = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    return { mx, my, dodge: false };
  }

  update(time: number, delta: number) {
    const cam = this.cameras.main;
    const watchers: { x: number; y: number; depth: number }[] = [];
    const lights: LightSource[] = [...this.props.lights];

    if (this.me && this.room) {
      // Phaser smooths `delta`; the simulation needs real elapsed time or it runs slow when frames drop.
      const frames = this.me.pred.tick(this.game.loop.rawDelta, this.intent(), !this.cinematic.playing);
      if (frames.length) this.room.send(MSG.input, { frames });
      const pos = this.me.pred.render();
      const b = this.me.pred.body;
      this.me.char.update({ x: pos.x, y: pos.y, vx: b.vx, vy: b.vy, facing: b.facing, dodgeT: b.dodgeT }, delta);
      watchers.push({ ...this.me.char.screen, depth: this.me.char.depth });
      const s = this.me.char.screen;
      // A faint cold light that follows each player, so you never lose your elf in the dark.
      lights.push({ x: s.x, y: s.y - 30, radius: 260, color: 0xa8b0d8, intensity: 0.5, seed: 1 });
      const stamina = $("stamina");
      (stamina.querySelector(".fill") as HTMLElement).style.width = `${b.stamina}%`;
      stamina.classList.toggle("low", b.stamina < 30);
    }
    for (const r of this.remotes.values()) {
      const s = r.interp.sample(time);
      if (!s) continue;
      r.char.update(s, delta);
      watchers.push({ ...r.char.screen, depth: r.char.depth });
      lights.push({ x: r.char.screen.x, y: r.char.screen.y - 30, radius: 260, color: 0xa8b0d8, intensity: 0.5, seed: 2 });
    }

    $("hud").classList.toggle("cinematic", this.cinematic.playing);
    if (this.cinematic.playing) {
      this.cinematic.update();
    } else if (this.me) {
      const target = this.me.char.screen;
      const zoom = PLAY_ZOOM * this.baseZoom() * this.userZoom;
      cam.setZoom(Phaser.Math.Linear(cam.zoom, zoom, Math.min(1, delta / 250)));
      const k = Math.min(1, delta / 140);
      cam.centerOn(Phaser.Math.Linear(cam.midPoint.x, target.x, k), Phaser.Math.Linear(cam.midPoint.y, target.y - 40, k));
    } else {
      // Title screen: a slow drift over the courtyard.
      this.titleT += delta / 1000;
      const p = worldToScreen(14 + Math.sin(this.titleT / 23) * 7, 12 + Math.cos(this.titleT / 31) * 6);
      cam.setZoom(0.62 * this.baseZoom());
      cam.centerOn(p.x, p.y);
    }

    this.props.update(time, delta, watchers);
    this.petals.update(time, delta);
    this.lighting.render(time, lights);
    for (const [i, f] of this.fog.entries()) {
      f.tilePositionX = cam.scrollX * (0.6 + i * 0.3) + time * (0.012 + i * 0.008);
      f.tilePositionY = cam.scrollY * (0.6 + i * 0.3) + time * 0.004;
    }
  }
}
