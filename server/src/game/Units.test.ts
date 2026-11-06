import { describe, expect, it } from "vitest";
import { BALANCE, GREYED, SIM_DT, type PathId } from "@broken-ash/shared";
import { dealDamage } from "./Combat.js";
import type { UnitSim } from "./fighters.js";
import { makeUnit } from "./Units.js";
import { World } from "./World.js";

/** A world past its intro, no waves: just the players and the enemies placed by a test. */
function arena(paths: PathId[]) {
  const w = new World();
  const ps = paths.map((path, i) => w.addPlayer(`p${i}`, { name: `P${i}`, path }));
  for (const p of ps) w.voteSkip(p.id);
  // Units only act in a fight; a fight with living enemies doesn't send the next wave.
  w.encounter = true;
  w.waves = false;
  w.phase = "fight";
  return { w, ps };
}

function run(w: World, seconds: number) {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) w.step(SIM_DT);
}

function place(w: World, kind: keyof typeof GREYED, x: number, y: number): UnitSim {
  const u = makeUnit(GREYED[kind], x, y);
  w.units.set(u.id, u);
  return u;
}

describe("enemy behaviours", () => {
  it("a crossbowman shoots a bolt down the telegraphed line, and backs off when you close in", () => {
    const { w, ps } = arena(["thorn"]);
    const p = ps[0];
    const u = place(w, "crossbow", p.body.x + 7, p.body.y);
    let bolts = 0;
    for (let i = 0; i < Math.round(2 / SIM_DT); i++) {
      w.step(SIM_DT);
      bolts += w.drainFx().filter((e) => e.t === "bolt").length;
    }
    expect(bolts).toBeGreaterThan(0);
    // Too close now: it retreats instead of standing there.
    u.x = p.body.x + 2;
    u.y = p.body.y;
    u.cds = { shot: 99, kick: 99 };
    u.state = "idle";
    const before = Math.hypot(u.x - p.body.x, u.y - p.body.y);
    run(w, 0.5);
    expect(Math.hypot(u.x - p.body.x, u.y - p.body.y)).toBeGreaterThan(before);
  });

  it("a man-at-arms turns blows to his shield but not to his back", () => {
    const { w, ps } = arena(["thorn"]);
    const p = ps[0];
    const front = place(w, "manatarms", p.body.x + 1.5, p.body.y);
    front.facing = Math.PI; // facing the player
    const hpF = front.hp;
    dealDamage(w, p, front, 50, 0);
    const back = place(w, "manatarms", p.body.x + 1.5, p.body.y + 3);
    back.facing = 0; // facing away from where the blow comes from (the player is to his west)
    back.x = p.body.x + 1.5;
    back.y = p.body.y;
    const hpB = back.hp;
    dealDamage(w, p, back, 50, 0);
    expect(hpF - front.hp).toBeLessThan((hpB - back.hp) * 0.5);
  });

  it("the drowned hold their victim until the partner strikes them", () => {
    const { w, ps } = arena(["thorn", "blood"]);
    const [a, b] = ps;
    // On the far side of A from B, so A is the one it reaches for.
    const u = place(w, "drowned", a.body.x - 1.2, a.body.y);
    u.cds = { claw: 99 };
    run(w, 1.2);
    expect(a.statuses.has("rooted")).toBe(true);
    expect(u.grabbed).toBe(a.id);
    // The held player's own blows don't free them; the partner's do.
    dealDamage(w, a, u, 5, 0);
    expect(a.statuses.has("rooted")).toBe(true);
    dealDamage(w, b, u, 5, 0);
    expect(a.statuses.has("rooted")).toBe(false);
  });

  it("a corpse-eater eats the dead when no one is near, healing and growing", () => {
    const { w, ps } = arena(["thorn"]);
    const p = ps[0];
    // On the open plaza (the pond to the south-east would trap them).
    const victim = place(w, "shambler", p.body.x - 3, p.body.y - 4);
    dealDamage(w, undefined, victim, 1e4, 0);
    expect(w.corpses.length).toBe(1);
    const eater = place(w, "eater", p.body.x - 5, p.body.y - 4);
    eater.hp = 40;
    const maxBefore = eater.hpMax;
    let eaten = false;
    for (let i = 0; i < Math.round(4 / SIM_DT) && !eaten; i++) {
      // Keep the player out of its way so it prefers the body.
      p.body.x = 2;
      p.body.y = 2;
      w.step(SIM_DT);
      eaten = w.drainFx().some((e) => e.t === "eaten");
    }
    expect(eaten).toBe(true);
    expect(w.corpses.length).toBe(0);
    expect(eater.hpMax).toBeGreaterThan(maxBefore);
    expect(eater.hp).toBeGreaterThan(40);
  });

  it("the Tapper drinks at 60 % (a stagger breaks it) and rages at 30 %", () => {
    const { w, ps } = arena(["bark"]);
    const p = ps[0];
    const t = place(w, "tapper", p.body.x + 6, p.body.y);
    dealDamage(w, undefined, t, t.hpMax * 0.41, 0);
    run(w, SIM_DT);
    expect(w.drainFx().some((e) => e.t === "phase")).toBe(true);
    expect(t.channel).toBeGreaterThan(0);
    const hp = t.hp;
    run(w, 1);
    expect(t.hp).toBeGreaterThan(hp);
    // A stagger stops the drinking.
    dealDamage(w, p, t, 1, 1e4);
    run(w, SIM_DT);
    expect(t.channel).toBe(0);
    t.staggerT = 0;
    dealDamage(w, undefined, t, t.hp - t.hpMax * 0.29, 0);
    run(w, SIM_DT);
    expect(t.rage).toBe(GREYED.tapper.phases![1].rage);
    expect(BALANCE.combat.bossChannel).toBeGreaterThan(0);
  });
});
