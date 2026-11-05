import { describe, expect, it } from "vitest";
import { directionIndex, screenDirToWorld, screenToWorld, worldToScreen } from "./iso.js";

describe("iso projection", () => {
  it("round-trips world → screen → world", () => {
    for (const [x, y] of [[0, 0], [3.25, 7.5], [-2, 11], [29.9, 0.1]]) {
      const s = worldToScreen(x, y);
      const w = screenToWorld(s.x, s.y);
      expect(w.x).toBeCloseTo(x, 9);
      expect(w.y).toBeCloseTo(y, 9);
    }
  });

  it("maps screen directions to world directions that project back onto the screen axis", () => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const w = screenDirToWorld(dx, dy);
      expect(Math.hypot(w.x, w.y)).toBeCloseTo(1, 9);
      const s = worldToScreen(w.x, w.y);
      // Same direction on screen as requested.
      expect(Math.atan2(s.y, s.x)).toBeCloseTo(Math.atan2(dy, dx), 9);
    }
  });

  it("numbers sprite directions clockwise from screen-south", () => {
    const dirOf = (dx: number, dy: number) => {
      const w = screenDirToWorld(dx, dy);
      return directionIndex(Math.atan2(w.y, w.x));
    };
    expect(dirOf(0, 1)).toBe(0); // S
    expect(dirOf(-1, 1)).toBe(1); // SW
    expect(dirOf(-1, 0)).toBe(2); // W
    expect(dirOf(-1, -1)).toBe(3); // NW
    expect(dirOf(0, -1)).toBe(4); // N
    expect(dirOf(1, -1)).toBe(5); // NE
    expect(dirOf(1, 0)).toBe(6); // E
    expect(dirOf(1, 1)).toBe(7); // SE
  });
});
