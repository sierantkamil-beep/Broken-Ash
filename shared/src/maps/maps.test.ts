import { describe, expect, it } from "vitest";
import { PROPS } from "../data/props.js";
import { CollisionGrid } from "../map.js";
import { BALANCE } from "../balance.js";
import { overlaps } from "../movement.js";
import { MAPS } from "./index.js";
import { CINEMATICS } from "../data/cinematics.js";
import { ITEM_BASES } from "../data/items.js";

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
  // Reachability with every gate open: the closed ones are what the story opens.
  const grid = CollisionGrid.fromMap(map, "open");

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

  it("links exits to existing areas and spawns, reachable on foot", () => {
    const area = reachable(grid, Math.floor(map.spawns[0].x), Math.floor(map.spawns[0].y));
    for (const x of map.exits ?? []) {
      expect(MAPS[x.to], x.to).toBeDefined();
      expect(x.spawn).toBeLessThan(MAPS[x.to].spawns.length);
      let touches = false;
      for (let y = Math.floor(x.region.y); y < x.region.y + x.region.h; y++)
        for (let cx = Math.floor(x.region.x); cx < x.region.x + x.region.w; cx++) if (area.has(y * map.width + cx)) touches = true;
      expect(touches, `exit to ${x.to}`).toBe(true);
    }
  });

  it("places encounters, NPCs, levers and the bonfire on reachable ground, with existing scenes", () => {
    const area = reachable(grid, Math.floor(map.spawns[0].x), Math.floor(map.spawns[0].y));
    const at = (x: number, y: number) => area.has(Math.floor(y) * map.width + Math.floor(x));
    for (const e of map.encounters ?? []) {
      for (const s of e.spawnAt) expect(at(s.x, s.y), `${e.id} spawn ${s.x},${s.y}`).toBe(true);
      if (e.clearCinematic) expect(CINEMATICS[e.clearCinematic], e.clearCinematic).toBeDefined();
    }
    for (const n of map.npcs ?? []) if (n.scene) expect(CINEMATICS[n.scene], n.scene).toBeDefined();
    for (const l of map.levers ?? []) {
      // Someone must be able to stand within talking range of the lever.
      let ok = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(l.x + dx, l.y + dy) && Math.hypot(dx, dy) <= BALANCE.combat.talkRange) ok = true;
      expect(ok, `lever ${l.x},${l.y}`).toBe(true);
    }
    if (map.bonfire) expect(overlaps(map.bonfire.x, map.bonfire.y, BALANCE.player.radius, grid)).toBe(false);
    for (const c of map.caches ?? []) {
      let ok = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(c.x + dx, c.y + dy) && Math.hypot(dx, dy) <= BALANCE.combat.talkRange) ok = true;
      expect(ok, `cache ${c.id}`).toBe(true);
      for (const b of c.items ?? []) expect(ITEM_BASES[b], b).toBeDefined();
    }
    for (const e of map.encounters ?? []) for (const b of e.reward?.items ?? []) expect(ITEM_BASES[b], b).toBeDefined();
  });

  it("closes its gates until their flag is set", () => {
    // (A chest's closed lid is a gate whose open twin takes the same cell, so it stays blocked.)
    const gates = map.props.filter((p) => p.until && !map.props.some((q) => q.after === p.until && q.x === p.x && q.y === p.y));
    const closed = CollisionGrid.fromMap(map);
    for (const g of gates) expect(closed.blocked(g.x, g.y)).toBe(true);
    for (const g of gates) expect(CollisionGrid.fromMap(map, new Set([g.until!])).blocked(g.x, g.y)).toBe(false);
  });
});
