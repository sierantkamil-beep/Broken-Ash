import Phaser from "phaser";
import { CELL, depthOf, PROPS, worldToScreen, Z_PX, type AreaMap, type PropDef } from "@broken-ash/shared";
import { settings } from "../settings";
import type { LightSource } from "./Lighting";
import { hasFrame } from "./frames";

/** Props tall enough to hide a player standing behind them; they fade while someone is back there. */
const OCCLUDERS = new Set(["blossom_tree", "shrine", "gate_vermilion", "bamboo", "banner", "paper_lantern"]);
const DEPTH_FLAT = -1e6;

interface Occluder {
  img: Phaser.GameObjects.Image;
  depth: number;
}

export class PropLayer {
  readonly lights: LightSource[] = [];
  private readonly occluders: Occluder[] = [];
  private readonly glows: { img: Phaser.GameObjects.Image; seed: number; base: number }[] = [];

  constructor(scene: Phaser.Scene, map: AreaMap, layer: Phaser.GameObjects.Layer) {
    map.props.forEach((p, i) => {
      const def: PropDef = PROPS[p.kind];
      if (def.flat && settings.gore === "reduced") return;
      const frame = `${p.kind}_${p.variant ?? 0}`;
      if (!hasFrame(scene, "props", frame)) return;
      const cx = p.x + def.w / 2;
      const cy = p.y + def.h / 2;
      const s = worldToScreen(cx, cy);
      const depth = def.flat ? DEPTH_FLAT + depthOf(cx, cy) : depthOf(cx, cy);
      const img = scene.add.image(s.x, s.y, "props", frame).setDepth(depth).setFlipX(!!p.flip);
      layer.add(img);
      if (OCCLUDERS.has(p.kind)) this.occluders.push({ img, depth });
      if (def.light) {
        const l = worldToScreen(cx, cy, def.light.z);
        this.lights.push({ x: l.x, y: s.y - def.light.z * Z_PX * 0.2, radius: def.light.radius * CELL, color: def.light.color, intensity: def.light.intensity ?? 1, flicker: def.light.flicker, seed: i * 7.3 });
        if (def.light.hidden) return;
        // A soft additive halo at the flame itself.
        const glow = scene.add.image(l.x, l.y, "fx", "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(def.light.color).setDepth(9.6e6).setScale(0.55).setAlpha(0.55);
        layer.add(glow);
        this.glows.push({ img: glow, seed: i * 7.3, base: 0.55 });
      }
    });
  }

  /** Fades tall props that stand in front of any of the given (screen-space) points. */
  update(time: number, delta: number, watchers: { x: number; y: number; depth: number }[]) {
    for (const o of this.occluders) {
      const b = o.img.getBounds();
      const hidden = watchers.some((w) => w.depth < o.depth && b.contains(w.x, w.y - 60) && w.y < o.img.y + 10);
      const target = hidden ? 0.42 : 1;
      o.img.setAlpha(Phaser.Math.Linear(o.img.alpha, target, Math.min(1, delta / 120)));
    }
    for (const g of this.glows) g.img.setAlpha(g.base * (1 + Math.sin(time / 83 + g.seed) * 0.08 + Math.sin(time / 29 + g.seed * 3) * 0.06));
  }
}
