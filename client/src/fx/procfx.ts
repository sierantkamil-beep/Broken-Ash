import Phaser from "phaser";
import type { Ramp } from "./fxkit";

/**
 * Big effect shapes generated in the client at the exact size a skill needs: blade smears, whirls,
 * shockwave rings, ground seals and cyclones. Drawn at art resolution (1 art px = 2 screen px, like
 * the characters) and cut into the element's hard colour steps, so a 5-cell cleave has the same
 * pixel size as a dagger flick (scaling baked sprites up made pixels 6 px wide and blocky).
 * The same recipes as tools/fx/build.py; each size is made once, on first use, then cached.
 */

const RAMPS: Record<Ramp, string[]> = {
  steel: ["#1c2230", "#4a5a74", "#9aacc4", "#dfe8f2", "#ffffff"],
  blood: ["#24030a", "#5e0812", "#a8121f", "#e0403a", "#ffc0b0"],
  fire: ["#2e0804", "#962606", "#ec7618", "#ffc23c", "#fff6c8"],
  lightning: ["#14163e", "#3e48b0", "#8e9cf0", "#d4dcff", "#ffffff"],
  spirit: ["#082a2a", "#1a7062", "#52bca6", "#a6f0d6", "#f2fff8"],
  poison: ["#14220a", "#365e12", "#7cc23e", "#c4ee6c", "#f2ffc8"],
  wind: ["#2e3844", "#6c7c8c", "#b4c2cc", "#e8f0f6", "#ffffff"],
  nature: ["#24160a", "#553614", "#76983a", "#acd06a", "#e2f2b4"],
  dusk: ["#301a06", "#84540e", "#dca63c", "#ffd88c", "#fff6dc"],
  shadow: ["#060408", "#1a1420", "#32283a", "#54485e", "#847a8e"],
  gold: ["#3a2406", "#8a5c12", "#d8a032", "#ffe08a", "#fffbe8"],
};
const RGB: Record<string, [number, number, number][]> = {};
for (const [k, list] of Object.entries(RAMPS)) RGB[k] = list.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

/** Deterministic value noise in [0, 1], so a shape looks the same every time it's made. */
function noise(seed: number, scale: number) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const fx = x / scale;
    const fy = y / scale;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    let tx = fx - x0;
    let ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const a = hash(x0, y0) * (1 - tx) + hash(x0 + 1, y0) * tx;
    const b = hash(x0, y0 + 1) * (1 - tx) + hash(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};

type Field = (x: number, y: number) => number;

/** A family: frame count, canvas size (art px), pivot, and the field of frame k. */
interface Family {
  frames: number;
  w: number;
  h: number;
  px: number;
  py: number;
  field(k: number): Field;
}

function slash(arcDeg: number, R: number): Family {
  const n = 7;
  const size = 2 * R + 6;
  const half = (arcDeg * Math.PI) / 360;
  const nz = noise(21, 5);
  return {
    frames: n,
    w: size,
    h: size,
    px: size / 2,
    py: size / 2,
    field(k) {
      const t = (k + 1) / (n - 1);
      const full = arcDeg >= 360;
      // The blade crosses the whole arc in the first half of the clip; the rest is the smear lingering.
      const sweep = Math.min(1, t * 2.1);
      const lead = -half + 2 * half * sweep;
      const span = full ? 2 * Math.PI * sweep : lead + half;
      const fade = 1 - Math.max(0, (t - 0.6) / 0.4) * 0.9;
      // A band never wider than ~20 art px: big swings stay crescents, not discs.
      const maxThick = Math.min(0.55, 20 / R);
      return (x, y) => {
        const d = Math.hypot(x, y);
        if (d > R + 1.5) return 0;
        let behind = lead - Math.atan2(y, x);
        if (full) behind = ((behind % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (behind < 0 || behind > span + 1e-6) return 0;
        const u = behind / Math.max(span, 1e-3);
        const thick = maxThick * Math.pow(1 - u, 0.7) + Math.min(0.08, 3 / R);
        const inner = R * (1 - thick);
        const band = clamp(1 - Math.abs(d - (R + inner) / 2) / ((R - inner) / 2 + 0.6));
        let f = band * Math.pow(1 - u, 0.7) * (0.8 + 0.35 * nz(x + R, y + R)) * fade;
        const rim = clamp(1 - Math.abs(d - R + 1.5) / 1.6) * Math.pow(1 - u, 2) * fade;
        f = Math.max(f, rim * 1.05);
        return f;
      };
    },
  };
}

function ring(R: number): Family {
  const n = 8;
  const size = 2 * R + 6;
  const w0 = Math.min(8, Math.max(4, R * 0.1));
  const nz = noise(3, 5);
  return {
    frames: n,
    w: size,
    h: size,
    px: size / 2,
    py: size / 2,
    field(k) {
      const t = (k + 1) / n;
      const r = R * (0.25 + 0.75 * smooth(Math.pow(t, 0.7)));
      const wd = w0 * (1 - t) + 1.2;
      return (x, y) => {
        const d = Math.hypot(x, y);
        // Just the wave front: an inner glow drawn opaque read as a dark stain in the middle.
        const f = clamp(1 - Math.abs(d - r) / wd) * (1.1 - t * 0.7);
        return f * (0.8 + 0.35 * nz(x + R, y + R));
      };
    },
  };
}

function sigil(R: number): Family {
  const n = 8;
  const size = 2 * R + 6;
  const marks: number[] = [];
  const nz = noise(11, 1);
  for (let i = 0; i < 24; i++) marks.push(nz(i * 3.7, 1.3));
  const sectors = Math.max(12, Math.round(R / 3.5));
  return {
    frames: n,
    w: size,
    h: size,
    px: size / 2,
    py: size / 2,
    field(k) {
      const t = k / n;
      const rot = (t * 2 * Math.PI) / sectors;
      const pulse = 0.78 + 0.22 * Math.sin(t * 2 * Math.PI);
      return (x, y) => {
        const d = Math.hypot(x, y);
        const outer = clamp(1 - Math.abs(d - R + 2) / 1.3);
        const inner = clamp(1 - Math.abs(d - R * 0.7) / 1.0);
        let f = Math.max(outer, inner) * 0.9;
        if (d > R * 0.74 && d < R - 4) {
          let sector = ((((Math.atan2(y, x) - rot) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * sectors;
          const si = Math.floor(sector) % 24;
          sector -= Math.floor(sector);
          const tick = Math.abs(sector - 0.5) < 0.6 / (R * 0.1) && marks[si] > 0.3;
          const bar = Math.abs(d - R * 0.86) < 0.9 && sector > 0.25 && sector < 0.75 && marks[si] > 0.55;
          if (tick || bar) f = Math.max(f, 0.8);
        }
        return Math.min(1, f) * pulse;
      };
    },
  };
}

function cyclone(R: number): Family {
  const n = 8;
  const size = 2 * R + 6;
  const nz = noise(8, 4);
  return {
    frames: n,
    w: size,
    h: size,
    px: size / 2,
    py: size / 2,
    field(k) {
      const phase = ((k / n) * 2 * Math.PI) / 3;
      return (x, y) => {
        const d = Math.hypot(x, y);
        if (d > R) return 0;
        const spiral = Math.sin(3 * (Math.atan2(y, x) - phase) + (d / R) * 5.5);
        let f = clamp((spiral - 0.35) * 1.8) * Math.pow(clamp(1 - d / R), 0.6);
        f = Math.max(f, clamp(1 - d / (R * 0.25)) * 0.6);
        return f * (0.75 + 0.4 * nz(x + R, y + R));
      };
    },
  };
}

/** A fiery (or poisonous) blast: a hot core swells, boils into lobes, then burns out to a ring. */
function explosion(R: number): Family {
  const n = 12;
  const size = 2 * R + 8;
  const nzs = [noise(5, Math.max(3, R / 7)), noise(6, Math.max(3, R / 7)), noise(7, Math.max(3, R / 7)), noise(8, Math.max(3, R / 7))];
  return {
    frames: n,
    w: size,
    h: size,
    px: size / 2,
    py: size / 2,
    field(k) {
      const t = (k + 1) / n;
      const r = R * (0.3 + 0.7 * smooth(Math.pow(t, 0.55)));
      const heat = 1.15 - t * 1.05;
      const a = nzs[k % 4];
      const b = nzs[(k + 1) % 4];
      return (x, y) => {
        const d = Math.hypot(x, y);
        if (d > r * 1.5) return 0;
        const nz = a(x + R, y + R) * 0.6 + b(x + R, y + R) * 0.4;
        let f = clamp(1 - Math.pow(d / r, 1.6) + (nz - 0.5) * 0.9) * heat;
        if (t > 0.45) f *= clamp((d / r - (t - 0.45) * 1.2) * 3);
        return f;
      };
    },
  };
}

export type ProcKind = "slash" | "ring" | "sigil" | "cyclone" | "explosion";

/** Round sizes to a few px so near-equal skills share one cached texture. */
const quant = (r: number) => Math.max(8, Math.round(r / 4) * 4);

export class ProcFx {
  private made = new Map<string, { frames: number; px: number; py: number }>();

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * The texture for a shape of radius `R` art px (arc in degrees for slashes; 360 is a whirl),
   * made on first use. Returns its key, frame count and pivot (normalised).
   */
  get(kind: ProcKind, ramp: Ramp, R: number, arc = 0) {
    const r = quant(R);
    const a = kind === "slash" ? Math.round(arc / 10) * 10 : 0;
    const key = `pfx:${kind}:${ramp}:${r}:${a}`;
    const have = this.made.get(key);
    if (have) return { key, ...have };
    const fam = kind === "slash" ? slash(a, r) : kind === "ring" ? ring(r) : kind === "sigil" ? sigil(r) : kind === "explosion" ? explosion(r) : cyclone(r);
    const cols = RGB[ramp] ?? RGB.steel;
    const canvas = document.createElement("canvas");
    canvas.width = fam.w * fam.frames;
    canvas.height = fam.h;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(canvas.width, canvas.height);
    const cut = 0.12;
    for (let k = 0; k < fam.frames; k++) {
      const field = fam.field(k);
      for (let y = 0; y < fam.h; y++)
        for (let x = 0; x < fam.w; x++) {
          const f = field(x + 0.5 - fam.px, y + 0.5 - fam.py);
          if (!(f >= cut)) continue;
          const idx = Math.min(cols.length - 1, Math.floor(((Math.min(1, f) - cut) / (1 - cut)) * cols.length));
          const c = cols[idx];
          const o = (y * canvas.width + k * fam.w + x) * 4;
          img.data[o] = c[0];
          img.data[o + 1] = c[1];
          img.data[o + 2] = c[2];
          img.data[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = this.scene.textures.addCanvas(key, canvas)!;
    for (let k = 0; k < fam.frames; k++) tex.add(String(k), 0, k * fam.w, 0, fam.w, fam.h);
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const info = { frames: fam.frames, px: fam.px / fam.w, py: fam.py / fam.h };
    this.made.set(key, info);
    return { key, ...info };
  }
}
