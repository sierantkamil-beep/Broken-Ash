import { ITEM_BASES, RARITY, type Item, type ItemBase } from "@broken-ash/shared";

/*
 * Item pictures for the bag, the paper doll and loot on the ground. Weapons are the game's own gear
 * sprites (the very pixels the character holds, turned to a diagonal); armour and trinkets are small
 * pixel drawings in their material's colours, so everything sits in one pixel style.
 */

/** Which gear sprite shows each weapon type (client/src/entities/Character.ts WEAPON_PARTS). */
const PART: Record<string, string> = {
  blades: "katana",
  glaive: "glaive",
  greatblade: "nodachi",
  brush: "brush",
  talismans: "talismans",
  fan: "fan",
  lantern: "lantern",
  bow: "bow",
  knives: "knife",
};

/** Material colours: main, shade, highlight, trim. */
const MAT: Record<string, [string, string, string, string]> = {
  lamellar: ["#8a1a12", "#5a0e0a", "#c0392b", "#c8a040"],
  scale: ["#6a7480", "#3e4650", "#a0aab4", "#c8a040"],
  silk: ["#3a4e7a", "#24304e", "#5a76a8", "#d8c8a0"],
  leather: ["#6a4a2a", "#4a3018", "#8a6a44", "#a08050"],
  bark: ["#5a4a2a", "#3a2e18", "#76983a", "#acd06a"],
  none: ["#8a7a5e", "#5e5240", "#b0a080", "#6a4a2a"],
  kabuto: ["#3a3434", "#1e1a1a", "#6a6262", "#c8a040"],
  kasa: ["#b0904a", "#7a6030", "#d8b870", "#5a4020"],
  hood: ["#3a3040", "#221a28", "#5a4a62", "#7a6a82"],
  mask: ["#8a1a12", "#4a0a08", "#e0402a", "#f0e0c0"],
  band: ["#a01a14", "#601010", "#d0402a", "#f0d090"],
  veil: ["#2a4a4a", "#162a2a", "#4a7a74", "#a6f0d6"],
  iron: ["#5a5e66", "#34373c", "#8a9098", "#c8a040"],
  gold: ["#b08a3e", "#7a5a20", "#e0c070", "#fff0b0"],
  relic: ["#6a3a1a", "#3a1e0a", "#e0602a", "#ffd080"],
  cloth: ["#5a4a3a", "#3a2e22", "#7a6a52", "#a08060"],
};

/** Pixel drawings: o outline, a main, b shade, c highlight, t trim, . nothing. 12 × 12. */
const ART: Record<string, string[]> = {
  chest: [
    "..oooooooo..",
    ".otaaaaaato.",
    "otaacaacaato",
    "oaaacaacaaao",
    "oaaaaaaaaaao",
    "ooaaattaaaoo",
    ".oaabttbaao.",
    ".oaaaaaaaao.",
    ".oabaaaabao.",
    ".oaaaaaaaao.",
    ".otttttttto.",
    ".oooooooooo.",
  ],
  kabuto: [
    "....tttt....",
    "...ottttto..",
    "..ooaaaaoo..",
    ".oaaccaaaao.",
    ".oacaaaaaao.",
    "oaaaaaaaaaao",
    "obbbbbbbbbbo",
    "ob.oaaaao.bo",
    "ob.o....o.bo",
    "oo.o....o.oo",
    "...o....o...",
    "............",
  ],
  kasa: [
    "............",
    ".....oo.....",
    "....ocao....",
    "...ocaaao...",
    "..ocaaaaao..",
    ".ocaaaaaaao.",
    "occaaaaaaabo",
    "obbbbbbbbbbo",
    ".oooootooo..",
    "......t.....",
    "......t.....",
    "............",
  ],
  hood: [
    "....oooo....",
    "...oaaaao...",
    "..oacaaaao..",
    ".oacao.oaao.",
    ".oao....oao.",
    ".oao....oao.",
    ".oaao..oaao.",
    "oaaaaooaaaao",
    "obaaaaaaaabo",
    "obbbbbbbbbbo",
    ".oooooooooo.",
    "............",
  ],
  mask: [
    "..oooooooo..",
    ".oaaaaaaaao.",
    "oaccaaaacaao",
    "oaooaaaaooao",
    "oatoaaaaotao",
    "oaaaaccaaaao",
    "oaaaaaaaaaao",
    ".oatttttao..",
    ".oattttttao.",
    "..oaaaaaao..",
    "...oooooo...",
    "............",
  ],
  band: [
    "............",
    "............",
    "............",
    "oooooooooooo",
    "oaccaaaaaaao",
    "oaaaattaaaao",
    "oooooooooaoo",
    ".........oao",
    "..........oa",
    "...........o",
    "............",
    "............",
  ],
  veil: [
    "...oooooo...",
    "..oaaaaaao..",
    ".oacttttcao.",
    ".oaaaaaaaao.",
    ".oacccccaao.",
    ".oaccccccao.",
    ".oacccccaao.",
    ".oaccccccao.",
    "..oaccccao..",
    "..oaaaaaao..",
    "...oooooo...",
    "............",
  ],
  hands: [
    "............",
    "...oo.oo....",
    "..oaoaoao...",
    "..oaoaoaoo..",
    "..oaaaaaaoo.",
    "..oaaaaaaao.",
    "..ocaaaaaao.",
    "..oaaaaaao..",
    "...otttto...",
    "...oaaaao...",
    "...oooooo...",
    "............",
  ],
  legs: [
    ".oooooooooo.",
    ".otttttttto.",
    ".oaaaaaaaao.",
    ".oaacaacaao.",
    ".oaaao.aaao.",
    ".oaaao.oaao.",
    ".oabao.oabo.",
    ".oaao..oaao.",
    ".oaao..oaao.",
    ".obbo..obbo.",
    ".oooo..oooo.",
    "............",
  ],
  boots: [
    "............",
    "..oooo......",
    "..oaao......",
    "..oaco......",
    "..oaao......",
    "..oaaoooo...",
    "..oaaaaaaoo.",
    "..ocaaaaaaao",
    "..obbbbbbbbo",
    "..oooooooooo",
    "............",
    "............",
  ],
  amulet: [
    "...o....o...",
    "...o....o...",
    "....o..o....",
    "....o..o....",
    ".....oo.....",
    "....oaao....",
    "...oaccao...",
    "...oattao...",
    "...oabbao...",
    "....oaao....",
    ".....oo.....",
    "............",
  ],
  ring: [
    "............",
    "....oooo....",
    "...occcco...",
    "...otooto...",
    "..oao..oao..",
    "..oa....ao..",
    "..oa....ao..",
    "..oao..oao..",
    "...oaaaao...",
    "....oooo....",
    "............",
    "............",
  ],
  relic: [
    "......o.....",
    ".....oco....",
    ".....oco....",
    "....ocaao...",
    "....oaaao...",
    "...ocatao...",
    "...oaatao...",
    "...oaaaao...",
    "...obaaao...",
    "....obbo....",
    ".....oo.....",
    "............",
  ],
  gold: [
    "............",
    "............",
    "......oooo..",
    ".....occcao.",
    "..oooottttoo",
    ".occcaobbbo.",
    "otttttoooo..",
    "obbbbbo.....",
    ".ooooo......",
    "............",
    "............",
    "............",
  ],
};

const OUTLINE = "#120c0a";
let gear: Promise<{ img: HTMLImageElement; frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> } | null> | null = null;

function loadGear() {
  gear ??= (async () => {
    try {
      const json = await (await fetch("assets/gear/gear.json")).json();
      const img = new Image();
      img.src = "assets/gear/gear.webp";
      await img.decode();
      return { img, frames: json.frames };
    } catch {
      return null;
    }
  })();
  return gear;
}

function drawGrid(ctx: CanvasRenderingContext2D, grid: string[], m: [string, string, string, string], px: number, ox: number, oy: number) {
  const col: Record<string, string> = { o: OUTLINE, a: m[0], b: m[1], c: m[2], t: m[3] };
  grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = col[ch];
      if (!c) return;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x * px, oy + y * px, px, px);
    }),
  );
}

function artFor(b: ItemBase): { grid: string[]; mat: [string, string, string, string] } {
  switch (b.slot) {
    case "chest":
      return { grid: ART.chest, mat: MAT[b.look?.armour ?? "none"] ?? MAT.none };
    case "head":
      return { grid: ART[b.look?.head ?? "band"] ?? ART.band, mat: MAT[b.look?.head ?? "band"] ?? MAT.band };
    case "hands":
      return { grid: ART.hands, mat: b.id.includes("bracers") ? MAT.lamellar : MAT.leather };
    case "legs":
      return { grid: ART.legs, mat: b.id.includes("greaves") ? MAT.iron : MAT.cloth };
    case "boots":
      return { grid: ART.boots, mat: b.id.includes("sandals") ? MAT.kasa : MAT.leather };
    case "amulet":
      return { grid: ART.amulet, mat: b.tier >= 3 ? MAT.relic : MAT.gold };
    case "ring":
      return { grid: ART.ring, mat: b.tier >= 2 ? MAT.gold : MAT.iron };
    default:
      return { grid: ART.relic, mat: MAT.relic };
  }
}

/**
 * A canvas with an item's picture, `cw × ch` CSS pixels (its grid cells × the cell size), on a
 * backing of its rarity. Weapons fill in a moment later, once the gear sheet is loaded.
 */
export function itemIcon(it: Item | { base: string; rarity: string }, cw: number, ch: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  c.className = "item-icon";
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const b = ITEM_BASES[it.base];
  if (!b) return c;
  // A dark backing tinted with the rarity's colour.
  const rc = it.rarity === "gold" ? "#b08a3e" : RARITY[it.rarity as keyof typeof RARITY]?.color ?? "#777";
  const g = ctx.createRadialGradient(cw / 2, ch / 2, 2, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
  g.addColorStop(0, `${rc}44`);
  g.addColorStop(1, "#0000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  if (b.slot === "weapon" && b.weapon) {
    const part = PART[b.weapon];
    void loadGear().then((gs) => {
      if (!gs) return;
      // The gear sheet's 32 angles: 28 points up and to the right (bows stand upright: 0).
      const f = gs.frames[`w/${part}/${part === "bow" ? 0 : 28}`]?.frame ?? gs.frames[`w/${part}/0`]?.frame;
      if (!f) return;
      const s = Math.max(1, Math.floor(Math.min(cw / f.w, ch / f.h)));
      ctx.drawImage(gs.img, f.x, f.y, f.w, f.h, Math.round((cw - f.w * s) / 2), Math.round((ch - f.h * s) / 2), f.w * s, f.h * s);
    });
    return c;
  }
  const { grid, mat } = artFor(b);
  const px = Math.max(1, Math.floor(Math.min(cw, ch) / 14));
  drawGrid(ctx, grid, mat, px, Math.round((cw - 12 * px) / 2), Math.round((ch - 12 * px) / 2));
  return c;
}

/** A gold coins picture (loot on the ground, the purse). */
export function goldIcon(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const px = Math.max(1, Math.floor(size / 14));
  drawGrid(ctx, ART.gold, MAT.gold, px, Math.round((size - 12 * px) / 2), Math.round((size - 12 * px) / 2));
  return c;
}
