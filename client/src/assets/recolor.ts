import Phaser from "phaser";
import type { Look } from "@broken-ash/shared";

/** Cloth tones this dark are shared with hair and outlines; this light, with eyes and buckles. Both stay. */
const CLOTH_MIN_LUM = 38;
const CLOTH_MAX_LUM = 175;

const lum = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** A colour at position t (0 dark … 1 light) along a ramp, interpolated between its stops. */
function sample(ramp: number[][], t: number): number[] {
  const x = Math.min(0.999, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return ramp[i].map((v, k) => Math.round(v + (ramp[i + 1][k] - v) * f));
}

/**
 * A copy of a body atlas with its cloth and leather recoloured to a look. The PixelLab bodies are
 * snapped to one palette and the atlas says which colours are which region (tools/pixellab/pack.py),
 * so this is an exact colour swap: shading keeps its order, light stays light.
 */
export function recolorAtlas(scene: Phaser.Scene, srcKey: string, look: Look, outKey: string): boolean {
  if (scene.textures.exists(outKey)) return true;
  if (!scene.textures.exists(srcKey)) return false;
  const src = scene.textures.get(srcKey);
  const regions = (src.customData as { meta?: { regions?: Record<string, string[]> } }).meta?.regions;
  if (!regions) return false;

  const map = new Map<number, number[]>();
  const add = (colors: string[] | undefined, ramp: string[], keep: (l: number) => boolean) => {
    const cs = (colors ?? []).map(rgb).filter((c) => keep(lum(c)));
    if (!cs.length) return;
    const ls = cs.map(lum);
    const lo = Math.min(...ls);
    const hi = Math.max(...ls);
    const r = ramp.map(rgb);
    for (const c of cs) map.set((c[0] << 16) | (c[1] << 8) | c[2], sample(r, (lum(c) - lo) / Math.max(1, hi - lo)));
  };
  add(regions.cloth, look.cloth, (l) => l >= CLOTH_MIN_LUM && l <= CLOTH_MAX_LUM);
  add(regions.trim, look.trim, () => true);

  const img = src.getSourceImage() as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const to = map.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (to) [d[i], d[i + 1], d[i + 2]] = to;
  }
  ctx.putImageData(data, 0, 0);

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
