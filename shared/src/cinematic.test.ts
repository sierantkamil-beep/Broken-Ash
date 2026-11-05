import { describe, expect, it } from "vitest";
import { evaluateCinematic, eventsBetween, validateCinematic, type Cinematic } from "./cinematic.js";
import { CINEMATICS } from "./data/cinematics.js";

const sample: Cinematic = {
  id: "t",
  durationMs: 10000,
  letterboxMs: 1000,
  camera: [
    { t: 0, x: 0, y: 0, zoom: 1 },
    { t: 4000, x: 10, y: 0, zoom: 2, ease: "linear" },
  ],
  startFade: 1,
  fades: [
    { t: 0, dur: 1000, to: 0 },
    { t: 9000, dur: 1000, to: 1 },
  ],
  subtitles: [{ t: 2000, dur: 3000, text: "Krótko." }],
  titles: [],
  actors: [{ id: "a", sprite: "ashbound_0", keys: [{ t: 0, x: 0, y: 0, dir: 0 }, { t: 2000, x: 4, y: 0, dir: 6, anim: "run", ease: "linear" }] }],
  events: [
    { t: 500, kind: "sound", key: "x" },
    { t: 5000, kind: "shake", intensity: 0.01, dur: 100 },
  ],
};

describe("cinematic timeline", () => {
  it("interpolates the camera and holds the last key", () => {
    expect(evaluateCinematic(sample, 2000).camera).toEqual({ x: 5, y: 0, zoom: 1.5 });
    expect(evaluateCinematic(sample, 7000).camera).toEqual({ x: 10, y: 0, zoom: 2 });
  });

  it("slides letterbox bars in and out", () => {
    expect(evaluateCinematic(sample, 0).letterbox).toBe(0);
    expect(evaluateCinematic(sample, 500).letterbox).toBe(0.5);
    expect(evaluateCinematic(sample, 5000).letterbox).toBe(1);
    expect(evaluateCinematic(sample, 9500).letterbox).toBe(0.5);
  });

  it("fades from black and back", () => {
    expect(evaluateCinematic(sample, 0).fade).toBe(1);
    expect(evaluateCinematic(sample, 500).fade).toBeCloseTo(0.5, 5);
    expect(evaluateCinematic(sample, 3000).fade).toBe(0);
    expect(evaluateCinematic(sample, 9500).fade).toBeCloseTo(0.5, 5);
  });

  it("shows subtitles in their window with soft edges", () => {
    expect(evaluateCinematic(sample, 1999).subtitle).toBeNull();
    const f = evaluateCinematic(sample, 2150);
    expect(f.subtitle?.text).toBe("Krótko.");
    expect(f.subtitleAlpha).toBeCloseTo(0.5, 5);
  });

  it("moves actors along their keys", () => {
    const a = evaluateCinematic(sample, 1000).actors[0];
    expect(a.x).toBe(2);
    expect(a.anim).toBe("run");
  });

  it("fires each event once when crossed, and none when seeking backwards", () => {
    expect(eventsBetween(sample, 0, 600).map((e) => e.kind)).toEqual(["sound"]);
    expect(eventsBetween(sample, 600, 4999)).toEqual([]);
    expect(eventsBetween(sample, 4999, 5000).map((e) => e.kind)).toEqual(["shake"]);
  });

  it("is done at the end", () => {
    expect(evaluateCinematic(sample, 9999).done).toBe(false);
    expect(evaluateCinematic(sample, 10000).done).toBe(true);
  });
});

describe.each(Object.values(CINEMATICS))("cinematic $id", (c) => {
  it("is valid and readable", () => {
    expect(validateCinematic(c)).toEqual([]);
  });
});
