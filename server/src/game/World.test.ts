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
    let seq = 1;
    // A cheating client sends 10 frames every step for 2 seconds.
    for (let i = 0; i < 120; i++) {
      w.queueInputs("a", frames(seq, 10));
      seq += 10;
      w.step(SIM_DT);
    }
    const travelled = Math.hypot(p.body.x - 13.5, p.body.y - 15.5);
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
    expect(w.cinematic).toMatchObject({ id: "prolog", elapsedMs: 0 });
    const p = w.players.get("a")!;
    const x0 = p.body.x;
    for (let i = 0; i < 60; i++) {
      w.queueInputs("a", frames(i + 1, 1));
      w.step(SIM_DT);
    }
    expect(p.body.x).toBe(x0);
    expect(p.lastSeq).toBe(60);

    w.addPlayer("b", "B");
    expect(w.cinematic?.id).toBe("prolog");
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
    const steps = Math.ceil(CINEMATICS.prolog.durationMs / 1000 / SIM_DT) + 1;
    for (let i = 0; i < steps; i++) w2.step(SIM_DT);
    expect(w2.cinematic).toBeNull();
  });

  it("sanitizes names", () => {
    expect(sanitizeName("  Ayume\u0007  z   Soramei  ")).toBe("Ayume z Soramei");
    expect(sanitizeName("")).toBe("Popielny");
    expect(sanitizeName(42)).toBe("Popielny");
    expect(sanitizeName("x".repeat(50))).toHaveLength(20);
  });
});
