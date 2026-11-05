import { describe, expect, it } from "vitest";
import { CollisionGrid, newBody, SIM_DT, stepBody } from "@broken-ash/shared";
import { Prediction } from "./Prediction";

describe("Prediction", () => {
  it("lands exactly on the server's result once inputs are acknowledged", () => {
    const grid = new CollisionGrid(40, 40);
    const p = new Prediction(grid, 10, 10);
    const sent = [];
    for (let i = 0; i < 30; i++) sent.push(...p.tick(SIM_DT * 1000, { mx: 1, my: i > 15 ? 1 : 0, dodge: i === 5 }, true));
    // The server applies the same frames.
    const server = newBody(10, 10);
    for (const f of sent.slice(0, 20)) stepBody(server, f, SIM_DT, grid);
    p.reconcile(server, sent[19].seq);
    for (const f of sent.slice(20)) stepBody(server, f, SIM_DT, grid);
    expect(p.body.x).toBeCloseTo(server.x, 9);
    expect(p.body.y).toBeCloseTo(server.y, 9);
  });

  it("keeps a short dodge tap even between steps", () => {
    const p = new Prediction(new CollisionGrid(40, 40), 10, 10);
    p.pressDodge();
    const frames = p.tick(SIM_DT * 1000, { mx: 0, my: 0, dodge: false }, true);
    expect(frames[0].dodge).toBe(true);
    expect(p.body.dodgeT).toBeGreaterThan(0);
  });
});
