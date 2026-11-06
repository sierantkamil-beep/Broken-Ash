/**
 * Prop catalogue: gameplay facts only (footprint, what blocks, lights). The sprites are rendered by
 * tools/art/render.py under the same ids; their pixel anchors come from the art's own metadata.
 */
export interface PropDef {
  /** Player-facing name (Polish), shown on hover later. */
  name: string;
  /** Footprint size in cells; the sprite is centred on the footprint. */
  w: number;
  h: number;
  /** Cells (relative to the footprint origin) that block movement. */
  blocks: [number, number][];
  /** Light source, if any: height above ground (cells), radius (cells), colour, flicker. */
  /** `hidden`: the flame is under a roof, so it lights the ground but shows no halo of its own. */
  light?: { z: number; radius: number; color: number; flicker?: boolean; intensity?: number; hidden?: boolean };
  /** Number of rendered variants. */
  variants: number;
  /** Flat props (gore, decals) are drawn under everything standing. */
  flat?: boolean;
}

export const PROPS = {
  gate_vermilion: { name: "Cynobrowa brama", w: 3, h: 1, blocks: [[0, 0], [2, 0]], variants: 1 },
  stone_lantern: {
    name: "Kamienna latarnia",
    w: 1,
    h: 1,
    blocks: [[0, 0]],
    light: { z: 1.05, radius: 4.2, color: 0xffa858, flicker: true, intensity: 0.95 },
    variants: 1,
  },
  paper_lantern: {
    name: "Papierowy lampion",
    w: 1,
    h: 1,
    blocks: [[0, 0]],
    light: { z: 2.0, radius: 5.5, color: 0xff5634, flicker: true, intensity: 1 },
    variants: 1,
  },
  blossom_tree: { name: "Krwawe drzewo kwitnące", w: 3, h: 3, blocks: [[1, 1]], variants: 3 },
  shrine: {
    name: "Kaplica przodków",
    w: 4,
    h: 4,
    // The building stands on the three western columns; the fourth holds its steps, facing the plaza.
    blocks: [
      [0, 0], [1, 0], [2, 0],
      [0, 1], [1, 1], [2, 1],
      [0, 2], [1, 2], [2, 2],
      [0, 3], [1, 3], [2, 3],
    ],
    light: { z: 1.0, radius: 3.2, color: 0xff7a3a, flicker: true, intensity: 0.7, hidden: true },
    variants: 1,
  },
  wall_x: { name: "Mur", w: 1, h: 1, blocks: [[0, 0]], variants: 1 },
  wall_y: { name: "Mur", w: 1, h: 1, blocks: [[0, 0]], variants: 1 },
  wall_post: { name: "Mur", w: 1, h: 1, blocks: [[0, 0]], variants: 1 },
  rock: { name: "Głaz", w: 1, h: 1, blocks: [[0, 0]], variants: 3 },
  bamboo: { name: "Bambus", w: 1, h: 1, blocks: [[0, 0]], variants: 2 },
  banner: { name: "Chorągiew rodu Soramei", w: 1, h: 1, blocks: [[0, 0]], variants: 1 },
  corpse_greyed: { name: "Martwy Szary", w: 2, h: 1, blocks: [], variants: 2, flat: true },
  blood_pool: { name: "Krew", w: 1, h: 1, blocks: [], variants: 4, flat: true },
  // Act 1: the cells under the keep, the Drowned Sap-Mine, the burned farmstead, Harrow's road.
  bars_x: { name: "Kraty celi", w: 1, h: 1, blocks: [[0, 0]], variants: 1 },
  bars_y: { name: "Kraty celi", w: 1, h: 1, blocks: [[0, 0]], variants: 1 },
  rockwall: { name: "Skała", w: 1, h: 1, blocks: [[0, 0]], variants: 3 },
  brazier: { name: "Kosz żarowy", w: 1, h: 1, blocks: [[0, 0]], light: { z: 0.85, radius: 4.5, color: 0xff8a3a, flicker: true, intensity: 1 }, variants: 1 },
  torch_post: { name: "Pochodnia", w: 1, h: 1, blocks: [[0, 0]], light: { z: 2.0, radius: 4, color: 0xffa050, flicker: true, intensity: 0.95 }, variants: 1 },
  support: { name: "Stempel", w: 1, h: 1, blocks: [[0, 0]], variants: 1 },
  cart: { name: "Wózek z urobkiem", w: 2, h: 1, blocks: [[0, 0], [1, 0]], light: { z: 0.8, radius: 1.6, color: 0xc87818, intensity: 0.4, hidden: true }, variants: 1 },
  barrel: { name: "Beczka", w: 1, h: 1, blocks: [[0, 0]], variants: 2 },
  crate: { name: "Skrzynia", w: 1, h: 1, blocks: [[0, 0]], variants: 1 },
  lever: { name: "Dźwignia pompy", w: 1, h: 1, blocks: [[0, 0]], variants: 1 },
  pump: { name: "Pompa żywicy", w: 2, h: 2, blocks: [[0, 0], [1, 0], [0, 1], [1, 1]], light: { z: 0.8, radius: 2.4, color: 0xc87818, intensity: 0.6, hidden: true }, variants: 1 },
  tent: { name: "Namiot", w: 3, h: 3, blocks: [[1, 1], [0, 1], [2, 1]], variants: 1 },
  palisade_x: { name: "Palisada", w: 1, h: 1, blocks: [[0, 0]], variants: 1 },
  palisade_y: { name: "Palisada", w: 1, h: 1, blocks: [[0, 0]], variants: 1 },
  house_burnt: { name: "Spalona chata", w: 4, h: 3, blocks: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 2], [3, 2]], light: { z: 0.2, radius: 2, color: 0xe0601a, flicker: true, intensity: 0.5, hidden: true }, variants: 1 },
  campfire: { name: "Ognisko", w: 1, h: 1, blocks: [[0, 0]], light: { z: 0.4, radius: 5, color: 0xff8a3a, flicker: true, intensity: 1.1 }, variants: 1 },
  dead_tree: { name: "Martwe drzewo", w: 2, h: 2, blocks: [[0, 0]], variants: 2 },
  pine: { name: "Sosna", w: 2, h: 2, blocks: [[0, 0]], variants: 3 },
} satisfies Record<string, PropDef>;

export type PropKind = keyof typeof PROPS;
export const PROP_KINDS = Object.keys(PROPS) as PropKind[];
