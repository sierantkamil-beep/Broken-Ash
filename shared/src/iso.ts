/**
 * Isometric (2:1 dimetric) projection. World units are cells; screen units are pixels at zoom 1.
 * A cell's diamond is TILE_W × TILE_H on screen. Art is rendered with the same camera
 * (tools/art/render.py), so sprites and the math agree.
 */
export const TILE_W = 128;
export const TILE_H = 64;
/**
 * Pixels per world unit of height (z). The render camera looks down at 30° (that's what makes a
 * cell exactly 2:1); a unit along the ground diagonal is 128/√2 = 90.51 px, a unit of height
 * 90.51 × cos 30° = 78.38 px.
 */
export const Z_PX = 78.38;

export function worldToScreen(x: number, y: number, z = 0): { x: number; y: number } {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) - z * Z_PX };
}

export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * Turns a screen-space direction (WASD: dx right, dy down) into a unit world direction, so "up"
 * moves straight up the screen and diagonals follow the screen, not the grid.
 */
export function screenDirToWorld(dx: number, dy: number): { x: number; y: number } {
  if (dx === 0 && dy === 0) return { x: 0, y: 0 };
  const wx = (dx / (TILE_W / 2) + dy / (TILE_H / 2)) / 2;
  const wy = (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2;
  const len = Math.hypot(wx, wy);
  return { x: wx / len, y: wy / len };
}

/** Eight sprite directions, index 0 = facing screen-south (towards the viewer), clockwise. */
export const DIRECTIONS = 8;

/** Sprite direction index (0 = screen south, then clockwise: SW, W, NW, N, NE, E, SE) for a world-space facing angle. */
export function directionIndex(worldAngle: number): number {
  // Project the facing onto the screen, then measure clockwise from screen-down.
  const s = worldToScreen(Math.cos(worldAngle), Math.sin(worldAngle));
  const screenAngle = Math.atan2(s.x, s.y); // 0 = down, +π/2 = right
  const step = (Math.PI * 2) / DIRECTIONS;
  // Clockwise from down means going towards screen-left first (SW).
  const idx = Math.round(-screenAngle / step);
  return ((idx % DIRECTIONS) + DIRECTIONS) % DIRECTIONS;
}

/** Depth for sorting things standing on the ground: further down the screen is drawn later. */
export function depthOf(x: number, y: number): number {
  return (x + y) * 100;
}
