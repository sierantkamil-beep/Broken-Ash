import { describe, expect, it } from "vitest";
import { GREYED, PATH_IDS, PATHS, SIM_DT, WEAPON_IDS, WEAPONS, screenDirToWorld, type InputFrame, type PathId, type WeaponId } from "@broken-ash/shared";
import { canCast, unitAttackHits } from "./Combat.js";
import type { PlayerSim, UnitSim } from "./fighters.js";
import { makeUnit } from "./Units.js";
import { World } from "./World.js";

/**
 * Balance simulation: scripted players fight the real rules. Not a test of "fun", but it keeps the
 * eight paths in the same league and proves a pair can win the gate assault.
 */

let seq = 1;
const lastPos = new WeakMap<PlayerSim, { x: number; y: number }>();

/** How far a skill reaches (where the bot should stand to use it). */
function reachOf(s: PlayerSim["skills"][number]): number {
  const sh = s.shape;
  return sh.kind === "cone" ? sh.range : sh.kind === "line" ? sh.length : sh.kind === "projectile" ? sh.range : sh.kind === "circle" ? (sh.at === "aim" ? sh.reach ?? 6 : sh.radius) : 2;
}

/** A simple player brain: keep the right distance, use the strongest ready skill, roll out of telegraphs. */
function bot(w: World, p: PlayerSim) {
  if (p.downed) {
    w.queueInputs(p.id, [{ seq: seq++, mx: 0, my: 0, dodge: false }]);
    return;
  }
  const foes = [...w.units.values()].filter((u) => u.faction === "greyed" && !u.dead);
  const partner = [...w.players.values()].find((o) => o !== p);
  const f: InputFrame = { seq: seq++, mx: 0, my: 0, dodge: false };
  if (partner?.downed && Math.hypot(partner.body.x - p.body.x, partner.body.y - p.body.y) < 1.4) {
    f.act = true;
    w.queueInputs(p.id, [f]);
    return;
  }
  let target: UnitSim | undefined;
  let best = 1e9;
  for (const u of foes) {
    const d = Math.hypot(u.x - p.body.x, u.y - p.body.y);
    if (d < best) {
      best = d;
      target = u;
    }
  }
  const goal = partner?.downed ? { x: partner.body.x, y: partner.body.y } : target;
  if (goal) {
    const aim = Math.atan2(goal.y - p.body.y, goal.x - p.body.x);
    f.aim = aim;
    f.aimDist = best;
    const want = partner?.downed ? 0.6 : WEAPONS[p.weapon].range === "melee" ? 1.2 : Math.min(4.5, reachOf(p.skills[0]) - 0.8);
    const d = Math.hypot(goal.x - p.body.x, goal.y - p.body.y);
    // Move along the aim (converted to the nearest screen direction). Backing off into a wall turns
    // into a sidestep along it, as a player would, instead of standing pinned.
    const sign = d > want + 0.3 ? 1 : d < want - 0.8 ? -1 : 0;
    const last = lastPos.get(p);
    const stuck = sign < 0 && !!last && Math.hypot(p.body.x - last.x, p.body.y - last.y) < 0.02;
    lastPos.set(p, { x: p.body.x, y: p.body.y });
    if (sign) {
      const move = sign > 0 ? aim : stuck ? aim + Math.PI / 2 : aim + Math.PI;
      let bestDir = [0, 0];
      let bestDot = -2;
      for (const mx of [-1, 0, 1])
        for (const my of [-1, 0, 1]) {
          if (!mx && !my) continue;
          const v = screenDirToWorld(mx, my);
          const dot = v.x * Math.cos(move) + v.y * Math.sin(move);
          if (dot > bestDot) {
            bestDot = dot;
            bestDir = [mx, my];
          }
        }
      f.mx = bestDir[0];
      f.my = bestDir[1];
    }
    // Roll out of a telegraph that's about to land.
    const danger = foes.some((u) => u.state === "windup" && u.t < 0.3 && unitAttackHits(u, p));
    if (danger) {
      f.dodge = true;
      f.mx = -f.mx || 1;
    }
    if (target && !partner?.downed) {
      for (let slot = p.skills.length - 1; slot >= 0; slot--) {
        const s = p.skills[slot];
        const selfOnly = s.shape.kind === "self";
        if (selfOnly && p.hp > p.hpMax * 0.6) continue;
        if (canCast(p, slot) && (p.path.resource.heat ? p.res + s.cost < p.path.resource.max - 5 : true)) {
          f.cast = slot;
          break;
        }
      }
    }
  }
  w.queueInputs(p.id, [f]);
}

function setup(paths: PathId[], encounter: boolean, seed = 1, weapon?: WeaponId) {
  const w = new World(undefined, seed);
  w.encounter = encounter;
  const ps = paths.map((path, i) => w.addPlayer(`p${i}`, { name: `P${i}`, path, weapon }));
  for (const p of ps) w.voteSkip(p.id);
  return { w, ps };
}

/** Sustained damage per second against a dummy pack (three targets, so area skills count). */
function dps(path: PathId, seconds = 40, weapon?: WeaponId): number {
  const { w, ps } = setup([path], false, 1, weapon);
  const p = ps[0];
  p.body.x = 14.5;
  p.body.y = 15.5;
  const dummies: UnitSim[] = [];
  for (const [dx, dy] of [[0, -2], [0.8, -2.6], [-0.8, -2.6]]) {
    const u = makeUnit({ ...GREYED.shambler, hp: 1e7, poise: 1e9, attacks: [] }, 14.5 + dx, 15.5 + dy);
    w.units.set(u.id, u);
    dummies.push(u);
  }
  w.encounter = true;
  w.phase = "fight";
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    bot(w, p);
    w.step(SIM_DT);
    for (const d of dummies) {
      d.x = Math.min(Math.max(d.x, 10), 19);
    }
  }
  const total = dummies.reduce((s, d) => s + (d.hpMax - d.hp), 0);
  return total / seconds;
}

/** Damage from the weapon's own three skills only (the path's signature skills are left out). */
function weaponDps(weapon: WeaponId, host: PathId, seconds = 40): number {
  const { w, ps } = setup([host], false, 1, weapon);
  const p = ps[0];
  // Only the weapon's slots: the bot never presses keys 2–4.
  p.skills = p.skills.slice(0, 3);
  p.cds = p.cds.slice(0, 3);
  p.body.x = 14.5;
  p.body.y = 15.5;
  const dummies: UnitSim[] = [];
  for (const [dx, dy] of [[0, -2], [0.8, -2.6], [-0.8, -2.6]]) {
    const u = makeUnit({ ...GREYED.shambler, hp: 1e7, poise: 1e9, attacks: [] }, 14.5 + dx, 15.5 + dy);
    w.units.set(u.id, u);
    dummies.push(u);
  }
  w.encounter = true;
  w.phase = "fight";
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    bot(w, p);
    w.step(SIM_DT);
    for (const d of dummies) d.x = Math.min(Math.max(d.x, 10), 19);
  }
  return dummies.reduce((s, d) => s + (d.hpMax - d.hp), 0) / seconds;
}

describe("balance", () => {
  it("keeps every path's sustained damage within ±30% of the average", () => {
    const table = Object.fromEntries(PATH_IDS.map((id) => [id, Math.round(dps(id))]));
    const avg = Object.values(table).reduce((a, b) => a + b, 0) / PATH_IDS.length;
    console.log("dps", table, "avg", Math.round(avg));
    for (const [id, v] of Object.entries(table)) {
      expect(v, `${id} (${PATHS[id as PathId].name}) dps ${v} vs avg ${Math.round(avg)}`).toBeGreaterThan(avg * 0.7);
      expect(v, `${id} dps ${v} vs avg ${Math.round(avg)}`).toBeLessThan(avg * 1.3);
    }
  });

  it("keeps every weapon within ±30% of the average on a path that has no affinity for it", () => {
    // Bark's signature skills are the least damage-heavy; its own home weapons are skipped by
    // picking, for each weapon, a path that isn't home to it.
    const table = Object.fromEntries(
      WEAPON_IDS.map((id) => {
        const host = PATH_IDS.find((pid) => !PATHS[pid].homeWeapons.includes(id) && pid !== "graves")!;
        return [id, Math.round(weaponDps(id, host))];
      }),
    );
    const avg = Object.values(table).reduce((a, b) => a + b, 0) / WEAPON_IDS.length;
    console.log("weapon dps", table, "avg", Math.round(avg));
    for (const [id, v] of Object.entries(table)) {
      expect(v, `${id} (${WEAPONS[id as WeaponId].name}) dps ${v} vs avg ${Math.round(avg)}`).toBeGreaterThan(avg * 0.7);
      expect(v, `${id} dps ${v} vs avg ${Math.round(avg)}`).toBeLessThan(avg * 1.3);
    }
  });

  it.each([
    ["thorn", "blood"],
    ["bark", "ash"],
    ["storm", "graves"],
    ["dusk", "sting"],
  ] as [PathId, PathId][])("%s + %s survive the gate assault and kill the Tapper", (a, b) => {
    const { w, ps } = setup([a, b], true);
    let won = false;
    let wipes = 0;
    for (let i = 0; i < Math.round(420 / SIM_DT) && !won; i++) {
      for (const p of ps) bot(w, p);
      w.step(SIM_DT);
      for (const e of w.drainFx()) if (e.t === "victory") won = true;
      if (ps.every((p) => p.downed)) wipes++;
    }
    console.log(a, b, "won", won, "time", Math.round(w.time), "s");
    expect(won).toBe(true);
  });
});

/**
 * Tuning aid, off by default: `SEEDS=20 pnpm vitest run server/src/game/sim.test.ts -t "seed sweep"`
 * plays Thorn + Blood over many spawn layouts (seed 1 is what the test above uses).
 */
describe.skipIf(!process.env.SEEDS)("seed sweep", () => {
  it("thorn + blood over seeds", () => {
    const res: string[] = [];
    for (let seed = 1; seed <= Number(process.env.SEEDS); seed++) {
      const { w, ps } = setup(["thorn", "blood"], true, seed);
      let won = false;
      for (let i = 0; i < Math.round(420 / SIM_DT) && !won; i++) {
        for (const p of ps) bot(w, p);
        w.step(SIM_DT);
        for (const e of w.drainFx()) if (e.t === "victory") won = true;
      }
      res.push(`${seed}:${won ? Math.round(w.time) : "LOST w" + (w.wave + 1)}`);
    }
    console.log(res.join(" "));
  });
});
