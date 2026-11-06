import type { SkillDef } from "@broken-ash/shared";
import { blot, enso, inkCanvas, rng, splatter, stroke, type Dab } from "../fx/ink/ink";

/**
 * Skill icons in shadow-ink (the same brush as the skill visuals): a small glyph that says what the
 * skill does — a crescent for a cut, a straight stroke for a thrust or dash, a comet for anything
 * thrown, an enso for a whirl, a blot for something landing, smoke for a buff. Painted once per
 * skill and accent, as a canvas shown with crisp pixels.
 */

const cache = new Map<string, HTMLCanvasElement>();
const has = (v: string, ...w: string[]) => w.some((x) => v.includes(x));

function glyph(s: SkillDef): Dab[] {
  const v = s.vfx;
  const sh = s.shape;
  const seed = [...s.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = rng(seed);
  if (has(v, "lightning")) {
    const pts = [{ x: -9, y: -11 }, { x: 1, y: -3 }, { x: -4, y: -1 }, { x: 6, y: 8 }, { x: 1, y: 6 }, { x: 10, y: 12 }];
    return stroke(pts, 3, { seed, dry: 0.1, press: 0.05 });
  }
  if (has(v, "roots", "grove", "snare")) {
    const out: Dab[] = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.55;
      out.push(...stroke([{ x: 0, y: 10 }, { x: Math.cos(a) * 6, y: 10 + Math.sin(a) * 8 }, { x: Math.cos(a) * 11, y: 10 + Math.sin(a) * 18 }], 2.6, { seed: seed + i, dry: 0.3 }));
    }
    return out;
  }
  switch (sh.kind) {
    case "cone": {
      // A crescent cut; wide cones get a heavier, broader sweep.
      const wide = sh.arc >= 110;
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI * (1.1 + (wide ? 0.95 : 0.75) * (i / 14));
        pts.push({ x: Math.cos(a) * 11 + 2, y: Math.sin(a) * 11 + 4 });
      }
      const out = stroke(pts, wide ? 5 : 4, { seed, dry: has(v, "gust", "gale") ? 0.6 : 0.25 });
      if (has(v, "cross")) out.push(...stroke(pts.map((p) => ({ x: -p.x + 4, y: p.y })), 3.5, { seed: seed + 1 }));
      if (has(v, "flurry")) out.push(...stroke(pts.map((p) => ({ x: p.x * 0.6 + 3, y: p.y * 0.6 + 5 })), 3, { seed: seed + 2 }));
      return out;
    }
    case "line": {
      const heavy = has(v, "heavy", "sunder", "charge", "overhead");
      const out = stroke([{ x: -11, y: 10 }, { x: 11, y: -10 }], heavy ? 5 : 3.6, { seed, dry: 0.4, press: 0.08 });
      if (s.effects.some((e) => e.kind === "dash")) out.push(...splatter(-9, 9, 4, 4, seed));
      return out;
    }
    case "projectile": {
      const n = Math.min(3, sh.count ?? 1);
      const out: Dab[] = [];
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 7;
        const thin = has(v, "arrow", "needle", "knife", "dart");
        out.push(...stroke([{ x: 10 + off * 0.3, y: -10 + off }, { x: -10 + off * 0.3, y: 10 + off }], thin ? 2.2 : 4, { seed: seed + i, dry: 0.5, press: 0.06 }));
        if (!thin) out.push(...blot(10 + off * 0.3, -10 + off, 3, seed + i));
      }
      return out;
    }
    case "circle": {
      if (sh.at === "aim") return [...blot(0, 3, 9, seed), ...splatter(0, 3, 11, 8, seed)];
      if (has(v, "quake", "nova", "vent", "boil", "drink", "toll", "flare")) return [...enso(0, 2, 8, 6, 2.6, 0.3, seed, Math.PI * 1.5), ...splatter(0, 2, 12, 10, seed)];
      return enso(0, 0, 11, 10, 3.8, Math.PI * (0.1 + r() * 0.4), seed);
    }
    case "self": {
      const out = [...enso(0, 9, 10, 4, 2.2, 0.3, seed)];
      for (let i = 0; i < 3; i++) {
        const x = -5 + i * 5;
        out.push(...stroke([{ x, y: 6 }, { x: x + 2, y: -2 }, { x: x - 1, y: -10 }], 2.4, { seed: seed + i, dry: 0.6, press: 0.3 }));
      }
      return out;
    }
  }
  return blot(0, 0, 8, seed);
}

export function skillIcon(s: SkillDef, accent: number): HTMLCanvasElement {
  const key = `${s.id}|${s.vfx}|${accent}`;
  let c = cache.get(key);
  if (!c) {
    c = inkCanvas(glyph(s), accent);
    cache.set(key, c);
  }
  // A fresh copy each time: one canvas element can only sit in one place in the page.
  const out = document.createElement("canvas");
  out.width = c.width;
  out.height = c.height;
  out.getContext("2d")!.drawImage(c, 0, 0);
  out.className = "ink-icon";
  return out;
}
