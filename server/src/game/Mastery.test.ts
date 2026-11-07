import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BALANCE, DEFAULT_PICKS, PATHS, masteryLevel, resolveLoadout, validLook, validPicks } from "@broken-ash/shared";
import { gainMastery } from "./Combat.js";
import { Profiles } from "./Profiles.js";
import { World } from "./World.js";

describe("loadout", () => {
  it("puts the weapon's three skills first and the path's signature after", () => {
    const l = resolveLoadout(PATHS.blood, "bow", DEFAULT_PICKS, 1);
    expect(l.skills.map((s) => s.id)).toEqual(["bow_arrow", "bow_hunter", "bow_volley", ...PATHS.blood.signature.map((s) => s.id)]);
    expect(l.home).toBe(false);
  });

  it("makes home weapons hit harder and carry the path's rider", () => {
    const off = resolveLoadout(PATHS.bark, "blades", DEFAULT_PICKS, 1).skills[0];
    const home = resolveLoadout(PATHS.thorn, "blades", DEFAULT_PICKS, 1).skills[0];
    const amount = (s: typeof off) => s.effects.find((e) => e.kind === "damage")!;
    expect((amount(home) as { amount: number }).amount).toBeGreaterThan((amount(off) as { amount: number }).amount);
    expect(home.effects.some((e) => e.kind === "status" && e.status === "bleed")).toBe(true);
    expect(off.effects.some((e) => e.kind === "status" && e.status === "bleed")).toBe(false);
  });

  it("applies passives: more bolts, faster cooldowns, forms", () => {
    const base = resolveLoadout(PATHS.dusk, "bow", DEFAULT_PICKS, 10).skills;
    const picked = resolveLoadout(PATHS.dusk, "bow", { rmb: 0, key: 0, passives: [1, 0, 0, 0, 1] }, 10).skills;
    expect(picked[0].cooldown).toBeLessThan(base[0].cooldown);
    expect(picked[0].vfx).toBe("ink_arrow_hawk");
    const shape = picked[0].shape;
    expect(shape.kind === "projectile" && shape.pierce).toBe(true);
    const more = resolveLoadout(PATHS.dusk, "bow", { rmb: 0, key: 0, passives: [0, 0, 0, 0, 0] }, 10).skills[0].shape;
    expect(more.kind === "projectile" && more.count).toBe(2); // row 4, first choice: a second arrow
  });

  it("only allows choices the mastery level has unlocked", () => {
    expect(validPicks({ rmb: 1, key: 2, passives: [1, 1, 1, 1, 1] }, 1)).toEqual({ rmb: 0, key: 0, passives: [-1, -1, -1, -1, -1] });
    const mid = validPicks({ rmb: 1, key: 2, passives: [1, 1, 1, 1, 1] }, 6);
    expect(mid.rmb).toBe(1);
    expect(mid.key).toBe(0);
    expect(mid.passives).toEqual([1, 1, -1, -1, -1]);
    expect(validPicks({ rmb: 1, key: 2, passives: [0, 1, 0, 1, 0] }, 10)).toEqual({ rmb: 1, key: 2, passives: [0, 1, 0, 1, 0] });
  });

  it("levels from weapon-skill damage", () => {
    const x = BALANCE.mastery.xpFor;
    expect(masteryLevel(0)).toBe(1);
    expect(masteryLevel(x[2])).toBe(2);
    expect(masteryLevel(x[10] * 5)).toBe(10);
  });
});

describe("mastery in the world", () => {
  it("gains XP from weapon hits and announces a level-up", () => {
    const w = new World("soramei_courtyard");
    w.encounter = false;
    const p = w.addPlayer("a", { name: "A", path: "thorn", weapon: "glaive" });
    expect(p.weapon).toBe("glaive");
    gainMastery(w, p, "glaive", BALANCE.mastery.xpFor[3] + 1);
    expect(masteryLevel(p.mastery.glaive!)).toBe(3);
    expect(w.drainFx().some((e) => e.t === "mastery" && e.level === 3)).toBe(true);
  });

  it("takes weapons only from the bag, never mid-fight, and validates tree picks", () => {
    const w = new World("soramei_courtyard");
    w.encounter = false;
    const p = w.addPlayer("a", { name: "A", path: "ash" });
    expect(p.weapon).toBe("talismans");
    expect(w.setLoadout("a", { weapon: "bow" })).toBe(true);
    expect(p.weapon).toBe("talismans");
    const bow = w.giveItem(p, "bow.1")!;
    expect(w.invOp("a", { op: "equip", uid: bow.uid })).toBe(true);
    expect(p.weapon).toBe("bow");
    expect(w.setLoadout("a", { picks: { rmb: 1 } })).toBe(true);
    expect(p.skills[1].id).toBe("bow_arrow".replace("arrow", "hunter")); // rmb 1 needs mastery 3: falls back
    const fan = w.giveItem(p, "fan.1")!;
    w.phase = "fight";
    expect(w.invOp("a", { op: "equip", uid: fan.uid })).toBe(false);
    expect(w.setLoadout("a", { picks: {} })).toBe(false);
    expect(p.weapon).toBe("bow");
    expect(w.setLoadout("a", "nonsense")).toBe(false);
  });

  it("restores saved progress and ignores junk in it", () => {
    const w = new World("soramei_courtyard");
    w.encounter = false;
    const p = w.addPlayer("a", { name: "A", path: "thorn", look: { skin: 99, head: "crown", cloth: 3 } }, {
      mastery: { blades: 5000, nope: 4 } as never,
      picks: { blades: { rmb: 1, key: 1, passives: [0, 1, 0, 1, 0] } },
    });
    expect(p.mastery.blades).toBe(5000);
    expect(Object.keys(p.mastery)).toEqual(["blades"]);
    expect(p.skills[1].id).toBe("blades_cross");
    expect(p.skills[2].id).toBe("blades_flurry");
    expect(p.appearance.cloth).toBe(3);
    expect(p.appearance.skin).toBe(validLook({}, "thorn").skin);
    expect(p.appearance.head).toBe(validLook({}, "thorn").head);
  });
});

describe("profiles", () => {
  it("round-trips through the host's data folder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ash-"));
    const a = new Profiles(dir);
    a.put({ name: "Kasuren Ayume", path: "thorn", weapon: "blades", mastery: { blades: 1234 }, picks: { blades: { rmb: 1, key: 0, passives: [-1, -1, -1, -1, -1] } } });
    const b = new Profiles(dir);
    expect(b.get("  kasuren   ayume ")?.mastery.blades).toBe(1234);
    expect(b.get("nobody")).toBeUndefined();
    fs.rmSync(dir, { recursive: true });
  });
});
