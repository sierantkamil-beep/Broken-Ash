import { DEFAULT_PICKS, PATHS, allSkills, isWeapon, masteryLevel, resolveLoadout, validLook, type CharacterLook, type PathId, type Picks, type SkillDef, type WeaponId } from "@broken-ash/shared";

/** The synced fields a player's bar and look are resolved from (server/src/schema/WorldState.ts). */
export interface LoadoutView {
  path: string;
  weapon: string;
  picks: string;
  mastery: string;
  appearance: string;
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
  const skills = resolveLoadout(PATHS[pathOf(v)], weapon, picks, level).skills;
  return { skills, level, key: `${v.path}|${weapon}|${v.picks}|${level}` };
}

export function lookOf(v: LoadoutView): CharacterLook {
  return validLook(parse(v.appearance, {}), pathOf(v));
}

/** Every skill that can be on any bar (fx events name a skill id). */
export const ALL_SKILLS = allSkills(PATHS);
