import type { PathId } from "@broken-ash/shared";

/** One accent colour per path: its skill shapes, icons and highlights are drawn in it. */
export const ACCENTS: Record<PathId, number> = {
  thorn: 0xd0381e, // vermilion
  bark: 0x7aa040, // moss
  blood: 0xb01226, // crimson
  ash: 0xf07c1c, // ember
  storm: 0x9aa8f0, // pale indigo
  graves: 0x58c0ac, // lantern teal
  dusk: 0xe0aa40, // amber
  sting: 0x84cc44, // venom green
};
