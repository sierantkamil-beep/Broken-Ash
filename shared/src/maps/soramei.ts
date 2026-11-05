import { MapBuilder } from "./builder.js";

/**
 * Dziedziniec Soramei — the courtyard of the ruined Soramei Keep, the night of the escape (Act 1).
 * Blossom trees still bloom red here; a stone path runs from the vermilion gate to the ancestor
 * shrine; the dead from the last Greyed attack haven't been cleared away.
 *
 * Screen orientation: (0, 0) is the top corner. Walls run along the two back edges (y = 0, x = 0);
 * the front edges are closed by bamboo and rocks so nothing tall stands between camera and players.
 */
const W = 30;
const H = 30;
const b = new MapBuilder(W, H, "moss");

// Ground: paved path gate → plaza → shrine, a raked gravel garden, a koi pond, trampled dirt.
b.rect("dirt", 11, 1, 17, 4);
b.rect("paving", 13, 1, 15, 22); // the main path from the gate
b.rect("paving", 9, 11, 20, 17); // the plaza
b.rect("paving", 4, 13, 9, 15); // to the shrine
b.rect("gravel", 19, 3, 26, 9);
b.blob("water", 22.5, 21.5, 3.6, 2.8);
b.blob("dirt", 8, 22, 2.5, 2);

// The back walls with the gate in the middle of the north-east wall.
for (let x = 1; x < W; x++) if (x < 13 || x > 15) b.prop("wall_x", x, 0);
for (let y = 1; y < H; y++) b.prop("wall_y", 0, y);
b.prop("wall_post", 0, 0);
b.prop("gate_vermilion", 13, 0);

// The ancestor shrine against the north-west wall, banners of House Soramei either side.
b.prop("shrine", 1, 12);
b.prop("banner", 2, 11);
b.prop("banner", 2, 17);

// Stone lanterns line the path; paper lanterns hang at the plaza corners.
for (const y of [3, 7]) {
  b.prop("stone_lantern", 12, y);
  b.prop("stone_lantern", 16, y);
}
b.prop("paper_lantern", 8, 10);
b.prop("paper_lantern", 21, 10);
b.prop("paper_lantern", 8, 18);
b.prop("paper_lantern", 21, 18);

// Blossom trees (3×3 footprint, trunk in the middle) on the moss.
b.prop("blossom_tree", 4, 3, 0);
b.prop("blossom_tree", 7, 6, 1, true);
b.prop("blossom_tree", 3, 20, 2);
b.prop("blossom_tree", 17, 23, 0, true);
b.prop("blossom_tree", 24, 12, 1);
b.prop("blossom_tree", 10, 24, 2, true);

// The gravel garden's stones.
b.prop("rock", 21, 5, 0);
b.prop("rock", 24, 7, 1);
b.prop("rock", 23, 4, 2);
// Stones around the pond.
b.prop("rock", 19, 20, 1);
b.prop("rock", 26, 23, 0);

// Bamboo closes the front edges.
for (let x = 2; x < W; x += 1) if (x % 3 !== 0 || x > 26) b.prop("bamboo", x, H - 1, x % 2);
for (let y = 2; y < H - 1; y += 1) if (y % 3 !== 1 || y > 26) b.prop("bamboo", W - 1, y, y % 2);
b.prop("rock", 0, H - 1, 2);
b.prop("rock", W - 1, 1, 0);

// The dead of the last attack: Greyed cut down by the gate, one on the plaza.
b.prop("corpse_greyed", 14, 5, 0);
b.prop("blood_pool", 15, 5, 0);
b.prop("blood_pool", 13, 6, 1);
b.prop("corpse_greyed", 17, 15, 1);
b.prop("blood_pool", 18, 16, 2);
b.prop("blood_pool", 11, 13, 3);

export const SORAMEI_COURTYARD = b.build({
  id: "soramei_courtyard",
  name: "Dziedziniec Soramei",
  spawns: [
    { x: 13.5, y: 15.5 },
    { x: 15.5, y: 15.5 },
  ],
  // Moonlit night: dark enough for lanterns to matter, light enough to read the ground.
  ambient: 0x5a6688,
  music: "music_soramei_night",
  ambience: "amb_night_wind",
  introCinematic: "prolog",
});
