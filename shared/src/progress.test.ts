import { describe, expect, it } from "vitest";
import { PATHS } from "./data/paths.js";
import { KEYSTONE_LEVEL, levelOf, levelProgress, MAX_LEVEL, pointsAt, slotOpen, statsOf, talentBonuses, talentTree, validTalents, withBonuses, XP_FOR } from "./progress.js";

describe("levels", () => {
  it("climbs with experience and caps", () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(XP_FOR[2])).toBe(2);
    expect(levelOf(XP_FOR[2] - 1)).toBe(1);
    expect(levelOf(1e9)).toBe(MAX_LEVEL);
    expect(levelProgress(XP_FOR[3] + (XP_FOR[4] - XP_FOR[3]) / 2)).toBeCloseTo(0.5);
    for (let l = 2; l <= MAX_LEVEL; l++) expect(XP_FOR[l]).toBeGreaterThan(XP_FOR[l - 1]);
  });

  it("starts with the basic attack and one path skill, and opens the rest by level", () => {
    expect([0, 1, 2, 3, 4, 5].filter((s) => slotOpen(1, s))).toEqual([0, 3]);
    expect([0, 1, 2, 3, 4, 5].filter((s) => slotOpen(6, s))).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("talents", () => {
  const path = PATHS.thorn;
  const tree = talentTree(path);

  it("has three branches of four two-way tiers and a keystone, for every path, with unique ids", () => {
    for (const p of Object.values(PATHS)) {
      const t = talentTree(p);
      expect(t.map((b) => b.id)).toEqual(["edge", "life", "art"]);
      const ids = t.flatMap((b) => [...b.tiers.flat(), b.keystone].map((n) => n.id));
      expect(ids.length).toBe(27);
      expect(new Set(ids).size).toBe(27);
      for (const b of t) for (const n of [...b.tiers.flat(), b.keystone]) expect(n.bonuses.length, n.id).toBeGreaterThan(0);
    }
  });

  it("allows one per tier, only opened tiers, keystones under full branches, no more than the points", () => {
    const e = tree[0];
    expect(validTalents(path, [e.tiers[0][0].id, e.tiers[0][1].id], 20)).toEqual([e.tiers[0][0].id]);
    expect(validTalents(path, [e.tiers[1][0].id], 4)).toEqual([]);
    expect(validTalents(path, [e.keystone.id], 20)).toEqual([]);
    const full = [...e.tiers.map((t) => t[0].id), e.keystone.id];
    expect(validTalents(path, full, KEYSTONE_LEVEL)).toEqual(full);
    expect(validTalents(path, full, 3)).toEqual([e.tiers[0][0].id]);
    expect(validTalents(path, ["nonsense", 3, null], 20)).toEqual([]);
    expect(pointsAt(1)).toBe(0);
  });

  it("applies bonuses to the right skills and to the body", () => {
    const harvest = path.signature[0];
    const b = talentBonuses(path, [tree[2].tiers[0][1].id]);
    const dmg = (s: typeof harvest) => s.effects.find((x) => x.kind === "damage")!;
    expect((dmg(withBonuses(harvest, 3, b)) as { amount: number }).amount).toBeGreaterThan((dmg(harvest) as { amount: number }).amount);
    expect(withBonuses(path.signature[1], 4, b)).toBe(path.signature[1]);
    const life = statsOf(path, talentBonuses(path, [tree[1].tiers[0][0].id, tree[1].tiers[0][1].id]));
    expect(life.hpMax).toBe(Math.round(path.hp * 1.1));
    expect(statsOf(path, [{ kind: "armour", pct: 5 }]).taken).toBeCloseTo(0.4);
  });
});
