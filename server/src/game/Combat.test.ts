import { describe, expect, it } from "vitest";
import { BALANCE, GREYED, PATH_IDS, PATHS, SIM_DT, type InputFrame, type PathId } from "@broken-ash/shared";
import { addStatus, canCast, dealDamage } from "./Combat.js";
import type { PlayerSim, UnitSim } from "./fighters.js";
import { makeUnit } from "./Units.js";
import { World } from "./World.js";

/** A world past its intro, with no waves unless asked for. */
function arena(paths: PathId[], encounter = false) {
  const w = new World();
  w.encounter = encounter;
  const ps = paths.map((path, i) => w.addPlayer(`p${i}`, { name: `P${i}`, path }));
  for (const p of ps) w.voteSkip(p.id);
  return { w, ps };
}

let seq = 1;
function send(w: World, p: PlayerSim, f: Partial<InputFrame> = {}) {
  w.queueInputs(p.id, [{ seq: seq++, mx: 0, my: 0, dodge: false, ...f }]);
}

function run(w: World, seconds: number, each?: () => void) {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    each?.();
    w.step(SIM_DT);
  }
}

/** A target dummy that never fights back. */
function dummy(w: World, x: number, y: number, hp = 1e6): UnitSim {
  const u = makeUnit({ ...GREYED.shambler, hp, poise: 1e9, attacks: [] }, x, y);
  w.units.set(u.id, u);
  return u;
}

describe("skills", () => {
  it.each(PATH_IDS)("every %s skill can be cast and lands", (path) => {
    for (let slot = 0; slot < 6; slot++) {
      const { w, ps } = arena([path, "thorn"]);
      const p = ps[0];
      p.res = p.path.resource.heat ? 0 : p.path.resource.max;
      p.body.x = 10.5;
      p.body.y = 14.5;
      const d = dummy(w, 12.3, 14.5);
      const aim = Math.atan2(d.y - p.body.y, d.x - p.body.x);
      expect(canCast(p, slot), `${path} slot ${slot}`).toBe(true);
      send(w, p, { cast: slot, aim, aimDist: 1.8 });
      run(w, 0.05);
      const skill = p.path.skills[slot];
      expect(p.cds[slot], `${skill.id} went on cooldown`).toBeGreaterThan(0);
      run(w, 1.5);
      const damaging = skill.effects.some((e) => e.kind === "damage") || skill.effects.some((e) => e.kind === "zone" && e.dps > 0);
      if (damaging) expect(d.hp, `${skill.id} hit the dummy`).toBeLessThan(d.hpMax);
    }
  });

  it("has six skills per path, unique ids, readable Polish names", () => {
    const ids = new Set<string>();
    for (const path of Object.values(PATHS)) {
      expect(path.skills).toHaveLength(6);
      for (const s of path.skills) {
        expect(ids.has(s.id)).toBe(false);
        ids.add(s.id);
        expect(s.name.length).toBeGreaterThan(2);
        expect(s.description.length).toBeGreaterThan(10);
      }
    }
  });

  it("spends the path's own resource and refuses when it's short", () => {
    const { ps } = arena(["thorn"]);
    const p = ps[0];
    p.res = 10;
    expect(canCast(p, 1)).toBe(false); // costs Fury
    expect(canCast(p, 0)).toBe(true); // the basic attack is free
  });
});

describe("statuses and combos", () => {
  it("bleeds over time and heals the Thorn who caused it", () => {
    const { w, ps } = arena(["thorn"]);
    const p = ps[0];
    p.hp = 100;
    const d = dummy(w, 20, 20);
    addStatus(d, "bleed", 4, 6, p.id);
    run(w, 2);
    expect(d.hp).toBeLessThan(d.hpMax - 5);
    expect(p.hp).toBeGreaterThan(100);
  });

  it("detonates the partner's bleed (Thorn's Harvest on Blood's bleeding)", () => {
    const { w, ps } = arena(["thorn", "blood"]);
    const [thorn] = ps;
    thorn.res = 100;
    thorn.body.x = 10.5;
    thorn.body.y = 14.5;
    const d = dummy(w, 11.8, 14.5);
    addStatus(d, "bleed", 6, 8, ps[1].id);
    send(w, thorn, { cast: 3, aim: 0 });
    run(w, 0.6);
    expect(d.statuses.has("bleed")).toBe(false);
    expect(d.hpMax - d.hp).toBeGreaterThan(60);
  });

  it("absorbs damage with shields and boosts damage on cursed targets", () => {
    const { w, ps } = arena(["bark"]);
    const p = ps[0];
    addStatus(p, "shield", 5, 30, p.id);
    const d = dummy(w, 20, 20);
    dealDamage(w, d, p, 20, 0);
    expect(p.hp).toBe(p.hpMax);
    const t = dummy(w, 22, 22);
    dealDamage(w, p, t, 100, 0);
    const plain = t.hpMax - t.hp;
    addStatus(t, "weaken", 5, 1, p.id);
    const before = t.hp;
    dealDamage(w, p, t, 100, 0);
    expect(before - t.hp).toBeCloseTo(plain * (1 + BALANCE.combat.weakenBonus), 5);
  });

  it("overheats the Path of Ash", () => {
    const { w, ps } = arena(["ash"]);
    const p = ps[0];
    p.res = 95;
    send(w, p, { cast: 1, aim: 0 });
    run(w, 0.5);
    expect(p.silenceT).toBeGreaterThan(0);
    expect(canCast(p, 0)).toBe(false);
  });
});

describe("the Greyed", () => {
  it("telegraph, then hit — and a well-timed roll avoids it", () => {
    const { w, ps } = arena(["thorn"], false);
    const p = ps[0];
    p.body.x = 14.5;
    p.body.y = 10.5;
    const u = makeUnit(GREYED.shambler, 14.5, 9.4);
    w.units.set(u.id, u);
    w.encounter = true;
    w.phase = "fight";
    run(w, 0.1);
    expect(u.state).toBe("windup");
    run(w, 1);
    expect(p.hp).toBeLessThan(p.hpMax);

    const hp = p.hp;
    u.cds = {};
    u.state = "idle";
    run(w, 0.1);
    expect(u.state).toBe("windup");
    run(w, u.t - 0.1);
    send(w, p, { dodge: true, mx: 0, my: 1 });
    run(w, 0.3);
    expect(p.hp).toBe(hp);
  });

  it("staggers under heavy hits and can be executed, healing both players", () => {
    const { w, ps } = arena(["bark", "blood"]);
    const [bark, blood] = ps;
    bark.hp = 100;
    blood.hp = 60;
    const u = makeUnit(GREYED.shambler, bark.body.x + 1, bark.body.y);
    w.units.set(u.id, u);
    dealDamage(w, bark, u, 10, 999);
    expect(u.staggerT).toBeGreaterThan(0);
    send(w, bark, { act: true });
    run(w, 0.05);
    expect(w.units.has(u.id)).toBe(false);
    expect(bark.hp).toBeGreaterThan(100);
    expect(blood.hp).toBeGreaterThan(60);
  });

  it("the Bloated burst into poison when they die", () => {
    const { w, ps } = arena(["thorn"]);
    const p = ps[0];
    const u = makeUnit(GREYED.bloated, p.body.x + 1, p.body.y);
    w.units.set(u.id, u);
    dealDamage(w, p, u, 1000, 0);
    expect(p.statuses.has("poison")).toBe(true);
  });
});

describe("going down", () => {
  it("downs instead of dying, and the partner revives with F", () => {
    const { w, ps } = arena(["thorn", "blood"]);
    const [a, b] = ps;
    dealDamage(w, undefined, a, 9999, 0);
    expect(a.downed).toBe(true);
    b.body.x = a.body.x + 0.8;
    b.body.y = a.body.y;
    run(w, BALANCE.combat.reviveTime + 0.2, () => send(w, b, { act: true }));
    expect(a.downed).toBe(false);
    expect(a.hp).toBeCloseTo(a.hpMax * BALANCE.combat.reviveHealth, 0);
  });

  it("gets everyone back up at the spawn when both fall", () => {
    const { w, ps } = arena(["thorn", "blood"], true);
    for (const p of ps) dealDamage(w, undefined, p, 9999, 0);
    run(w, BALANCE.combat.wipeDelay + 0.1);
    for (const p of ps) {
      expect(p.downed).toBe(false);
      expect(p.hp).toBe(p.hpMax);
    }
  });
});

describe("the gate assault", () => {
  it("breaks the gate, sends waves, and the Tapper comes last", () => {
    const { w } = arena(["thorn", "blood"], true);
    run(w, BALANCE.combat.waveDelay + 4);
    expect(w.phase).toBe("fight");
    expect(w.wave).toBe(0);
    expect(w.units.size).toBe(5);
    // Clear every wave by fiat.
    for (let wave = 0; wave < 4; wave++) {
      run(w, 3);
      for (const u of [...w.units.values()]) dealDamage(w, undefined, u, 1e6, 0);
      run(w, BALANCE.combat.waveDelay + 4);
      if (wave === 2) expect([...w.units.values()].some((u) => u.kind === "tapper")).toBe(true);
    }
  });
});
