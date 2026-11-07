import { equipBonuses, type EquipSlot, type Item } from "@broken-ash/shared";
import { DEFAULT_PICKS, PATHS, allSkills, isWeapon, masteryLevel, resolveLoadout, talentBonuses, validLook, withBonuses, type Bonus, type CharacterLook, type PathId, type Picks, type SkillDef, type WeaponId } from "@broken-ash/shared";

/** The synced fields a player's bar and look are resolved from (server/src/schema/WorldState.ts). */
export interface LoadoutView {
  path: string;
  weapon: string;
  picks: string;
  mastery: string;
  appearance: string;
  level?: number;
  talents?: string;
  /** Equipped items (JSON), when items exist (shared/src/inventory.ts). */
  equip?: string;
}

/** Talent (and, with items, equipment) bonuses of a synced player, exactly as the server applies them. */
export function bonusesOf(v: LoadoutView): Bonus[] {
  return [...talentBonuses(PATHS[pathOf(v)], parse<string[]>(v.talents ?? "", [])), ...extraBonuses(v)];
}

/** Equipment bonuses, from the synced worn items. */
function extraBonuses(v: LoadoutView): Bonus[] {
  return equipBonuses(parse<Partial<Record<EquipSlot, Item>>>(v.equip ?? "", {}));
}

const parse = <T>(s: string, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

export function pathOf(v: { path: string }): PathId {
  return (v.path in PATHS ? v.path : "thorn") as PathId;
}

export function weaponOf(v: LoadoutView): WeaponId {
  return isWeapon(v.weapon) ? v.weapon : PATHS[pathOf(v)].homeWeapons[0];
}

export function masteryOf(v: LoadoutView): Partial<Record<WeaponId, number>> {
  return parse(v.mastery, {});
}

/** The bar the server built, resolved the same way from the same synced inputs. */
export function barOf(v: LoadoutView): { skills: SkillDef[]; key: string; level: number } {
  const weapon = weaponOf(v);
  const level = masteryLevel(masteryOf(v)[weapon] ?? 0);
  const picks = parse<Picks>(v.picks, DEFAULT_PICKS);
  const bonuses = bonusesOf(v);
  const skills = resolveLoadout(PATHS[pathOf(v)], weapon, picks, level).skills.map((s, i) => withBonuses(s, i, bonuses));
  return { skills, level, key: `${v.path}|${weapon}|${v.picks}|${level}|${v.talents ?? ""}|${v.equip ?? ""}|${v.level ?? 1}` };
}

export function lookOf(v: LoadoutView): CharacterLook {
  return validLook(parse(v.appearance, {}), pathOf(v));
}

/** Every skill that can be on any bar (fx events name a skill id). */
export const ALL_SKILLS = allSkills(PATHS);
