import Phaser from "phaser";
import { CELL } from "@broken-ash/shared";
import { ART } from "./fxkit";

/** Under the blood, over the ground. */
const DEPTH_SCARS = -9.6e5;

/**
 * What skills leave on the ground: scorch from fire, cracks from heavy blows, ink and soot, burnt
 * talisman ash. Like the blood layer (gore.ts) it's one render texture over the map at art
 * resolution, so every mark stays for the visit at no cost per frame.
 */
export class Scars {
  private readonly rt: Phaser.GameObjects.RenderTexture;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, mapW: number, mapH: number) {
    this.rt = scene.add.renderTexture(0, 0, (mapW * CELL) / ART, (mapH * CELL) / ART).setOrigin(0, 0).setScale(ART).setDepth(DEPTH_SCARS);
    this.rt.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    layer.add(this.rt);
  }

  destroy() {
    this.rt.destroy();
  }

  /** One art pixel (or a few) of colour at a screen point. */
  dot(x: number, y: number, size: number, color: number, alpha = 0.9) {
    this.rt.stamp("px", undefined, Math.round(x / ART), Math.round(y / ART), { scale: size, tint: color, alpha, originX: 0.5, originY: 0.5 });
  }

  /** A blot: a ragged disc of colour, densest in the middle (scorch, ink, soot). */
  blot(x: number, y: number, radiusPx: number, color: number, alpha = 0.55) {
    const r = radiusPx / ART;
    const n = Math.round(r * r * 1.2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 0.7) * r;
      this.dot(x + Math.cos(a) * d * ART, y + Math.sin(a) * d * ART * 0.85, Math.random() < 0.3 ? 2 : 1, color, alpha * (1 - (d / r) * 0.6));
    }
  }

  /** A crack in the ground: a jagged dark line with a lighter lip, branching now and then. */
  crack(x0: number, y0: number, x1: number, y1: number, branch = true) {
    const len = Math.hypot(x1 - x0, y1 - y0) / ART;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    let x = x0;
    let y = y0;
    let wob = 0;
    for (let i = 0; i < len; i++) {
      wob += (Math.random() - 0.5) * 0.9;
      wob *= 0.8;
      x += Math.cos(ang + wob) * ART;
      y += Math.sin(ang + wob) * ART;
      this.dot(x, y, 1, 0x0c0a08, 0.95);
      this.dot(x + ART, y - ART, 1, 0x8a7f72, 0.35);
      if (branch && Math.random() < 0.06) this.crack(x, y, x + Math.cos(ang + (Math.random() < 0.5 ? 0.8 : -0.8)) * len * ART * 0.25, y + Math.sin(ang + (Math.random() < 0.5 ? 0.8 : -0.8)) * len * ART * 0.25, false);
    }
  }
}
