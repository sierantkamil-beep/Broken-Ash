import type { BoltLook } from "./types";
import type { Tools } from "./tools";

/** An enemy's blow landing: where it stands and where it struck (screen px), and the attack's size. */
export interface Blow {
  t: Tools;
  id: string;
  x: number;
  y: number;
  aim: number;
  /** The aimed spot (slams thrown at a point). */
  ax: number;
  ay: number;
  range: number;
  arc: number;
  length: number;
  width: number;
  radius: number;
}

export interface EnemyRecipe {
  sig: string;
  blow?(b: Blow): void;
  bolt?: BoltLook;
}

const tip = (b: Blow, cells: number) => ({ x: b.x + Math.cos(b.aim) * b.t.px(cells), y: b.y + Math.sin(b.aim) * b.t.px(cells) });
const ROT = [0x2a1e14, 0x4a3a24, 0x3a3428];

/**
 * Every enemy attack, by `<kind>_<attack>` (shared/src/data/greyed.ts): the Greyed tear and smash
 * with filth and old blood; the miners with picks and stone; the drowned with sap; the Iron March
 * with steel, bolts and shields; the Tapper with his cleaver and his pump.
 */
export const ENEMY: Record<string, EnemyRecipe> = {
  shambler_claw: {
    sig: "shambler claw: three dirty parallel rakes, grime flecks",
    blow: (b) => {
      for (let i = -1; i <= 1; i++) b.t.smear(b.x + i * 4, b.y - 20 + i * 5, b.range * 0.8, 60, b.aim + i * 0.12, "blood", { fps: 30, alpha: 0.75, delay: (i + 1) * 30 });
      const p = tip(b, b.range * 0.7);
      b.t.flakes(p.x, p.y, 10, 5, ROT, false);
    },
  },
  runner_pounce: {
    sig: "runner pounce: a dark lunge streak, a claw slash where it lands, kicked dust",
    blow: (b) => {
      b.t.sprite("streak", "shadow", b.x, b.y - 18, { rot: b.aim, scaleX: b.t.px(b.length) / 192, scaleY: 0.8, fps: 24, add: false, alpha: 0.6 });
      const p = tip(b, b.length);
      b.t.smear(p.x, p.y - 20, 0.8, 120, b.aim, "blood", { fps: 30, delay: 60 });
      b.t.dust(b.x, b.y, 24, 8);
    },
  },
  bloated_slam: {
    sig: "bloated slam: belly flop shockwave, poison splash ring, green puddle",
    blow: (b) => {
      b.t.ring(b.x, b.y, b.radius, "poison");
      b.t.sprite("cloud", "poison", b.x, b.y - 10, { scale: 1.6, fps: 12, alpha: 0.7 });
      b.t.sparks(b.x, b.y, "poison", 16, 160, 6);
      b.t.stain(b.x, b.y, b.t.px(b.radius) * 0.5, 0x2a3a12, 0.45);
      b.t.dust(b.x, b.y, b.t.px(b.radius), 14);
      b.t.shake(0.006, 160);
    },
  },
  tapper_chop: {
    sig: "tapper chop: a huge rusty cleaver arc, a spray of sap and blood, cleaver bites the ground",
    blow: (b) => {
      b.t.smear(b.x, b.y - 26, b.range, b.arc, b.aim, "blood", { fps: 26 });
      b.t.smear(b.x, b.y - 26, b.range * 0.85, b.arc * 0.8, b.aim, "dusk", { fps: 26, delay: 40, alpha: 0.7 });
      const p = tip(b, b.range * 0.8);
      b.t.crack(p.x - Math.cos(b.aim) * 20, p.y - Math.sin(b.aim) * 20, p.x + Math.cos(b.aim) * 30, p.y + Math.sin(b.aim) * 30, 80);
      b.t.sparks(p.x, p.y - 10, "dusk", 12, 180, 10, b.aim, 1.2);
      b.t.shake(0.008, 160);
    },
  },
  tapper_sweep: {
    sig: "tapper sweep: the hoses lash round in a wide arc spitting sap, sap pools",
    blow: (b) => {
      b.t.smear(b.x, b.y - 20, b.range, b.arc, b.aim, "dusk", { fps: 22 });
      for (let i = 0; i < 6; i++) {
        const a = b.aim + ((i / 5 - 0.5) * b.arc * Math.PI) / 180;
        const p = { x: b.x + Math.cos(a) * b.t.px(b.range) * 0.8, y: b.y + Math.sin(a) * b.t.px(b.range) * 0.7 };
        b.t.later(i * 30, () => {
          b.t.sparks(p.x, p.y, "dusk", 5, 110, 14);
          b.t.stain(p.x, p.y, 8, 0x8a4a08, 0.6);
        });
      }
      b.t.shake(0.007, 200);
    },
  },
  tapper_slam: {
    sig: "tapper slam: the pump hammered down, a sap geyser, a shockwave and long cracks",
    blow: (b) => {
      b.t.ring(b.ax, b.ay, b.radius, "dusk");
      b.t.ring(b.ax, b.ay, b.radius * 0.6, "blood", { delay: 80 });
      b.t.sprite("pillar", "dusk", b.ax, b.ay, { scale: 1.6, fps: 20 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.t.crack(b.ax, b.ay, b.ax + Math.cos(a) * b.t.px(b.radius), b.ay + Math.sin(a) * b.t.px(b.radius) * 0.8, 160);
      }
      b.t.dust(b.ax, b.ay, b.t.px(b.radius), 30);
      b.t.stain(b.ax, b.ay, b.t.px(b.radius) * 0.4, 0x8a4a08, 0.5);
      b.t.shake(0.016, 300);
    },
  },
  miner_pick: {
    sig: "miner pick: an overhead pick strike, stone chips and sparks from the point",
    blow: (b) => {
      const p = tip(b, b.length * 0.85);
      b.t.smear(b.x, b.y - 34, b.length * 0.9, 50, b.aim, "steel", { fps: 28 });
      b.t.later(60, () => {
        b.t.sparks(p.x, p.y, "gold", 10, 160, 4);
        b.t.dust(p.x, p.y, 20, 10, 0x6a625a);
        b.t.scars?.crack(p.x - 10, p.y, p.x + 10, p.y + 4, false);
      });
    },
  },
  miner_quake: {
    sig: "miner quake: the pick driven into rock, a ring of stone shards bursting up",
    blow: (b) => {
      b.t.ring(b.x, b.y, b.radius, "steel");
      b.t.dust(b.x, b.y, b.t.px(b.radius), 26, 0x6a625a);
      b.t.burst(b.x, b.y, "gold", 14, 160);
      b.t.shake(0.008, 200);
    },
  },
  drowned_grab: {
    sig: "drowned grab: sap tendrils lashing out and coiling round the caught",
    blow: (b) => {
      const p = tip(b, b.length);
      b.t.beam(b.x, b.y - 24, p.x, p.y - 20, "dusk", 4, 380);
      b.t.beam(b.x, b.y - 18, p.x, p.y - 12, "dusk", 3, 380, 60);
      b.t.later(140, () => b.t.sprite("vines", "nature", p.x, p.y, { scale: 1.2, fps: 14, add: false }));
      b.t.stain(p.x, p.y, 6, 0x8a4a08, 0.6);
    },
  },
  drowned_claw: {
    sig: "drowned claw: a dripping amber swipe, sap droplets falling",
    blow: (b) => {
      b.t.smear(b.x, b.y - 20, b.range, b.arc, b.aim, "dusk", { fps: 28, alpha: 0.85 });
      const p = tip(b, b.range * 0.7);
      b.t.flakes(p.x, p.y, 12, 6, [0x8a4a08, 0xc87818], true);
    },
  },
  eater_bite: {
    sig: "eater bite: two snapping jaw arcs closing, a blood burst",
    blow: (b) => {
      const p = tip(b, b.range * 0.8);
      b.t.smear(p.x, p.y - 24, 0.5, 120, b.aim - Math.PI / 2, "blood", { fps: 32 });
      b.t.smear(p.x, p.y - 16, 0.5, 120, b.aim + Math.PI / 2, "blood", { fps: 32, flipY: true });
      b.t.sparks(p.x, p.y - 20, "blood", 8, 120, 20);
    },
  },
  eater_leap: {
    sig: "eater leap: a long low shadow leap, landing claws, scattered bones of light",
    blow: (b) => {
      b.t.sprite("streak", "shadow", b.x, b.y - 10, { rot: b.aim, scaleX: b.t.px(b.length) / 192, scaleY: 0.6, fps: 26, add: false, alpha: 0.7 });
      const p = tip(b, b.length);
      b.t.later(120, () => {
        b.t.smear(p.x, p.y - 14, 0.9, 160, b.aim, "shadow", { fps: 28, add: false });
        b.t.dust(p.x, p.y, 30, 10);
      });
    },
  },
  crossbow_shot: {
    sig: "crossbow: a string twang with muzzle dust, a heavy quarrel, a splintering impact",
    bolt: {
      anim: "arrow/steel",
      scale: 1.2,
      trail: "steel",
      launch: (c, x, y) => {
        c.t.dust(x, y + 20, 14, 5);
        c.t.streaks(x, y, c.aim, 40, 2, 0.3, "steel");
      },
      impact: (c, x, y) => {
        c.t.sparks(x, y - 20, "gold", 8, 140, 20);
        c.t.flakes(x, y, 10, 4, [0x6a4e34, 0x4a3424], false);
      },
    },
  },
  crossbow_kick: {
    sig: "crossbow kick: a short boot shove, a dust puff and a stagger ring",
    blow: (b) => {
      const p = tip(b, b.range * 0.7);
      b.t.ring(p.x, p.y, 0.4, "wind");
      b.t.dust(p.x, p.y, 16, 6);
    },
  },
  manatarms_cut: {
    sig: "man-at-arms cut: a clean arming-sword arc, a steel glint",
    blow: (b) => {
      b.t.smear(b.x, b.y - 22, b.range, b.arc, b.aim, "steel", { fps: 28 });
      const p = tip(b, b.range);
      b.t.sprite("sparks", "steel", p.x, p.y - 22, { scale: 0.6, fps: 28 });
    },
  },
  manatarms_thrust: {
    sig: "man-at-arms thrust: a lunging spike of steel along the line, blood from its point",
    blow: (b) => {
      b.t.sprite("streak", "steel", b.x, b.y - 22, { rot: b.aim, scaleX: b.t.px(b.length) / 192, scaleY: 0.55, fps: 28 });
      const p = tip(b, b.length);
      b.t.sparks(p.x, p.y - 22, "blood", 6, 120, 20, b.aim, 0.6);
    },
  },
  manatarms_bash: {
    sig: "shield bash: a wide flat shove, a dull ring, stagger stars",
    blow: (b) => {
      const p = tip(b, b.range * 0.6);
      b.t.smear(b.x, b.y - 20, b.range * 0.7, b.arc, b.aim, "wind", { fps: 26, alpha: 0.7 });
      b.t.ring(p.x, p.y, 0.6, "steel");
      b.t.sprite("stars", "gold", p.x, p.y - 50, { scale: 0.8, fps: 14 });
      b.t.shake(0.005, 120);
    },
  },
};
