import type { Effect, SkillDef, StatusId } from "@broken-ash/shared";

/**
 * Skill icons as crisp pixel art: a 24 × 24 grid shown at exactly 2× (48 px), the same pixel size as
 * the characters. Each icon is built from the skill's data, so it tells you what the skill does:
 * - the glyph is the skill's real shape (a crescent for a cone, a bar for a line, a bolt with its
 *   trail for a projectile, a target for a circle you throw, a burst for one around you, a pool for
 *   lingering ground, a chevron for a buff), in the path's accent with a lit top-left edge, a shaded
 *   bottom-right edge and a dark outline so it reads on any background;
 * - a small corner badge names its main effect (bleed, burn, poison, slow, heal, summon, …) in that
 *   effect's own colour;
 * - the plate behind is the accent, darkened, with a bevel.
 * (The painted-ink icons this replaced were speckle at this size: dry-brush holes, a broken rim and
 * non-integer stretching.)
 */

export const ICON = 24;
export const ICON_SCALE = 2;

type RGB = [number, number, number];
const rgbOf = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)) as RGB;
const BLACK: RGB = [8, 6, 8];
const PAPER: RGB = [239, 230, 216];
const LACQUER: RGB = [20, 17, 19];

/** A tiny raster: a mask of glyph pixels with a tone per pixel (0 dark, 1 base, 2 light). */
class Grid {
  readonly tone: Int8Array;
  constructor(readonly n = ICON) {
    this.tone = new Int8Array(n * n).fill(-1);
  }
  set(x: number, y: number, t = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.n && y < this.n) this.tone[y * this.n + x] = t;
  }
  get(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.n || y >= this.n ? -1 : this.tone[y * this.n + x];
  }
  /** Every pixel whose centre passes the test. */
  fill(test: (x: number, y: number) => boolean, t = 1) {
    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) if (test(x + 0.5, y + 0.5)) this.set(x, y, t);
  }
  disc(cx: number, cy: number, r: number, t = 1) {
    this.fill((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, t);
  }
  ring(cx: number, cy: number, r: number, w: number, t = 1) {
    this.fill((x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      return d <= r && d >= r - w;
    }, t);
  }
  /** A thick segment (capsule). */
  line(x0: number, y0: number, x1: number, y1: number, w: number, t = 1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    this.fill((x, y) => {
      const k = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
      return Math.hypot(x - (x0 + dx * k), y - (y0 + dy * k)) <= w / 2;
    }, t);
  }
  /** Part of a ring between two angles (radians, screen y down). */
  arc(cx: number, cy: number, r: number, w: number, a0: number, a1: number, t = 1) {
    this.fill((x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r || d < r - w) return false;
      let a = Math.atan2(y - cy, x - cx);
      while (a < a0) a += Math.PI * 2;
      return a <= a1;
    }, t);
  }
  wedge(cx: number, cy: number, r: number, a0: number, a1: number, t = 1) {
    this.arc(cx, cy, r, r, a0, a1, t);
  }
  poly(pts: [number, number][], t = 1) {
    this.fill((x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, t);
  }
}

const has = (v: string, ...w: string[]) => w.some((x) => v.includes(x));

/** The glyph: the skill's real shape. Aimed shapes point up-right, the way a cursor leads. */
function glyph(s: SkillDef): Grid {
  const g = new Grid();
  const sh = s.shape;
  const v = s.vfx;
  const zone = s.effects.find((e) => e.kind === "zone");
  const dash = s.effects.some((e) => e.kind === "dash" && e.distance > 0);
  const UP_RIGHT = -Math.PI / 4;
  if (has(v, "lightning")) {
    const z: [number, number][] = [[15, 3], [8, 11], [13, 12], [6, 21], [17, 10], [12, 9]];
    g.poly(z);
    return g;
  }
  if (zone && sh.kind !== "projectile") {
    // Lingering ground: a pool (dark) with a lit rim and a few rising wisps.
    g.fill((x, y) => ((x - 12) / 9.5) ** 2 + ((y - 15) / 5.5) ** 2 <= 1, 0);
    g.fill((x, y) => {
      const e = ((x - 12) / 9.5) ** 2 + ((y - 15) / 5.5) ** 2;
      return e <= 1 && e >= 0.6;
    });
    g.line(8, 9, 8, 5, 1.6);
    g.line(12, 8, 12, 3, 1.6);
    g.line(16, 9, 16, 5, 1.6);
    return g;
  }
  switch (sh.kind) {
    case "cone": {
      // A cut: the wedge it hits (dark) under a bright crescent edge, as wide as the real arc.
      const half = Math.max(0.35, Math.min(1.3, (sh.arc * Math.PI) / 360));
      const cx = 5;
      const cy = 19;
      g.wedge(cx, cy, 16, UP_RIGHT - half, UP_RIGHT + half, 0);
      g.arc(cx, cy, 17, 4, UP_RIGHT - half, UP_RIGHT + half, 1);
      if (has(v, "cross", "flurry")) g.arc(cx, cy, 11, 3, UP_RIGHT - half * 0.8, UP_RIGHT + half * 0.8, 1);
      return g;
    }
    case "line": {
      // A thrust or a dash: a blade-like bar to a point; a dash trails speed lines.
      const heavy = sh.width >= 1.2 || has(v, "heavy", "sunder", "charge", "overhead");
      const w = heavy ? 4.5 : 3;
      g.line(5, 19, 16, 8, w);
      g.poly([[14, 5], [20, 4], [19, 10]]);
      if (dash) {
        g.line(3, 13, 8, 8, 1.5, 0);
        g.line(9, 21, 14, 16, 1.5, 0);
      }
      return g;
    }
    case "projectile": {
      // A bolt and its trail; several bolts fan out.
      const n = Math.min(3, sh.count ?? 1);
      const thin = has(v, "arrow", "needle", "knife", "dart");
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 5;
        const hx = 17 + off * 0.7;
        const hy = 7 + off * 0.7 + (n > 1 ? Math.abs(off) * 0.4 : 0);
        const tx = 5 + off * 0.7;
        const ty = 19 + off * 0.7;
        g.line(tx, ty, hx, hy, thin ? 1.5 : 2, 0);
        if (thin) g.poly([[hx + 2.5, hy - 2.5], [hx - 2.5, hy - 0.5], [hx + 0.5, hy + 2.5]]);
        else g.disc(hx, hy, n > 1 ? 2.4 : 3.6);
      }
      return g;
    }
    case "circle": {
      if (sh.at === "aim") {
        // Thrown onto a spot: a target ring with something falling into it.
        g.ring(12, 14, 9, 2);
        g.disc(12, 14, 2.2);
        g.line(12, 2, 12, 8, 2, 0);
        g.poly([[9, 7], [15, 7], [12, 11]]);
        return g;
      }
      // Around you: a burst ring with rays.
      g.ring(12, 12, 8, 2.2);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        g.line(12 + Math.cos(a) * 9, 12 + Math.sin(a) * 9, 12 + Math.cos(a) * 11.5, 12 + Math.sin(a) * 11.5, 1.6);
      }
      g.disc(12, 12, 2.4, 0);
      return g;
    }
    case "self": {
      // A buff: two rising chevrons over a ring at the feet.
      for (const y of [6, 12]) g.poly([[5, y + 6], [12, y - 1], [19, y + 6], [19, y + 9], [12, y + 2], [5, y + 9]]);
      g.fill((x, y) => {
        const e = ((x - 12) / 8) ** 2 + ((y - 20.5) / 2.5) ** 2;
        return e <= 1 && e >= 0.45;
      }, 0);
      return g;
    }
  }
  g.disc(12, 12, 7);
  return g;
}

/** The skill's main effect, as a badge in its own colour. */
type Motif = { draw: (g: Grid) => void; color: number };
const MOTIFS: Partial<Record<StatusId | "heal" | "summon" | "detonate", Motif>> = {
  bleed: { color: 0xc81e2a, draw: (g) => (g.poly([[3.5, 0.5], [6.2, 4.5], [0.8, 4.5]]), g.disc(3.5, 4.6, 2.7)) },
  burn: { color: 0xf08a24, draw: (g) => (g.poly([[3.5, 0], [6.5, 4], [5.5, 7], [1.5, 7], [0.5, 4], [2.5, 3]])) },
  poison: { color: 0x7ec84a, draw: (g) => (g.disc(2.5, 4.5, 2.4), g.disc(5.5, 2, 1.6)) },
  slow: { color: 0x9ec8f0, draw: (g) => (g.ring(2.6, 3.5, 2.6, 1.1), g.ring(4.6, 3.5, 2.6, 1.1)) },
  rooted: { color: 0x9a7a48, draw: (g) => (g.line(3.5, 0.5, 3.5, 6.5, 1.4), g.line(3.5, 6.5, 0.5, 4, 1.2), g.line(3.5, 6.5, 6.5, 4, 1.2)) },
  static: { color: 0xf0e070, draw: (g) => g.poly([[4.5, 0], [1, 4], [3.5, 4], [2.5, 7], [6, 3], [3.5, 3]]) },
  mark: { color: 0xe0b040, draw: (g) => g.poly([[3.5, 0], [7, 3.5], [3.5, 7], [0, 3.5]]) },
  weaken: { color: 0xa890c8, draw: (g) => g.poly([[0.5, 2], [6.5, 2], [3.5, 6.5]]) },
  shield: { color: 0xc8d8f0, draw: (g) => g.poly([[0.5, 0.5], [6.5, 0.5], [6.5, 3.5], [3.5, 6.8], [0.5, 3.5]]) },
  haste: { color: 0xf0f0e0, draw: (g) => (g.poly([[0, 0.5], [3, 3.5], [0, 6.5]]), g.poly([[3.5, 0.5], [6.5, 3.5], [3.5, 6.5]])) },
  stealth: { color: 0x9a80d0, draw: (g) => g.fill((x, y) => (x - 3.5) ** 2 + (y - 3.5) ** 2 <= 10.5 && (x - 5.3) ** 2 + (y - 2.6) ** 2 > 7) },
  heal: { color: 0xe05a6a, draw: (g) => (g.disc(2.2, 2.4, 1.9), g.disc(4.8, 2.4, 1.9), g.poly([[0.3, 3], [6.7, 3], [3.5, 6.8]])) },
  summon: { color: 0xd8d0c0, draw: (g) => (g.disc(3.5, 3, 3), g.line(2, 6, 5, 6, 1.4)) },
  detonate: { color: 0xf06030, draw: (g) => g.poly([[3.5, 0], [4.5, 2.5], [7, 3.5], [4.5, 4.5], [3.5, 7], [2.5, 4.5], [0, 3.5], [2.5, 2.5]]) },
};

function motifOf(s: SkillDef): Motif | null {
  const ef: Effect[] = s.effects;
  if (ef.some((e) => e.kind === "summon")) return MOTIFS.summon!;
  if (ef.some((e) => e.kind === "detonate")) return MOTIFS.detonate!;
  const st = ef.find((e) => e.kind === "status" && e.status !== "stagger") as Extract<Effect, { kind: "status" }> | undefined;
  const zoneSt = (ef.find((e) => e.kind === "zone" && e.status) as Extract<Effect, { kind: "zone" }> | undefined)?.status;
  if (st && MOTIFS[st.status]) return MOTIFS[st.status]!;
  if (zoneSt && MOTIFS[zoneSt]) return MOTIFS[zoneSt]!;
  if (ef.some((e) => e.kind === "heal" || e.kind === "lifesteal")) return MOTIFS.heal!;
  if (s.fire) return MOTIFS.burn!;
  return null;
}

/** Writes a toned grid into RGBA pixels, lit from the top left, outlined in near-black. */
function blit(px: Uint8ClampedArray, g: Grid, base: RGB, ox = 0, oy = 0, size = ICON) {
  const light = mix(base, PAPER, 0.55);
  const shade = mix(base, BLACK, 0.45);
  const dark = mix(base, BLACK, 0.68);
  const put = (x: number, y: number, c: RGB) => {
    const X = x + ox;
    const Y = y + oy;
    if (X < 0 || Y < 0 || X >= size || Y >= size) return;
    const i = (Y * size + X) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
  };
  // Outline first: every empty pixel touching the glyph (8-neighbourhood).
  for (let y = -1; y <= g.n; y++)
    for (let x = -1; x <= g.n; x++) {
      if (g.get(x, y) >= 0) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) if (g.get(x + dx, y + dy) >= 0) near = true;
      if (near) put(x, y, BLACK);
    }
  for (let y = 0; y < g.n; y++)
    for (let x = 0; x < g.n; x++) {
      const t = g.get(x, y);
      if (t < 0) continue;
      if (t === 0) {
        put(x, y, dark);
        continue;
      }
      const lit = g.get(x - 1, y) < 1 || g.get(x, y - 1) < 1;
      const shaded = g.get(x + 1, y) < 1 || g.get(x, y + 1) < 1;
      put(x, y, lit && !shaded ? light : shaded && !lit ? shade : base);
    }
}

/** The plate: the accent darkened almost to black, a lit top edge, a dark frame, cut corners. */
function plate(px: Uint8ClampedArray, accent: RGB) {
  const fill = mix(LACQUER, accent, 0.16);
  const top = mix(LACQUER, accent, 0.34);
  const edge = mix(LACQUER, accent, 0.5);
  for (let y = 0; y < ICON; y++)
    for (let x = 0; x < ICON; x++) {
      const corner = (x === 0 || x === ICON - 1) && (y === 0 || y === ICON - 1);
      if (corner) continue;
      const border = x === 0 || y === 0 || x === ICON - 1 || y === ICON - 1;
      // A soft vertical falloff: lighter at the top, like lacquer catching light.
      const k = 1 - y / ICON;
      const c = border ? edge : y === 1 ? top : mix(fill, top, k * 0.35);
      const i = (y * ICON + x) * 4;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    }
}

const cache = new Map<string, ImageData>();

function render(s: SkillDef, accent: number): ImageData {
  const key = `${s.id}|${accent}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const img = new ImageData(ICON, ICON);
  const acc = rgbOf(accent);
  plate(img.data, acc);
  blit(img.data, glyph(s), acc);
  const m = motifOf(s);
  if (m) {
    // A 7 × 7 badge in the bottom-right corner, on a dark disc so it reads over the glyph.
    const badge = new Grid();
    m.draw(badge);
    const ox = ICON - 9;
    const oy = ICON - 9;
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++)
        if ((x - 4) ** 2 + (y - 4) ** 2 <= 20) {
          const i = ((oy + y) * ICON + ox + x) * 4;
          img.data[i] = BLACK[0];
          img.data[i + 1] = BLACK[1];
          img.data[i + 2] = BLACK[2];
          img.data[i + 3] = 255;
        }
    blit(img.data, badge, rgbOf(m.color), ox + 1, oy + 1);
  }
  cache.set(key, img);
  return img;
}

/** A skill's icon as a canvas at its pixel size; CSS shows it at exactly 2× (class `px-icon`). */
export function skillIcon(s: SkillDef, accent: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = ICON;
  c.getContext("2d")!.putImageData(render(s, accent), 0, 0);
  c.className = "px-icon";
  return c;
}

/**
 * The title mark: an open vermilion enso (the brush circle) around the World-Ash, a pale Y-shaped
 * tree split down its trunk by a red crack, 32 × 32 pixels shown at an integer scale beside the name.
 */
export function logoMark(): HTMLCanvasElement {
  const S = 32;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const img = new ImageData(S, S);
  const ring = new Grid(S);
  // Open at the top right, swelling at the bottom left, as a brush circle does.
  ring.fill((x, y) => {
    const d = Math.hypot(x - 16, y - 16);
    const a = Math.atan2(y - 16, x - 16);
    if (a > -1.25 && a < -0.45) return false;
    return d <= 15 && d >= 15 - (2 + 1.8 * Math.max(0, Math.cos(a - 2.4)));
  });
  const tree = new Grid(S);
  tree.line(16, 25, 16, 15, 4);
  tree.line(15.5, 16, 10, 8, 2.6);
  tree.line(16.5, 16, 22, 8, 2.6);
  tree.line(16, 15, 16, 7, 2);
  tree.poly([[11, 26], [21, 26], [18, 23], [14, 23]]);
  blit(img.data, ring, [192, 48, 28], 0, 0, S);
  blit(img.data, tree, [206, 196, 180], 0, 0, S);
  // The crack: a jagged red line down the trunk, where the tree was split.
  const sap: RGB = [170, 20, 28];
  for (let y = 10; y <= 24; y++) {
    const x = 16 + [0, 1, 0, -1][y % 4];
    img.data.set([...sap, 255], (y * S + x) * 4);
  }
  c.getContext("2d")!.putImageData(img, 0, 0);
  c.className = "px-logo";
  return c;
}
