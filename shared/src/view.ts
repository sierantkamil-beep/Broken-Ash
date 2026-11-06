/**
 * Top-down 3/4 view (like Dinusie): square cells, the ground drawn flat, characters and props drawn
 * upright as seen slightly from the front. World units are cells; screen units are pixels at zoom 1.
 * World +x is screen right, world +y is screen down, height (z) lifts straight up the screen.
 * The PixelLab bodies are drawn "high top-down", which is this view.
 */
/** Screen pixels per cell (32 art pixels at 2×, the size of a PixelLab top-down tile). */
export const CELL = 64;
/** Screen pixels per unit of height: upright things keep their full height in a 3/4 view. */
export const Z_PX = CELL;

export function worldToScreen(x: number, y: number, z = 0): { x: number; y: number } {
  return { x: x * CELL, y: y * CELL - z * Z_PX };
}

export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  return { x: sx / CELL, y: sy / CELL };
}

/** Turns a screen-space direction (WASD: dx right, dy down) into a unit world direction. */
export function screenDirToWorld(dx: number, dy: number): { x: number; y: number } {
  if (dx === 0 && dy === 0) return { x: 0, y: 0 };
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len };
}

/** Eight sprite directions, index 0 = facing screen-south (towards the viewer), clockwise. */
export const DIRECTIONS = 8;

/** Sprite direction index (0 = screen south, then clockwise: SW, W, NW, N, NE, E, SE) for a world-space facing angle. */
export function directionIndex(worldAngle: number): number {
  const s = worldToScreen(Math.cos(worldAngle), Math.sin(worldAngle));
  const screenAngle = Math.atan2(s.x, s.y); // 0 = down, +π/2 = right
  const step = (Math.PI * 2) / DIRECTIONS;
  // Clockwise from down means going towards screen-left first (SW).
  const idx = Math.round(-screenAngle / step);
  return ((idx % DIRECTIONS) + DIRECTIONS) % DIRECTIONS;
}

/** Depth for sorting things standing on the ground: further down the screen is drawn later. */
export function depthOf(_x: number, y: number): number {
  return y * 100;
}
