import { describe, expect, it } from "vitest";
import { PROPS } from "../data/props.js";
import { CollisionGrid } from "../map.js";
import { BALANCE } from "../balance.js";
import { overlaps } from "../movement.js";
import { MAPS } from "./index.js";
import { CINEMATICS } from "../data/cinematics.js";

/** Cells reachable on foot from a start cell (4-connected over unblocked cells). */
function reachable(grid: CollisionGrid, sx: number, sy: number): Set<number> {
  const seen = new Set<number>([sy * grid.width + sx]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const k = ny * grid.width + nx;
      if (!grid.blocked(nx, ny) && !seen.has(k)) {
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
  }
  return seen;
}

describe.each(Object.values(MAPS))("map $id", (map) => {
  const grid = CollisionGrid.fromMap(map);

  it("has a consistent ground layer", () => {
    expect(map.ground.length).toBe(map.width * map.height);
    expect(Math.max(...map.ground)).toBeLessThan(map.groundTypes.length);
  });

  it("keeps every prop inside the map", () => {
    for (const p of map.props) {
      const d = PROPS[p.kind];
      expect(p.x >= 0 && p.y >= 0 && p.x + d.w <= map.width && p.y + d.h <= map.height, `${p.kind} at ${p.x},${p.y}`).toBe(true);
      expect((p.variant ?? 0) < d.variants, `${p.kind} variant`).toBe(true);
    }
  });

  it("spawns players on free ground, all reachable from each other", () => {
    const first = reachable(grid, Math.floor(map.spawns[0].x), Math.floor(map.spawns[0].y));
    for (const s of map.spawns) {
      expect(overlaps(s.x, s.y, BALANCE.player.radius, grid), `spawn ${s.x},${s.y}`).toBe(false);
      expect(first.has(Math.floor(s.y) * map.width + Math.floor(s.x))).toBe(true);
    }
  });

  it("leaves most of the open ground reachable (no sealed-off pockets)", () => {
    const area = reachable(grid, Math.floor(map.spawns[0].x), Math.floor(map.spawns[0].y));
    let free = 0;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (!grid.blocked(x, y)) free++;
    expect(area.size / free).toBeGreaterThan(0.97);
  });

  it("references an existing intro cinematic", () => {
    if (map.introCinematic) expect(CINEMATICS[map.introCinematic]).toBeDefined();
  });
});
