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
    // The map in pixel art (tools/art/pixelate.py over the Blender renders), like the characters.
    for (const atlas of ["ground", "props"]) this.load.atlas(atlas, `assets/sprites/${atlas}_px.png`, `assets/sprites/${atlas}_px.json`);
    this.load.atlas("fx", "assets/sprites/fx.png", "assets/sprites/fx.json");
    // Gear drawn pixel by pixel (tools/pixellab/parts.py): weapons, head pieces, shoulders, capes.
    this.load.atlas("gear", "assets/gear/gear.webp", "assets/gear/gear.json");
    for (const key of AUDIO_KEYS) this.load.audio(key, `assets/audio/${key}.ogg`);
  }

  create() {
    // Pixel art stays crisp: nearest sampling for the map and the gear.
    for (const key of ["ground", "props", "gear"]) if (this.textures.exists(key)) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.scene.start("world");
  }
}
