import type { Recipe } from "./types";

/*
 * The paths' own skills: each path's element and its people's style. Thorn red and harvesting,
 * Bark green and rooted, Blood drawn out of bodies, Ash burning, Storm striking from the sky, Graves
 * calling the dead, Dusk hunting under gold, Sting poisoning in smoke.
 */

const BLOOD = [0x5e0812, 0x7a0a14, 0x9a1220];
const LEAVES = [0x4a6a24, 0x76983a, 0x553614];

export const PATH_RECIPES: Record<string, Recipe> = {
  // --- Thorn
  thorn_harvest: {
    sig: "harvest: blood gathers on the blade, a crimson triple crescent, thorny spikes, every bleed torn",
    windup: (c) => c.t.gather(c.hx, c.hy, "blood", 14, 40, 20, 200),
    release: (c) => {
      const { t } = c;
      for (let i = 0; i < 3; i++) t.smear(c.x, c.y - 16, c.range * (0.7 + i * 0.15), c.arc, c.aim + (i - 1) * 0.15, i === 1 ? "steel" : "blood", { delay: i * 60, flipY: i === 1 });
      for (let i = 0; i < 5; i++) {
        const a = c.aim + ((i / 4 - 0.5) * c.arc * Math.PI) / 180;
        t.later(150 + i * 25, () => t.sprite("roots", "blood", c.x + Math.cos(a) * t.px(c.range) * 0.8, c.y + Math.sin(a) * t.px(c.range) * 0.7, { scale: 0.7, fps: 22, add: false }));
      }
      t.light(c.tx, c.ty, 150, "blood", 1, 260);
      t.shake(0.006, 140);
    },
  },
  thorn_feint: {
    sig: "feint: a shadow left standing where you were, a quick red slash from the side",
    release: (c) => {
      const { t } = c;
      t.sprite("cloud", "shadow", c.x, c.y - 20, { scale: 1.2, fps: 12, add: false, alpha: 0.8 });
      t.smear(c.x, c.y - 18, c.range, c.arc, c.aim + 0.4, "blood", { flipY: true, fps: 34 });
      t.streaks(c.x, c.y - 10, c.aim + Math.PI, 40, 3, 0.5, "shadow", { add: false, alpha: 0.6 });
    },
  },
  thorn_oath: {
    sig: "oath: blood drawn up the arm into a thorn sigil over the head, a red pulse",
    windup: (c) => c.t.sparks(c.hx, c.hy, "blood", 4, 40, 30),
    release: (c) => {
      const { t } = c;
      t.sigil(c.x, c.y - 70, 0.5, "blood", { depth: undefined, fps: 16 });
      t.ring(c.x, c.y, 1.2, "blood");
      t.sprite("pillar", "blood", c.x, c.y, { scale: 0.9, fps: 18 });
      t.orbit(c.follow, "blood", 4, 20, 700, 40, 10);
      t.light(c.x, c.y - 30, 140, "blood", 1.1, 600, c.follow);
    },
  },

  // --- Bark
  bark_roots: {
    sig: "roots: hand to the soil, a green ripple running to the spot, roots erupting in a ring",
    windup: (c) => c.t.sprite("vines", "nature", c.x, c.y, { scale: 1, fps: 14, add: false }),
    land: (c) => {
      const { t } = c;
      t.sigil(c.tx, c.ty, c.radius, "nature", { loop: true, duration: 900 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.2;
        t.later(i * 30, () => t.sprite("roots", "nature", c.tx + Math.cos(a) * t.px(c.radius) * 0.6, c.ty + Math.sin(a) * t.px(c.radius) * 0.5, { scale: 1.1, fps: 18, add: false }));
      }
      t.dust(c.tx, c.ty, t.px(c.radius), 14, 0x5a4a2a);
      t.flakes(c.tx, c.ty, t.px(c.radius) * 0.6, 10, LEAVES);
    },
  },
  bark_hide: {
    sig: "bark hide: bark plates closing over the body, splinters, a green-brown dome",
    windup: (c) => c.t.gather(c.x, c.y - 30, "nature", 10, 40, 30, 120),
    release: (c) => {
      const { t } = c;
      t.sprite("bubble", "nature", c.x, c.y - 34, { scale: 1.6, fps: 12, loop: true, duration: 1400, alpha: 0.85, follow: c.follow, dy: -34 });
      t.flakes(c.x, c.y, 24, 10, [0x553614, 0x3a2410, 0x76983a]);
      t.ring(c.x, c.y, 0.9, "nature");
    },
  },
  bark_grove: {
    sig: "grove: a ring of thorn trees bursting up round you, leaves falling, a living green circle",
    windup: (c) => c.t.gather(c.x, c.y, "nature", 20, 90, 4, 400),
    release: (c) => {
      const { t } = c;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        t.later(i * 30, () => t.sprite("roots", "nature", c.x + Math.cos(a) * t.px(c.radius) * 0.85, c.y + Math.sin(a) * t.px(c.radius) * 0.75, { scale: 1.3, fps: 16, add: false }));
      }
      t.ring(c.x, c.y, c.radius, "nature");
      t.flakes(c.x, c.y, t.px(c.radius), 30, LEAVES);
      t.shake(0.006, 200);
    },
    zone: (c, ms) => {
      c.t.sigil(c.tx, c.ty, c.radius, "nature", { loop: true, duration: ms, alpha: 0.7 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        c.t.sprite("vines", "nature", c.tx + Math.cos(a) * c.t.px(c.radius) * 0.5, c.ty + Math.sin(a) * c.t.px(c.radius) * 0.4, { scale: 1, fps: 8, loop: true, duration: ms, add: false });
      }
    },
  },

  // --- Blood
  blood_drink: {
    sig: "drink: blood ripped out of everyone around in streams that pour into the caster",
    windup: (c) => c.t.sigil(c.x, c.y, 0.8, "blood", { fps: 18 }),
    release: (c) => {
      const { t } = c;
      t.ring(c.x, c.y, c.radius, "blood");
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = t.px(c.radius) * 0.85;
        t.beam(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.8 - 20, c.x, c.y - 26, "blood", 4, 300, i * 20);
      }
      t.gather(c.x, c.y - 26, "blood", 40, t.px(c.radius), 20, 450);
      t.later(400, () => t.sprite("pillar", "blood", c.x, c.y, { scale: 1, fps: 20 }));
      t.light(c.x, c.y, t.px(c.radius) * 1.6, "blood", 1, 500);
    },
  },
  blood_veil: {
    sig: "veil: a curtain of blood mist wraps the body, drops circling, a red dome",
    release: (c) => {
      const { t } = c;
      t.sprite("bubble", "blood", c.x, c.y - 34, { scale: 1.6, fps: 12, loop: true, duration: 1600, alpha: 0.8, follow: c.follow, dy: -34 });
      t.sprite("cloud", "blood", c.x, c.y - 20, { scale: 1.4, fps: 10, alpha: 0.6 });
      t.orbit(c.follow, "blood", 6, 30, 900, 20, 7);
    },
  },
  blood_boil: {
    sig: "boil: the ground bubbles red, blood geysers burst out of the ring, a boiling cloud",
    windup: (c) => c.t.gather(c.x, c.y, "blood", 16, 60, 4, 300),
    release: (c) => {
      const { t } = c;
      t.sigil(c.x, c.y, c.radius, "blood", { fps: 16 });
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * t.px(c.radius) * 0.85;
        const x = c.x + Math.cos(a) * r;
        const y = c.y + Math.sin(a) * r * 0.8;
        t.later(i * 40, () => {
          t.sparks(x, y, "blood", 8, 60, 4, -Math.PI / 2, 0.5);
          t.sprite("bubble", "blood", x, y - 8, { scale: 0.35, fps: 16 });
          t.stain(x, y, 6, BLOOD[0], 0.5);
        });
      }
      t.sprite("cloud", "blood", c.x, c.y - 16, { scale: 2.2, fps: 9, alpha: 0.6, delay: 150 });
    },
  },

  // --- Ash
  ash_pyre: {
    sig: "pyre: a fireball lobbed high, a blast and a pyre of flames left burning with embers",
    windup: (c) => {
      c.t.gather(c.hx, c.hy, "fire", 16, 40, 20, 400);
      c.t.light(c.hx, c.hy, 80, "fire", 1, 450, c.follow);
    },
    land: (c) => {
      const { t } = c;
      // The ball comes down out of the sky onto the spot.
      t.lob(c.hx, c.hy, c.tx, c.ty, "orb", "fire", 2, 180);
      t.later(180, () => {
        t.boom(c.tx, c.ty - 14, c.radius, "fire");
        t.ring(c.tx, c.ty, c.radius, "fire");
        t.sparks(c.tx, c.ty, "fire", 30, 300, 20);
        t.scorch(c.tx, c.ty, t.px(c.radius) * 0.8);
        t.light(c.tx, c.ty, t.px(c.radius) * 2.6, "fire", 1.8, 600);
        t.shake(0.009, 220);
      });
    },
    zone: (c, ms) => {
      const { t } = c;
      const R = t.px(c.radius);
      for (let i = 0; i < 8; i++) {
        const a = i * 2.4;
        const r = Math.sqrt((i + 0.5) / 8) * R * 0.85;
        t.sprite("flames", "fire", c.tx + Math.cos(a) * r, c.ty + Math.sin(a) * r * 0.8, { scale: 1.1, fps: 12, loop: true, duration: ms, delay: i * 20 });
      }
      t.light(c.tx, c.ty, R * 2.2, "fire", 1.3, ms);
      for (let i = 0; i < Math.floor(ms / 120); i++) t.later(i * 120, () => t.rise(c.tx, c.ty, "fire", 2, R));
    },
  },
  ash_ignite: {
    sig: "ignite: a snap of the fingers, a ring of fire racing out, every poisoned body flaring",
    windup: (c) => c.t.sprite("sparks", "fire", c.hx, c.hy - 10, { scale: 0.7, fps: 30 }),
    release: (c) => {
      const { t } = c;
      t.ring(c.x, c.y, c.radius, "fire", { fps: 30 });
      t.burst(c.x, c.y, "fire", 40, 380);
      // Flames flare up round the ring as the fire races out.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        t.sprite("explosion", "fire", c.x + Math.cos(a) * t.px(c.radius) * 0.7, c.y + Math.sin(a) * t.px(c.radius) * 0.55 - 10, { scale: 0.9, fps: 26, delay: 40 + i * 15 });
      }
      t.light(c.x, c.y, t.px(c.radius) * 2, "fire", 1.4, 350);
      t.flash(0xffa040, 60);
    },
  },
  ash_vent: {
    sig: "vent: heat pouring out of the body, a fire blast with a heat-wave ring, scorched circle",
    windup: (c) => c.t.rise(c.x, c.y, "fire", 12, 24, 1.5),
    release: (c) => {
      const { t } = c;
      t.boom(c.x, c.y - 10, c.radius, "fire");
      t.sprite("explosion", "fire", c.x, c.y - 20, { scale: 2.4, fps: 22 });
      t.sprite("pillar", "fire", c.x, c.y, { scale: 1.4, fps: 20 });
      t.ring(c.x, c.y, c.radius, "fire");
      t.ring(c.x, c.y, c.radius * 1.15, "wind", { delay: 80, alpha: 0.5 });
      t.scorch(c.x, c.y, t.px(c.radius) * 0.6);
      t.rise(c.x, c.y, "fire", 20, t.px(c.radius) * 0.8);
      t.light(c.x, c.y, t.px(c.radius) * 2.2, "fire", 1.6, 500);
      t.shake(0.01, 220);
    },
  },

  // --- Storm
  storm_bolt: {
    sig: "storm bolt: static gathering in the hand, a lightning bolt along the line, a crackling strike point",
    windup: (c) => {
      c.t.sprite("crackle", "lightning", c.hx, c.hy, { scale: 1, fps: 18 });
      c.t.light(c.hx, c.hy, 70, "lightning", 1, 220);
    },
    release: (c) => {
      const { t } = c;
      t.lightning(c.hx, c.hy, c.tx, c.ty - 20, 280, Math.max(1, c.width));
      t.lightning(c.hx, c.hy, c.tx, c.ty - 20, 180, 1);
      t.ring(c.tx, c.ty, 0.5, "lightning");
      t.sprite("crackle", "lightning", c.tx, c.ty - 20, { scale: 1.6, fps: 16 });
      t.scorch(c.tx, c.ty, 10);
      t.light((c.x + c.tx) / 2, (c.y + c.ty) / 2, t.px(c.length) * 0.7, "lightning", 1.4, 260, undefined, true);
      t.flash(0xc8d0ff, 80);
      t.shake(0.006, 140);
    },
  },
  storm_ward: {
    sig: "storm ward: a crackling blue dome, arcs jumping over it, a static ring on the ground",
    release: (c) => {
      const { t } = c;
      t.sprite("bubble", "lightning", c.x, c.y - 34, { scale: 1.6, fps: 12, loop: true, duration: 1400, alpha: 0.8, follow: c.follow, dy: -34 });
      for (let i = 0; i < 4; i++) t.later(i * 110, () => t.lightning(c.x - 30, c.y - 60 + i * 8, c.x + 30, c.y - 10 - i * 6, 120));
      t.ring(c.x, c.y, 1, "lightning");
      t.streaks(c.x, c.y - 6, Math.PI, 30, 2, 0.4, "lightning", { delay: 100 });
    },
  },
  storm_tempest: {
    sig: "tempest: hands to the sky, a seal on the spot, bolts falling one after another",
    windup: (c) => {
      c.t.lightning(c.hx, c.hy - 20, c.hx + (Math.random() - 0.5) * 30, c.hy - 200, 300);
      c.t.light(c.x, c.y - 40, 120, "lightning", 1, 500);
    },
    land: (c) => {
      const { t } = c;
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * t.px(c.radius);
        const x = c.tx + Math.cos(a) * r;
        const y = c.ty + Math.sin(a) * r * 0.8;
        t.later(i * 70, () => {
          t.lightning(x + (Math.random() - 0.5) * 40, y - 280, x, y, 180, 2);
          t.sparks(x, y, "lightning", 8, 160, 4);
          t.scorch(x, y, 8);
          t.light(x, y, 180, "lightning", 1.2, 180, undefined, true);
        });
      }
      t.ring(c.tx, c.ty, c.radius, "lightning");
      t.flash(0xc8d0ff, 110);
      t.shake(0.008, 300);
    },
    zone: (c, ms) => {
      const { t } = c;
      t.sigil(c.tx, c.ty, c.radius, "lightning", { loop: true, duration: ms, alpha: 0.8 });
      const n = Math.floor(ms / 330);
      for (let i = 0; i < n; i++)
        t.later(i * 330, () => {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * t.px(c.radius);
          t.lightning(c.tx + Math.cos(a) * r, c.ty + Math.sin(a) * r - 220, c.tx + Math.cos(a) * r, c.ty + Math.sin(a) * r, 140);
        });
      t.light(c.tx, c.ty, t.px(c.radius) * 1.8, "lightning", 0.8, ms);
    },
  },

  // --- Graves
  graves_raise: {
    sig: "raise: knelt to the grave, a turning death seal, clawing hands, spirits rising in a teal column",
    windup: (c) => {
      c.t.sigil(c.x, c.y, 1.2, "spirit", { fps: 12, loop: true, duration: 500 });
      c.t.gather(c.x, c.y, "spirit", 20, 70, 4, 500);
    },
    release: (c) => {
      const { t } = c;
      for (const dx of [-40, 0, 40]) t.sprite("hands", "spirit", c.x + dx, c.y + 10 - Math.abs(dx) / 4, { scale: 1.4, fps: 14 });
      t.ring(c.x, c.y, 1.6, "spirit");
      t.sprite("pillar", "spirit", c.x, c.y, { scale: 1.3, fps: 16 });
      t.rise(c.x, c.y, "spirit", 30, 70);
      t.light(c.x, c.y, 220, "spirit", 1.3, 700);
    },
  },
  graves_curse: {
    sig: "curse: a black hand thrown out, a spirit seal on the spot, shadow hands dragging down",
    windup: (c) => c.t.sprite("cloud", "shadow", c.hx, c.hy, { scale: 0.6, fps: 12, add: false, alpha: 0.7 }),
    land: (c) => {
      const { t } = c;
      t.sigil(c.tx, c.ty, c.radius, "spirit", { loop: true, duration: 900 });
      t.sprite("hands", "shadow", c.tx, c.ty + 8, { scale: 1.4, fps: 14, add: false });
      t.sprite("cloud", "poison", c.tx, c.ty - 10, { scale: 1.6, fps: 9, alpha: 0.6 });
      t.stain(c.tx, c.ty, t.px(c.radius) * 0.4, 0x1a1420, 0.4);
    },
  },
  graves_feast: {
    sig: "feast: a spirit maw sweeping the cone, souls torn out and flowing back into the caster",
    windup: (c) => c.t.orbit(c.follow, "spirit", 5, 26, 380, 20),
    release: (c) => {
      const { t } = c;
      t.smear(c.x, c.y - 16, c.range, c.arc, c.aim, "spirit");
      t.smear(c.x, c.y - 16, c.range * 0.7, c.arc, c.aim, "spirit", { flipY: true, delay: 80, alpha: 0.8 });
      t.sprite("hands", "spirit", c.tx, c.ty + 6, { scale: 1.6, fps: 16 });
      // Souls torn out along the cone, streaming back to the caster.
      for (let i = 0; i < 5; i++) {
        const a = c.aim + ((i / 4 - 0.5) * c.arc * Math.PI) / 180;
        const r = t.px(c.range) * 0.85;
        t.beam(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r - 20, c.x, c.y - 26, "spirit", 4, 360, 140 + i * 30);
      }
      t.later(160, () => t.gather(c.x, c.y - 24, "spirit", 30, t.px(c.range) * 0.7, 24, 380));
      t.later(520, () => t.sprite("pillar", "spirit", c.x, c.y, { scale: 0.8, fps: 20 }));
    },
  },

  // --- Dusk
  dusk_mark: {
    sig: "mark: a gold-feathered arrow, a hunter's sigil flaring over the struck",
    windup: (c) => c.t.gather(c.hx, c.hy, "dusk", 10, 36, 20, 250),
    bolt: {
      anim: "arrow/dusk",
      scale: 1.8,
      trail: "dusk",
      every: 30,
      tail: (c, x, y) => c.t.sprite("streak", "dusk", x, y - 22, { rot: c.aim + Math.PI, scaleX: 0.4, scaleY: 0.35, fps: 30, alpha: 0.8 }),
      impact: (c, x, y) => {
        c.t.sprite("sigil", "dusk", x, y - 60, { scale: 0.7, fps: 16 });
        c.t.sparks(x, y - 22, "dusk", 10, 150, 22);
      },
    },
  },
  dusk_snare: {
    sig: "snare: a hunter's wire trap snapping shut, golden threads, a slowing net",
    windup: (c) => c.t.sparks(c.x, c.y, "dusk", 4, 30, 2),
    land: (c) => {
      const { t } = c;
      const R = t.px(c.radius);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        t.beam(c.tx + Math.cos(a) * R, c.ty + Math.sin(a) * R * 0.8, c.tx, c.ty, "dusk", 2, 360, i * 25);
      }
      t.ring(c.tx, c.ty, c.radius, "dusk", { delay: 120 });
      t.sprite("vines", "nature", c.tx, c.ty, { scale: 1.2, fps: 14, add: false, delay: 140 });
    },
    zone: (c, ms) => c.t.sigil(c.tx, c.ty, c.radius, "dusk", { loop: true, duration: ms, alpha: 0.6 }),
  },
  dusk_fade: {
    sig: "fade: gone in a puff of dusk-gold smoke, motes where you were",
    release: (c) => {
      const { t } = c;
      t.sprite("cloud", "shadow", c.x, c.y - 20, { scale: 1.8, fps: 12, loop: true, duration: 700, add: false, alpha: 0.85 });
      t.rise(c.x, c.y, "dusk", 16, 30);
      t.burst(c.x, c.y - 10, "dusk", 14, 120);
    },
  },

  // --- Sting
  sting_smoke: {
    sig: "smoke bomb: a pellet smashed at the feet, a wall of grey smoke, sparks inside it",
    release: (c) => {
      const { t } = c;
      t.sparks(c.x, c.y, "gold", 8, 120, 2);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const r = t.px(c.radius) * (i % 3 === 0 ? 0.2 : 0.6);
        t.sprite("cloud", "shadow", c.x + Math.cos(a) * r, c.y + Math.sin(a) * r - 8, { scale: 1.6, fps: 10, loop: true, duration: 1600, add: false, alpha: 0.85, delay: i * 30 });
      }
    },
    zone: (c, ms) => {
      for (let i = 0; i < 5; i++) {
        const a = i * 2.4;
        const r = c.t.px(c.radius) * 0.5;
        c.t.sprite("cloud", "shadow", c.tx + Math.cos(a) * r, c.ty + Math.sin(a) * r - 6, { scale: 1.4, fps: 8, loop: true, duration: ms, add: false, alpha: 0.6 });
      }
    },
  },
  sting_boil: {
    sig: "venom boil: green bubbles bursting on every body, poison splashes, a sickly ring",
    windup: (c) => c.t.sprite("cloud", "poison", c.hx, c.hy, { scale: 0.5, fps: 14, alpha: 0.6 }),
    release: (c) => {
      const { t } = c;
      t.ring(c.x, c.y, c.radius, "poison");
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * t.px(c.radius);
        t.later(i * 35, () => {
          t.sprite("explosion", "poison", c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.8 - 8, { scale: 0.8, fps: 24 });
          t.sprite("bubble", "nature", c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.8 - 14, { scale: 0.4, fps: 16 });
        });
      }
      t.stain(c.x, c.y, t.px(c.radius) * 0.5, 0x1e2a10, 0.4);
    },
  },
  sting_antidote: {
    sig: "antidote: a vial drunk, green motes rising off the body, a clean white flash",
    release: (c) => {
      const { t } = c;
      t.sprite("pillar", "poison", c.x, c.y, { scale: 0.9, fps: 18 });
      t.rise(c.x, c.y, "poison", 20, 20, 1.6);
      t.light(c.x, c.y - 30, 120, "poison", 1, 400, c.follow, true);
      t.sparks(c.hx, c.hy - 10, "wind", 6, 60, 30);
    },
  },
};
