import Phaser from "phaser";
import { CINEMATICS, evaluateCinematic, eventsBetween, worldToScreen, type Cinematic } from "@broken-ash/shared";
import type { AudioDirector } from "../audio/AudioDirector";
import { $ } from "../ui/dom";

export interface CinematicHooks {
  audio: AudioDirector;
  petals: (amount: number) => void;
  /** Camera zoom that 1.0 in the data corresponds to (scales with the window height). */
  baseZoom: () => number;
  setDesaturation: (amount: number) => void;
  onEnd: () => void;
}

/**
 * Plays a cinematic timeline from shared data: drives the camera, the DOM overlay (letterbox,
 * fades, title card, subtitles) and fires sounds/shakes/flashes as their moments pass.
 * Seekable: a partner who joins mid-scene starts at the same moment.
 */
export class CinematicPlayer {
  private current: Cinematic | null = null;
  private startedAt = 0;
  private lastT = 0;
  private skipVotes = { votes: 0, needed: 2 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: CinematicHooks,
  ) {}

  get playing() {
    return this.current !== null;
  }

  start(id: string, elapsedMs: number) {
    const c = CINEMATICS[id];
    if (!c) return;
    this.current = c;
    this.startedAt = this.scene.time.now - elapsedMs;
    this.lastT = elapsedMs;
    this.skipVotes = { votes: 0, needed: 2 };
    $("cinema").hidden = false;
    $("cin-skip").hidden = false;
    this.renderSkip();
    // Joining late: start the music that would already be playing.
    const music = c.events.filter((e) => e.kind === "music" && e.t <= elapsedMs).pop();
    if (music && music.kind === "music") this.hooks.audio.playMusic(music.key, 1500);
    if (elapsedMs === 0) for (const e of c.events.filter((e) => e.t === 0)) this.fire(e);
  }

  setSkipVotes(votes: number, needed: number) {
    this.skipVotes = { votes, needed };
    this.renderSkip();
  }

  private renderSkip() {
    const { votes, needed } = this.skipVotes;
    $("cin-skip").textContent = votes > 0 ? `Pomiń: Esc (${votes}/${needed})` : "Pomiń: Esc";
  }

  /** The server ended (or both of you skipped) the scene. */
  stop() {
    if (!this.current) return;
    this.current = null;
    this.hooks.setDesaturation(0);
    const bars = document.querySelectorAll<HTMLElement>("#cinema .bar");
    // Animate the bars and any fade away rather than cutting.
    for (const b of bars) {
      b.style.transition = "transform 0.7s ease";
      b.style.transform = "scaleY(0)";
    }
    for (const id of ["cin-fade", "cin-subtitle", "cin-title"]) {
      $(id).style.transition = "opacity 0.6s";
      $(id).style.opacity = "0";
    }
    $("cin-skip").hidden = true;
    this.hooks.onEnd();
    setTimeout(() => {
      for (const b of bars) b.style.transition = "none";
      for (const id of ["cin-fade", "cin-subtitle", "cin-title"]) $(id).style.transition = "none";
    }, 800);
  }

  update() {
    const c = this.current;
    if (!c) return;
    const t = this.scene.time.now - this.startedAt;
    const f = evaluateCinematic(c, t);
    for (const e of eventsBetween(c, this.lastT, t)) this.fire(e);
    this.lastT = t;

    const cam = this.scene.cameras.main;
    const p = worldToScreen(f.camera.x, f.camera.y);
    cam.setZoom(f.camera.zoom * this.hooks.baseZoom());
    cam.centerOn(p.x, p.y);

    for (const b of document.querySelectorAll<HTMLElement>("#cinema .bar")) b.style.transform = `scaleY(${f.letterbox})`;
    $("cin-fade").style.opacity = String(f.fade);
    const sub = $("cin-subtitle");
    sub.style.opacity = String(f.subtitleAlpha);
    if (f.subtitle) {
      (sub.querySelector(".speaker") as HTMLElement).textContent = f.subtitle.speaker ?? "";
      (sub.querySelector(".line") as HTMLElement).textContent = f.subtitle.text;
    }
    const title = $("cin-title");
    title.style.opacity = String(f.titleAlpha);
    if (f.title) {
      (title.querySelector(".title") as HTMLElement).textContent = f.title.title;
      (title.querySelector(".sub") as HTMLElement).textContent = f.title.subtitle ?? "";
    }
    this.hooks.setDesaturation((c.desaturate ?? 0) * f.letterbox);
    // The server ends the scene; locally we only hold the last frame until it says so.
  }

  private fire(e: Cinematic["events"][number]) {
    switch (e.kind) {
      case "sound":
        this.hooks.audio.play(e.key, e.volume ?? 1);
        break;
      case "music":
        this.hooks.audio.playMusic(e.key, 2500);
        break;
      case "shake":
        this.scene.cameras.main.shake(e.dur, e.intensity);
        break;
      case "flash": {
        const el = $("cin-flash");
        el.style.transition = "none";
        el.style.background = `#${e.color.toString(16).padStart(6, "0")}`;
        el.style.opacity = "0.85";
        requestAnimationFrame(() => {
          el.style.transition = `opacity ${e.dur}ms ease-out`;
          el.style.opacity = "0";
        });
        break;
      }
      case "petals":
        this.hooks.petals(e.amount);
        break;
    }
  }
}
