import type { CollisionGrid } from "@broken-ash/shared";

/**
 * Flow fields: for a goal cell, every reachable cell's walking distance to it (8-connected, no
 * corner cutting). The Greyed step downhill on the field of whoever they chase, so they walk round
 * trees, lanterns and the shrine instead of grinding against them.
 */
export class FlowField {
  readonly dist: Float32Array;

  constructor(
    readonly grid: CollisionGrid,
    gx: number,
    gy: number,
  ) {
    const { width: w, height: h } = grid;
    this.dist = new Float32Array(w * h).fill(Infinity);
    const sx = Math.max(0, Math.min(w - 1, Math.floor(gx)));
    const sy = Math.max(0, Math.min(h - 1, Math.floor(gy)));
    // Dijkstra with a tiny binary heap: the maps are small (≤ 64×64).
    const heap: [number, number][] = [[0, sy * w + sx]];
    this.dist[sy * w + sx] = 0;
    const push = (d: number, i: number) => {
      heap.push([d, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, i] = pop();
      if (d > this.dist[i]) continue;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (grid.blocked(nx, ny)) continue;
          if (dx && dy && (grid.blocked(x + dx, y) || grid.blocked(x, y + dy))) continue;
          const nd = d + (dx && dy ? Math.SQRT2 : 1);
          const ni = ny * w + nx;
          if (nd < this.dist[ni]) {
            this.dist[ni] = nd;
            push(nd, ni);
          }
        }
    }
  }

  /** Unit direction to walk from (x, y), or null at the goal / when cut off. */
  direction(x: number, y: number): { x: number; y: number } | null {
    const { width: w } = this.grid;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const here = this.dist[cy * w + cx];
    if (!Number.isFinite(here) || here === 0) return null;
    let best = here;
    let bx = 0;
    let by = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (this.grid.blocked(cx + dx, cy) && dx && dy) continue;
        if (this.grid.blocked(cx, cy + dy) && dx && dy) continue;
        if (this.grid.blocked(cx + dx, cy + dy)) continue;
        const d = this.dist[(cy + dy) * w + cx + dx];
        if (d < best) {
          best = d;
          bx = dx;
          by = dy;
        }
      }
    if (!bx && !by) return null;
    // Aim for the centre of the next cell so units don't scrape along walls.
    const tx = cx + bx + 0.5 - x;
    const ty = cy + by + 0.5 - y;
    const len = Math.hypot(tx, ty) || 1;
    return { x: tx / len, y: ty / len };
  }
}
