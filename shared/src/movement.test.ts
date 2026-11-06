import { describe, expect, it } from "vitest";
import { BALANCE } from "./balance.js";
import { SIM_DT } from "./constants.js";
import { CollisionGrid } from "./map.js";
import { isInvulnerable, newBody, overlaps, sanitizeInput, stepBody, type InputFrame } from "./movement.js";

const open = () => new CollisionGrid(40, 40);
const frame = (mx: number, my: number, dodge = false): InputFrame => ({ seq: 0, mx, my, dodge });
const run = (b: ReturnType<typeof newBody>, grid: CollisionGrid, f: InputFrame, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepBody(b, f, SIM_DT, grid);
};

describe("movement", () => {
  it("accelerates to run speed and stops quickly", () => {
    const b = newBody(20, 20);
    run(b, open(), frame(1, 0), 1);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(BALANCE.player.speed, 5);
    run(b, open(), frame(0, 0), 0.2);
    expect(Math.hypot(b.vx, b.vy)).toBe(0);
  });

  it("is deterministic: same inputs, same result", () => {
    const a = newBody(10, 10);
    const c = newBody(10, 10);
    const inputs = [frame(1, 0), frame(1, 1), frame(0, -1, true), frame(-1, 0), frame(0, 0)];
    for (let i = 0; i < 300; i++) {
      stepBody(a, inputs[i % 5], SIM_DT, open());
      stepBody(c, inputs[i % 5], SIM_DT, open());
    }
    expect(a).toEqual(c);
  });

  it("blocks walls and slides along them", () => {
    const grid = open();
    for (let y = 0; y < 40; y++) grid.set(22, y, true);
    const b = newBody(20.5, 20.5);
    // Screen down-right moves +x +y: the x part hits the wall, the y part keeps sliding.
    run(b, grid, frame(1, 1), 2);
    expect(b.x).toBeLessThanOrEqual(22 - BALANCE.player.radius + 1e-9);
    expect(b.y).toBeGreaterThan(23);
    expect(overlaps(b.x, b.y, BALANCE.player.radius, grid)).toBe(false);
  });

  it("can't dodge through a one-cell wall", () => {
    const grid = open();
    for (let y = 0; y < 40; y++) grid.set(21, y, true);
    const b = newBody(20.5, 20.5);
    b.facing = 0; // +x, straight at the wall
    run(b, grid, frame(0, 0, true), 0.5);
    expect(b.x).toBeLessThan(21);
  });

  it("dodges the configured distance, costs stamina and grants i-frames early on", () => {
    const b = newBody(10, 10);
    b.facing = 0;
    stepBody(b, frame(0, 0, true), SIM_DT, open());
    expect(isInvulnerable(b)).toBe(true);
    expect(b.stamina).toBe(BALANCE.player.staminaMax - BALANCE.dodge.cost);
    run(b, open(), frame(0, 0), BALANCE.dodge.duration);
    expect(isInvulnerable(b)).toBe(false);
    expect(b.x - 10).toBeGreaterThan(BALANCE.dodge.distance * 0.92);
    expect(b.x - 10).toBeLessThan(BALANCE.dodge.distance * 1.08);
  });

  it("runs out of stamina after three dodges", () => {
    const b = newBody(20, 20);
    let dodges = 0;
    // Two seconds of mashing: dodges are 0.54 s apart and regen waits 0.6 s, so stamina never recovers.
    for (let i = 0; i < 120; i++) {
      const before = b.dodgeT;
      stepBody(b, frame(0, 0, true), SIM_DT, open());
      if (before === 0 && b.dodgeT > 0) dodges++;
    }
    expect(dodges).toBe(3);
  });

  it("sanitizes untrusted input", () => {
    expect(sanitizeInput({ seq: 4, mx: 5, my: -1, dodge: "yes" })).toEqual({ seq: 4, mx: 0, my: -1, dodge: false });
    expect(sanitizeInput({ seq: -1 })).toBeNull();
    expect(sanitizeInput({ seq: 1.5 })).toBeNull();
    expect(sanitizeInput("hello")).toBeNull();
  });
});
