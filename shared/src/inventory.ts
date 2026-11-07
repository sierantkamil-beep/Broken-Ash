import type { PathDef, WeaponId } from "./combat/types.js";
import { EQUIP_SLOTS, ITEM_BASES, itemBonuses, makeItem, slotOf, validItem, type EquipSlot, type Item } from "./data/items.js";
import type { CharacterLook } from "./data/looks.js";
import type { Bonus } from "./progress.js";

/*
 * The bag and what's worn (design.md §6 "Inventory with weight"): a grid where items take their
 * size in cells, so a glaive and a ring compete for room; ten equipment slots. The weapon slot is
 * never empty (you can swap a weapon, not stand unarmed): the weapon in it is the weapon in your
 * hands, with its skills and its mastery.
 */

export const BAG_W = 10;
export const BAG_H = 6;

export interface Placed {
  item: Item;
  x: number;
  y: number;
}

export interface Inventory {
  bag: Placed[];
  equip: Partial<Record<EquipSlot, Item>>;
  gold: number;
}

const size = (it: Item) => {
  const b = ITEM_BASES[it.base];
  return { w: b?.w ?? 1, h: b?.h ?? 1 };
};

/** Does an item fit at (x, y), ignoring the item `except` (the one being moved)? */
export function fits(inv: Inventory, it: Item, x: number, y: number, except?: string): boolean {
  const { w, h } = size(it);
  if (x < 0 || y < 0 || x + w > BAG_W || y + h > BAG_H) return false;
  for (const p of inv.bag) {
    if (p.item.uid === except) continue;
    const s = size(p.item);
    if (x < p.x + s.w && p.x < x + w && y < p.y + s.h && p.y < y + h) return false;
  }
  return true;
}

/** The first free spot for an item (reading order), or null when the bag is full for it. */
export function freeSpot(inv: Inventory, it: Item, except?: string): { x: number; y: number } | null {
  for (let y = 0; y < BAG_H; y++) for (let x = 0; x < BAG_W; x++) if (fits(inv, it, x, y, except)) return { x, y };
  return null;
}

/** Puts an item in the bag where it fits (or at a given spot). Returns false when there's no room. */
export function stow(inv: Inventory, it: Item, at?: { x: number; y: number }): boolean {
  const spot = at && fits(inv, it, at.x, at.y) ? at : freeSpot(inv, it);
  if (!spot) return false;
  inv.bag.push({ item: it, ...spot });
  return true;
}

export function moveInBag(inv: Inventory, uid: string, x: number, y: number): boolean {
  const p = inv.bag.find((q) => q.item.uid === uid);
  if (!p || !fits(inv, p.item, x, y, uid)) return false;
  p.x = x;
  p.y = y;
  return true;
}

/** Which equipment slot an item goes to (a ring takes the free ring slot, else the first). */
export function slotFor(inv: Inventory, it: Item): EquipSlot | null {
  const s = ITEM_BASES[it.base]?.slot;
  if (!s) return null;
  if (s === "ring") return !inv.equip.ring1 ? "ring1" : !inv.equip.ring2 ? "ring2" : "ring1";
  return s;
}

/**
 * Wears an item from the bag. What was in the slot goes to the bag, where the new item was if it fits
 * there, else wherever it fits; if it fits nowhere the swap is refused.
 */
export function equip(inv: Inventory, uid: string, slot?: EquipSlot): boolean {
  const i = inv.bag.findIndex((q) => q.item.uid === uid);
  if (i < 0) return false;
  const placed = inv.bag[i];
  const target = slot ?? slotFor(inv, placed.item);
  if (!target || slotOf(target) !== ITEM_BASES[placed.item.base]?.slot) return false;
  const old = inv.equip[target];
  inv.bag.splice(i, 1);
  if (old) {
    const ok = stow(inv, old, { x: placed.x, y: placed.y }) || stow(inv, old);
    if (!ok) {
      inv.bag.splice(i, 0, placed);
      return false;
    }
  }
  inv.equip[target] = placed.item;
  return true;
}

/** Takes an item off into the bag. The weapon stays (swap it for another instead). */
export function unequip(inv: Inventory, slot: EquipSlot, at?: { x: number; y: number }): boolean {
  const it = inv.equip[slot];
  if (!it || slot === "weapon") return false;
  if (!stow(inv, it, at)) return false;
  delete inv.equip[slot];
  return true;
}

/** Takes an item out of the bag (to drop it on the ground). */
export function takeOut(inv: Inventory, uid: string): Item | null {
  const i = inv.bag.findIndex((q) => q.item.uid === uid);
  if (i < 0) return null;
  return inv.bag.splice(i, 1)[0].item;
}

/** The weapon in hand (the equipped weapon's type). */
export function weaponOfInv(inv: Inventory, fallback: WeaponId): WeaponId {
  const w = inv.equip.weapon;
  return (w && ITEM_BASES[w.base]?.weapon) || fallback;
}

/** Everything worn adds up. */
export function equipBonuses(equipped: Partial<Record<EquipSlot, Item>>): Bonus[] {
  return EQUIP_SLOTS.flatMap((s) => (equipped[s] ? itemBonuses(equipped[s]!) : []));
}

/** The look as worn: the chest piece decides the armour and shoulders, the head piece the head. */
export function wornLook(look: CharacterLook, equipped: Partial<Record<EquipSlot, Item>>): CharacterLook {
  const chest = equipped.chest ? ITEM_BASES[equipped.chest.base]?.look : undefined;
  const head = equipped.head ? ITEM_BASES[equipped.head.base]?.look : undefined;
  return { ...look, armour: chest?.armour ?? "none", shoulders: chest?.shoulders ?? "none", head: head?.head ?? "none" };
}

/** What a new character starts with: the path's own weapon and the clothes they were chosen in. */
export function startingKit(path: PathDef, look: CharacterLook, uid: (k: string) => string): Inventory {
  const inv: Inventory = { bag: [], equip: {}, gold: 0 };
  inv.equip.weapon = makeItem(`${path.homeWeapons[0]}.1`, uid("w"));
  const chest = Object.values(ITEM_BASES).find((b) => b.slot === "chest" && b.tier === 1 && (b.look?.armour ?? "none") === look.armour);
  inv.equip.chest = makeItem(chest?.id ?? "chest.tunic.1", uid("c"));
  if (look.head !== "none") {
    const head = Object.values(ITEM_BASES).find((b) => b.slot === "head" && b.tier === 1 && b.look?.head === look.head);
    if (head) inv.equip.head = makeItem(head.id, uid("h"));
  }
  return inv;
}

/** An inventory from a save: unknown items dropped, overlaps resolved by re-stowing. */
export function validInventory(raw: unknown): Inventory | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { bag?: unknown; equip?: unknown; gold?: unknown };
  const inv: Inventory = { bag: [], equip: {}, gold: typeof r.gold === "number" && r.gold >= 0 ? Math.min(Math.floor(r.gold), 1e7) : 0 };
  if (r.equip && typeof r.equip === "object")
    for (const s of EQUIP_SLOTS) {
      const it = validItem((r.equip as Record<string, unknown>)[s]);
      if (it && slotOf(s) === ITEM_BASES[it.base].slot) inv.equip[s] = it;
    }
  if (Array.isArray(r.bag))
    for (const p of r.bag.slice(0, BAG_W * BAG_H)) {
      const it = validItem((p as Placed)?.item);
      if (!it) continue;
      const x = Number((p as Placed).x);
      const y = Number((p as Placed).y);
      if (!stow(inv, it, Number.isInteger(x) && Number.isInteger(y) ? { x, y } : undefined)) break;
    }
  return inv;
}
