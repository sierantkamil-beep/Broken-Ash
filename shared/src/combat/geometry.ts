import type { Shape } from "./types.js";

/** Smallest difference between two angles, in radians (0..π). */
export function angleDiff(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

/** Distance from a point to the segment a→b. */
export function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export interface Caster {
  x: number;
  y: number;
}

/**
 * Does a shape cast from `c` along `aim` (radians) reach a target circle at (tx, ty) with radius tr?
 * `aimPoint` is where an "aim" circle lands (already clamped to its reach).
 */
export function shapeHits(shape: Shape, c: Caster, aim: number, tx: number, ty: number, tr: number, aimPoint?: { x: number; y: number }): boolean {
  switch (shape.kind) {
    case "cone": {
      const d = Math.hypot(tx - c.x, ty - c.y);
      if (d > shape.range + tr) return false;
      if (d < tr + 0.2) return true;
      // Widen the wedge by the target's own size at that distance.
      const slack = Math.asin(Math.min(1, tr / d));
      return angleDiff(Math.atan2(ty - c.y, tx - c.x), aim) <= (shape.arc * Math.PI) / 360 + slack;
    }
    case "circle": {
      const o = shape.at === "aim" && aimPoint ? aimPoint : c;
      return Math.hypot(tx - o.x, ty - o.y) <= shape.radius + tr;
    }
    case "line": {
      const ex = c.x + Math.cos(aim) * shape.length;
      const ey = c.y + Math.sin(aim) * shape.length;
      return pointSegmentDistance(tx, ty, c.x, c.y, ex, ey) <= shape.width / 2 + tr;
    }
    default:
      return false;
  }
}

/** Where an aimed circle lands: the aimed point, pulled back to the skill's reach. */
export function aimLanding(c: Caster, aim: number, target: { x: number; y: number } | null, reach: number): { x: number; y: number } {
  if (target) {
    const d = Math.hypot(target.x - c.x, target.y - c.y);
    if (d <= reach) return { x: target.x, y: target.y };
  }
  return { x: c.x + Math.cos(aim) * reach, y: c.y + Math.sin(aim) * reach };
}
