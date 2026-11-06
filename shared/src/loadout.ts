import { BALANCE } from "./balance.js";
import type { Effect, PathDef, Shape, SkillDef, WeaponId } from "./combat/types.js";
import { WEAPONS, WEAPON_IDS, type Mod, type PassiveDef, type SkillSlot } from "./data/weapons.js";

/**
 * A character's skill bar: the weapon's basic, RMB and key-1 skills (from its mastery tree), then the
 * path's three signature skills (design.md §4). Passives and the home-weapon affinity are baked into
 * copies of the weapon skills here, so the combat engine only ever sees plain SkillDefs.
 * The server builds the bar with this; the HUD and the character screen show the same thing.
 */

const M = BALANCE.mastery;

/** Which skill of each choice is picked. `passives[i]` is the choice in row i (0/1), or -1 for none yet. */
export interface Picks {
  rmb: number;
  key: number;
  passives: number[];
}

export const DEFAULT_PICKS: Picks = { rmb: 0, key: 0, passives: [-1, -1, -1, -1, -1] };

/** Mastery level for an amount of weapon-skill damage dealt. */
export function masteryLevel(xp: number): number {
  let lvl = 1;
  for (let i = 2; i <= M.maxLevel; i++) if (xp >= M.xpFor[i]) lvl = i;
  return lvl;
}

/** Progress towards the next level, 0–1 (1 at max). */
export function masteryProgress(xp: number): number {
  const lvl = masteryLevel(xp);
  if (lvl >= M.maxLevel) return 1;
  const a = M.xpFor[lvl];
  const b = M.xpFor[lvl + 1];
  return Math.max(0, Math.min(1, (xp - a) / (b - a)));
}

export function isWeapon(id: unknown): id is WeaponId {
  return typeof id === "string" && (WEAPON_IDS as string[]).includes(id);
}

/** Keeps only choices the level has unlocked; anything else falls back to the first option. */
export function validPicks(raw: Partial<Picks> | undefined, level: number): Picks {
  const pick = (v: unknown, unlocks: readonly number[]) => {
    const i = typeof v === "number" && Number.isInteger(v) ? v : 0;
    return i >= 0 && i < unlocks.length && unlocks[i] <= level ? i : 0;
  };
  const passives = M.passiveUnlock.map((unlock, row) => {
    const v = raw?.passives?.[row];
    return level >= unlock && (v === 0 || v === 1) ? v : -1;
  });
  return { rmb: pick(raw?.rmb, M.rmbUnlock), key: pick(raw?.key, M.keyUnlock), passives };
}

export interface Loadout {
  skills: SkillDef[];
  passives: PassiveDef[];
  home: boolean;
}

export function resolveLoadout(path: PathDef, weaponId: WeaponId, picks: Picks, level: number): Loadout {
  const w = WEAPONS[weaponId];
  const p = validPicks(picks, level);
  const passives = p.passives.flatMap((choice, row) => (choice >= 0 ? [w.passives[row][choice]] : []));
  const mods = passives.flatMap((ps) => ps.mods);
  const home = path.homeWeapons.includes(weaponId);
  const weaponSkills: [SkillDef, SkillSlot][] = [
    [w.basic, "basic"],
    [w.rmb[p.rmb], "rmb"],
    [w.key[p.key], "key"],
  ];
  const skills = weaponSkills.map(([s, slot]) => applyMods(s, slot, mods, home ? path : null));
  return { skills: [...skills, ...path.signature], passives, home };
}

const applies = (m: Mod, slot: SkillSlot) => (m.slot ?? "all") === "all" || m.slot === slot;
const damaging = (s: SkillDef) => s.effects.some((e) => e.kind === "damage");

function applyMods(base: SkillDef, slot: SkillSlot, mods: Mod[], homePath: PathDef | null): SkillDef {
  const mine = mods.filter((m) => applies(m, slot));
  let dmgMul = 1 + (homePath ? M.affinityDamage : 0);
  let cdMul = 1;
  let reachMul = 1;
  let poiseMul = 1;
  let addBolts = 0;
  let pierce = false;
  let vfx = base.vfx;
  const extra: Effect[] = [];
  for (const m of mine) {
    switch (m.kind) {
      case "damage":
        dmgMul += m.pct;
        break;
      case "cooldown":
        cdMul += m.pct;
        break;
      case "reach":
        reachMul += m.pct;
        break;
      case "poise":
        poiseMul += m.pct;
        break;
      case "projectiles":
        addBolts += m.add;
        break;
      case "pierce":
        pierce = true;
        break;
      case "rider":
        if (damaging(base)) extra.push(m.effect);
        break;
      case "form":
        vfx = m.vfx;
        if (m.effect) extra.push(m.effect);
        break;
    }
  }
  // The home path's rider rides on every damaging weapon skill.
  if (homePath && damaging(base)) extra.push(...homePath.affinity.rider);

  const effects = [...base.effects, ...extra].map((e): Effect => {
    if (e.kind === "damage") return { ...e, amount: round(e.amount * dmgMul), poise: round((e.poise ?? 0) * poiseMul) };
    if (e.kind === "detonate") return { ...e, damage: round(e.damage * dmgMul) };
    return e;
  });
  return {
    ...base,
    vfx,
    cooldown: Math.max(base.cooldown * 0.25, round(base.cooldown * cdMul, 100)),
    shape: scaleShape(base.shape, reachMul, addBolts, pierce),
    effects,
  };
}

function scaleShape(s: Shape, reach: number, addBolts: number, pierce: boolean): Shape {
  switch (s.kind) {
    case "cone":
      return { ...s, range: round(s.range * reach, 100) };
    case "line":
      return { ...s, length: round(s.length * reach, 100) };
    case "circle":
      return { ...s, radius: round(s.radius * reach, 100) };
    case "projectile": {
      const count = (s.count ?? 1) + addBolts;
      // An extra bolt on a single-shot skill fans out a little so they don't overlap.
      const spread = count > 1 ? s.spread || 6 * (count - 1) : s.spread;
      return { ...s, range: round(s.range * reach, 100), count, spread, pierce: s.pierce || pierce };
    }
    default:
      return s;
  }
}

const round = (v: number, k = 10) => Math.round(v * k) / k;

/** Every skill that can appear on a bar, by id (paths' signatures + every weapon skill). */
export function allSkills(paths: Record<string, PathDef>): Map<string, SkillDef> {
  const m = new Map<string, SkillDef>();
  for (const p of Object.values(paths)) for (const s of p.signature) m.set(s.id, s);
  for (const w of Object.values(WEAPONS)) for (const s of [w.basic, ...w.rmb, ...w.key]) m.set(s.id, s);
  return m;
}
