import Phaser from "phaser";
import { DYES, SKIN_TONES, type ArmourId, type CharacterLook } from "@broken-ash/shared";

/** Cloth tones this dark are shared with hair and outlines; this light, with eyes and buckles. Both stay. */
const CLOTH_MIN_LUM = 38;
const CLOTH_MAX_LUM = 175;

const lum = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const key = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

/** A colour at position t (0 dark … 1 light) along a ramp, interpolated between its stops. */
function sample(ramp: number[][], t: number): number[] {
  const x = Math.min(0.999, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return ramp[i].map((v, k) => Math.round(v + (ramp[i + 1][k] - v) * f));
}

/** Where a region's colours sit on its own light scale (0 dark … 1 light). */
function positions(colors: string[] | undefined, keep: (l: number) => boolean): Map<number, number> {
  const cs = (colors ?? []).map(rgb).filter((c) => keep(lum(c)));
  const out = new Map<number, number>();
  if (!cs.length) return out;
  const ls = cs.map(lum);
  const lo = Math.min(...ls);
  const hi = Math.max(...ls);
  for (const c of cs) out.set(key(c[0], c[1], c[2]), (lum(c) - lo) / Math.max(1, hi - lo));
  return out;
}

/**
 * The armour material drawn into the tunic over the chest, in the frame's own coordinates (lx, ly
 * from the neck): a shade step (-1 darker … +1 lighter) and whether it's trim (lacing, stitches).
 * It moves with every animation frame because it is anchored to the torso the frame reports.
 */
function material(m: ArmourId, lx: number, ly: number): { step: number; trim: boolean } {
  switch (m) {
    case "lamellar": {
      // Rows of small plates laced together: a dark seam every third row, lacing columns.
      if (ly % 3 === 0) return { step: -1, trim: false };
      if ((lx + Math.floor(ly / 3) * 2) % 4 === 0) return { step: 0, trim: true };
      return { step: ly % 3 === 1 ? 1 : 0, trim: false };
    }
    case "scale": {
      const row = Math.floor(ly / 2);
      const off = (row % 2) * 2;
      if (ly % 2 === 0 && (lx + off) % 4 === 0) return { step: -1, trim: false };
      return { step: (lx + off) % 4 === 1 && ly % 2 === 1 ? 1 : 0, trim: false };
    }
    case "silk":
      // A diagonal sheen across the robe.
      return { step: (((lx - ly) % 7) + 7) % 7 === 0 ? 1 : 0, trim: false };
    case "leather":
      // Leather is the trim dye, with a stitched seam down the middle.
      return { step: lx === 0 && ly % 2 === 0 ? -1 : 0, trim: true };
    case "bark":
      if (((lx % 3) + 3) % 3 === 0) return { step: -1, trim: false };
      return { step: (ly + lx * 3) % 5 === 0 ? 1 : 0, trim: false };
    default:
      return { step: 0, trim: false };
  }
}

interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Chest band in sheet pixels: from just under the neck to above the belt, centred on the torso. */
  top: number;
  bottom: number;
  cx: number;
}

/**
 * A copy of a body atlas dressed in a look: cloth and leather dyed, skin toned, and the chosen armour
 * material drawn into the tunic. The PixelLab bodies are snapped to one palette and the atlas says
 * which colours are which region (tools/pixellab/pack.py), so this is an exact colour swap: shading
 * keeps its order, light stays light.
 */
export function recolorAtlas(scene: Phaser.Scene, srcKey: string, look: CharacterLook, outKey: string): boolean {
  if (scene.textures.exists(outKey)) return true;
  if (!scene.textures.exists(srcKey)) return false;
  const src = scene.textures.get(srcKey);
  const meta = (src.customData as { meta?: { regions?: Record<string, string[]>; anchors?: Record<string, (number | null)[]> } }).meta;
  const regions = meta?.regions;
  if (!regions) return false;

  const cloth = positions(regions.cloth, (l) => l >= CLOTH_MIN_LUM && l <= CLOTH_MAX_LUM);
  const trim = positions(regions.trim, () => true);
  const skin = positions(regions.skin, () => true);
  const clothRamp = DYES[look.cloth].ramp.map(rgb);
  const trimRamp = DYES[look.trim].ramp.map(rgb);
  const skinRamp = SKIN_TONES[look.skin].ramp.map(rgb);

  // Chest bands per frame, from the anchors (relative to each frame's pivot).
  const boxes: FrameBox[] = [];
  if (look.armour !== "none" && meta?.anchors) {
    // The pattern's horizontal origin is one value per clip and direction (the median torso x):
    // following each frame's torso x made the 4-px lacing crawl across the chest while running.
    // Only the vertical band follows the frame, so the pattern bobs with the body.
    const torsoXs = new Map<string, number[]>();
    for (const name of src.getFrameNames()) {
      const a = meta.anchors[name];
      if (!a) continue;
      const clip = name.slice(0, name.lastIndexOf("/"));
      if (!torsoXs.has(clip)) torsoXs.set(clip, []);
      torsoXs.get(clip)!.push(a[11] as number);
    }
    const median = (v: number[]) => [...v].sort((p, q) => p - q)[v.length >> 1];
    for (const name of src.getFrameNames()) {
      const a = meta.anchors[name];
      if (!a) continue;
      const f = src.get(name);
      const px = f.cutX + f.pivotX * f.cutWidth;
      const py = f.cutY + f.pivotY * f.cutHeight;
      const neckY = a[10] as number;
      const torsoX = median(torsoXs.get(name.slice(0, name.lastIndexOf("/")))!);
      const torsoY = a[12] as number;
      boxes.push({ x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight, top: Math.round(py + neckY + 2), bottom: Math.round(py + torsoY + 5), cx: Math.round(px + torsoX) });
    }
  }

  const img = src.getSourceImage() as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  const W = canvas.width;
  // Which frame a pixel belongs to (only needed for the armour pass).
  const owner = boxes.length ? new Int32Array(W * canvas.height).fill(-1) : null;
  if (owner) boxes.forEach((b, i) => {
    for (let y = Math.max(b.y, b.top); y <= Math.min(b.y + b.h - 1, b.bottom); y++) for (let x = b.x; x < b.x + b.w; x++) owner[y * W + x] = i;
  });

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const k = key(d[i], d[i + 1], d[i + 2]);
    let out: number[] | undefined;
    const tc = cloth.get(k);
    if (tc !== undefined) {
      const p = i >> 2;
      const fi = owner ? owner[p] : -1;
      if (fi >= 0) {
        const b = boxes[fi];
        const x = p % W;
        const y = (p - x) / W;
        const m = material(look.armour, x - b.cx, y - b.top);
        const t = Math.max(0, Math.min(1, tc + m.step * 0.3));
        out = sample(m.trim ? trimRamp : clothRamp, t);
      } else out = sample(clothRamp, tc);
    } else {
      const tt = trim.get(k);
      if (tt !== undefined) out = sample(trimRamp, tt);
      else {
        const ts = skin.get(k);
        if (ts !== undefined) out = sample(skinRamp, ts);
      }
    }
    if (out) [d[i], d[i + 1], d[i + 2]] = out;
  }
  ctx.putImageData(data, 0, 0);
  return addCopy(scene, src, canvas, outKey);
}

/** Registers a canvas as a texture with the same frames and pivots as `src`. */
function addCopy(scene: Phaser.Scene, src: Phaser.Textures.Texture, canvas: HTMLCanvasElement, outKey: string): boolean {
  const tex = scene.textures.addCanvas(outKey, canvas);
  if (!tex) return false;
  for (const name of src.getFrameNames()) {
    const f = src.get(name);
    const nf = tex.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
    if (nf && f.customPivot) {
      nf.customPivot = true;
      nf.pivotX = f.pivotX;
      nf.pivotY = f.pivotY;
    }
  }
  tex.customData = src.customData;
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return true;
}

/**
 * The gear atlas (tools/pixellab/parts.py) with its dye markers (#ff0001–#ff0008) filled from a look:
 * 1–4 the cloth dye, 5–8 the trim dye. One copy per dye pair, shared by everyone wearing it.
 */
export function gearFor(scene: Phaser.Scene, look: CharacterLook): string | null {
  const outKey = `gear@${look.cloth}-${look.trim}`;
  if (scene.textures.exists(outKey)) return outKey;
  if (!scene.textures.exists("gear")) return null;
  const src = scene.textures.get("gear");
  const img = src.getSourceImage() as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  const ramps = [...DYES[look.cloth].ramp, ...DYES[look.trim].ramp].map(rgb);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] && d[i] === 255 && d[i + 1] === 0 && d[i + 2] >= 1 && d[i + 2] <= 8) [d[i], d[i + 1], d[i + 2]] = ramps[d[i + 2] - 1];
  }
  ctx.putImageData(data, 0, 0);
  return addCopy(scene, src, canvas, outKey) ? outKey : null;
}
