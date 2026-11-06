import type { PathId } from "../combat/types.js";

/**
 * How a path dresses the shared male/female body (a "look"): colour ramps, dark to light, that
 * replace the body's cloth and leather-trim colours. Gear will layer its own looks and add-on parts
 * on top later; these are each people's everyday colours (design.md "Peoples of Aeldrith").
 */
export interface Look {
  cloth: string[];
  trim: string[];
}

const OLD_GOLD = ["#3a2a10", "#6a4e1c", "#a07a2c", "#d0a848"];

export const PATH_LOOKS: Record<PathId, Look> = {
  // Thorn Clan: black lacquer with vermilion cords, old gold fittings.
  thorn: { cloth: ["#120a0c", "#2e1216", "#5e1a1c", "#962c24"], trim: OLD_GOLD },
  // Bark Monasteries: bark-brown robes bound with mossy cord.
  bark: { cloth: ["#1a1610", "#3a3020", "#5a4a30", "#7c6c48"], trim: ["#1c2414", "#33401f", "#4f5e2e", "#73843f"] },
  // Lacquer Court blood-scribes: crimson silk and gold.
  blood: { cloth: ["#160609", "#3c0c14", "#6c1220", "#9e2232"], trim: OLD_GOLD },
  // Ember Folk: soot-grey smith's cloth, ember-orange wraps.
  ash: { cloth: ["#141212", "#2a2624", "#443c36", "#5e5248"], trim: ["#3a1406", "#6e2a0a", "#b04a14", "#e07a28"] },
  // Wind Clan: storm indigo with silver.
  storm: { cloth: ["#0c1020", "#1c2848", "#2c4070", "#4a62a0"], trim: ["#2a2e36", "#4e5662", "#7e8896", "#b4bec8"] },
  // Lantern-Keepers: ash-pale grey-green, lantern teal.
  graves: { cloth: ["#14181a", "#2a3234", "#4a5654", "#728078"], trim: ["#0e2422", "#1c4440", "#2e6e66", "#58a89a"] },
  // Dusk Riders: steppe ochre felt, red-dyed leather.
  dusk: { cloth: ["#1a1408", "#3a2c14", "#5e4a24", "#86703c"], trim: ["#2a0e0a", "#4e1c14", "#7a3020", "#a64a30"] },
  // Reed Folk night runners: near-black with poison green.
  sting: { cloth: ["#08090c", "#14161c", "#20242c", "#2e343e"], trim: ["#0e1a0c", "#1e3618", "#36602a", "#5a8e40"] },
};

/**
 * Dyes a player can choose for cloth, trim and cape (character screen). The first eight are the
 * peoples' own colours (same as PATH_LOOKS), then a few neutral and rich ones.
 */
export const DYES: { id: string; name: string; ramp: string[] }[] = [
  { id: "lacquer", name: "Czarna laka", ramp: PATH_LOOKS.thorn.cloth },
  { id: "bark", name: "Kora", ramp: PATH_LOOKS.bark.cloth },
  { id: "crimson", name: "Karmazyn", ramp: PATH_LOOKS.blood.cloth },
  { id: "soot", name: "Sadza", ramp: PATH_LOOKS.ash.cloth },
  { id: "indigo", name: "Indygo burzy", ramp: PATH_LOOKS.storm.cloth },
  { id: "ashgreen", name: "Popielna zieleń", ramp: PATH_LOOKS.graves.cloth },
  { id: "ochre", name: "Ochra stepu", ramp: PATH_LOOKS.dusk.cloth },
  { id: "night", name: "Noc", ramp: PATH_LOOKS.sting.cloth },
  { id: "gold", name: "Stare złoto", ramp: ["#3a2a10", "#6a4e1c", "#a07a2c", "#d0a848"] },
  { id: "vermilion", name: "Cynober", ramp: ["#3a0a08", "#7a1810", "#b82c1a", "#e0502c"] },
  { id: "ivory", name: "Kość słoniowa", ramp: ["#4a4438", "#7a7262", "#b2a890", "#e2dac4"] },
  { id: "jade", name: "Jadeit", ramp: ["#0e2a22", "#1c4a3a", "#2e7258", "#56a080"] },
  { id: "plum", name: "Śliwka", ramp: ["#1e0c1c", "#3c1838", "#5e2856", "#86407a"] },
  { id: "moss", name: "Mech", ramp: PATH_LOOKS.bark.trim },
  { id: "ember", name: "Żar", ramp: PATH_LOOKS.ash.trim },
  { id: "teal", name: "Morska woda", ramp: PATH_LOOKS.graves.trim },
];

/** Skin tones (light to dark), replacing the bodies' skin ramp. */
export const SKIN_TONES: { name: string; ramp: string[] }[] = [
  { name: "Porcelana", ramp: ["#8a5040", "#c08068", "#e8b496", "#f8d8c0"] },
  { name: "Jasna", ramp: ["#904a42", "#c8745a", "#e1916e", "#f9c5a1"] },
  { name: "Złocista", ramp: ["#7a4630", "#a8683e", "#cc9058", "#e8b882"] },
  { name: "Oliwkowa", ramp: ["#5a3826", "#86583a", "#a87a52", "#c89c70"] },
  { name: "Ciemna", ramp: ["#2e1a12", "#4e3020", "#704830", "#94643e"] },
];

export type ArmourId = "none" | "lamellar" | "silk" | "leather" | "bark" | "scale";
export type HeadId = "none" | "kabuto" | "kasa" | "hood" | "mask" | "band" | "veil";
export type ShoulderId = "none" | "sode" | "fur";

export const ARMOURS: { id: ArmourId; name: string }[] = [
  { id: "none", name: "Tunika" },
  { id: "lamellar", name: "Lamelka" },
  { id: "scale", name: "Łuska" },
  { id: "silk", name: "Jedwab" },
  { id: "leather", name: "Skóra" },
  { id: "bark", name: "Kora" },
];
export const HEADS: { id: HeadId; name: string }[] = [
  { id: "none", name: "Nic" },
  { id: "kabuto", name: "Hełm z grzebieniem" },
  { id: "kasa", name: "Słomkowy kapelusz" },
  { id: "hood", name: "Kaptur" },
  { id: "mask", name: "Maska demona" },
  { id: "band", name: "Opaska" },
  { id: "veil", name: "Welon strażnika" },
];
export const SHOULDERS: { id: ShoulderId; name: string }[] = [
  { id: "none", name: "Nic" },
  { id: "sode", name: "Naramienniki" },
  { id: "fur", name: "Futro" },
];

/** What a player looks like: indices into the tables above (`cape` -1 = no cape). */
export interface CharacterLook {
  skin: number;
  cloth: number;
  trim: number;
  armour: ArmourId;
  head: HeadId;
  shoulders: ShoulderId;
  cape: number;
}

/** Each path's default dress: its people's colours and gear. */
export const DEFAULT_LOOKS: Record<PathId, CharacterLook> = {
  thorn: { skin: 1, cloth: 0, trim: 8, armour: "lamellar", head: "band", shoulders: "sode", cape: -1 },
  bark: { skin: 2, cloth: 1, trim: 13, armour: "bark", head: "kasa", shoulders: "fur", cape: -1 },
  blood: { skin: 0, cloth: 2, trim: 8, armour: "silk", head: "none", shoulders: "none", cape: 2 },
  ash: { skin: 2, cloth: 3, trim: 14, armour: "leather", head: "band", shoulders: "none", cape: -1 },
  storm: { skin: 1, cloth: 4, trim: 10, armour: "silk", head: "none", shoulders: "sode", cape: 4 },
  graves: { skin: 0, cloth: 5, trim: 15, armour: "silk", head: "veil", shoulders: "none", cape: 5 },
  dusk: { skin: 3, cloth: 6, trim: 9, armour: "leather", head: "hood", shoulders: "fur", cape: -1 },
  sting: { skin: 3, cloth: 7, trim: 13, armour: "scale", head: "mask", shoulders: "none", cape: -1 },
};

const inRange = (v: unknown, n: number, fallback: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n ? v : fallback);
const oneOf = <T extends string>(v: unknown, list: { id: T }[], fallback: T): T => (list.some((x) => x.id === v) ? (v as T) : fallback);

/** A look from untrusted input (a client, a save file): every field clamped to what exists. */
export function validLook(raw: unknown, path: PathId): CharacterLook {
  const d = DEFAULT_LOOKS[path];
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof CharacterLook, unknown>>;
  return {
    skin: inRange(r.skin, SKIN_TONES.length, d.skin),
    cloth: inRange(r.cloth, DYES.length, d.cloth),
    trim: inRange(r.trim, DYES.length, d.trim),
    armour: oneOf(r.armour, ARMOURS, d.armour),
    head: oneOf(r.head, HEADS, d.head),
    shoulders: oneOf(r.shoulders, SHOULDERS, d.shoulders),
    cape: r.cape === -1 ? -1 : inRange(r.cape, DYES.length, d.cape),
  };
}
