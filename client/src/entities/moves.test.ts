import { describe, expect, it } from "vitest";
import { allSkills, PATHS } from "@broken-ash/shared";
import { MOVES, poseAt, SKILL_MOTION, strokeAngle } from "./moves";

describe("skill moves", () => {
  const skills = [...allSkills(PATHS).keys()];

  it("gives every castable skill its own motion", () => {
    const missing = skills.filter((id) => !SKILL_MOTION[id]);
    expect(missing).toEqual([]);
  });

  it("never repeats a motion: move, strokes and trail together are unique per skill", () => {
    const seen = new Map<string, string>();
    for (const [id, m] of Object.entries(SKILL_MOTION)) {
      const sig = JSON.stringify({ move: m.move, strokes: m.strokes ?? [], trail: m.trail ?? null, ghosts: m.ghosts ?? 0 });
      expect(seen.get(sig), `${id} moves exactly like ${seen.get(sig)}`).toBeUndefined();
      seen.set(sig, id);
    }
  });

  it("keeps poses sane over the whole timeline", () => {
    for (const [id, move] of Object.entries(MOVES)) {
      for (let t = 0; t <= 2; t += 0.05) {
        const p = poseAt(move, t);
        expect(p.squash, id).toBeGreaterThan(0.7);
        expect(p.squash, id).toBeLessThan(1.15);
        expect(Math.abs(p.fwd) + Math.abs(p.side), id).toBeLessThan(14);
        expect(p.lift, id).toBeLessThan(20);
      }
      // Every move ends standing where it started (no snap back at the end).
      const end = poseAt(move, 2);
      expect([end.fwd, end.side, end.lift, end.upper], id).toEqual([0, 0, 0, 0]);
      expect(end.squash, id).toBe(1);
    }
  });

  it("swings strokes from their start to their end", () => {
    const s = [{ from: -90, to: 90, t0: 1, t1: 1.4 }];
    expect(strokeAngle(s, "main", 0.5)).toBeCloseTo(-Math.PI / 2);
    expect(strokeAngle(s, "main", 1.2)).toBeCloseTo(0);
    expect(strokeAngle(s, "main", 1.4)).toBeCloseTo(Math.PI / 2);
    expect(strokeAngle(s, "off", 1.2)).toBeNull();
    expect(strokeAngle(s, "main", 1.9)).toBeNull();
  });
});
