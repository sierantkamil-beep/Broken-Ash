import Phaser from "phaser";
import { CELL, DEFAULT_LOOKS, worldToScreen, type AreaMap, type Npc } from "@broken-ash/shared";
import { Character } from "../entities/Character";
import type { AudioDirector } from "../audio/AudioDirector";

/**
 * The living parts of an area beyond the fight: the people you can talk to (drawn as characters,
 * dressed like their path, with a name; "F — rozmowa" when you're close), and the ways out (a
 * glowing threshold with where it leads, dimmed while it's closed: an ambush still on, or a story
 * flag not yet earned).
 */
export class AreaLife {
  private npcs = new Map<string, { def: Npc; char: Character }>();
  private exits: { g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; needs?: string }[] = [];
  private prompt: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly map: AreaMap,
    private readonly audio: AudioDirector,
  ) {
    this.prompt = scene.add
      .text(0, 0, "F — rozmowa", { fontFamily: "Cormorant Garamond", fontSize: "18px", color: "#f1e7d9", stroke: "#000", strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(9.7e6)
      .setVisible(false);
    layer.add(this.prompt);
    for (const x of map.exits ?? []) {
      const g = scene.add.graphics().setDepth(9.511e6);
      const r = x.region;
      const a = worldToScreen(r.x, r.y);
      const w = r.w * CELL;
      const h = r.h * CELL;
      // A threshold of light on the ground, brightest at its edge.
      for (let i = 0; i < 4; i++) {
        g.fillStyle(0xe8c070, 0.05 + i * 0.03);
        g.fillRect(a.x + i * 6, a.y + i * 6, w - i * 12, h - i * 12);
      }
      g.lineStyle(2, 0xe8c070, 0.7).strokeRect(a.x, a.y, w, h);
      layer.add(g);
      const label = scene.add
        .text(a.x + w / 2, a.y + h / 2, `→ ${x.label}`, { fontFamily: "Cormorant Garamond", fontSize: "20px", color: "#f1e7d9", stroke: "#000", strokeThickness: 4 })
        .setOrigin(0.5)
        .setResolution(2)
        .setDepth(9.7e6);
      layer.add(label);
      this.exits.push({ g, label, needs: x.needs });
    }
  }

  /** Each frame: who's present (by the story flags), exits open or closed, the talk prompt. */
  update(flags: Set<string>, fighting: boolean, me: { x: number; y: number } | null, delta: number) {
    const present = (this.map.npcs ?? []).filter((n) => (!n.needs || flags.has(n.needs)) && (!n.unless || !flags.has(n.unless)));
    for (const [id, n] of this.npcs) if (!present.some((p) => p.id === id)) {
      n.char.destroy();
      this.npcs.delete(id);
    }
    let near: Npc | null = null;
    for (const def of present) {
      let n = this.npcs.get(def.id);
      if (!n) {
        const char = new Character(this.scene, this.layer, def.path, def.body, def.name, true, this.audio, () => null);
        char.setLook(DEFAULT_LOOKS[def.path]);
        n = { def, char };
        this.npcs.set(def.id, n);
      }
      n.char.update({ x: def.x, y: def.y, vx: 0, vy: 0, facing: def.facing, dodgeT: 0 }, delta);
      if (me && def.scene && Math.hypot(me.x - def.x, me.y - def.y) <= 1.6) near = def;
    }
    if (near && !fighting) {
      const s = worldToScreen(near.x, near.y);
      this.prompt.setPosition(s.x, s.y - 150).setVisible(true).setScale(1 / this.scene.cameras.main.zoom);
    } else this.prompt.setVisible(false);
    for (const x of this.exits) {
      const open = !fighting && (!x.needs || flags.has(x.needs));
      x.g.setAlpha(open ? 1 : 0.25);
      x.label.setAlpha(open ? 1 : 0.4).setScale(1 / this.scene.cameras.main.zoom);
    }
  }

  destroy() {
    for (const n of this.npcs.values()) n.char.destroy();
    this.npcs.clear();
    for (const x of this.exits) {
      x.g.destroy();
      x.label.destroy();
    }
    this.prompt.destroy();
  }
}
