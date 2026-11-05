import { describe, expect, it } from "vitest";
import { GREYED, PATH_IDS, PATHS, SIM_DT, screenDirToWorld, type InputFrame, type PathId } from "@broken-ash/shared";
import { canCast, unitAttackHits } from "./Combat.js";
import type { PlayerSim, UnitSim } from "./fighters.js";
import { makeUnit } from "./Units.js";
import { World } from "./World.js";

/**
 * Balance simulation: scripted players fight the real rules. Not a test of "fun", but it keeps the
 * eight paths in the same league and proves a pair can win the gate assault.
 */

let seq = 1;

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
    const want = partner?.downed ? 0.6 : p.path.type === "melee" ? 1.2 : 4.5;
    const d = Math.hypot(goal.x - p.body.x, goal.y - p.body.y);
    // Move along the aim (converted to the nearest screen direction).
    const sign = d > want + 0.3 ? 1 : d < want - 0.8 ? -1 : 0;
    if (sign) {
      let bestDir = [0, 0];
      let bestDot = -2;
      for (const mx of [-1, 0, 1])
        for (const my of [-1, 0, 1]) {
          if (!mx && !my) continue;
          const v = screenDirToWorld(mx, my);
          const dot = (v.x * Math.cos(aim) + v.y * Math.sin(aim)) * sign;
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
      for (let slot = 5; slot >= 0; slot--) {
        const s = p.path.skills[slot];
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

function setup(paths: PathId[], encounter: boolean) {
  const w = new World();
  w.encounter = encounter;
  const ps = paths.map((path, i) => w.addPlayer(`p${i}`, { name: `P${i}`, path }));
  for (const p of ps) w.voteSkip(p.id);
  return { w, ps };
}

/** Sustained damage per second against a dummy pack (three targets, so area skills count). */
function dps(path: PathId, seconds = 40): number {
  const { w, ps } = setup([path], false);
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
