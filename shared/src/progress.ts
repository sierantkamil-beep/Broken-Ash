import type { Effect, PathDef, PathId, Shape, SkillDef, StatusId } from "./combat/types.js";

/*
 * A character's growth (design.md §4 "Skill pool → loadout", "Talent tree"): experience from kills,
 * fights won and story beats raises the level; levels open the bar's slots one by one (you start
 * with the basic attack and one path skill) and give talent points for the path's three branches.
 * Items (data/items.ts) speak the same language of bonuses as talents, so both feed one place.
 */

export const MAX_LEVEL = 20;

/** Total experience needed to reach each level (index = level). Grows a little faster than linear. */
export const XP_FOR: number[] = Array.from({ length: MAX_LEVEL + 1 }, (_, l) => (l <= 1 ? 0 : 40 * (l - 1) ** 2 + 60 * (l - 1)));

export function levelOf(xp: number): number {
  let lvl = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) if (xp >= XP_FOR[l]) lvl = l;
  return lvl;
}

/** Progress towards the next level, 0–1 (1 at the cap). */
export function levelProgress(xp: number): number {
  const l = levelOf(xp);
  if (l >= MAX_LEVEL) return 1;
  return Math.max(0, Math.min(1, (xp - XP_FOR[l]) / (XP_FOR[l + 1] - XP_FOR[l])));
}

/**
 * The level that opens each bar slot: basic, RMB, key 1 (weapon), then the path's three skills.
 * Act 1's fights carry a character from 1 to about 7: the cells open the RMB, the courtyard the
 * second path skill and the weapon's key 1, the mine the third path skill.
 */
export const SLOT_UNLOCK = [1, 2, 4, 1, 3, 6] as const;

export const slotOpen = (level: number, slot: number) => level >= (SLOT_UNLOCK[slot] ?? 99);

/** Experience for a kill, by enemy kind (shared: both players get it). */
export const KILL_XP: Record<string, number> = {
  shambler: 12,
  runner: 14,
  bloated: 24,
  miner: 22,
  drowned: 22,
  eater: 26,
  crossbow: 30,
  manatarms: 36,
  tapper: 400,
};
/** Experience for winning an encounter (all its waves). */
export const CLEAR_XP = 60;

// ------------------------------------------------------------------------------------------ bonuses

/** What a bonus applies to: every skill, weapon skills, the path's skills, one slot, or one skill by id. */
export type Target = "all" | "weapon" | "sig" | "basic" | "rmb" | "key" | `skill:${string}`;

/** A bonus from a talent or an item. Skill bonuses change the bar; stat bonuses the body. */
export type Bonus =
  | { kind: "damage"; pct: number; to?: Target }
  | { kind: "cooldown"; pct: number; to?: Target }
  | { kind: "reach"; pct: number; to?: Target }
  | { kind: "projectiles"; add: number; to?: Target }
  | { kind: "poise"; pct: number; to?: Target }
  | { kind: "cost"; pct: number; to?: Target }
  /** An effect added to every damaging skill it targets. */
  | { kind: "rider"; effect: Effect; to?: Target }
  /** More damage from a status's ticks and detonations (bleed, burn, poison…). */
  | { kind: "status"; status: StatusId; pct: number }
  | { kind: "hp"; pct?: number; add?: number }
  /** Less damage taken (0.1 = 10%), capped in balance. */
  | { kind: "armour"; pct: number }
  | { kind: "speed"; pct: number };

/** Which bar slot a skill index is (0 basic, 1 rmb, 2 key, 3–5 the path's). */
const SLOT_TAG = ["basic", "rmb", "key", "sig", "sig", "sig"] as const;

function hits(to: Target | undefined, index: number, skill: SkillDef): boolean {
  const t = to ?? "all";
  if (t === "all") return true;
  const tag = SLOT_TAG[index];
  if (t === "weapon") return index <= 2;
  if (t === "sig") return tag === "sig";
  if (t.startsWith("skill:")) return t.slice(6) === skill.id;
  return t === tag;
}

const SKILL_KINDS = new Set<Bonus["kind"]>(["damage", "cooldown", "reach", "projectiles", "poise", "cost", "rider"]);
const round = (v: number, k = 10) => Math.round(v * k) / k;
const damaging = (s: SkillDef) => s.effects.some((e) => e.kind === "damage");

/** A bar skill with the talents' and items' bonuses applied. */
export function withBonuses(skill: SkillDef, index: number, bonuses: Bonus[]): SkillDef {
  const mine = bonuses.filter((b) => SKILL_KINDS.has(b.kind) && hits((b as { to?: Target }).to, index, skill));
  if (!mine.length) return skill;
  let dmg = 1;
  let cd = 1;
  let reach = 1;
  let poise = 1;
  let cost = 1;
  let bolts = 0;
  const extra: Effect[] = [];
  for (const b of mine) {
    if (b.kind === "damage") dmg += b.pct;
    else if (b.kind === "cooldown") cd += b.pct;
    else if (b.kind === "reach") reach += b.pct;
    else if (b.kind === "poise") poise += b.pct;
    else if (b.kind === "cost") cost += b.pct;
    else if (b.kind === "projectiles") bolts += b.add;
    else if (b.kind === "rider" && damaging(skill)) extra.push(b.effect);
  }
  const effects = [...skill.effects, ...extra].map((e): Effect => {
    if (e.kind === "damage") return { ...e, amount: round(e.amount * dmg), poise: round((e.poise ?? 0) * poise) };
    if (e.kind === "detonate") return { ...e, damage: round(e.damage * dmg) };
    return e;
  });
  const sh: Shape = skill.shape;
  const shape: Shape =
    sh.kind === "cone"
      ? { ...sh, range: round(sh.range * reach, 100) }
      : sh.kind === "line"
        ? { ...sh, length: round(sh.length * reach, 100) }
        : sh.kind === "circle"
          ? { ...sh, radius: round(sh.radius * reach, 100) }
          : sh.kind === "projectile"
            ? { ...sh, range: round(sh.range * reach, 100), count: (sh.count ?? 1) + bolts, spread: (sh.count ?? 1) + bolts > 1 ? sh.spread || 6 * ((sh.count ?? 1) + bolts - 1) : sh.spread }
            : sh;
  return {
    ...skill,
    cooldown: Math.max(skill.cooldown * 0.3, round(skill.cooldown * cd, 100)),
    cost: Math.max(0, round(skill.cost * cost)),
    shape,
    effects,
  };
}

/** The body's numbers after bonuses: max health, damage taken, run speed, status damage. */
export function statsOf(path: PathDef, bonuses: Bonus[]) {
  let hpPct = 0;
  let hpAdd = 0;
  let armour = 0;
  let speed = 0;
  const status: Partial<Record<StatusId, number>> = {};
  for (const b of bonuses) {
    if (b.kind === "hp") {
      hpPct += b.pct ?? 0;
      hpAdd += b.add ?? 0;
    } else if (b.kind === "armour") armour += b.pct;
    else if (b.kind === "speed") speed += b.pct;
    else if (b.kind === "status") status[b.status] = (status[b.status] ?? 0) + b.pct;
  }
  return {
    hpMax: Math.round(path.hp * (1 + hpPct) + hpAdd),
    /** Fraction of damage taken (1 = all), armour capped at 60%. */
    taken: 1 - Math.min(0.6, armour),
    speed: path.speed * (1 + Math.min(0.35, speed)),
    status,
  };
}

// ------------------------------------------------------------------------------------------ talents

export interface TalentNode {
  id: string;
  name: string;
  description: string;
  bonuses: Bonus[];
}

export interface TalentBranch {
  id: "edge" | "life" | "art";
  name: string;
  blurb: string;
  /** Four tiers, each a choice of one of two. */
  tiers: [TalentNode, TalentNode][];
  /** The branch's last node: it needs every tier above it, and changes how the path plays. */
  keystone: TalentNode;
}

/** The level a tier opens at (tier 0 at 2 … tier 3 at 11); keystones at 14. */
export const TIER_LEVEL = [2, 5, 8, 11];
export const KEYSTONE_LEVEL = 14;
/** One talent point per level from 2. */
export const pointsAt = (level: number) => Math.max(0, level - 1);

const st = (status: StatusId, duration: number, value?: number): Effect => ({ kind: "status", status, duration, value });

const PATH_STATUS: Record<PathId, StatusId> = { thorn: "bleed", bark: "slow", blood: "bleed", ash: "burn", storm: "static", graves: "poison", dusk: "mark", sting: "poison" };

/** Each path's three keystones (one per branch): the talents you build towards. */
const KEYSTONES: Record<PathId, Record<TalentBranch["id"], Omit<TalentNode, "id">>> = {
  thorn: {
    edge: { name: "Żniwiarz", description: "Każda umiejętność otwiera ranę (krwawienie) i zadaje 10% więcej obrażeń.", bonuses: [{ kind: "rider", effect: st("bleed", 3, 3) }, { kind: "damage", pct: 0.1 }] },
    life: { name: "Ciernisty pancerz", description: "+25% życia i 10% mniej otrzymanych obrażeń.", bonuses: [{ kind: "hp", pct: 0.25 }, { kind: "armour", pct: 0.1 }] },
    art: { name: "Krwawy plon", description: "Krwawienie rani o 40% mocniej, Żniwo odnawia się o 30% szybciej.", bonuses: [{ kind: "status", status: "bleed", pct: 0.4 }, { kind: "cooldown", pct: -0.3, to: "skill:thorn_harvest" }] },
  },
  bark: {
    edge: { name: "Ciężar pnia", description: "Trafienia łamią postawę o 60% mocniej i spowalniają.", bonuses: [{ kind: "poise", pct: 0.6 }, { kind: "rider", effect: st("slow", 1.5, 0.3) }] },
    life: { name: "Stuletni dąb", description: "+35% życia, 12% mniej otrzymanych obrażeń.", bonuses: [{ kind: "hp", pct: 0.35 }, { kind: "armour", pct: 0.12 }] },
    art: { name: "Gaj bez końca", description: "Umiejętności ścieżki sięgają o 30% dalej i odnawiają się o 20% szybciej.", bonuses: [{ kind: "reach", pct: 0.3, to: "sig" }, { kind: "cooldown", pct: -0.2, to: "sig" }] },
  },
  blood: {
    edge: { name: "Krwiopijca", description: "Każda umiejętność leczy cię o 10% zadanych obrażeń.", bonuses: [{ kind: "rider", effect: { kind: "lifesteal", fraction: 0.1 } }] },
    life: { name: "Żywe naczynie", description: "+30% życia; krwawienie, które zadajesz, rani o 25% mocniej.", bonuses: [{ kind: "hp", pct: 0.3 }, { kind: "status", status: "bleed", pct: 0.25 }] },
    art: { name: "Wrząca krew", description: "Umiejętności ścieżki zadają 25% więcej i kosztują 20% mniej.", bonuses: [{ kind: "damage", pct: 0.25, to: "sig" }, { kind: "cost", pct: -0.2, to: "sig" }] },
  },
  ash: {
    edge: { name: "Żar", description: "Każda umiejętność podpala, umiejętności odnawiają się o 10% szybciej.", bonuses: [{ kind: "rider", effect: st("burn", 3, 3) }, { kind: "cooldown", pct: -0.1 }] },
    life: { name: "Popiół nie płonie", description: "+25% życia, 10% mniej otrzymanych obrażeń.", bonuses: [{ kind: "hp", pct: 0.25 }, { kind: "armour", pct: 0.1 }] },
    art: { name: "Stos ofiarny", description: "Płonięcie rani o 40% mocniej, Stos sięga o 30% szerzej.", bonuses: [{ kind: "status", status: "burn", pct: 0.4 }, { kind: "reach", pct: 0.3, to: "skill:ash_pyre" }] },
  },
  storm: {
    edge: { name: "Rozszczepienie", description: "Pociski: +1 pocisk; wszystkie umiejętności sięgają o 15% dalej.", bonuses: [{ kind: "projectiles", add: 1 }, { kind: "reach", pct: 0.15 }] },
    life: { name: "Oko burzy", description: "+20% życia i 10% szybszy bieg.", bonuses: [{ kind: "hp", pct: 0.2 }, { kind: "speed", pct: 0.1 }] },
    art: { name: "Grzmot", description: "Piorun i Nawałnica zadają 30% więcej, ładunek statyczny rani mocniej.", bonuses: [{ kind: "damage", pct: 0.3, to: "skill:storm_bolt" }, { kind: "damage", pct: 0.3, to: "skill:storm_tempest" }, { kind: "status", status: "static", pct: 0.3 }] },
  },
  graves: {
    edge: { name: "Kostnica", description: "Każda umiejętność zatruwa, +10% obrażeń.", bonuses: [{ kind: "rider", effect: st("poison", 3, 3) }, { kind: "damage", pct: 0.1 }] },
    life: { name: "Nieumarły", description: "+30% życia; 8% mniej otrzymanych obrażeń.", bonuses: [{ kind: "hp", pct: 0.3 }, { kind: "armour", pct: 0.08 }] },
    art: { name: "Pan grobów", description: "Trucizna rani o 40% mocniej, Uczta sięga o 25% dalej.", bonuses: [{ kind: "status", status: "poison", pct: 0.4 }, { kind: "reach", pct: 0.25, to: "skill:graves_feast" }] },
  },
  dusk: {
    edge: { name: "Łowca", description: "Atak podstawowy zadaje 25% więcej i sięga o 20% dalej.", bonuses: [{ kind: "damage", pct: 0.25, to: "basic" }, { kind: "reach", pct: 0.2, to: "basic" }] },
    life: { name: "Jeździec zmierzchu", description: "+20% życia i 12% szybszy bieg.", bonuses: [{ kind: "hp", pct: 0.2 }, { kind: "speed", pct: 0.12 }] },
    art: { name: "Naznaczony na śmierć", description: "Znak wzmacnia mocniej, Naznaczenie odnawia się o 30% szybciej.", bonuses: [{ kind: "status", status: "mark", pct: 0.3 }, { kind: "cooldown", pct: -0.3, to: "skill:dusk_mark" }] },
  },
  sting: {
    edge: { name: "Jad trzcin", description: "Każda umiejętność zatruwa, umiejętności ścieżki zadają 15% więcej.", bonuses: [{ kind: "rider", effect: st("poison", 3, 3) }, { kind: "damage", pct: 0.15, to: "sig" }] },
    life: { name: "Odporność na jady", description: "+25% życia, 10% mniej otrzymanych obrażeń.", bonuses: [{ kind: "hp", pct: 0.25 }, { kind: "armour", pct: 0.1 }] },
    art: { name: "Wrzący kocioł", description: "Trucizna rani o 40% mocniej, Wrzący jad sięga o 25% szerzej.", bonuses: [{ kind: "status", status: "poison", pct: 0.4 }, { kind: "reach", pct: 0.25, to: "skill:sting_boil" }] },
  },
};

const n = (id: string, name: string, description: string, bonuses: Bonus[]): TalentNode => ({ id, name, description, bonuses });

/**
 * The path's talent tree. Ostrze (offence) and Żywot (sustain) are shaped alike for every path with
 * its own status and keystones; Sztuka works on the path's own three skills by name.
 */
export function talentTree(path: PathDef): TalentBranch[] {
  const p = path.id;
  const status = PATH_STATUS[p];
  const [s1, s2, s3] = path.signature;
  const ks = KEYSTONES[p];
  return [
    {
      id: "edge",
      name: "Ostrze",
      blurb: "Więcej obrażeń, szybsze odnowienie, dłuższe ramię.",
      tiers: [
        [n(`${p}.edge.0a`, "Ostra ręka", "+8% obrażeń wszystkich umiejętności.", [{ kind: "damage", pct: 0.08 }]), n(`${p}.edge.0b`, "Pierwszy cios", "+15% obrażeń ataku podstawowego.", [{ kind: "damage", pct: 0.15, to: "basic" }])],
        [n(`${p}.edge.1a`, "Rytm walki", "Umiejętności odnawiają się o 10% szybciej.", [{ kind: "cooldown", pct: -0.1 }]), n(`${p}.edge.1b`, "Długie ramię", "Umiejętności sięgają o 15% dalej.", [{ kind: "reach", pct: 0.15 }])],
        [n(`${p}.edge.2a`, "Znamię ścieżki", `Atak podstawowy nakłada ${statusWord(status)}.`, [{ kind: "rider", effect: st(status, 3, status === "slow" ? 0.3 : status === "mark" ? 0.1 : 2), to: "basic" }]), n(`${p}.edge.2b`, "Łamacz postawy", "Trafienia łamią postawę o 35% mocniej.", [{ kind: "poise", pct: 0.35 }])],
        [n(`${p}.edge.3a`, "Broń w dłoni", "Umiejętności broni zadają 12% więcej.", [{ kind: "damage", pct: 0.12, to: "weapon" }]), n(`${p}.edge.3b`, "Sztuka zabijania", "Umiejętności ścieżki zadają 12% więcej.", [{ kind: "damage", pct: 0.12, to: "sig" }])],
      ],
      keystone: { id: `${p}.edge.k`, ...ks.edge },
    },
    {
      id: "life",
      name: "Żywot",
      blurb: "Więcej życia, mniej ran, szybsze nogi.",
      tiers: [
        [n(`${p}.life.0a`, "Twarda skóra", "+10% życia.", [{ kind: "hp", pct: 0.1 }]), n(`${p}.life.0b`, "Unik w porę", "6% mniej otrzymanych obrażeń.", [{ kind: "armour", pct: 0.06 }])],
        [n(`${p}.life.1a`, "Picie z ran", "Atak podstawowy leczy o 5% zadanych obrażeń.", [{ kind: "rider", effect: { kind: "lifesteal", fraction: 0.05 }, to: "basic" }]), n(`${p}.life.1b`, "Gruba krew", "+12% życia.", [{ kind: "hp", pct: 0.12 }])],
        [n(`${p}.life.2a`, "Lekki krok", "Biegasz o 6% szybciej.", [{ kind: "speed", pct: 0.06 }]), n(`${p}.life.2b`, "Pancerz z blizn", "8% mniej otrzymanych obrażeń.", [{ kind: "armour", pct: 0.08 }])],
        [n(`${p}.life.3a`, "Nie do zabicia", "+15% życia.", [{ kind: "hp", pct: 0.15 }]), n(`${p}.life.3b`, "Krwawa wymiana", "Wszystkie umiejętności leczą o 4% zadanych obrażeń.", [{ kind: "rider", effect: { kind: "lifesteal", fraction: 0.04 } }])],
      ],
      keystone: { id: `${p}.life.k`, ...ks.life },
    },
    {
      id: "art",
      name: "Sztuka",
      blurb: `Trzy umiejętności ścieżki: ${s1.name}, ${s2.name}, ${s3.name}.`,
      tiers: [
        [n(`${p}.art.0a`, `${s1.name}: szybciej`, `${s1.name} odnawia się o 20% szybciej.`, [{ kind: "cooldown", pct: -0.2, to: `skill:${s1.id}` }]), n(`${p}.art.0b`, `${s1.name}: mocniej`, `${s1.name} zadaje 20% więcej.`, [{ kind: "damage", pct: 0.2, to: `skill:${s1.id}` }])],
        [n(`${p}.art.1a`, `${s2.name}: szybciej`, `${s2.name} odnawia się o 20% szybciej.`, [{ kind: "cooldown", pct: -0.2, to: `skill:${s2.id}` }]), n(`${p}.art.1b`, `${s2.name}: szerzej`, `${s2.name} sięga o 25% dalej.`, [{ kind: "reach", pct: 0.25, to: `skill:${s2.id}` }])],
        [n(`${p}.art.2a`, `${s3.name}: taniej`, `${s3.name} kosztuje 25% mniej.`, [{ kind: "cost", pct: -0.25, to: `skill:${s3.id}` }]), n(`${p}.art.2b`, `${s3.name}: mocniej`, `${s3.name} zadaje 25% więcej.`, [{ kind: "damage", pct: 0.25, to: `skill:${s3.id}` }])],
        [n(`${p}.art.3a`, "Biegłość ścieżki", "Umiejętności ścieżki odnawiają się o 12% szybciej.", [{ kind: "cooldown", pct: -0.12, to: "sig" }]), n(`${p}.art.3b`, "Moc ścieżki", "Umiejętności ścieżki zadają 10% więcej.", [{ kind: "damage", pct: 0.1, to: "sig" }])],
      ],
      keystone: { id: `${p}.art.k`, ...ks.art },
    },
  ];
}

function statusWord(s: StatusId) {
  return { bleed: "krwawienie", burn: "płonięcie", poison: "truciznę", slow: "spowolnienie", static: "ładunek statyczny", mark: "znak" }[s as string] ?? s;
}

/**
 * Keeps only talents this character may hold: nodes of their path, one per tier, tiers the level has
 * opened, a keystone only under a full branch, and no more than their points. Order is kept, so
 * the earliest picks win when points run short.
 */
export function validTalents(path: PathDef, raw: unknown, level: number): string[] {
  if (!Array.isArray(raw)) return [];
  const tree = talentTree(path);
  const out: string[] = [];
  const points = pointsAt(level);
  for (const id of raw) {
    if (typeof id !== "string" || out.includes(id) || out.length >= points) continue;
    for (const b of tree) {
      const t = b.tiers.findIndex((pair) => pair.some((x) => x.id === id));
      if (t >= 0) {
        const sibling = b.tiers[t].find((x) => x.id !== id)!;
        if (level >= TIER_LEVEL[t] && !out.includes(sibling.id)) out.push(id);
      } else if (b.keystone.id === id && level >= KEYSTONE_LEVEL && b.tiers.every((pair) => pair.some((x) => out.includes(x.id)))) out.push(id);
    }
  }
  return out;
}

/** The bonuses of a set of talents. */
export function talentBonuses(path: PathDef, talents: string[]): Bonus[] {
  const all = talentTree(path).flatMap((b) => [...b.tiers.flat(), b.keystone]);
  return talents.flatMap((id) => all.find((x) => x.id === id)?.bonuses ?? []);
}
