import { CELL_BREAK, HARROW_SCOUTS, MINE_GALLERY, MINE_HALL, TAPPER_FIGHT } from "../data/greyed.js";
import { MapBuilder } from "./builder.js";

/*
 * Act 1, "Popiół na czole" (design.md §3): the bleeding-cells under Soramei Keep → the courtyard
 * (soramei.ts) → the farmstead Itheru gives you → the Drowned Sap-Mine → Harrow's scouts on the road
 * → the downer back at the farmstead.
 *
 * Every map keeps its south edge low (void, rocks): the camera looks north, so anything tall there
 * would hide the players.
 */

const ACT = "Akt I · Popiół na czole";

// ------------------------------------------------------------------------------------ Pień
/**
 * Pień — the bleeding-cells under the keep. Three cells behind iron bars on the west (yours is the
 * middle one; the bars are broken), the bleeding hall with the sap-tap in the middle, the stairs up
 * to the courtyard in the north wall. The dead prisoners get up when you step into the hall.
 */
function cells() {
  const W = 24;
  const H = 18;
  const b = new MapBuilder(W, H, "slabs");
  b.rect("void", 0, H - 1, W - 1, H - 1);
  b.rect("dirt", 10, 0, 13, 1); // the worn stairs
  for (let x = 0; x < W; x++) if (x < 11 || x > 12) b.prop("rockwall", x, 0, x % 3);
  for (let y = 1; y < H - 1; y++) {
    b.prop("rockwall", 0, y, y % 3);
    b.prop("rockwall", W - 1, y, (y + 1) % 3);
  }
  // The cells: bars along x = 7 with a broken door in each, bars between them.
  for (let y = 1; y < H - 1; y++) if (y !== 3 && y !== 9 && y !== 10 && y !== 14) b.prop("bars_y", 7, y);
  for (let x = 1; x < 7; x++) {
    b.prop("bars_x", x, 6);
    b.prop("bars_x", x, 12);
  }
  b.rect("mud", 1, 7, 6, 11); // straw and filth where you were kept
  b.prop("blood_pool", 2, 2, 1).prop("blood_pool", 4, 15, 2).prop("corpse_greyed", 2, 4, 1).prop("corpse_greyed", 3, 14, 0);
  // The bleeding hall: the tap (a pump) the prisoners were bled into, braziers, pillars, the dead guard.
  b.prop("pump", 14, 8);
  b.blob("sap", 15, 11.2, 1.4, 0.7);
  for (const [x, y] of [[11, 5], [18, 5], [11, 12], [18, 12]]) b.prop("support", x, y);
  for (const [x, y] of [[9, 2], [21, 2], [9, 15], [21, 15]]) b.prop("brazier", x, y);
  b.prop("crate", 20, 4).prop("crate", 21, 5).prop("barrel", 21, 12, 0).prop("barrel", 20, 13, 1);
  b.prop("corpse_greyed", 17, 9, 1).prop("blood_pool", 18, 10, 0).prop("blood_pool", 13, 7, 3).prop("blood_pool", 16, 14, 1);
  return b.build({
    id: "soramei_cells",
    name: "Pień",
    subtitle: ACT,
    spawns: [
      { x: 3.5, y: 9.5 },
      { x: 3.5, y: 10.6 },
    ],
    ambient: 0x504a6a,
    music: "music_soramei_night",
    ambience: "amb_night_wind",
    introCinematic: "cells_intro",
    exits: [{ region: { x: 11, y: 0, w: 2, h: 1.4 }, to: "soramei_courtyard", spawn: 0, label: "Schody na dziedziniec", needs: "cells_cleared" }],
    // The design's first find: a dead guard's blades (and his purse) in the bleeding hall.
    caches: [{ id: "guard", x: 18, y: 9.6, items: ["u.guard_blades"], rolls: 1, gold: 15, label: "Przeszukaj martwego strażnika" }],
    encounters: [
      {
        id: "cells",
        trigger: { x: 8, y: 1, w: 15, h: 16 },
        waves: CELL_BREAK,
        spawnAt: [{ x: 3.5, y: 3.5 }, { x: 3.5, y: 14.5 }, { x: 11.5, y: 0.6 }],
        lock: true,
        clearFlag: "cells_cleared",
      },
    ],
  });
}

// ------------------------------------------------------------------------------------ Pogorzelisko
/**
 * Pogorzelisko — the burned-out farmstead Itheru gives you: two charred houses, a broken palisade,
 * the tent of his men, a campfire (where you get up after a fall). The way to the mine is east; the
 * road where Harrow's scouts ride is west, once the mine is done.
 */
function farmstead() {
  const W = 30;
  const H = 24;
  const b = new MapBuilder(W, H, "grass");
  b.rect("mud", 2, 10, W - 1, 12); // the cart track, west to east
  b.rect("mud", 14, 12, 16, 20);
  b.blob("scorched", 8, 6, 4, 2.6);
  b.blob("scorched", 20, 5, 4, 2.4);
  b.blob("dirt", 15, 16, 3, 2);
  b.blob("mud", 23, 18, 2.5, 1.5);
  // The palisade on the north and west, broken where the track runs out west.
  for (let x = 1; x < W - 1; x++) if (x % 7 !== 3) b.prop("palisade_x", x, 1);
  for (let y = 2; y < H - 2; y++) if (y < 9 || y > 13) b.prop("palisade_y", 1, y);
  b.prop("house_burnt", 6, 4).prop("house_burnt", 18, 3);
  b.prop("tent", 9, 14).prop("campfire", 15, 15);
  b.chest(12, 17, "farmstead", "itheru");
  b.prop("cart", 4, 18).prop("barrel", 7, 19, 1).prop("crate", 8, 19);
  b.prop("dead_tree", 22, 14, 0).prop("dead_tree", 4, 14, 1, true);
  // Pines close the east side except where the track leaves for the mine.
  for (const y of [2, 5, 14, 17]) b.prop("pine", W - 2, y, y % 3);
  b.prop("pine", 25, 7, 1).prop("pine", 25, 19, 2, true);
  for (let x = 0; x < W; x++) b.prop("rock", x, H - 1, x % 3);
  for (let y = 2; y < H - 1; y++) if (y < 8 || y > 13) b.prop("rock", 0, y, y % 3);
  return b.build({
    id: "farmstead",
    name: "Pogorzelisko",
    subtitle: ACT,
    spawns: [
      { x: 14.5, y: 19.5 },
      { x: 16.5, y: 19.5 },
      // From the mine (east) and from the road (west).
      { x: 27.5, y: 10.5 },
      { x: 27.5, y: 12.5 },
      { x: 2.5, y: 10.5 },
      { x: 2.5, y: 12.5 },
    ],
    ambient: 0x7e84a6,
    music: "music_soramei_night",
    ambience: "amb_night_wind",
    introCinematic: "farm_intro",
    bonfire: { x: 15.5, y: 17.5 },
    exits: [
      { region: { x: W - 1, y: 9, w: 1, h: 5 }, to: "sap_mine", spawn: 0, label: "Zatopiona Kopalnia Żywicy" },
      { region: { x: 0, y: 9, w: 1, h: 5 }, to: "harrow_road", spawn: 0, label: "Trakt Harrowa", needs: "tapper_dead" },
    ],
    // Itheru's gift: his own headband, and something for the road.
    caches: [{ id: "itheru", x: 12.5, y: 17.5, items: ["u.itheru_band"], rolls: 2, luck: 0.15, gold: 40, label: "Otwórz kufer od Itheru" }],
    npcs: [
      { id: "itheru", name: "Itheru z rodu Soramei", x: 13.5, y: 14.8, facing: 0, path: "thorn", body: "male", scene: "itheru_talk", unless: "tapper_dead" },
      { id: "itheru2", name: "Itheru z rodu Soramei", x: 13.5, y: 14.8, facing: 0, path: "thorn", body: "male", scene: "itheru_road", needs: "tapper_dead", unless: "act1_done" },
      { id: "maeve", name: "Maeve „Rdza”", x: 17.6, y: 15.2, facing: 6, path: "sting", body: "female", scene: "maeve_talk", unless: "act1_done" },
      { id: "freed", name: "Uwolniona z kopalni", x: 9.5, y: 17.5, facing: 0, path: "bark", body: "female", scene: "freed_talk", needs: "captives_saved", unless: "act1_done" },
    ],
  });
}

// ------------------------------------------------------------------------------------ Kopalnia
/**
 * Zatopiona Kopalnia Żywicy — the first dungeon, rooms cut out of the dark: the entry with a fire,
 * the shaft hall (miners), the flooded gallery (the drowned, the corpse-eaters) with the two pump
 * levers at its far ends, and behind the bars the pumps hold shut, the Tapper's bleeding room with
 * the cages.
 */
function mine() {
  const W = 36;
  const H = 34;
  const b = new MapBuilder(W, H, "void");
  // Rooms (south to north) and the tunnels between them.
  b.rect("rock", 2, 23, 8, 30); // entry
  b.rect("rock", 8, 25, 13, 26); // tunnel to the hall
  b.rect("rock", 13, 21, 25, 29); // shaft hall
  b.rect("planks", 18, 18, 19, 20); // tunnel up to the gallery
  b.rect("rock", 6, 12, 30, 17); // flooded gallery
  b.rect("water", 7, 14, 29, 15);
  b.rect("planks", 10, 14, 11, 15); // bridges
  b.rect("planks", 18, 14, 19, 15);
  b.rect("planks", 25, 14, 26, 15);
  b.blob("sap", 14, 16.6, 1.6, 0.6);
  b.blob("sap", 22, 12.4, 1.5, 0.5);
  b.rect("planks", 17, 10, 19, 11); // under the bars
  b.rect("slabs", 9, 1, 27, 9); // the bleeding room
  b.blob("sap", 22.5, 5.5, 2, 1.1);
  b.rect("void", 9, 0, 27, 0);
  // Entry: the fire, the way back out.
  b.prop("campfire", 3, 24).prop("crate", 7, 23).prop("barrel", 2, 28, 1).prop("torch_post", 8, 27);
  // The shaft hall: pit props, carts of ore, torches.
  for (const [x, y] of [[15, 23], [22, 23], [15, 27], [22, 27]]) b.prop("support", x, y);
  b.prop("cart", 17, 22).prop("cart", 20, 28).prop("crate", 24, 21).prop("barrel", 13, 21, 0).prop("barrel", 13, 22, 1);
  b.prop("torch_post", 18, 25).prop("torch_post", 25, 25);
  b.prop("blood_pool", 19, 24, 2).prop("corpse_greyed", 21, 25, 0);
  // The gallery: the two pump levers at its ends, the pump between, torches by the bridges.
  b.prop("lever", 6, 12).prop("lever", 30, 12).prop("pump", 22, 16);
  b.prop("torch_post", 12, 12).prop("torch_post", 24, 12).prop("support", 8, 17).prop("support", 28, 17);
  // The bars the pumps hold shut (the pressure of the sap keeps them down).
  for (let x = 17; x <= 19; x++) b.gate("bars_x", x, 10, "pumps_on");
  // The bleeding room: the Tapper's own pump, braziers, the cages along the north wall.
  b.prop("pump", 21, 3).prop("brazier", 10, 6).prop("brazier", 26, 6).prop("brazier", 17, 2);
  b.chest(25, 2, "sap_mine", "overseer");
  b.chest(13, 28, "sap_mine", "shaft");
  for (let x = 10; x <= 14; x++) b.gate("bars_x", x, 3, "tapper_dead");
  b.prop("bars_y", 15, 1).prop("bars_y", 15, 2);
  b.prop("blood_pool", 12, 1, 1).prop("blood_pool", 18, 5, 0).prop("blood_pool", 13, 6, 3).prop("corpse_greyed", 19, 7, 1);
  return b.build({
    id: "sap_mine",
    name: "Zatopiona Kopalnia Żywicy",
    subtitle: ACT,
    spawns: [
      { x: 4.5, y: 28.5 },
      { x: 6.5, y: 28.5 },
    ],
    ambient: 0x464460,
    music: "music_soramei_night",
    ambience: "amb_night_wind",
    introCinematic: "mine_intro",
    bonfire: { x: 4.5, y: 26.5 },
    exits: [{ region: { x: 3, y: 30, w: 5, h: 1 }, to: "farmstead", spawn: 2, label: "Pogorzelisko" }],
    caches: [
      { id: "overseer", x: 25.5, y: 3.4, items: ["u.mine_lamp", "relic.drowned_bell"], rolls: 1, gold: 80, label: "Otwórz kufer nadzorcy" },
      { id: "shaft", x: 14.2, y: 28.5, rolls: 2, gold: 25, label: "Otwórz kufer górników" },
    ],
    encounters: [
      {
        id: "hall",
        trigger: { x: 14, y: 21, w: 12, h: 9 },
        waves: MINE_HALL,
        spawnAt: [{ x: 24.5, y: 28.5 }, { x: 18.5, y: 20.5 }],
        lock: true,
        clearFlag: "mine_hall",
        reward: { rolls: 2 },
      },
      {
        id: "gallery",
        trigger: { x: 6, y: 12, w: 25, h: 6 },
        waves: MINE_GALLERY,
        spawnAt: [{ x: 7.5, y: 16.5 }, { x: 29.5, y: 16.5 }, { x: 14.5, y: 12.5 }],
        lock: true,
        clearFlag: "mine_gallery",
        reward: { rolls: 2, luck: 0.1 },
      },
      {
        id: "tapper",
        needs: "pumps_on",
        trigger: { x: 9, y: 1, w: 19, h: 8 },
        waves: TAPPER_FIGHT,
        spawnAt: [{ x: 18.5, y: 4.5 }, { x: 25.5, y: 7.5 }],
        lock: true,
        clearFlag: "tapper_dead",
        reward: { items: ["u.tapper_cleaver", "relic.tapper_valve"], rolls: 2, luck: 0.3 },
        clearCinematic: "tapper_dead",
      },
    ],
    levers: [
      { x: 6.5, y: 12.5, group: "pumps", flag: "pumps_on" },
      { x: 30.5, y: 12.5, group: "pumps", flag: "pumps_on" },
    ],
    npcs: [{ id: "captives", name: "Więźniowie z klatek", x: 12.5, y: 2.2, facing: 0, path: "bark", body: "male", scene: "captives_free", needs: "tapper_dead", unless: "captives_saved" }],
  });
}

// ------------------------------------------------------------------------------------ Trakt
/**
 * Trakt Harrowa — the forest road west of the farmstead, and the camp of the Iron March scouts at its
 * east end (tents, a fire, a half-built palisade). Beating them ends in the choice: execute or let go.
 */
function road() {
  const W = 40;
  const H = 20;
  const b = new MapBuilder(W, H, "grass");
  b.rect("dirt", 0, 9, W - 1, 11);
  b.blob("mud", 12, 10, 3, 1.2);
  b.blob("mud", 31, 10, 4, 2.5);
  b.blob("moss", 6, 15, 4, 2);
  b.blob("moss", 20, 4, 5, 2);
  // Forest: pines along the north, a few dead trees and pines south of the road.
  for (let x = 0; x < 26; x += 3) b.prop("pine", x, (x / 3) % 2 === 0 ? 1 : 3, x % 3, x % 2 === 0);
  for (const [x, y] of [[4, 6], [15, 6], [22, 6]]) b.prop("dead_tree", x, y, x % 2);
  for (const [x, y] of [[8, 14], [17, 15], [24, 13]]) b.prop("pine", x, y, (x + y) % 3);
  b.prop("dead_tree", 2, 15, 1).prop("rock", 12, 14, 0).prop("rock", 13, 16, 2);
  // The Iron March camp.
  for (let y = 2; y < 17; y++) if (y < 8 || y > 12) b.prop("palisade_y", 27, y);
  b.prop("tent", 29, 3).prop("tent", 34, 3).prop("tent", 34, 13);
  b.prop("campfire", 31, 12).prop("cart", 29, 15).prop("crate", 37, 9).prop("crate", 37, 10).prop("barrel", 38, 11, 0);
  b.chest(37, 15, "harrow_road", "supplies");
  b.prop("torch_post", 28, 8).prop("torch_post", 28, 12).prop("torch_post", 38, 7);
  for (let x = 0; x < W; x++) b.prop("rock", x, H - 1, x % 3);
  for (let x = 28; x < W; x++) b.prop("palisade_x", x, 1);
  for (let y = 2; y < H - 1; y++) b.prop("palisade_y", W - 1, y);
  return b.build({
    id: "harrow_road",
    name: "Trakt Harrowa",
    subtitle: ACT,
    spawns: [
      { x: 2.5, y: 9.5 },
      { x: 2.5, y: 11.5 },
    ],
    ambient: 0x8a94b4,
    music: "music_soramei_night",
    ambience: "amb_night_wind",
    introCinematic: "road_intro",
    bonfire: { x: 3.5, y: 10.5 },
    exits: [{ region: { x: 0, y: 8, w: 1, h: 5 }, to: "farmstead", spawn: 4, label: "Pogorzelisko" }],
    caches: [{ id: "supplies", x: 37.5, y: 16.4, rolls: 2, luck: 0.1, gold: 60, label: "Otwórz skrzynię zapasów Marchii" }],
    encounters: [
      {
        id: "scouts",
        trigger: { x: 27, y: 2, w: 12, h: 17 },
        waves: HARROW_SCOUTS,
        spawnAt: [{ x: 36.5, y: 7.5 }, { x: 36.5, y: 12.5 }],
        lock: true,
        clearFlag: "scouts_beaten",
        reward: { items: ["u.harrow_crossbow"], rolls: 2, luck: 0.2 },
        clearCinematic: "scouts_choice",
      },
    ],
  });
}

export const SORAMEI_CELLS = cells();
export const FARMSTEAD = farmstead();
export const SAP_MINE = mine();
export const HARROW_ROAD = road();
