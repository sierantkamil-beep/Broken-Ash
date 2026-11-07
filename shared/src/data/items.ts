import type { StatusId, WeaponId } from "../combat/types.js";
import type { Bonus } from "../progress.js";
import type { ArmourId, HeadId, ShoulderId } from "./looks.js";

/*
 * Items (design.md §6): what you wear and wield. Every slot is a decision: a base (what it is, how
 * big it is in the bag, what it shows on the body), a rarity, and up to four affixes rolled from the
 * slot's pool. Ashen uniques change how skills work and belong to a person or place in the story;
 * relics are strong and cursed. Bonuses use progress.ts's language, so talents and gear add up in
 * one place.
 */

export type ItemSlot = "weapon" | "head" | "chest" | "hands" | "legs" | "boots" | "amulet" | "ring" | "relic";
export type EquipSlot = "weapon" | "head" | "chest" | "hands" | "legs" | "boots" | "amulet" | "ring1" | "ring2" | "relic";
export const EQUIP_SLOTS: EquipSlot[] = ["weapon", "head", "chest", "hands", "legs", "boots", "amulet", "ring1", "ring2", "relic"];
export const slotOf = (e: EquipSlot): ItemSlot => (e === "ring1" || e === "ring2" ? "ring" : e);

export const SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: "Broń",
  head: "Głowa",
  chest: "Pierś",
  hands: "Dłonie",
  legs: "Nogi",
  boots: "Stopy",
  amulet: "Amulet",
  ring1: "Pierścień",
  ring2: "Pierścień",
  relic: "Relikwia",
};

export type Rarity = "common" | "fine" | "rare" | "ashen";
export const RARITY: Record<Rarity, { name: string; color: string; affixes: [number, number] }> = {
  common: { name: "Zwykły", color: "#9a9590", affixes: [0, 0] },
  fine: { name: "Dobry", color: "#e8e2d6", affixes: [1, 2] },
  rare: { name: "Rzadki", color: "#5a9ae0", affixes: [3, 4] },
  ashen: { name: "Popielny", color: "#e0442a", affixes: [2, 2] },
};

export interface ItemBase {
  id: string;
  name: string;
  slot: ItemSlot;
  /** Size in the bag's grid (cells). */
  w: number;
  h: number;
  tier: 1 | 2 | 3;
  /** A weapon base's type: equipping it puts that weapon in your hands (its skills, its mastery). */
  weapon?: WeaponId;
  /** What it changes on the body (armour material, head piece, shoulders). */
  look?: { armour?: ArmourId; head?: HeadId; shoulders?: ShoulderId };
  /** The base's own bonuses, always there (the "implicit"). */
  base: Bonus[];
  /** A line of flavour (people and craft). */
  flavour?: string;
}

const dmgW = (pct: number): Bonus[] => (pct ? [{ kind: "damage", pct, to: "weapon" }] : []);

/** Three tiers per weapon type: worn, clan-made, master-made. Bigger hits each step. */
const WEAPON_BASES: [WeaponId, string[], number, number][] = [
  ["blades", ["Para zardzewiałych ostrzy", "Para ostrzy Klanu Ciernia", "Bliźnięta z Soramei"], 2, 3],
  ["glaive", ["Glewia strażnika", "Glewia mnichów z Kory", "Księżycowa glewia"], 1, 4],
  ["greatblade", ["Ciężki tasak", "Ostrze dwuręczne Żaru", "Ostrze Złamanego Jesionu"], 2, 4],
  ["brush", ["Pędzel pisarza", "Pędzel krwawego tuszu", "Pędzel Dworu Laki"], 1, 2],
  ["talismans", ["Garść talizmanów", "Talizmany kapłanów", "Talizmany Starszego Ognia"], 1, 2],
  ["fan", ["Wachlarz z bambusa", "Wachlarz bojowy Wiatru", "Wachlarz Burzy"], 1, 2],
  ["lantern", ["Latarnia pielgrzyma", "Latarnia duchów", "Latarnia Strażniczek"], 1, 2],
  ["bow", ["Łuk myśliwski", "Łuk jeźdźców Zmierzchu", "Długi łuk z Trzcin"], 1, 4],
  ["knives", ["Noże do patroszenia", "Noże Trzcin", "Noże cichej śmierci"], 1, 2],
];

const ARMOUR_BASES: { id: string; name: string[]; armour: ArmourId; shoulders: ShoulderId; hp: number; arm: number }[] = [
  { id: "lamellar", name: ["Zniszczona lamelka", "Lamelka Klanu", "Lakierowana lamelka"], armour: "lamellar", shoulders: "sode", hp: 10, arm: 0.04 },
  { id: "scale", name: ["Łuskowy kaftan", "Pancerz z łusek", "Smocza łuska"], armour: "scale", shoulders: "sode", hp: 6, arm: 0.05 },
  { id: "silk", name: ["Jedwabna szata", "Szata dworska", "Szata z nocnego jedwabiu"], armour: "silk", shoulders: "none", hp: 4, arm: 0.01 },
  { id: "leather", name: ["Skórzany kaftan", "Kurta myśliwska", "Kurta z garbowanej skóry"], armour: "leather", shoulders: "none", hp: 8, arm: 0.03 },
  { id: "bark", name: ["Kaftan z kory", "Pancerz z kory", "Kora stuletniego dębu"], armour: "bark", shoulders: "fur", hp: 12, arm: 0.03 },
  { id: "tunic", name: ["Tunika skazańca", "Tunika wędrowca", "Tunika z lnu"], armour: "none", shoulders: "none", hp: 3, arm: 0 },
];

const HEAD_BASES: { head: HeadId; name: string[]; hp: number; arm: number }[] = [
  { head: "kabuto", name: ["Pogięty hełm", "Hełm z grzebieniem", "Hełm generała"], hp: 6, arm: 0.03 },
  { head: "kasa", name: ["Słomkowy kapelusz", "Kapelusz wędrownego mnicha", "Kapelusz z laki"], hp: 4, arm: 0.01 },
  { head: "hood", name: ["Kaptur", "Kaptur zwiadowcy", "Kaptur Zmierzchu"], hp: 3, arm: 0.01 },
  { head: "mask", name: ["Drewniana maska", "Maska demona", "Maska z Popiołu"], hp: 2, arm: 0.02 },
  { head: "band", name: ["Opaska", "Opaska wojownika", "Opaska z czerwonego jedwabiu"], hp: 3, arm: 0.0 },
  { head: "veil", name: ["Welon", "Welon strażnika", "Welon Latarni"], hp: 3, arm: 0.01 },
];

/** Hands, legs, boots: no look of their own (the bodies don't show them), numbers only. */
const PLAIN_BASES: { slot: ItemSlot; ids: string; name: string[]; base: (tier: number) => Bonus[] }[] = [
  { slot: "hands", ids: "gloves", name: ["Owijki", "Rękawice skórzane", "Rękawice z łusek"], base: (t) => [{ kind: "armour", pct: 0.01 * t }] },
  { slot: "hands", ids: "bracers", name: ["Karwasze", "Karwasze łucznika", "Karwasze z laki"], base: (t) => [{ kind: "damage", pct: 0.02 * t }] },
  { slot: "legs", ids: "trousers", name: ["Spodnie z konopi", "Nogawice", "Hakama mistrza"], base: (t) => [{ kind: "hp", add: 5 * t }] },
  { slot: "legs", ids: "greaves", name: ["Nagolenniki", "Nagolenniki z łusek", "Nagolenniki gwardii"], base: (t) => [{ kind: "armour", pct: 0.015 * t }] },
  { slot: "boots", ids: "sandals", name: ["Sandały ze słomy", "Sandały wędrowca", "Sandały mnicha"], base: (t) => [{ kind: "speed", pct: 0.02 * t }] },
  { slot: "boots", ids: "boots", name: ["Buty z łyka", "Buty z garbowanej skóry", "Buty jeźdźca"], base: (t) => [{ kind: "armour", pct: 0.01 * t }, { kind: "speed", pct: 0.01 * t }] },
  { slot: "amulet", ids: "amulet", name: ["Kamyk na sznurku", "Amulet z kości", "Amulet z żywicy"], base: (t) => [{ kind: "hp", add: 6 * t }] },
  { slot: "ring", ids: "ring", name: ["Żelazny pierścień", "Srebrny pierścień", "Pierścień z popiołu"], base: (t) => [{ kind: "damage", pct: 0.015 * t }] },
];

function build(): Record<string, ItemBase> {
  const out: Record<string, ItemBase> = {};
  const add = (b: ItemBase) => (out[b.id] = b);
  for (const [w, names, wd, ht] of WEAPON_BASES)
    names.forEach((name, i) => add({ id: `${w}.${i + 1}`, name, slot: "weapon", w: wd, h: ht, tier: (i + 1) as 1 | 2 | 3, weapon: w, base: dmgW(i * 0.08) }));
  for (const a of ARMOUR_BASES)
    a.name.forEach((name, i) => add({ id: `chest.${a.id}.${i + 1}`, name, slot: "chest", w: 2, h: 3, tier: (i + 1) as 1 | 2 | 3, look: { armour: a.armour, shoulders: a.shoulders }, base: [{ kind: "hp", add: a.hp * (i + 1) }, ...(a.arm ? [{ kind: "armour", pct: a.arm * (i + 1) } as Bonus] : [])] }));
  for (const h of HEAD_BASES)
    h.name.forEach((name, i) => add({ id: `head.${h.head}.${i + 1}`, name, slot: "head", w: 2, h: 2, tier: (i + 1) as 1 | 2 | 3, look: { head: h.head }, base: [{ kind: "hp", add: h.hp * (i + 1) }, ...(h.arm ? [{ kind: "armour", pct: h.arm * (i + 1) } as Bonus] : [])] }));
  for (const p of PLAIN_BASES)
    p.name.forEach((name, i) => {
      const small = p.slot === "ring" || p.slot === "amulet";
      add({ id: `${p.slot}.${p.ids}.${i + 1}`, name, slot: p.slot, w: small ? 1 : 2, h: small ? 1 : 2, tier: (i + 1) as 1 | 2 | 3, base: p.base(i + 1) });
    });
  for (const r of RELICS) add({ id: r.id, name: r.name, slot: "relic", w: 1, h: 2, tier: 3, base: r.bonuses, flavour: r.flavour });
  for (const u of UNIQUES) add({ ...out[u.base], id: u.id, name: u.name, flavour: u.flavour, base: [...out[u.base].base, ...u.bonuses] });
  return out;
}

/**
 * Relics: power with a curse attached (the trade-off is the point). Always found, never rolled at
 * random from enemies: chests and bosses.
 */
const RELICS: { id: string; name: string; flavour: string; bonuses: Bonus[] }[] = [
  { id: "relic.ysolde_shard", name: "Drzazga Jesionu", flavour: "Kawałek pnia, który ścięła królowa. Wciąż sączy. Pije też ciebie.", bonuses: [{ kind: "damage", pct: 0.25 }, { kind: "hp", pct: -0.2 }] },
  { id: "relic.ash_brand", name: "Piętno Popielnych", flavour: "Żelazo, którym znaczą skazańców. Kto je nosi, nie ma już nic do stracenia.", bonuses: [{ kind: "cooldown", pct: -0.2 }, { kind: "armour", pct: -0.15 }] },
  { id: "relic.tapper_valve", name: "Zawór Upuszczacza", flavour: "Wciąż chce pompować. Rany otwierają się łatwiej, także twoje.", bonuses: [{ kind: "status", status: "bleed", pct: 0.5 }, { kind: "hp", pct: -0.12 }] },
  { id: "relic.drowned_bell", name: "Dzwon utopionych", flavour: "Słychać go tylko pod wodą. Albo w głowie.", bonuses: [{ kind: "reach", pct: 0.25 }, { kind: "speed", pct: -0.1 }] },
];

/** Ashen uniques: a base with a name, a story and something no roll gives. */
const UNIQUES: { id: string; base: string; name: string; flavour: string; bonuses: Bonus[] }[] = [
  { id: "u.tapper_cleaver", base: "greatblade.2", name: "Tasak Upuszczacza", flavour: "Wyszczerbiony od kości. Rękojeść lepi się od żywicy.", bonuses: [{ kind: "rider", effect: { kind: "status", status: "bleed", duration: 4, value: 4 }, to: "weapon" }, { kind: "rider", effect: { kind: "lifesteal", fraction: 0.06 }, to: "weapon" }] },
  { id: "u.guard_blades", base: "blades.2", name: "Ostrza Kaelitha", flavour: "Strażnik Pnia trzymał je do końca. Nie pomogły mu, może pomogą tobie.", bonuses: [{ kind: "cooldown", pct: -0.15, to: "weapon" }, { kind: "damage", pct: 0.1, to: "basic" }] },
  { id: "u.harrow_crossbow", base: "bow.2", name: "Kusza zwiadowcy Harrowa", flavour: "Ludzka robota: brzydka, ciężka i niezawodna.", bonuses: [{ kind: "damage", pct: 0.2, to: "basic" }, { kind: "projectiles", add: 1, to: "rmb" }] },
  { id: "u.itheru_band", base: "head.band.3", name: "Opaska Itheru", flavour: "Dał ci ją bez słowa. Pachnie dymem z jego ogniska.", bonuses: [{ kind: "hp", pct: 0.1 }, { kind: "cooldown", pct: -0.08 }] },
  { id: "u.mine_lamp", base: "head.kasa.2", name: "Lampa górnika", flavour: "Wciąż się pali. Nikt nie wie, czym.", bonuses: [{ kind: "reach", pct: 0.12, to: "sig" }, { kind: "damage", pct: 0.08, to: "sig" }] },
];

export const ITEM_BASES: Record<string, ItemBase> = build();

// ------------------------------------------------------------------------------------------ affixes

export interface AffixDef {
  id: string;
  /** Polish text with `{v}` for the rolled value (shown as a percent where it is one). */
  text: string;
  slots: ItemSlot[];
  /** Value range at item level 1 and the cap it grows towards (level 20). */
  min: number;
  max: number;
  pct: boolean;
  make(v: number): Bonus;
}

const ALL_ARMOUR: ItemSlot[] = ["head", "chest", "hands", "legs", "boots"];
const JEWEL: ItemSlot[] = ["amulet", "ring"];
const sx = (s: StatusId, name: string): AffixDef => ({ id: `st.${s}`, text: `+{v} obrażeń od: ${name}`, slots: ["weapon", ...JEWEL], min: 0.06, max: 0.3, pct: true, make: (v) => ({ kind: "status", status: s, pct: v }) });

export const AFFIXES: AffixDef[] = [
  { id: "dmg", text: "+{v} obrażeń", slots: ["weapon", ...JEWEL, "hands"], min: 0.03, max: 0.15, pct: true, make: (v) => ({ kind: "damage", pct: v }) },
  { id: "dmg.basic", text: "+{v} obrażeń ataku podstawowego", slots: ["weapon", "hands"], min: 0.05, max: 0.25, pct: true, make: (v) => ({ kind: "damage", pct: v, to: "basic" }) },
  { id: "dmg.sig", text: "+{v} obrażeń umiejętności ścieżki", slots: [...JEWEL, "head", "relic"], min: 0.04, max: 0.2, pct: true, make: (v) => ({ kind: "damage", pct: v, to: "sig" }) },
  { id: "cd", text: "{v} szybsze odnawianie", slots: ["head", ...JEWEL, "hands"], min: 0.03, max: 0.12, pct: true, make: (v) => ({ kind: "cooldown", pct: -v }) },
  { id: "reach", text: "+{v} zasięgu umiejętności", slots: ["weapon", "amulet", "head"], min: 0.04, max: 0.2, pct: true, make: (v) => ({ kind: "reach", pct: v }) },
  { id: "poise", text: "+{v} łamania postawy", slots: ["weapon", "hands"], min: 0.08, max: 0.4, pct: true, make: (v) => ({ kind: "poise", pct: v }) },
  { id: "cost", text: "{v} niższy koszt umiejętności", slots: ["amulet", "head", "chest"], min: 0.04, max: 0.15, pct: true, make: (v) => ({ kind: "cost", pct: -v }) },
  { id: "hp", text: "+{v} życia", slots: [...ALL_ARMOUR, ...JEWEL], min: 6, max: 60, pct: false, make: (v) => ({ kind: "hp", add: v }) },
  { id: "hp.pct", text: "+{v} życia", slots: ["chest", "amulet"], min: 0.03, max: 0.12, pct: true, make: (v) => ({ kind: "hp", pct: v }) },
  { id: "armour", text: "{v} mniej otrzymanych obrażeń", slots: ALL_ARMOUR, min: 0.01, max: 0.06, pct: true, make: (v) => ({ kind: "armour", pct: v }) },
  { id: "speed", text: "+{v} szybkości biegu", slots: ["boots", "legs"], min: 0.02, max: 0.08, pct: true, make: (v) => ({ kind: "speed", pct: v }) },
  { id: "leech", text: "Leczy o {v} zadanych obrażeń", slots: ["weapon", "ring"], min: 0.01, max: 0.05, pct: true, make: (v) => ({ kind: "rider", effect: { kind: "lifesteal", fraction: v } }) },
  sx("bleed", "krwawienia"),
  sx("burn", "płonięcia"),
  sx("poison", "trucizny"),
  sx("static", "ładunku"),
];
export const AFFIX = Object.fromEntries(AFFIXES.map((a) => [a.id, a])) as Record<string, AffixDef>;

// ------------------------------------------------------------------------------------------ items

/** An item: its base, rarity, level and rolled affixes ([affix id, value]). */
export interface Item {
  uid: string;
  base: string;
  rarity: Rarity;
  level: number;
  affixes: [string, number][];
}

export function itemBase(it: Item): ItemBase {
  return ITEM_BASES[it.base];
}

/** Every bonus an item gives: its base's and its affixes'. */
export function itemBonuses(it: Item): Bonus[] {
  const b = ITEM_BASES[it.base];
  if (!b) return [];
  return [...b.base, ...it.affixes.flatMap(([id, v]) => (AFFIX[id] ? [AFFIX[id].make(v)] : []))];
}

/** An affix's line, with its value written out. */
export function affixText(id: string, v: number): string {
  const a = AFFIX[id];
  if (!a) return id;
  return a.text.replace("{v}", a.pct ? `${Math.round(v * 100)}%` : String(Math.round(v)));
}

/** A small deterministic random source (mulberry32), so rolls are testable and the host decides them. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bases a roll may give for a slot and level: no relics or uniques; tiers open with level. */
function pool(slot: ItemSlot | undefined, level: number) {
  const tierMax = level >= 10 ? 3 : level >= 4 ? 2 : 1;
  return Object.values(ITEM_BASES).filter((b) => b.slot !== "relic" && !b.id.startsWith("u.") && (!slot || b.slot === slot) && b.tier <= tierMax);
}

/**
 * Rolls a new item: a base for the slot (any slot when not given), a rarity (better with `luck`), and
 * affixes from the slot's pool, each different, stronger at higher levels.
 */
export function rollItem(rand: () => number, level: number, uid: string, o: { slot?: ItemSlot; luck?: number; rarity?: Rarity } = {}): Item {
  const bases = pool(o.slot, level);
  const base = bases[Math.floor(rand() * bases.length)];
  const luck = o.luck ?? 0;
  const r = rand() - luck;
  const rarity: Rarity = o.rarity ?? (r < 0.08 ? "rare" : r < 0.4 ? "fine" : "common");
  const [lo, hi] = RARITY[rarity].affixes;
  const count = lo + Math.floor(rand() * (hi - lo + 1));
  const candidates = AFFIXES.filter((a) => a.slots.includes(base.slot));
  const affixes: [string, number][] = [];
  const k = Math.min(1, (level - 1) / 19);
  while (affixes.length < count && candidates.length) {
    const a = candidates.splice(Math.floor(rand() * candidates.length), 1)[0];
    const top = a.min + (a.max - a.min) * (0.35 + 0.65 * k);
    const v = a.min + (top - a.min) * rand();
    affixes.push([a.id, a.pct ? Math.round(v * 100) / 100 : Math.round(v)]);
  }
  return { uid, base: base.id, rarity, level, affixes };
}

/** A specific item (a starting weapon, a story reward): common unless told, no affixes unless given. */
export function makeItem(base: string, uid: string, rarity: Rarity = "common", level = 1, affixes: [string, number][] = []): Item {
  return { uid, base, rarity: base.startsWith("u.") ? "ashen" : base.startsWith("relic.") ? "ashen" : rarity, level, affixes };
}

/** Checks an item from a save or a client: known base, known affixes, sane values. */
export function validItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Item>;
  if (typeof r.uid !== "string" || r.uid.length > 40 || typeof r.base !== "string" || !ITEM_BASES[r.base]) return null;
  const rarity: Rarity = r.rarity && r.rarity in RARITY ? r.rarity : "common";
  const level = typeof r.level === "number" && r.level >= 1 && r.level <= 20 ? Math.floor(r.level) : 1;
  const affixes = Array.isArray(r.affixes)
    ? r.affixes
        .filter((a): a is [string, number] => Array.isArray(a) && typeof a[0] === "string" && !!AFFIX[a[0]] && typeof a[1] === "number" && Number.isFinite(a[1]))
        .slice(0, 4)
        .map(([id, v]) => [id, Math.max(-1, Math.min(AFFIX[id].pct ? 1 : 200, v))] as [string, number])
    : [];
  return { uid: r.uid, base: r.base, rarity, level, affixes };
}
