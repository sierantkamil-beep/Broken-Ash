import Phaser from "phaser";
import { RARITY, worldToScreen } from "@broken-ash/shared";
import { goldIcon, itemIcon } from "../ui/itemIcons";

/** A piece of loot as synced (server/src/schema/WorldState.ts LootState). */
export interface LootView {
  id: string;
  x: number;
  y: number;
  base: string;
  rarity: string;
  name: string;
  gold: number;
}

const BEAM: Record<string, number> = { common: 0x9a9590, fine: 0xe8e2d6, rare: 0x5a9ae0, ashen: 0xe0442a, gold: 0xe0c070 };

/**
 * Loot on the ground: the item's picture lying there, a column of light in its rarity's colour (taller
 * for better things, so a rare drop is seen across a fight), its name, and "F" when you're close.
 */
export class LootLayer {
  private readonly shown = new Map<string, { img: Phaser.GameObjects.Image; beam: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; v: LootView; born: number }>();
  private readonly prompt: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {
    this.prompt = scene.add
      .text(0, 0, "F — podnieś", { fontFamily: "Cormorant Garamond", fontSize: "17px", color: "#f1e7d9", stroke: "#000", strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(9.7e6)
      .setVisible(false);
    layer.add(this.prompt);
  }

  private texture(v: LootView): string {
    const key = v.gold ? "loot:gold" : `loot:${v.base}:${v.rarity}`;
    if (!this.scene.textures.exists(key)) {
      const c = v.gold ? goldIcon(28) : itemIcon({ base: v.base, rarity: v.rarity }, 34, 34);
      this.scene.textures.addCanvas(key, c);
      // Weapons are drawn a moment later (the gear sheet loads asynchronously): refresh then.
      if (!v.gold) window.setTimeout(() => (this.scene.textures.get(key) as Phaser.Textures.CanvasTexture | undefined)?.refresh?.(), 400);
    }
    return key;
  }

  /** Each frame: what lies on the ground now, where you stand. */
  update(loot: Iterable<LootView>, me: { x: number; y: number } | null, time: number, zoom: number) {
    const seen = new Set<string>();
    let nearest: { v: LootView; d: number } | null = null;
    for (const v of loot) {
      seen.add(v.id);
      let s = this.shown.get(v.id);
      if (!s) {
        const p = worldToScreen(v.x, v.y);
        const img = this.scene.add.image(p.x, p.y - 8, this.texture(v)).setDepth(p.y * 100 - 10);
        const beam = this.scene.add.graphics().setDepth(p.y * 100 - 11).setBlendMode(Phaser.BlendModes.ADD);
        const color = RARITY[v.rarity as keyof typeof RARITY]?.color ?? "#e0c070";
        const label = this.scene.add
          .text(p.x, p.y - 30, v.name, { fontFamily: "Cormorant Garamond", fontSize: "15px", color, stroke: "#000", strokeThickness: 4 })
          .setOrigin(0.5, 1)
          .setResolution(2)
          .setDepth(9.69e6);
        this.layer.add([beam, img, label]);
        s = { img, beam, label, v, born: time };
        this.shown.set(v.id, s);
      }
      // A drop arcs in, then bobs; the beam breathes.
      const p = worldToScreen(v.x, v.y);
      const age = (time - s.born) / 1000;
      const land = Math.min(1, age / 0.35);
      const bob = Math.sin(time / 300 + v.x) * 2;
      s.img.setPosition(Math.round(p.x), Math.round(p.y - 8 - Math.sin(land * Math.PI) * 30 + bob * land));
      const tall = v.gold ? 20 : { common: 26, fine: 44, rare: 80, ashen: 120 }[v.rarity] ?? 30;
      const c = BEAM[v.rarity] ?? 0xffffff;
      const a = 0.18 + Math.sin(time / 400 + v.y) * 0.05;
      s.beam.clear();
      for (let i = 0; i < 6; i++) {
        s.beam.fillStyle(c, a * (1 - i / 6));
        s.beam.fillRect(p.x - 5 + i * 0.6, p.y - 6 - tall * (i / 6) - tall / 6, 10 - i * 1.2, tall / 6);
      }
      s.beam.fillStyle(c, a * 0.8).fillEllipse(p.x, p.y - 4, 26, 10);
      const d = me ? Math.hypot(me.x - v.x, me.y - v.y) : 99;
      // Names: always for the good things, close up for the rest.
      s.label.setVisible(v.rarity === "rare" || v.rarity === "ashen" || d < 3).setScale(1 / zoom);
      if (!v.gold && d <= 1.3 && (!nearest || d < nearest.d)) nearest = { v, d };
    }
    for (const [id, s] of this.shown)
      if (!seen.has(id)) {
        s.img.destroy();
        s.beam.destroy();
        s.label.destroy();
        this.shown.delete(id);
      }
    if (nearest) {
      const p = worldToScreen(nearest.v.x, nearest.v.y);
      this.prompt.setPosition(p.x, p.y - 48).setScale(1 / zoom).setVisible(true);
    } else this.prompt.setVisible(false);
  }

  destroy() {
    for (const s of this.shown.values()) {
      s.img.destroy();
      s.beam.destroy();
      s.label.destroy();
    }
    this.shown.clear();
    this.prompt.destroy();
  }
}
