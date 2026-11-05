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
