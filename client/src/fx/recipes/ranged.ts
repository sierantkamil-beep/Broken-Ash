import type { Ctx, Recipe } from "./types";

/*
 * Brush, talismans, fan, lantern, bow, knives: things that leave the hand. Each has a wind-up at
 * the hand, a release flash (muzzle), its own projectile with its own trail, and its own impact.
 */

const INK = [0x0e0a0c, 0x24030a, 0x5e0812];
const PAPER = [0xe8dcc0, 0xc8b890, 0x8a2a14];
const ASH = [0x3a3430, 0x6a625a, 0x2a2420];

/** A little calligraphy flourish at the hand (the brush's wind-ups). */
function flourish(c: Ctx, ramp: Ctx["ramp"] = "blood") {
  c.t.smear(c.hx, c.hy, 0.45, 220, c.aim - 1.2, ramp, { fps: 26, alpha: 0.9 });
  c.t.sparks(c.hx, c.hy, ramp, 3, 50, 20);
}

/** A motion line behind something fast and small (an arrow, a knife), so its flight reads. */
function whoosh(c: Ctx, x: number, y: number, ramp: Ctx["ramp"], len = 0.3) {
  c.t.sprite("streak", ramp, x, y - 22, { rot: c.aim + Math.PI, scaleX: len, scaleY: 0.35, fps: 30, alpha: 0.75 });
}

/** A string or wrist snap at the hand as something is loosed. */
function snap(c: Ctx, ramp: Ctx["ramp"], n = 5) {
  c.t.sprite("sparks", ramp, c.hx, c.hy, { scale: 0.6, fps: 30, rot: c.aim });
  c.t.streaks(c.hx, c.hy, c.aim, 46, 3, 0.35, ramp === "steel" ? "wind" : ramp, { alpha: 0.8 });
  c.t.sparks(c.hx, c.hy, ramp, n, 90, 22, c.aim, 0.6);
}

/** A paper talisman lit at the fingertips. */
function lit(c: Ctx) {
  c.t.sprite("flames", "fire", c.hx, c.hy + 6, { scale: 0.4, fps: 20, loop: true, duration: 260 });
  c.t.light(c.hx, c.hy, 50, "fire", 0.7, 260);
}

export const RANGED: Record<string, Recipe> = {
  // --- Brush (blood ink)
  brush_stroke: {
    sig: "brush basic: ink needle with drip trail, ink splash, beat 3 wide splatter",
    windup: (c) => flourish(c),
    release: (c) => c.t.sparks(c.hx, c.hy, "blood", c.beat === 2 ? 10 : 4, 120, 20, c.aim, 0.6),
    bolt: {
      anim: "needle/blood",
      trail: "blood",
      every: 70,
      tail: (c, x, y) => c.t.stain(x, y, 2, INK[1], 0.6),
      impact: (c, x, y) => {
        c.t.sprite("sparks", "blood", x, y - 22, { scale: c.beat === 2 ? 1.4 : 1, fps: 28 });
        c.t.stain(x, y, c.beat === 2 ? 22 : 10, INK[0], 0.7);
      },
    },
  },
  brush_lance: {
    sig: "lance: long held stroke, a huge ink spear, ink spray behind it, a pierced-hole stain",
    windup: (c) => {
      c.t.smear(c.hx, c.hy, 0.7, 300, c.aim + 2, "blood", { fps: 18 });
      c.t.gather(c.hx, c.hy, "blood", 12, 40, 20, 300);
    },
    release: (c) => c.t.beam(c.hx, c.hy, c.hx + Math.cos(c.aim) * 60, c.hy + Math.sin(c.aim) * 60, "blood", 8, 160),
    bolt: {
      // A spear of ink as long as a body, not a needle.
      anim: "streak/blood",
      scale: 0.5,
      trail: "blood",
      every: 40,
      tail: (c, x, y) => c.t.sparks(x, y, "blood", 2, 50, 22, c.aim + Math.PI, 0.8),
      impact: (c, x, y) => {
        c.t.ring(x, y, 0.6, "blood");
        c.t.stain(x, y, 26, INK[0], 0.75);
        c.t.sparks(x, y - 22, "blood", 14, 200, 22, c.aim, 1);
      },
    },
  },
  brush_seal: {
    sig: "seal: a seal drawn in the air, then stamped on the ground with binding chains of ink",
    travel: (c, x0, y0, x1, y1, ms) => {
      // The seal slides off the brush across the ground.
      c.t.runner(x0, y0 + 30, x1, y1, ms, "sigil", "blood", 30, { scale: 0.35, add: true });
    },
    windup: (c) => c.t.sigil(c.hx, c.hy, 0.4, "blood", { fps: 18, depth: undefined }),
    land: (c) => {
      const { t } = c;
      t.sigil(c.tx, c.ty, c.radius, "blood", { loop: true, duration: 1500 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        t.chain(c.tx + Math.cos(a) * t.px(c.radius), c.ty + Math.sin(a) * t.px(c.radius) * 0.8, c.tx, c.ty - 10, "blood", 5, 22);
      }
      t.stain(c.tx, c.ty, t.px(c.radius) * 0.5, INK[0], 0.35);
      t.shake(0.004, 100);
    },
  },
  brush_sigil: {
    sig: "sigil: a turning burning seal, boiling bubbles of red, rising steam",
    travel: (c, x0, y0, x1, y1, ms) => c.t.lob(x0, y0, x1, y1, "sigil", "fire", 0.4, ms),
    windup: (c) => flourish(c, "fire"),
    land: (c) => {
      const { t } = c;
      t.sigil(c.tx, c.ty, c.radius, "fire", { fps: 18 });
      t.ring(c.tx, c.ty, c.radius, "blood", { delay: 60 });
    },
    zone: (c, ms) => {
      const { t } = c;
      t.sigil(c.tx, c.ty, c.radius, "blood", { loop: true, duration: ms, alpha: 0.85 });
      for (let i = 0; i < Math.floor(ms / 250); i++)
        t.later(i * 250, () => {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * t.px(c.radius) * 0.8;
          t.sprite("bubble", "blood", c.tx + Math.cos(a) * r, c.ty + Math.sin(a) * r * 0.8 - 6, { scale: 0.35, fps: 14 });
          t.rise(c.tx, c.ty, "fire", 2, t.px(c.radius) * 0.7, 0.6);
        });
    },
  },
  brush_glyphs: {
    sig: "glyphs: three glyphs flicked in a fan, each a turning letter of ink",
    windup: (c) => {
      for (let i = -1; i <= 1; i++) c.t.sprite("mote", "blood", c.hx + i * 10, c.hy - 6 - Math.abs(i) * 4, { scale: 0.9, fps: 16 });
    },
    bolt: {
      anim: "sigil/blood",
      scale: 0.35,
      spin: true,
      trail: "blood",
      impact: (c, x, y) => {
        c.t.sigil(x, y, 0.4, "blood", { fps: 24 });
        c.t.sparks(x, y - 20, "blood", 6, 120, 20);
      },
    },
  },
  brush_flood: {
    sig: "flood: a wave of ink rolling over the cone, splashes, everything left stained",
    windup: (c) => {
      c.t.gather(c.hx, c.hy, "blood", 20, 60, 20, 500);
      c.t.smear(c.hx, c.hy, 0.6, 360, 0, "blood", { fps: 12, alpha: 0.6 });
    },
    release: (c) => {
      const { t } = c;
      // A rolling wave: crests one behind another, foam of streaks and spray along its front.
      for (let i = 0; i < 5; i++) t.smear(c.x, c.y - 6, c.range * (0.3 + i * 0.17), c.arc + 10, c.aim, "blood", { fps: 20, delay: i * 60, alpha: 0.95 - i * 0.1 });
      t.streaks(c.x, c.y - 10, c.aim, t.px(c.range), 9, (c.arc * Math.PI) / 180, "blood");
      t.sprite("cloud", "blood", c.tx, c.ty - 10, { scale: 2.2, fps: 10, alpha: 0.7, delay: 200 });
      for (let i = 0; i < 6; i++) {
        const a = c.aim + ((i / 5 - 0.5) * c.arc * Math.PI) / 180;
        const r = t.px(c.range) * (0.5 + Math.random() * 0.45);
        t.later(150 + i * 30, () => {
          t.sparks(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, "blood", 6, 140, 6, -Math.PI / 2, 1.2);
          t.stain(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 20, INK[0], 0.45);
        });
      }
      t.shake(0.008, 220);
    },
  },

  // --- Talismans (fire)
  talismans_throw: {
    sig: "talisman basic: burning paper spinning, ash flakes behind, fire pop, beat 3 two at once",
    windup: (c) => lit(c),
    release: (c) => c.t.sparks(c.hx, c.hy, "fire", c.beat === 2 ? 8 : 3, 80, 20, c.aim, 0.8),
    bolt: {
      anim: "talisman/fire",
      spin: true,
      trail: "fire",
      every: 90,
      tail: (c, x, y) => c.t.flakes(x, y, 6, 1, ASH, false),
      impact: (c, x, y) => {
        c.t.boom(x, y - 14, c.beat === 2 ? 1.1 : 0.7, "fire");
        c.t.scorch(x, y, 12);
        c.t.light(x, y, 140, "fire", 1.2, 260);
      },
    },
  },
  talismans_fan: {
    sig: "fan of talismans: five papers spread like a hand of cards, paper scraps, small pops",
    windup: (c) => {
      for (let i = -2; i <= 2; i++) c.t.sprite("talisman", "fire", c.hx + i * 6, c.hy - 4 - Math.abs(i) * 3, { rot: c.aim + i * 0.25, fps: 1, duration: 200, add: false });
    },
    bolt: {
      anim: "talisman/fire",
      spin: true,
      trail: "fire",
      impact: (c, x, y) => {
        c.t.sprite("sparks", "fire", x, y - 18, { scale: 0.9, fps: 28 });
        c.t.flakes(x, y, 14, 5, PAPER);
      },
    },
  },
  talismans_ward: {
    sig: "ward: a ring of talismans planted round the spot, catching fire one after another",
    travel: (c, x0, y0, x1, y1, ms) => {
      for (let i = 0; i < 4; i++) c.t.later(i * 30, () => c.t.lob(x0, y0, x1 + (i - 1.5) * 20, y1, "talisman", "fire", 1, ms - i * 30));
    },
    windup: (c) => lit(c),
    land: (c) => {
      const { t } = c;
      const R = t.px(c.radius);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const x = c.tx + Math.cos(a) * R;
        const y = c.ty + Math.sin(a) * R * 0.8;
        t.later(i * 30, () => {
          t.sprite("talisman", "fire", x, y - 10, { rot: -Math.PI / 2, fps: 1, duration: 400, add: false });
          t.sprite("flames", "fire", x, y, { scale: 0.7, fps: 14 });
        });
      }
      t.ring(c.tx, c.ty, c.radius, "fire", { delay: 300 });
    },
    zone: (c, ms) => {
      const { t } = c;
      const R = t.px(c.radius);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        t.sprite("flames", "fire", c.tx + Math.cos(a) * R, c.ty + Math.sin(a) * R * 0.8, { scale: 0.8, fps: 12, loop: true, duration: ms, delay: 300 + i * 30 });
      }
      t.light(c.tx, c.ty, R * 2, "fire", 1.1, ms);
      t.scorch(c.tx, c.ty, R * 0.4);
    },
  },
  talismans_mine: {
    sig: "mine: a paper stuck to the ground blinking, then a tall pillar of flame and soot",
    travel: (c, x0, y0, x1, y1, ms) => c.t.lob(x0, y0, x1, y1, "talisman", "fire", 1.2, ms),
    windup: (c) => c.t.sprite("talisman", "fire", c.hx, c.hy, { rot: c.aim, fps: 1, duration: 250, add: false }),
    land: (c) => {
      const { t } = c;
      t.sprite("talisman", "fire", c.tx, c.ty - 4, { rot: 0, fps: 1, duration: 120, add: false });
      t.later(120, () => {
        t.sprite("pillar", "fire", c.tx, c.ty, { scale: 1.6, fps: 22 });
        t.boom(c.tx, c.ty - 16, c.radius, "fire");
        t.scorch(c.tx, c.ty, t.px(c.radius) * 0.7);
        t.flakes(c.tx, c.ty, 40, 10, ASH);
        t.light(c.tx, c.ty, t.px(c.radius) * 2.6, "fire", 1.8, 400);
        t.shake(0.01, 200);
      });
    },
  },
  talismans_chain: {
    sig: "talisman chain: a string of papers snaking through, fire flicking along it",
    windup: (c) => {
      lit(c);
      c.t.chain(c.hx - 20, c.hy, c.hx + 10, c.hy, "fire", 4, 30);
    },
    bolt: {
      anim: "talisman/fire",
      scale: 1.2,
      trail: "fire",
      every: 45,
      tail: (c, x, y) => c.t.sprite("talisman", "fire", x, y - 22, { rot: c.aim + Math.sin(x / 20) * 0.5, fps: 1, duration: 260, add: false }),
      impact: (c, x, y) => {
        c.t.boom(x, y - 14, 0.8, "fire");
        c.t.flakes(x, y, 20, 8, PAPER);
      },
    },
  },
  talismans_phoenix: {
    sig: "phoenix: a fire bird with beating wings, ash feathers falling, a burning feather burst",
    windup: (c) => {
      c.t.gather(c.x, c.y - 30, "fire", 26, 70, 30, 500);
      c.t.sprite("pillar", "fire", c.x, c.y, { scale: 1, fps: 16 });
      c.t.light(c.x, c.y - 30, 160, "fire", 1.2, 550, c.follow);
    },
    bolt: {
      anim: "orb/fire",
      scale: 3,
      trail: "fire",
      every: 60,
      tail: (c, x, y) => {
        // Wings beating: two smears either side of the flight line, and feathers falling.
        const k = Math.sin(x / 18);
        c.t.smear(x, y - 22, 1, 70, c.aim + Math.PI / 2 + k * 0.4, "fire", { fps: 30, alpha: 0.8 });
        c.t.smear(x, y - 22, 1, 70, c.aim - Math.PI / 2 - k * 0.4, "fire", { fps: 30, alpha: 0.8, flipY: true });
        c.t.flakes(x, y, 10, 2, [0xffc23c, 0xec7618, 0x3a3430]);
      },
      impact: (c, x, y) => {
        c.t.boom(x, y - 20, 1.6, "fire");
        c.t.flakes(x, y, 50, 18, [0xffc23c, 0xec7618, 0x962606]);
        c.t.scorch(x, y, 30);
        c.t.light(x, y, 260, "fire", 2, 500);
        c.t.shake(0.01, 220);
      },
    },
  },

  // --- Fan (wind)
  fan_gust: {
    sig: "fan basic: a white crescent of wind, blown streaks, beat 3 a spinning gust ring",
    windup: (c) => c.t.streaks(c.hx, c.hy, c.aim + Math.PI, 26, 2, 0.6, "wind", { alpha: 0.6 }),
    release: (c) => {
      const { t } = c;
      if (c.beat === 2) {
        t.cyclone(c.x, c.y - 10, 1.3, "wind", { loop: true, duration: 300 });
        t.ring(c.x, c.y, c.range * 0.6, "wind");
      }
      t.smear(c.x, c.y - 16, c.range, c.arc, c.aim, "wind", { flipY: c.beat === 1, fps: 30, alpha: 0.85 });
      t.streaks(c.x, c.y - 16, c.aim, t.px(c.range), 4, (c.arc * Math.PI) / 180, "wind", { alpha: 0.7 });
    },
  },
  fan_blink: {
    sig: "blink: a puff of leaves where you stood, a whirl left behind, a gust ring where you land",
    release: (c) => {
      const { t } = c;
      t.sprite("cloud", "wind", c.x, c.y - 14, { scale: 1.4, fps: 14, alpha: 0.8 });
      t.flakes(c.x, c.y, 30, 10, [0x76983a, 0x553614, 0xacd06a]);
      t.cyclone(c.x, c.y - 10, c.radius * 0.8, "wind", { loop: true, duration: 600, alpha: 0.75 });
      t.ring(c.x, c.y, c.radius, "wind");
    },
  },
  fan_blades: {
    sig: "wind blades: three spinning crescents of air, shredded leaves trailing, cut marks",
    windup: (c) => c.t.smear(c.hx, c.hy, 0.5, 160, c.aim, "wind", { fps: 30 }),
    bolt: {
      anim: "slash80/wind",
      scale: 0.4,
      spin: true,
      trail: "wind",
      every: 80,
      tail: (c, x, y) => c.t.flakes(x, y, 4, 1, [0x76983a, 0xacd06a], false),
      impact: (c, x, y) => {
        c.t.smear(x, y - 20, 0.6, 120, c.aim, "steel", { fps: 30 });
        c.t.sparks(x, y - 20, "wind", 6, 120, 20);
      },
    },
  },
  fan_gale: {
    sig: "gale: a wall of wind, dozens of streaks, leaves and grit blown out of the cone",
    windup: (c) => c.t.gather(c.hx, c.hy, "wind", 14, 50, 20, 300),
    release: (c) => {
      const { t } = c;
      t.streaks(c.x, c.y - 16, c.aim, t.px(c.range), 9, (c.arc * Math.PI) / 180, "wind");
      t.smear(c.x, c.y - 10, c.range, c.arc, c.aim, "wind", { fps: 20, alpha: 0.5 });
      t.later(80, () => t.streaks(c.x, c.y - 30, c.aim, t.px(c.range) * 0.8, 5, (c.arc * Math.PI) / 220, "steel", { alpha: 0.5 }));
      t.flakes(c.x + Math.cos(c.aim) * 60, c.y + Math.sin(c.aim) * 60, t.px(c.range) * 0.6, 22, [0x76983a, 0x553614, 0x8a7f72]);
      t.dust(c.tx, c.ty, 60, 12);
      t.shake(0.006, 160);
    },
  },
  fan_updraft: {
    sig: "updraft: a rising cyclone round the body, debris lifted and spun, a gust ring",
    windup: (c) => c.t.orbit(c.follow, "wind", 5, 30, 250, 10, 12),
    release: (c) => {
      const { t } = c;
      t.cyclone(c.x, c.y - 16, c.radius, "wind", { loop: true, duration: 700, alpha: 0.6 });
      t.rise(c.x, c.y, "wind", 30, t.px(c.radius) * 0.8, 2.5);
      t.dust(c.x, c.y, t.px(c.radius), 16);
      t.ring(c.x, c.y, c.radius, "wind", { delay: 120 });
    },
  },
  fan_cyclone: {
    sig: "cyclone: a tall turning funnel on the spot, dust pulled in, leaves orbiting",
    travel: (c, x0, y0, x1, y1, ms) => c.t.runner(x0, y0 + 30, x1, y1, ms, "cyclone", "wind", 34, { scale: 0.45, add: false, alpha: 0.7 }),
    windup: (c) => c.t.cyclone(c.hx, c.hy, 0.4, "wind", { loop: true, duration: 400 }),
    land: (c) => c.t.gather(c.tx, c.ty, "wind", 24, c.t.px(c.radius), 12, 400),
    zone: (c, ms) => {
      const { t } = c;
      t.cyclone(c.tx, c.ty - 12, c.radius, "wind", { loop: true, duration: ms, alpha: 0.8 });
      t.cyclone(c.tx, c.ty - 40, c.radius * 0.6, "wind", { loop: true, duration: ms, alpha: 0.6 });
      t.orbit(() => ({ x: c.tx, y: c.ty }), "nature", 4, t.px(c.radius) * 0.6, ms, 30, 9);
      for (let i = 0; i < Math.floor(ms / 400); i++) t.later(i * 400, () => t.gather(c.tx, c.ty, "wind", 6, t.px(c.radius), 4, 400));
    },
  },

  // --- Lantern (spirit)
  lantern_wisp: {
    sig: "lantern basic: a pale wisp with a flickering tail, a ghostly bite, beat 3 the lantern flares",
    windup: (c) => c.t.light(c.hx, c.hy, 60, "spirit", 0.9, 200),
    release: (c) => {
      if (c.beat === 2) {
        c.t.sprite("pillar", "spirit", c.x, c.y, { scale: 0.7, fps: 20 });
        c.t.light(c.hx, c.hy, 140, "spirit", 1.4, 220);
      }
    },
    bolt: {
      anim: "orb/spirit",
      scale: 1.1,
      trail: "spirit",
      impact: (c, x, y) => {
        c.t.sprite("hands", "spirit", x, y + 6, { scale: 0.7, fps: 20 });
        c.t.sparks(x, y - 20, "poison", 5, 90, 20);
      },
    },
  },
  lantern_toll: {
    sig: "toll: a struck bell, three spirit waves rolling out, faces in the motes",
    windup: (c) => {
      c.t.light(c.hx, c.hy - 20, 90, "spirit", 1, 350);
      c.t.orbit(c.follow, "spirit", 3, 20, 330, 50, 8);
    },
    release: (c) => {
      const { t } = c;
      for (let i = 0; i < 3; i++) t.ring(c.x, c.y, c.radius * (0.6 + i * 0.2), "spirit", { delay: i * 120, alpha: 0.9 - i * 0.2 });
      t.sprite("sigil", "spirit", c.x, c.y, { scale: 1.3, fps: 16, depth: -9e5 });
      t.rise(c.x, c.y, "spirit", 24, t.px(c.radius));
      t.light(c.x, c.y, t.px(c.radius) * 2, "spirit", 1.3, 600);
      t.shake(0.006, 260);
    },
  },
  lantern_chain: {
    sig: "soul chain: a chain of linked spirit lights, faces trailing, a binding coil on hit",
    windup: (c) => c.t.chain(c.hx - 26, c.hy + 4, c.hx, c.hy, "spirit", 4, 40),
    bolt: {
      anim: "orb/spirit",
      scale: 1.4,
      trail: "spirit",
      every: 35,
      tail: (c, x, y) => c.t.sprite("mote", "spirit", x, y - 22, { scale: 1, fps: 18 }),
      impact: (c, x, y) => {
        c.t.sprite("vines", "nature", x, y, { scale: 1, fps: 14, add: false });
        c.t.ring(x, y, 0.5, "spirit");
      },
    },
  },
  lantern_rot: {
    sig: "rot: the lantern's light turns green, a grave-mould cloud, flies and bones of light",
    travel: (c, x0, y0, x1, y1, ms) => c.t.lob(x0, y0, x1, y1, "orb", "poison", 1.6, ms),
    windup: (c) => c.t.light(c.hx, c.hy, 70, "poison", 0.9, 350),
    land: (c) => {
      c.t.ring(c.tx, c.ty, c.radius, "poison");
      c.t.stain(c.tx, c.ty, c.t.px(c.radius) * 0.6, 0x1e2a10, 0.4);
    },
    zone: (c, ms) => {
      const { t } = c;
      const R = t.px(c.radius);
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        const r = Math.sqrt((i + 0.5) / 7) * R * 0.8;
        t.sprite("cloud", "poison", c.tx + Math.cos(a) * r, c.ty + Math.sin(a) * r * 0.8 - 6, { scale: 1.5, fps: 8, loop: true, duration: ms, alpha: 0.55, delay: i * 40 });
      }
      for (let i = 0; i < Math.floor(ms / 200); i++) t.later(i * 200, () => t.rise(c.tx, c.ty, "poison", 3, R * 0.8, 0.5));
    },
  },
  lantern_flare: {
    sig: "flare: the lantern blazes white, a column of light, everything near bleached and weakened",
    windup: (c) => c.t.gather(c.hx, c.hy, "spirit", 16, 50, 20, 300),
    release: (c) => {
      const { t } = c;
      t.sprite("pillar", "spirit", c.x, c.y, { scale: 1.6, fps: 18 });
      t.ring(c.x, c.y, c.radius, "gold");
      t.burst(c.x, c.y - 20, "spirit", 30, 260, 20);
      t.light(c.x, c.y - 20, t.px(c.radius) * 2.4, "spirit", 2, 300, undefined, true);
      t.flash(0xd8fff0, 80);
    },
  },
  lantern_procession: {
    sig: "procession: five spirits walking out in a fan, each a wisp with a tail of faces",
    windup: (c) => {
      c.t.sprite("hands", "spirit", c.x, c.y + 8, { scale: 1, fps: 14 });
      c.t.rise(c.x, c.y, "spirit", 16, 40);
    },
    bolt: {
      anim: "orb/spirit",
      scale: 1.6,
      trail: "spirit",
      every: 80,
      tail: (c, x, y) => c.t.sprite("mote", "spirit", x, y - 10, { scale: 1.4, fps: 10 }),
      impact: (c, x, y) => {
        c.t.sprite("hands", "spirit", x, y + 6, { scale: 1, fps: 18 });
        c.t.sprite("cloud", "poison", x, y - 10, { scale: 0.8, fps: 12, alpha: 0.6 });
      },
    },
  },

  // --- Bow
  bow_arrow: {
    sig: "bow basic: string snap, arrow with a thin air trail, splinters on hit, beat 3 a heavier shot",
    windup: (c) => c.t.sparks(c.hx, c.hy, "wind", 2, 30, 22),
    release: (c) => {
      snap(c, "wind", c.beat === 2 ? 10 : 4);
      if (c.beat === 2) c.t.ring(c.hx, c.hy + 20, 0.35, "wind", { depth: undefined });
    },
    bolt: {
      anim: "arrow/steel",
      scale: 1.5,
      trail: "wind",
      every: 30,
      tail: (c, x, y) => whoosh(c, x, y, "wind"),
      impact: (c, x, y) => {
        c.t.sparks(x, y - 20, "gold", c.beat === 2 ? 8 : 4, 110, 20);
        c.t.flakes(x, y, 8, 3, [0x6a4e34, 0x4a3424], false);
      },
    },
  },
  bow_hunter: {
    sig: "hunter: kneeling aim with a focus ring, a gold arrow tearing the air, a mark burst",
    windup: (c) => {
      c.t.sigil(c.x, c.y, 0.5, "gold", { fps: 18 });
      c.t.gather(c.hx, c.hy, "gold", 14, 40, 20, 450);
    },
    release: (c) => {
      c.t.ring(c.hx, c.hy + 20, 0.4, "gold", { depth: undefined });
      c.t.shake(0.004, 80);
    },
    bolt: {
      anim: "arrow/dusk",
      scale: 2,
      trail: "gold",
      every: 30,
      tail: (c, x, y) => {
        whoosh(c, x, y, "gold", 0.5);
        c.t.sparks(x, y, "gold", 1, 30, 22, c.aim + Math.PI, 0.6);
      },
      impact: (c, x, y) => {
        c.t.sprite("sigil", "dusk", x, y - 30, { scale: 0.6, fps: 18 });
        c.t.sparks(x, y - 22, "gold", 14, 200, 22, c.aim, 1);
      },
    },
  },
  bow_split: {
    sig: "split arrow: one arrow that bursts into three with a puff mid-flight",
    windup: (c) => c.t.sparks(c.hx, c.hy, "steel", 3, 30, 22),
    release: (c) => {
      snap(c, "steel", 4);
      c.t.sprite("cloud", "wind", c.hx + Math.cos(c.aim) * 40, c.hy + Math.sin(c.aim) * 40, { scale: 0.8, fps: 16, alpha: 0.8 });
    },
    bolt: {
      anim: "arrow/wind",
      scale: 1.4,
      trail: "steel",
      every: 30,
      tail: (c, x, y) => whoosh(c, x, y, "steel"),
      impact: (c, x, y) => c.t.sprite("sparks", "steel", x, y - 20, { scale: 0.8, fps: 28 }),
    },
  },
  bow_volley: {
    sig: "volley: arrows loosed up into the sky, then a staggered rain with shadows on the spot",
    // The arrows are already up in the sky (the release): the flight is their shadows sliding in.
    travel: (c, _x0, _y0, x1, y1, ms) => c.t.ring(x1, y1, c.radius, "wind", { duration: ms, alpha: 0.4 }),
    windup: (c) => c.t.streaks(c.hx, c.hy - 10, -Math.PI / 2, 40, 3, 0.4, "wind"),
    release: (c) => c.t.streaks(c.x, c.y - 40, -Math.PI / 2 + Math.cos(c.aim) * 0.3, 90, 7, 0.4, "steel"),
    land: (c) => {
      const { t } = c;
      t.rain(c.tx, c.ty, t.px(c.radius), 16, "arrow", "steel", 300);
      t.ring(c.tx, c.ty, c.radius, "wind", { delay: 300 });
    },
  },
  bow_pin: {
    sig: "pin: a heavy arrow with a green wake that nails the target, roots bursting from the hole",
    windup: (c) => c.t.gather(c.hx, c.hy, "nature", 8, 30, 20, 250),
    release: (c) => snap(c, "nature", 6),
    bolt: {
      anim: "arrow/steel",
      scale: 1.7,
      trail: "nature",
      every: 30,
      tail: (c, x, y) => whoosh(c, x, y, "nature"),
      impact: (c, x, y) => {
        c.t.sprite("roots", "nature", x, y, { scale: 0.9, fps: 18, add: false });
        c.t.ring(x, y, 0.45, "nature");
        c.t.dust(x, y, 16, 6);
      },
    },
  },
  bow_barrage: {
    sig: "barrage: rapid string snaps, a dense long rain over a wide circle, dust everywhere",
    travel: (c, x0, y0, _x1, _y1, ms) => {
      for (let i = 0; i < 6; i++) c.t.later((i * ms) / 6, () => c.t.streaks(x0, y0 - 10, -Math.PI / 2 + (Math.random() - 0.5) * 0.5, 70, 1, 0, "steel"));
    },
    windup: (c) => {
      for (let i = 0; i < 4; i++) c.t.later(i * 110, () => c.t.streaks(c.hx, c.hy - 10, -Math.PI / 2 + (Math.random() - 0.5) * 0.4, 50, 2, 0.3, "steel"));
    },
    land: (c) => {
      const { t } = c;
      t.rain(c.tx, c.ty, t.px(c.radius), 30, "arrow", "steel", 700, (x, y) => Math.random() < 0.4 && t.dust(x, y, 10, 3));
      t.ring(c.tx, c.ty, c.radius, "steel", { delay: 700 });
      t.later(300, () => t.shake(0.006, 400));
    },
  },

  // --- Knives
  knives_throw: {
    sig: "knives basic: two flicked knives, glints, steel pings, beat 3 a spinning pair",
    windup: (c) => c.t.sparks(c.hx, c.hy, "steel", 2, 30, 22),
    release: (c) => snap(c, "steel", c.beat === 2 ? 8 : 3),
    bolt: {
      anim: "knife/steel",
      scale: 1.6,
      trail: "steel",
      every: 30,
      tail: (c, x, y) => whoosh(c, x, y, "steel"),
      impact: (c, x, y) => c.t.sprite("sparks", "gold", x, y - 20, { scale: c.beat === 2 ? 0.9 : 0.6, fps: 30 }),
    },
  },
  knives_fan: {
    sig: "knife fan: five knives sprayed wide, bleeding spray on each hit",
    windup: (c) => {
      for (let i = -2; i <= 2; i++) c.t.sparks(c.hx + i * 5, c.hy, "steel", 1, 20, 22);
    },
    release: (c) => snap(c, "steel", 8),
    bolt: {
      anim: "knife/blood",
      scale: 1.5,
      spin: true,
      trail: "steel",
      every: 30,
      tail: (c, x, y) => whoosh(c, x, y, "steel"),
      impact: (c, x, y) => {
        c.t.sparks(x, y - 20, "blood", 6, 120, 20);
        c.t.stain(x, y, 6, 0x5e0812, 0.6);
      },
    },
  },
  knives_dart: {
    sig: "dart: a blowpipe puff, a venom-green dart with dripping trail, a sickly splash",
    windup: (c) => c.t.sprite("cloud", "poison", c.hx, c.hy, { scale: 0.4, fps: 16, alpha: 0.6 }),
    release: (c) => snap(c, "poison", 4),
    bolt: {
      anim: "knife/poison",
      scale: 1.3,
      trail: "poison",
      every: 60,
      tail: (c, x, y) => {
        whoosh(c, x, y, "poison");
        c.t.stain(x, y, 2, 0x365e12, 0.6);
      },
      impact: (c, x, y) => {
        c.t.boom(x, y - 14, 0.5, "poison");
        c.t.stain(x, y, 10, 0x365e12, 0.5);
      },
    },
  },
  knives_hamstring: {
    sig: "hamstring: a low skimming knife along the ground, a red cut line at the legs",
    windup: (c) => c.t.dust(c.x, c.y, 16, 4),
    release: (c) => snap(c, "blood", 4),
    bolt: {
      anim: "knife/blood",
      scale: 1.5,
      trail: "blood",
      every: 50,
      tail: (c, x, y) => {
        whoosh(c, x, y, "blood");
        c.t.dust(x, y + 20, 6, 1);
      },
      impact: (c, x, y) => {
        c.t.smear(x, y + 4, 0.5, 90, c.aim + Math.PI / 2, "blood", { fps: 30 });
        c.t.sparks(x, y, "blood", 8, 100, 4);
      },
    },
  },
  knives_ricochet: {
    sig: "ricochet: gold-edged knives that ping off with a spark star at each hit",
    windup: (c) => c.t.sprite("sparks", "gold", c.hx, c.hy, { scale: 0.5, fps: 30 }),
    release: (c) => snap(c, "gold", 5),
    bolt: {
      anim: "knife/steel",
      scale: 1.6,
      spin: true,
      trail: "gold",
      every: 30,
      tail: (c, x, y) => whoosh(c, x, y, "gold"),
      impact: (c, x, y) => {
        c.t.sprite("stars", "gold", x, y - 26, { scale: 0.8, fps: 18 });
        c.t.streaks(x, y - 20, c.aim + Math.PI * 0.75, 30, 3, 1.4, "gold");
      },
    },
  },
  knives_rain: {
    sig: "blade rain: knives thrown up in a glittering spray, falling as a poisoned rain",
    travel: (c, x0, y0, x1, y1, ms) => {
      for (let i = 0; i < 5; i++) c.t.lob(x0, y0, x1 + (i - 2) * 18, y1 + ((i * 7) % 3) * 10, "knife", "steel", 1, ms);
    },
    windup: (c) => c.t.sparks(c.hx, c.hy - 10, "steel", 10, 160, 30, -Math.PI / 2, 0.8),
    land: (c) => {
      const { t } = c;
      t.rain(c.tx, c.ty, t.px(c.radius), 18, "knife", "poison", 420, (x, y) => t.stain(x, y, 3, 0x365e12, 0.7));
      t.ring(c.tx, c.ty, c.radius, "poison", { delay: 420 });
    },
  },
};

/** The basic-attack forms (weapon mastery): the basic's look changed, keyed by the form's vfx. */
export const FORMS: Record<string, Recipe> = {
  ink_slash_petal: {
    sig: "form petal cut: smear shedding blossom petals that stay on the ground",
    release: (c) => {
      c.t.smear(c.x, c.y - 18, c.range, c.arc, c.aim, "blood", { flipY: c.beat === 1 });
      c.t.flakes(c.tx, c.ty, 30, 10, [0x9a1a22, 0xd04050, 0x7a1418]);
    },
  },
  ink_sweep_wing: {
    sig: "form crane wing: a feathered white smear, feathers drifting off it",
    release: (c) => {
      c.t.smear(c.x, c.y - 18, c.range, c.arc + 20, c.aim, "wind", { flipY: c.beat === 1, fps: 24 });
      c.t.flakes(c.tx, c.ty, 36, 8, [0xf2f2ea, 0xc8c8c0, 0x1e1e22]);
    },
  },
  ink_cleave_mountain: {
    sig: "form mountain: the cleave rings the ground like a struck mountain, stones jumping",
    release: (c) => {
      c.t.smear(c.x, c.y - 16, c.range, c.arc, c.aim, "steel", { flipY: c.beat === 1 });
      c.t.ring(c.tx, c.ty, 1, "dusk");
      c.t.dust(c.tx, c.ty, 60, 20, 0x6a625a);
      c.t.shake(0.006, 120);
    },
  },
  ink_needle_crane: {
    sig: "form crane needle: a white-tipped needle trailing a single long feather",
    bolt: {
      anim: "needle/steel",
      scale: 1.2,
      trail: "wind",
      every: 70,
      tail: (c, x, y) => c.t.flakes(x, y, 4, 1, [0xf2f2ea], false),
      impact: (c, x, y) => c.t.sprite("sparks", "steel", x, y - 20, { scale: 0.9, fps: 28 }),
    },
  },
  ink_talisman_fox: {
    sig: "form fox fire: a blue-white fox flame talisman, a wide blinding pop",
    bolt: {
      anim: "orb/spirit",
      scale: 1.2,
      trail: "spirit",
      impact: (c, x, y) => {
        c.t.boom(x, y - 14, 1, "spirit");
        c.t.light(x, y, 200, "spirit", 1.8, 200, undefined, true);
      },
    },
  },
  ink_gust_pine: {
    sig: "form pine wind: the gust carries pine needles that stick in the ground",
    release: (c) => {
      c.t.smear(c.x, c.y - 16, c.range, c.arc, c.aim, "nature", { flipY: c.beat === 1, alpha: 0.85 });
      c.t.flakes(c.tx, c.ty, 40, 12, [0x2a4a22, 0x3a5a2a, 0x1a2a14]);
    },
  },
  ink_wisp_moth: {
    sig: "form moth: the wisp flutters as a pale moth, dust of its wings falling",
    bolt: {
      anim: "orb/dusk",
      scale: 1,
      trail: "dusk",
      every: 60,
      tail: (c, x, y) => c.t.flakes(x, y, 5, 1, [0xffe8b0, 0xdca63c], false),
      impact: (c, x, y) => c.t.flakes(x, y, 16, 8, [0xffe8b0, 0xdca63c]),
    },
  },
  ink_arrow_hawk: {
    sig: "form hawk: the arrow screams with a hawk's shadow, pierces with a feather burst",
    bolt: {
      anim: "arrow/dusk",
      scale: 1.2,
      trail: "dusk",
      every: 90,
      tail: (c, x, y) => c.t.sprite("streak", "shadow", x, y, { rot: c.aim, scaleX: 0.25, scaleY: 0.6, fps: 24, add: false, alpha: 0.5 }),
      impact: (c, x, y) => c.t.flakes(x, y, 20, 8, [0x5a3a1a, 0x8a5a2a, 0xe8d8b8]),
    },
  },
  ink_knife_swallow: {
    sig: "form swallow: knives curving like swallows, twin dark wing streaks",
    bolt: {
      anim: "knife/steel",
      spin: true,
      trail: "shadow",
      every: 70,
      tail: (c, x, y) => c.t.smear(x, y - 22, 0.35, 120, c.aim + Math.PI, "shadow", { fps: 30, add: false, alpha: 0.6 }),
      impact: (c, x, y) => c.t.sprite("sparks", "steel", x, y - 20, { scale: 0.8, fps: 30 }),
    },
  },
};
