import Phaser from "phaser";
import { CELL, worldToScreen, type AreaMap, type GroundType } from "@broken-ash/shared";
import { framePivot } from "./frames";

/**
 * Which ground draws its soft, feathered rim over which: higher priority creeps over lower
 * (moss over flagstones, flagstones over the pond's edge). Water and void stay crisp.
 */
const PRIORITY: Record<GroundType, number> = { void: -1, water: 0, paving: 1, gravel: 2, dirt: 3, moss: 4 };
const SUPER = 4;

/** Bakes the whole ground into one render texture once: hard squares first, then soft rims by priority. */
export class GroundLayer {
  readonly rt: Phaser.GameObjects.RenderTexture;

  constructor(scene: Phaser.Scene, map: AreaMap) {
    const margin = CELL;
    const left = -margin;
    const top = -margin;
    const width = map.width * CELL + margin * 2;
    const height = map.height * CELL + margin * 2;
    this.rt = scene.add.renderTexture(left, top, width, height).setOrigin(0, 0).setDepth(-1e9);

    const typeAt = (x: number, y: number): GroundType | null =>
      x < 0 || y < 0 || x >= map.width || y >= map.height ? null : map.groundTypes[map.ground[y * map.width + x]];

    const draw = (frame: string, x: number, y: number) => {
      const p = framePivot(scene, "ground", frame);
      if (!p) return;
      const s = worldToScreen(x + 0.5, y + 0.5);
      this.rt.batchDrawFrame("ground", frame, s.x - left - p.x, s.y - top - p.y);
    };

    this.rt.beginDraw();
    // Row by row (top to bottom) so the soft rims of nearer cells overlap correctly.
    const cells: [number, number][] = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) cells.push([x, y]);
    for (const [x, y] of cells) {
      const t = typeAt(x, y);
      if (t && t !== "void") draw(`${t}_${x % SUPER}_${y % SUPER}`, x, y);
    }
    const types = [...new Set(map.groundTypes)].filter((t) => t !== "water" && t !== "void").sort((a, b) => PRIORITY[a] - PRIORITY[b]);
    for (const t of types) {
      for (const [x, y] of cells) {
        if (typeAt(x, y) !== t) continue;
        const borders = [-1, 0, 1].some((dy) =>
          [-1, 0, 1].some((dx) => {
            const n = typeAt(x + dx, y + dy);
            return n !== null && PRIORITY[n] < PRIORITY[t];
          }),
        );
        if (borders) draw(`${t}_${x % SUPER}_${y % SUPER}_soft`, x, y);
      }
    }
    this.rt.endDraw();
  }
}
