import { describe, expect, it } from "vitest";
import { AFFIXES, ITEM_BASES, itemBonuses, makeItem, rng, rollItem, validItem } from "./data/items.js";
import { DEFAULT_LOOKS } from "./data/looks.js";
import { PATHS } from "./data/paths.js";
import { equip, equipBonuses, fits, freeSpot, startingKit, stow, unequip, validInventory, weaponOfInv, wornLook, BAG_W, BAG_H } from "./inventory.js";

const kit = () => startingKit(PATHS.thorn, DEFAULT_LOOKS.thorn, (k) => `${k}${Math.random()}`);

describe("items", () => {
  it("has bases for every slot and weapon type, each a sane size", () => {
    const slots = new Set(Object.values(ITEM_BASES).map((b) => b.slot));
    expect([...slots].sort()).toEqual(["amulet", "boots", "chest", "hands", "head", "legs", "relic", "ring", "weapon"]);
    for (const b of Object.values(ITEM_BASES)) {
      expect(b.w * b.h, b.id).toBeGreaterThan(0);
      expect(b.w <= BAG_W && b.h <= BAG_H, b.id).toBe(true);
    }
    for (const w of Object.keys(PATHS).flatMap((p) => PATHS[p as keyof typeof PATHS].homeWeapons)) expect(ITEM_BASES[`${w}.1`]).toBeDefined();
  });

  it("rolls the same item from the same seed, with distinct affixes from the slot's pool", () => {
    const a = rollItem(rng(7), 10, "x", { rarity: "rare" });
    const b = rollItem(rng(7), 10, "x", { rarity: "rare" });
    expect(a).toEqual(b);
    expect(a.affixes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(a.affixes.map((x) => x[0])).size).toBe(a.affixes.length);
    const slot = ITEM_BASES[a.base].slot;
    for (const [id] of a.affixes) expect(AFFIXES.find((x) => x.id === id)!.slots).toContain(slot);
    expect(itemBonuses(a).length).toBeGreaterThanOrEqual(a.affixes.length);
  });

  it("rejects junk items and clamps values", () => {
    expect(validItem({ uid: "a", base: "nope" })).toBeNull();
    expect(validItem({ uid: "a", base: "ring.ring.1", affixes: [["hp", 1e9], ["nope", 1]] })!.affixes).toEqual([["hp", 200]]);
  });
});

describe("bag and gear", () => {
  it("starts with the path's weapon and the clothes of the chosen look", () => {
    const inv = kit();
    expect(weaponOfInv(inv, "bow")).toBe(PATHS.thorn.homeWeapons[0]);
    expect(wornLook(DEFAULT_LOOKS.thorn, inv.equip).armour).toBe(DEFAULT_LOOKS.thorn.armour);
    expect(wornLook(DEFAULT_LOOKS.thorn, {}).armour).toBe("none");
  });

  it("places items by size without overlaps and fills up", () => {
    const inv = { bag: [], equip: {}, gold: 0 };
    const glaive = makeItem("glaive.1", "g");
    expect(fits(inv, glaive, 9, 3)).toBe(false);
    expect(stow(inv, glaive, { x: 0, y: 0 })).toBe(true);
    expect(fits(inv, makeItem("ring.ring.1", "r"), 0, 3)).toBe(false);
    let n = 0;
    while (stow(inv, makeItem("chest.silk.1", `c${n}`))) n++;
    expect(n).toBeGreaterThan(5);
    expect(freeSpot(inv, makeItem("chest.silk.1", "z"))).toBeNull();
  });

  it("swaps worn items with the bag, keeps the weapon slot filled, and adds up bonuses", () => {
    const inv = kit();
    const glaive = makeItem("glaive.2", "g2");
    stow(inv, glaive);
    expect(equip(inv, "g2")).toBe(true);
    expect(weaponOfInv(inv, "bow")).toBe("glaive");
    expect(inv.bag.some((p) => ITEM_BASES[p.item.base].weapon === PATHS.thorn.homeWeapons[0])).toBe(true);
    expect(unequip(inv, "weapon")).toBe(false);
    expect(unequip(inv, "chest")).toBe(true);
    const ring = makeItem("ring.ring.1", "r1", "rare", 5, [["dmg", 0.1]]);
    stow(inv, ring);
    expect(equip(inv, "r1")).toBe(true);
    expect(inv.equip.ring1?.uid).toBe("r1");
    expect(equipBonuses(inv.equip).some((b) => b.kind === "damage" && b.pct === 0.1)).toBe(true);
  });

  it("restores a save, dropping what doesn't belong", () => {
    const inv = kit();
    stow(inv, makeItem("ring.ring.1", "r"));
    const back = validInventory(JSON.parse(JSON.stringify({ ...inv, bag: [...inv.bag, { item: { uid: "x", base: "nope" }, x: 0, y: 0 }], equip: { ...inv.equip, ring1: inv.equip.weapon } })))!;
    expect(back.bag.length).toBe(1);
    expect(back.equip.ring1).toBeUndefined();
    expect(back.equip.weapon?.uid).toBe(inv.equip.weapon?.uid);
  });
});
