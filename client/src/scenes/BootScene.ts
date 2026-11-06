import Phaser from "phaser";
import { AUDIO_KEYS } from "../audio/AudioDirector";

/** Loads the atlases (rendered by tools/art) and the sounds (tools/audio), with a thin progress line. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 160, height / 2, 1, 2, 0xb8261a).setOrigin(0, 0.5);
    this.load.on("progress", (p: number) => bar.setSize(320 * p, 2));
    for (const atlas of ["ground", "props", "fx"]) this.load.atlas(atlas, `assets/sprites/${atlas}.png`, `assets/sprites/${atlas}.json`);
    // Gear drawn pixel by pixel (tools/pixellab/parts.py): weapons, head pieces, shoulders, capes.
    this.load.atlas("gear", "assets/gear/gear.webp", "assets/gear/gear.json");
    for (const key of AUDIO_KEYS) this.load.audio(key, `assets/audio/${key}.ogg`);
  }

  create() {
    this.scene.start("world");
  }
}
