import Phaser from "phaser";
import { CELL, depthOf, PROPS, worldToScreen, Z_PX, type AreaMap, type PropDef } from "@broken-ash/shared";
import { settings } from "../settings";
import type { LightSource } from "./Lighting";
import { hasFrame } from "./frames";

/** Props tall enough to hide a player standing behind them; they fade while someone is back there. */
const OCCLUDERS = new Set(["blossom_tree", "shrine", "gate_vermilion", "bamboo", "banner", "paper_lantern", "pine", "dead_tree", "tent", "house_burnt", "rockwall", "support", "pump"]);
const DEPTH_FLAT = -1e6;

interface Occluder {
  img: Phaser.GameObjects.Image;
  depth: number;
}

export class PropLayer {
  readonly lights: LightSource[] = [];
  private readonly occluders: Occluder[] = [];
  private readonly glows: { img: Phaser.GameObjects.Image; seed: number; base: number }[] = [];
  /** Everything this layer placed, so a new area can clear it. */
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  /** Gates: props that stand only until a story flag is set. */
  private readonly gates: { img: Phaser.GameObjects.Image; until: string }[] = [];
  /** Props that appear once a flag is set (an opened chest). */
  private readonly reveals: { img: Phaser.GameObjects.Image; after: string }[] = [];

  constructor(private readonly scene: Phaser.Scene, map: AreaMap, layer: Phaser.GameObjects.Layer, flags: ReadonlySet<string> = new Set()) {
    map.props.forEach((p, i) => {
      const def: PropDef = PROPS[p.kind];
      if (def.flat && settings.gore === "reduced") return;
      const frame = `${p.kind}_${p.variant ?? 0}`;
      if (!hasFrame(scene, "props", frame)) return;
      if (p.until && flags.has(p.until)) return;
      const hidden = !!p.after && !flags.has(p.after);
      const cx = p.x + def.w / 2;
      const cy = p.y + def.h / 2;
      const s = worldToScreen(cx, cy);
      const depth = def.flat ? DEPTH_FLAT + depthOf(cx, cy) : depthOf(cx, cy);
      const img = scene.add.image(s.x, s.y, "props", frame).setDepth(depth).setFlipX(!!p.flip);
      layer.add(img);
      this.objects.push(img);
      if (OCCLUDERS.has(p.kind)) this.occluders.push({ img, depth });
      if (p.until) this.gates.push({ img, until: p.until });
      if (hidden) {
        img.setVisible(false);
        this.reveals.push({ img, after: p.after! });
      }
      if (def.light) {
        const l = worldToScreen(cx, cy, def.light.z);
        this.lights.push({ x: l.x, y: s.y - def.light.z * Z_PX * 0.2, radius: def.light.radius * CELL, color: def.light.color, intensity: def.light.intensity ?? 1, flicker: def.light.flicker, seed: i * 7.3 });
        if (def.light.hidden) return;
        // A soft additive halo at the flame itself.
        const glow = scene.add.image(l.x, l.y, "fx", "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(def.light.color).setDepth(9.6e6).setScale(0.55).setAlpha(0.55);
        layer.add(glow);
        this.objects.push(glow);
        this.glows.push({ img: glow, seed: i * 7.3, base: 0.55 });
      }
    });
  }

  /** The story moved on: gates whose flag is now set sink and fade away. */
  setFlags(flags: ReadonlySet<string>) {
    for (let i = this.reveals.length - 1; i >= 0; i--) {
      const r = this.reveals[i];
      if (!flags.has(r.after)) continue;
      this.reveals.splice(i, 1);
      r.img.setVisible(true);
    }
    for (let i = this.gates.length - 1; i >= 0; i--) {
      const g = this.gates[i];
      if (!flags.has(g.until)) continue;
      this.gates.splice(i, 1);
      // A chest is swapped for its open twin at once; gates and bars sink away.
      if (g.img.frame.name.startsWith("chest_")) {
        g.img.setVisible(false);
        continue;
      }
      this.scene.tweens.add({ targets: g.img, alpha: 0, y: g.img.y + 24, duration: 900, ease: "Cubic.easeIn", onComplete: () => g.img.setVisible(false) });
    }
  }

  destroy() {
    for (const o of this.objects) o.destroy();
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
