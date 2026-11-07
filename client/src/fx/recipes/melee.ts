import type { Ctx, Recipe } from "./types";

/*
 * Blades, glaive, greatblade. The steel itself is the effect: smears the size of the real wedge,
 * glints on the edge, sparks where the arc ends, the ground answering heavy blows. Basic attacks
 * read the chain beat (0, 1, 2): the second cuts back the other way, the third is the finisher.
 */

const CHEST = 18;

/** A short glint on the edge as the blade is drawn back (every melee wind-up). */
function glint(c: Ctx, ramp: Ctx["ramp"] = "steel", n = 4) {
  c.t.sprite("sparks", ramp === "steel" ? "gold" : ramp, c.hx, c.hy - 6, { scale: 0.5, fps: 24 });
  c.t.sparks(c.hx, c.hy, ramp === "steel" ? "steel" : ramp, n, 40, 22);
}

/** Sparks thrown from where an arc ends. */
function arcEnd(c: Ctx, rot: number, R: number, ramp: Ctx["ramp"], n: number) {
  c.t.sparks(c.x + Math.cos(rot) * c.t.px(R), c.y - CHEST + Math.sin(rot) * c.t.px(R), ramp, n, 150, 16);
}

export const MELEE: Record<string, Recipe> = {
  // --- Blades
  blades_cut: {
    sig: "blades basic: twin smears, beat 2 cross-back, beat 3 thrust spike",
    windup: (c) => glint(c, "steel", 2),
    release: (c) => {
      const { t } = c;
      if (c.beat === 2) {
        // The finisher: both blades thrust together, a spike of light and a heavier spark.
        t.sprite("streak", "steel", c.x, c.y - CHEST, { rot: c.aim, scaleX: t.px(c.range) / 192, scaleY: 0.9, fps: 30 });
        t.sprite("sparks", "gold", c.tx, c.ty - CHEST, { scale: 1.1, fps: 30, rot: c.aim });
        t.shake(0.004, 90);
        t.freeze(c.caster, 40);
        return;
      }
      const flip = c.beat === 1;
      t.smear(c.x, c.y - CHEST, c.range, c.arc, c.aim + (flip ? 0.12 : -0.12), "steel", { flipY: flip });
      t.smear(c.x, c.y - CHEST, c.range * 0.8, c.arc * 0.8, c.aim, "steel", { flipY: !flip, delay: 70, alpha: 0.75 });
      arcEnd(c, c.aim + ((flip ? -1 : 1) * c.arc * Math.PI) / 400, c.range, "gold", 4);
      t.light(c.tx, c.ty - CHEST, 90, "steel", 0.5, 150);
    },
  },
  blades_draw: {
    sig: "draw: sheath flash, afterimage streak, delayed hairline cut along the line",
    windup: (c) => {
      c.t.sprite("sparks", "gold", c.hx, c.hy, { scale: 0.7, fps: 30 });
      c.t.light(c.hx, c.hy, 70, "gold", 0.8, 120);
    },
    release: (c) => {
      const { t } = c;
      t.sprite("streak", "shadow", c.x, c.y - CHEST, { rot: c.aim, scaleX: t.px(c.length) / 192, scaleY: 1.4, fps: 22, add: false, alpha: 0.7 });
      // The cut appears a beat after the body has passed: a thin white hairline, then it bursts.
      t.later(110, () => {
        t.beam(c.x, c.y - CHEST, c.tx, c.ty - CHEST, "steel", 10, 400);
        t.light((c.x + c.tx) / 2, c.y - CHEST, t.px(c.length) * 0.6, "steel", 1, 260, undefined, true);
        for (let i = 1; i <= 4; i++) t.sparks(c.x + ((c.tx - c.x) * i) / 5, c.y - CHEST + ((c.ty - c.y) * i) / 5, "gold", 3, 90, 18);
      });
      t.dust(c.x, c.y, 30, 8);
    },
  },
  blades_cross: {
    sig: "cross: two crossing smears, an X flare where they meet, stagger stars",
    windup: (c) => {
      glint(c, "gold", 3);
      c.t.sparks(c.hx - 8, c.hy, "steel", 3, 30, 22);
    },
    release: (c) => {
      const { t } = c;
      t.smear(c.x, c.y - CHEST, c.range, c.arc, c.aim - 0.25, "steel");
      t.smear(c.x, c.y - CHEST, c.range, c.arc, c.aim + 0.25, "gold", { flipY: true, delay: 90 });
      const mx = c.x + Math.cos(c.aim) * t.px(c.range) * 0.6;
      const my = c.y - CHEST + Math.sin(c.aim) * t.px(c.range) * 0.6;
      t.later(100, () => {
        t.streaks(mx, my, c.aim + Math.PI / 4, 70, 2, Math.PI / 2, "gold");
        t.sprite("stars", "gold", mx, my - 20, { scale: 1, fps: 14 });
        t.light(mx, my, 120, "gold", 0.9, 160, undefined, true);
        t.shake(0.004, 100);
      });
    },
  },
  blades_whirl: {
    sig: "whirl: double counter-turning steel rings, a spark spiral, a dust ring",
    windup: (c) => c.t.gather(c.x, c.y - CHEST, "steel", 10, 50, 18, 150),
    release: (c) => {
      const { t } = c;
      t.smear(c.x, c.y - 14, c.radius, 360, c.aim, "steel", { fps: 32 });
      t.smear(c.x, c.y - 14, c.radius * 0.75, 360, c.aim + Math.PI, "wind", { fps: 32, flipY: true, delay: 80, alpha: 0.8 });
      for (let i = 0; i < 12; i++) {
        const a = c.aim + (i / 12) * Math.PI * 2;
        t.later(i * 14, () => arcEnd(c, a, c.radius, "gold", 1));
      }
      t.dust(c.x, c.y, t.px(c.radius), 14);
    },
  },
  blades_flurry: {
    sig: "flurry: three staggered alternating smears, rising speed lines, haste wind at the feet",
    windup: (c) => c.t.streaks(c.x, c.y - 6, c.aim + Math.PI, 40, 3, 0.6, "wind"),
    release: (c) => {
      const { t } = c;
      for (let i = 0; i < 4; i++)
        t.smear(c.x, c.y - CHEST, c.range * (0.8 + i * 0.07), c.arc * 0.9, c.aim + (i % 2 ? 0.2 : -0.2), i === 3 ? "gold" : "steel", { flipY: i % 2 === 1, delay: i * 65, alpha: 0.9 });
      t.later(240, () => arcEnd(c, c.aim, c.range, "gold", 8));
      t.ring(c.x, c.y, 0.8, "wind", { delay: 200 });
      t.streaks(c.x, c.y - 30, -Math.PI / 2, 40, 4, 1.2, "wind", { delay: 220 });
    },
  },
  blades_behead: {
    sig: "behead: crouched shadow, leap streak, vertical blood crescent at the end, red flash",
    windup: (c) => {
      c.t.sprite("cloud", "shadow", c.x, c.y - 8, { scale: 1, fps: 12, add: false, alpha: 0.7 });
      c.t.light(c.hx, c.hy, 60, "blood", 0.7, 300);
    },
    release: (c) => {
      const { t } = c;
      t.sprite("streak", "shadow", c.x, c.y - 30, { rot: c.aim, scaleX: t.px(c.length) / 192, scaleY: 1.1, fps: 22, add: false, alpha: 0.6 });
      t.later(140, () => {
        // One vertical crescent where the head would be.
        t.smear(c.tx, c.ty - 34, 1.3, 160, -Math.PI / 2 + (Math.cos(c.aim) >= 0 ? 0.6 : -0.6), "blood", { fps: 26 });
        t.sparks(c.tx, c.ty - 30, "blood", 14, 200, 30, c.aim, 1.2);
        t.flash(0x8a0a10, 90);
        t.shake(0.008, 140);
        t.freeze(c.caster, 70);
      });
    },
  },

  // --- Glaive
  glaive_sweep: {
    sig: "glaive basic: long thin sweep, shaft wind line, beat 3 spear spike",
    windup: (c) => glint(c, "steel", 2),
    release: (c) => {
      const { t } = c;
      if (c.beat === 2) {
        t.sprite("streak", "gold", c.x, c.y - CHEST, { rot: c.aim, scaleX: (t.px(c.range) * 1.2) / 192, scaleY: 0.7, fps: 30 });
        t.sparks(c.tx, c.ty - CHEST, "gold", 6, 160, 18, c.aim, 0.6);
        t.shake(0.004, 80);
        return;
      }
      t.smear(c.x, c.y - CHEST, c.range, c.arc + 20, c.aim, "steel", { flipY: c.beat === 1, fps: 26 });
      t.streaks(c.x, c.y - CHEST, c.aim + (c.beat === 1 ? 0.5 : -0.5), t.px(c.range) * 0.8, 1, 0, "wind", { alpha: 0.6 });
      arcEnd(c, c.aim + (c.beat === 1 ? -0.6 : 0.6), c.range, "steel", 3);
    },
  },
  glaive_thrust: {
    sig: "thrust: long gold spear of light, pierce rings along the line, a wake of wind",
    windup: (c) => c.t.gather(c.hx, c.hy, "gold", 8, 30, 18, 200),
    release: (c) => {
      const { t } = c;
      t.sprite("streak", "gold", c.x, c.y - CHEST, { rot: c.aim, scaleX: t.px(c.length) / 192, scaleY: 0.6, fps: 30 });
      t.beam(c.x, c.y - CHEST, c.tx, c.ty - CHEST, "gold", 4, 180);
      for (let i = 1; i <= 3; i++) t.ring(c.x + ((c.tx - c.x) * i) / 4, c.y + ((c.ty - c.y) * i) / 4, 0.35, "gold", { delay: i * 40 });
      t.streaks(c.tx, c.ty - CHEST, c.aim, 50, 3, 0.5, "wind", { delay: 80 });
    },
  },
  glaive_vault: {
    sig: "vault: dust at take-off, arc of air, a wing-shaped slam ring on landing",
    windup: (c) => c.t.dust(c.x, c.y, 24, 6),
    release: (c) => {
      const { t } = c;
      t.dust(c.x, c.y, 40, 12);
      t.sprite("streak", "wind", c.x, c.y - 40, { rot: c.aim, scaleX: t.px(c.length) / 192, scaleY: 0.8, fps: 24, alpha: 0.7 });
      t.later(180, () => {
        t.smear(c.tx, c.ty - 10, c.width * 1.2, 200, c.aim, "wind", { fps: 26 });
        t.ring(c.tx, c.ty, c.width, "steel");
        t.dust(c.tx, c.ty, t.px(c.width), 16);
        t.shake(0.006, 120);
      });
    },
  },
  glaive_reap: {
    sig: "reap: wide green-tinged scythe circle, cut grass flying, a slow mist ring",
    windup: (c) => c.t.sprite("sparks", "nature", c.hx, c.hy, { scale: 0.6, fps: 24 }),
    release: (c) => {
      const { t } = c;
      t.smear(c.x, c.y - 10, c.radius, 360, c.aim, "nature", { fps: 28 });
      t.smear(c.x, c.y - 10, c.radius * 1.05, 360, c.aim, "steel", { fps: 28, delay: 40, alpha: 0.6 });
      t.flakes(c.x, c.y, t.px(c.radius) * 0.8, 24, [0x4a6a24, 0x76983a, 0x5a4a2a]);
      t.ring(c.x, c.y, c.radius, "wind", { delay: 160, alpha: 0.6 });
    },
  },
  glaive_hook: {
    sig: "hook: narrow reaching streak, a curved hook smear pulling back, vines snapping at the end",
    windup: (c) => glint(c, "steel", 2),
    release: (c) => {
      const { t } = c;
      t.sprite("streak", "steel", c.x, c.y - CHEST, { rot: c.aim, scaleX: t.px(c.range) / 192, scaleY: 0.5, fps: 30 });
      t.later(110, () => {
        t.smear(c.tx, c.ty - CHEST, 0.9, 140, c.aim + Math.PI, "steel", { fps: 28 });
        t.sprite("vines", "nature", c.tx, c.ty, { scale: 1.2, fps: 14, add: false });
        t.sparks(c.tx, c.ty - CHEST, "gold", 5, 110, 18, c.aim + Math.PI, 0.8);
      });
    },
  },
  glaive_moon: {
    sig: "moon: huge dusk crescent ring that grows, silver motes, knockback dust wave",
    windup: (c) => {
      c.t.orbit(c.follow, "dusk", 6, 26, 380, 30);
      c.t.light(c.x, c.y - 20, 120, "dusk", 0.6, 400, c.follow);
    },
    release: (c) => {
      const { t } = c;
      t.smear(c.x, c.y - 12, c.radius, 360, c.aim, "dusk", { fps: 22 });
      t.smear(c.x, c.y - 12, c.radius * 0.6, 300, c.aim + 1, "gold", { fps: 22, delay: 70, alpha: 0.8 });
      t.ring(c.x, c.y, c.radius, "dusk");
      t.rise(c.x, c.y, "gold", 20, t.px(c.radius) * 0.8);
      t.dust(c.x, c.y, t.px(c.radius), 24);
      t.light(c.x, c.y, t.px(c.radius) * 2, "dusk", 1.2, 300);
      t.shake(0.008, 180);
    },
  },

  // --- Greatblade
  greatblade_cleave: {
    sig: "greatblade basic: wide heavy smear, chips off the ground, beat 3 overhead with cracks",
    windup: (c) => glint(c, "steel", 3),
    release: (c) => {
      const { t } = c;
      if (c.beat === 2) {
        t.smear(c.x, c.y - 14, c.range, 60, c.aim, "gold", { fps: 26 });
        t.later(60, () => {
          t.crack(c.x + Math.cos(c.aim) * 30, c.y + Math.sin(c.aim) * 30, c.tx, c.ty, 140);
          t.shake(0.008, 140);
          t.freeze(c.caster, 70);
        });
        return;
      }
      t.smear(c.x, c.y - 16, c.range, c.arc, c.aim, "steel", { flipY: c.beat === 1, fps: 24 });
      t.smear(c.x, c.y - 16, c.range * 0.6, c.arc * 0.8, c.aim, "shadow", { flipY: c.beat === 1, fps: 24, add: false, alpha: 0.5, delay: 40 });
      t.dust(c.tx, c.ty, 50, 10);
      arcEnd(c, c.aim + (c.beat === 1 ? -1 : 1), c.range, "gold", 6);
      t.shake(0.004, 100);
    },
  },
  greatblade_charge: {
    sig: "charge: a ram of steel streaks, trampled dust trail, impact ring with shards",
    windup: (c) => {
      c.t.dust(c.x, c.y, 30, 10);
      c.t.streaks(c.x, c.y - 20, c.aim + Math.PI, 50, 3, 0.4, "steel", { alpha: 0.5 });
    },
    release: (c) => {
      const { t } = c;
      t.sprite("streak", "steel", c.x, c.y - 24, { rot: c.aim, scaleX: t.px(c.length) / 192, scaleY: 1.6, fps: 22 });
      for (let i = 0; i < 6; i++) t.later(i * 40, () => t.dust(c.x + ((c.tx - c.x) * i) / 6, c.y + ((c.ty - c.y) * i) / 6, 30, 6));
      t.later(240, () => {
        t.ring(c.tx, c.ty, c.width, "steel");
        t.sparks(c.tx, c.ty - 20, "gold", 14, 220, 20, c.aim, 1.4);
        t.shake(0.01, 160);
      });
    },
  },
  greatblade_overhead: {
    sig: "overhead: blade raised with gathering light, a vertical gold slash, a crater and long cracks",
    windup: (c) => {
      c.t.gather(c.x, c.y - 60, "gold", 16, 40, 60, 500);
      c.t.light(c.x, c.y - 60, 90, "gold", 0.8, 550, c.follow);
    },
    release: (c) => {
      const { t } = c;
      t.smear(c.x, c.y - 30, c.range, c.arc, c.aim, "gold", { fps: 30 });
      const ix = c.x + Math.cos(c.aim) * t.px(c.range) * 0.75;
      const iy = c.y + Math.sin(c.aim) * t.px(c.range) * 0.75;
      t.later(60, () => {
        t.ring(ix, iy, 0.9, "steel");
        t.crack(ix, iy, ix + Math.cos(c.aim) * 90, iy + Math.sin(c.aim) * 90, 120);
        t.crack(ix, iy, ix + Math.cos(c.aim + 1) * 50, iy + Math.sin(c.aim + 1) * 50, 90);
        t.crack(ix, iy, ix + Math.cos(c.aim - 1) * 50, iy + Math.sin(c.aim - 1) * 50, 90);
        t.dust(ix, iy, 70, 22);
        t.shake(0.012, 200);
        t.freeze(c.caster, 90);
      });
    },
  },
  greatblade_quake: {
    sig: "quake: leap shadow, ground blast rings in two colours, radial cracks, debris",
    windup: (c) => c.t.dust(c.x, c.y, 26, 6),
    release: (c) => {
      const { t } = c;
      t.ring(c.x, c.y, c.radius, "gold");
      t.ring(c.x, c.y, c.radius * 0.7, "dusk", { delay: 70 });
      t.burst(c.x, c.y, "gold", 36, 320);
      t.light(c.x, c.y, t.px(c.radius) * 1.8, "dusk", 1.2, 300);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        t.crack(c.x, c.y, c.x + Math.cos(a) * t.px(c.radius) * 0.9, c.y + Math.sin(a) * t.px(c.radius) * 0.8, 160);
      }
      t.dust(c.x, c.y, t.px(c.radius), 40, 0xb0a898);
      t.shake(0.014, 280);
      t.freeze(c.caster, 90);
    },
  },
  greatblade_spin: {
    sig: "spin: slow heavy steel circle, dragging sparks along the ground, a grey slowing haze",
    windup: (c) => glint(c, "steel", 3),
    release: (c) => {
      const { t } = c;
      t.smear(c.x, c.y - 10, c.radius, 360, c.aim, "steel", { fps: 18 });
      for (let i = 0; i < 16; i++) {
        const a = c.aim + (i / 16) * Math.PI * 2;
        t.later(i * 20, () => t.sparks(c.x + Math.cos(a) * t.px(c.radius) * 0.8, c.y + Math.sin(a) * t.px(c.radius) * 0.7, "gold", 2, 60, 2));
      }
      t.sprite("cloud", "wind", c.x, c.y - 4, { scale: 2, fps: 8, alpha: 0.5, delay: 200 });
    },
  },
  greatblade_sunder: {
    sig: "sunder: a dark rift racing along the line, shadow haze rising from it, rubble",
    windup: (c) => {
      c.t.sprite("cloud", "shadow", c.hx, c.hy - 20, { scale: 0.9, fps: 10, add: false, alpha: 0.6 });
      c.t.light(c.x, c.y - 50, 80, "shadow", 0.5, 400);
    },
    release: (c) => {
      const { t } = c;
      t.smear(c.x, c.y - 24, 1.6, 50, c.aim, "shadow", { fps: 28, add: false });
      t.crack(c.x, c.y, c.tx, c.ty, 260);
      for (let i = 1; i <= 5; i++)
        t.later(i * 50, () => {
          const x = c.x + ((c.tx - c.x) * i) / 5;
          const y = c.y + ((c.ty - c.y) * i) / 5;
          t.sprite("cloud", "shadow", x, y - 6, { scale: 0.9, fps: 10, add: false, alpha: 0.6 });
          t.dust(x, y, 30, 6);
        });
      t.shake(0.01, 260);
    },
  },
};
