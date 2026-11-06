import { describe, expect, it } from "vitest";
import { BALANCE, CINEMATICS, SIM_DT } from "@broken-ash/shared";
import { sanitizeName, World } from "./World.js";

const frames = (from: number, n: number, mx = 1, my = 0) => Array.from({ length: n }, (_, i) => ({ seq: from + i, mx, my, dodge: false }));

function worldWithoutIntro() {
  const w = new World();
  w.addPlayer("a", "Ayume");
  w.voteSkip("a");
  return w;
}

describe("World", () => {
  it("spawns two players on different spawn points", () => {
    const w = new World();
    const a = w.addPlayer("a", "A");
    const b = w.addPlayer("b", "B");
    expect([a.body.x, a.body.y]).not.toEqual([b.body.x, b.body.y]);
    expect([a.look, b.look]).toEqual(["a", "b"]);
  });

  it("applies one queued input per step and acknowledges it", () => {
    const w = worldWithoutIntro();
    const p = w.players.get("a")!;
    const x0 = p.body.x;
    for (let i = 0; i < 30; i++) {
      w.queueInputs("a", frames(i + 1, 1));
      w.step(SIM_DT);
    }
    expect(p.lastSeq).toBe(30);
    expect(p.body.x).toBeGreaterThan(x0);
  });

  it("can't be sped up by flooding inputs", () => {
    const w = worldWithoutIntro();
    const p = w.players.get("a")!;
    const [x0, y0] = [p.body.x, p.body.y];
    let seq = 1;
    // A cheating client sends 10 frames every step for 2 seconds.
    for (let i = 0; i < 120; i++) {
      w.queueInputs("a", frames(seq, 10));
      seq += 10;
      w.step(SIM_DT);
    }
    const travelled = Math.hypot(p.body.x - x0, p.body.y - y0);
    // Two seconds at run speed, plus the small burst allowance.
    expect(travelled).toBeLessThan(BALANCE.player.speed * 2.3);
  });

  it("drops malformed and replayed inputs", () => {
    const w = worldWithoutIntro();
    w.queueInputs("a", [{ seq: 5, mx: 1, my: 0 }, { seq: 3, mx: 1, my: 0 }, { seq: "x" }, null, { seq: 6, mx: 9, my: 0 }]);
    expect(w.players.get("a")!.queue.map((f) => [f.seq, f.mx])).toEqual([[5, 1], [6, 0]]);
    w.queueInputs("a", "not an array");
    w.queueInputs("nobody", frames(1, 3));
  });

  it("plays the intro once and freezes players during it, and a late joiner shares the same scene", () => {
    const w = new World();
    w.addPlayer("a", "A");
    expect(w.cinematic).toMatchObject({ id: "cells_intro", elapsedMs: 0 });
    const p = w.players.get("a")!;
    const x0 = p.body.x;
    for (let i = 0; i < 60; i++) {
      w.queueInputs("a", frames(i + 1, 1));
      w.step(SIM_DT);
    }
    expect(p.body.x).toBe(x0);
    expect(p.lastSeq).toBe(60);

    w.addPlayer("b", "B");
    expect(w.cinematic?.id).toBe("cells_intro");
    expect(w.cinematic?.elapsedMs).toBeCloseTo(1000, 0);

    // Leaving and coming back doesn't replay it.
    w.voteSkip("a");
    w.voteSkip("b");
    w.removePlayer("a");
    w.addPlayer("a", "A");
    expect(w.cinematic).toBeNull();
  });

  it("skips only when both players vote", () => {
    const w = new World();
    w.addPlayer("a", "A");
    w.addPlayer("b", "B");
    w.voteSkip("a");
    w.voteSkip("a");
    expect(w.cinematic?.votes.size).toBe(1);
    w.voteSkip("b");
    expect(w.cinematic).toBeNull();
  });

  it("ends the cinematic by itself, and the partner leaving can't strand it", () => {
    const w = new World();
    w.addPlayer("a", "A");
    w.addPlayer("b", "B");
    w.voteSkip("a");
    w.removePlayer("b");
    expect(w.cinematic).toBeNull();

    const w2 = new World();
    w2.addPlayer("a", "A");
    const steps = Math.ceil(CINEMATICS.cells_intro.durationMs / 1000 / SIM_DT) + 1;
    for (let i = 0; i < steps; i++) w2.step(SIM_DT);
    expect(w2.cinematic).toBeNull();
  });

  it("sanitizes names", () => {
    expect(sanitizeName("  Ayume\u0007  z   Soramei  ")).toBe("Ayume z Soramei");
    expect(sanitizeName("")).toBe("Popielny");
    expect(sanitizeName(42)).toBe("Popielny");
    expect(sanitizeName("x".repeat(50))).toHaveLength(20);
  });

  it("opens the mine's bars only when both pump levers are pulled together", () => {
    const w = new World("sap_mine", 1, ["seen:mine_intro"]);
    const a = w.addPlayer("a", "A");
    const b = w.addPlayer("b", "B");
    w.encounter = false;
    let seq = 1;
    const press = (id: string) => w.queueInputs(id, [{ seq: seq++, mx: 0, my: 0, act: true }]);
    const [l1, l2] = w.map.levers!;
    expect(w.grid.blocked(18, 10)).toBe(true);
    // One person running from lever to lever is too slow.
    Object.assign(a.body, { x: l1.x, y: l1.y + 1 });
    press("a");
    w.step(SIM_DT);
    for (let i = 0; i < Math.ceil(BALANCE.combat.leverWindow / SIM_DT) + 5; i++) w.step(SIM_DT);
    Object.assign(a.body, { x: l2.x, y: l2.y + 1 });
    press("a");
    w.step(SIM_DT);
    expect(w.flags.has("pumps_on")).toBe(false);
    // Two people, the same moment.
    Object.assign(b.body, { x: l1.x, y: l1.y + 1 });
    press("b");
    w.step(SIM_DT);
    expect(w.flags.has("pumps_on")).toBe(true);
    expect(w.grid.blocked(18, 10)).toBe(false);
  });

  it("plays Act 1's ending: the scouts' choice, its scene, home to the farmstead, the downer", () => {
    const w = new World("harrow_road", 1, ["seen:road_intro", "seen:farm_intro"]);
    w.addPlayer("a", "A");
    w.addPlayer("b", "B");
    w.startCinematic("scouts_choice");
    const choiceT = CINEMATICS.scouts_choice.choice!.t;
    for (let i = 0; i < Math.ceil(choiceT / 1000 / SIM_DT) + 120; i++) w.step(SIM_DT);
    // The scene holds at the choice until both agree.
    expect(w.cinematic?.id).toBe("scouts_choice");
    w.pickChoice("a", { option: 1 });
    w.pickChoice("b", { option: 0 });
    expect(w.flags.has("scouts_spared") || w.flags.has("scouts_executed")).toBe(false);
    w.pickChoice("b", { option: 1 });
    expect(w.flags.has("scouts_spared")).toBe(true);
    const run = (id: string) => {
      expect(w.cinematic?.id).toBe(id);
      for (let i = 0; i < Math.ceil(CINEMATICS[id].durationMs / 1000 / SIM_DT) + 2 && w.cinematic?.id === id; i++) w.step(SIM_DT);
    };
    run("scouts_choice");
    run("scouts_free");
    expect(w.map.id).toBe("farmstead");
    run("downer");
    expect(w.flags.has("act1_done")).toBe(true);
    run("act1_end");
    expect(w.cinematic).toBeNull();
  });

  it("walks out of the cells only once the dead there are put down", () => {
    const w = new World(undefined, 1, ["seen:cells_intro"]);
    const a = w.addPlayer("a", "A");
    const exit = w.map.exits![0];
    Object.assign(a.body, { x: exit.region.x + 1, y: exit.region.y + 0.7 });
    for (let i = 0; i < 120; i++) w.step(SIM_DT);
    expect(w.map.id).toBe("soramei_cells");
    w.setFlag("cells_cleared");
    w.units.clear();
    for (let i = 0; i < 120; i++) w.step(SIM_DT);
    expect(w.map.id).toBe("soramei_courtyard");
    expect(w.cinematic?.id).toBe("prolog");
  });
});
