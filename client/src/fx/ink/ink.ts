import Phaser from "phaser";
import type { PathId } from "@broken-ash/shared";

/**
 * Shadow-ink: every skill visual in Broken Ash is sumi-e brush ink (CLAUDE.md "Skill VFX"). An effect
 * is a list of brush dabs (discs along the stroke, each with the moment it is laid down) painted at
 * art resolution — one art pixel is 2×2 on screen, like the characters — into a strip of frames:
 * the ink is laid along the stroke, then dries and flakes away from its thin edges inwards.
 *
 * Colours: a black ink core, a pale rice-paper rim so ink reads on the dark night map, and one
 * accent per path glowing in the thickest part of the stroke.
 */

export const ART = 2;

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

const INK = [0x0a080c, 0x17131a, 0x2a242c];
/** The thin wash at a stroke's edge, where the ink thins on the paper. */
const WASH = 0x3c3640;
const RIM = 0xe2d6bc;
const RIM_DIM = 0x9a9080;

export interface Dab {
  /** Art pixels, relative to the effect's origin. */
  x: number;
  y: number;
  r: number;
  /** When it is laid down, 0–1 of the reveal. */
  t: number;
  /** Thick part of the stroke: the accent glows here. */
  accent?: boolean;
  /** Dry brush: 0 wet … 1 very streaky. */
  dry?: number;
}

export interface InkOpts {
  /** Frames in the strip: the reveal, then the drying. */
  frames?: number;
  /** Share of the frames spent laying the ink (the rest dry it away). */
  reveal?: number;
  accent: number;
  /** Paint the rim (off for tiny drops, which would turn all rim). */
  rim?: boolean;
  /** Keep the last frames dense (zones hold before drying). */
  hold?: number;
}

/** Deterministic noise per pixel: the same stroke dries the same way every time. */
function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const cache = new Map<string, { key: string; frames: number; ox: number; oy: number; w: number; h: number }>();

/**
 * Paints dabs into a frame strip texture (cached by `id`). Returns the texture key, frame count and
 * where the origin sits in a frame.
 */
export function paint(scene: Phaser.Scene, id: string, dabs: Dab[], o: InkOpts) {
  const hit = cache.get(id);
  if (hit && scene.textures.exists(hit.key)) return hit;
  const frames = o.frames ?? 9;
  const reveal = o.reveal ?? 0.35;
  const pad = 3;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const d of dabs) {
    x0 = Math.min(x0, d.x - d.r);
    y0 = Math.min(y0, d.y - d.r);
    x1 = Math.max(x1, d.x + d.r);
    y1 = Math.max(y1, d.y + d.r);
  }
  if (!dabs.length) {
    x0 = y0 = 0;
    x1 = y1 = 1;
  }
  const ox = Math.ceil(-x0) + pad;
  const oy = Math.ceil(-y0) + pad;
  const w = Math.ceil(x1 - x0) + pad * 2;
  const h = Math.ceil(y1 - y0) + pad * 2;
  const key = `ink:${id}`;
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w * frames, h);
  const px = img.data;
  const ac = [(o.accent >> 16) & 255, (o.accent >> 8) & 255, o.accent & 255];
  const put = (fx: number, x: number, y: number, c: number[] | number) => {
    const i = (y * w * frames + fx * w + x) * 4;
    const rgb = typeof c === "number" ? [(c >> 16) & 255, (c >> 8) & 255, c & 255] : c;
    px[i] = rgb[0];
    px[i + 1] = rgb[1];
    px[i + 2] = rgb[2];
    px[i + 3] = 255;
  };

  // Per pixel: how deep in the ink it is (0 none … 1 the middle of a thick dab), and when it lands.
  const depth = new Float32Array(w * h);
  const land = new Float32Array(w * h).fill(2);
  const accent = new Uint8Array(w * h);
  for (const d of dabs) {
    const cx = d.x + ox;
    const cy = d.y + oy;
    const r = Math.max(0.6, d.r);
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > r) continue;
        // Dry brush: streaks along the stroke where the bristles ran out of ink.
        if (d.dry && hash(x, Math.round(y / 2), 7) < d.dry * (dist / r)) continue;
        const k = y * w + x;
        const dep = (1 - dist / r) * Math.min(1, r / 3);
        if (dep > depth[k]) depth[k] = dep;
        if (d.t < land[k]) land[k] = d.t;
        // The accent burns only in a thin heart of the thickest strokes.
        if (d.accent && dist < r * 0.2 && r > 3) accent[k] = 1;
      }
    }
  }

  for (let f = 0; f < frames; f++) {
    const p = (f + 1) / frames;
    const shown = Math.min(1, p / reveal);
    // Drying: thin edges go first, the thick core last.
    const dryK = p <= reveal ? 0 : (p - reveal) / (1 - reveal);
    const dry = o.hold ? Math.max(0, (dryK - o.hold) / (1 - o.hold)) : dryK;
    const alive = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) {
      if (depth[k] <= 0 || land[k] > shown) continue;
      const x = k % w;
      const y = (k - x) / w;
      if (dry > 0 && hash(x, y, 3) * 0.6 + depth[k] * 0.7 < dry * 1.25) continue;
      alive[k] = 1;
    }
    for (let k = 0; k < w * h; k++) {
      if (!alive[k]) continue;
      const x = k % w;
      const y = (k - x) / w;
      const dep = depth[k];
      let c: number[] | number = dep > 0.45 ? INK[0] : dep > 0.2 ? INK[1] : dep > 0.08 ? INK[2] : (x + y) % 2 ? WASH : INK[2];
      // The accent burns in the thick of the stroke while it's fresh, then cools to ink.
      if (accent[k] && dry < 0.5 && hash(x, y, 11) > 0.18) c = dry < 0.25 ? ac : ac.map((v) => Math.round(v * 0.55));
      put(f, x, y, c);
    }
    if (o.rim !== false) {
      // Rice-paper rim: the pale edge of wet ink, brighter on the upper-left (the moon side).
      for (let k = 0; k < w * h; k++) {
        if (alive[k]) continue;
        const x = k % w;
        const y = (k - x) / w;
        const n = (dx: number, dy: number) => {
          const xx = x + dx;
          const yy = y + dy;
          return xx >= 0 && yy >= 0 && xx < w && yy < h && alive[yy * w + xx] === 1;
        };
        // Broken, like light catching a wet edge: never a full sticker outline.
        const r = hash(x, y, 5);
        if (r < 0.35) continue;
        if (n(0, -1) || n(-1, 0)) put(f, x, y, dry > 0.3 || r < 0.6 ? RIM_DIM : RIM);
        else if ((n(1, 0) || n(0, 1)) && r > 0.75) put(f, x, y, RIM_DIM);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * w, 0, w, h);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  const out = { key, frames, ox, oy, w, h };
  cache.set(id, out);
  return out;
}

// ------------------------------------------------------------------------------------- strokes

/** Seeded random for stroke shapes. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A brush stroke along a polyline (art pixels): fat where the brush lands, tapering to a dry tail,
 * laid down from the first point to the last over [t0, t1] of the reveal.
 */
export function stroke(pts: { x: number; y: number }[], width: number, o: { t0?: number; t1?: number; dry?: number; accent?: boolean; seed?: number; press?: number } = {}): Dab[] {
  const out: Dab[] = [];
  const rand = rng(o.seed ?? 1);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let run = 0;
  const t0 = o.t0 ?? 0;
  const t1 = o.t1 ?? 1;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 0.8));
    for (let s = 0; s < steps; s++) {
      const u = (run + (len * s) / steps) / Math.max(1, total);
      const x = a.x + ((b.x - a.x) * s) / steps;
      const y = a.y + ((b.y - a.y) * s) / steps;
      // Pressure: the brush presses in fast, holds, lifts off into a thin dry tail.
      const press = o.press ?? 0.12;
      const prof = u < press ? 0.55 + 0.45 * (u / press) : Math.pow(1 - (u - press) / (1 - press), 0.7);
      const r = Math.max(0.5, width * prof * (0.9 + rand() * 0.2));
      out.push({ x, y, r, t: t0 + (t1 - t0) * u, accent: o.accent !== false && prof > 0.6, dry: (o.dry ?? 0.25) * (0.4 + u) });
    }
    run += len;
  }
  return out;
}

/** Ink flung from the brush: droplets around a point. */
export function splatter(cx: number, cy: number, radius: number, n: number, seed: number, t = 0.2): Dab[] {
  const rand = rng(seed);
  const out: Dab[] = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = radius * (0.5 + rand() * 0.8);
    const r = 0.6 + rand() * 1.6;
    out.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.55, r, t: t + rand() * 0.5 });
    // A trailing smaller drop behind some of them.
    if (rand() < 0.4) out.push({ x: cx + Math.cos(a) * (d - r * 2), y: cy + Math.sin(a) * (d - r * 2) * 0.55, r: r * 0.5, t: t + rand() * 0.5 });
  }
  return out;
}

/** A wet blot: an uneven pool of ink (flattened onto the iso ground). */
export function blot(cx: number, cy: number, radius: number, seed: number, t = 0, accent = true): Dab[] {
  const rand = rng(seed);
  const out: Dab[] = [];
  const lobes = 7;
  for (let i = 0; i < lobes * 3; i++) {
    const a = rand() * Math.PI * 2;
    const d = radius * Math.sqrt(rand()) * 0.75;
    out.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.5, r: radius * (0.25 + rand() * 0.25), t: t + rand() * 0.3, accent: accent && d < radius * 0.25 && i % 4 === 0 });
  }
  return out;
}

/** An enso: one brush circle on the ground (whirls, rings), open where the brush lifts. */
export function enso(cx: number, cy: number, rx: number, ry: number, width: number, start: number, seed: number, sweep = Math.PI * 1.85): Dab[] {
  const pts = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = start + (sweep * i) / n;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return stroke(pts, width, { seed, dry: 0.35, press: 0.08 });
}
