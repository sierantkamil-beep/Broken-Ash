import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the paper doll against the bugs that made gear jump: every mirrored direction (NE, E, SE)
 * must carry exactly its source direction's anchors reflected about the feet, and a run must carry
 * the weapon at one steady angle. Frame layout: [hand x, y, angle, off x, y, angle, head x, y, top,
 * neck x, y, torso x, y, shoulder L x, y, R x, y, rotation] (tools/pixellab/pack.py rel_anchor).
 */
type Anchor = (number | null)[];
const load = (body: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../client/public/assets/chars/body_${body}.json`, import.meta.url)), "utf8")).meta as {
    anims: Record<string, number>;
    anchors: Record<string, Anchor>;
  };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe.each(["male", "female"])("body_%s anchors", (body) => {
  const meta = load(body);

  it("anchors every frame of every clip in all eight directions", () => {
    for (const [anim, n] of Object.entries(meta.anims))
      for (let d = 0; d < 8; d++) for (let k = 0; k < n; k++) expect(meta.anchors[`${anim}/${d}/${k}`], `${anim}/${d}/${k}`).toBeTruthy();
  });

  it("mirrors NE, E and SE exactly from NW, W and SW", () => {
    for (const [anim, n] of Object.entries(meta.anims))
      for (const d of [5, 6, 7])
        for (let k = 0; k < n; k++) {
          const m = meta.anchors[`${anim}/${d}/${k}`];
          const s = meta.anchors[`${anim}/${8 - d}/${k}`];
          const name = `${anim}/${d}/${k}`;
          // x reflected, y kept: hands, head, neck, torso.
          for (const [xi, yi] of [[0, 1], [3, 4], [6, 7], [9, 10], [11, 12]]) {
            if (s[xi] === null) {
              expect(m[xi], name).toBeNull();
              continue;
            }
            expect(m[xi], name).toBeCloseTo(-(s[xi] as number), 6);
            expect(m[yi], name).toBeCloseTo(s[yi] as number, 6);
          }
          // Hand angles reflected (a → π − a), shoulders swapped, rotation negated.
          for (const ai of [2, 5]) if (s[ai] !== null) expect(Math.abs(wrap((m[ai] as number) - (Math.PI - (s[ai] as number)))), name).toBeLessThan(1e-3);
          expect(m[13], name).toBeCloseTo(-(s[15] as number), 6);
          expect(m[15], name).toBeCloseTo(-(s[13] as number), 6);
          expect(m[17], name).toBeCloseTo(-(s[17] as number), 6);
        }
  });

  it("keeps gear on the body: hands within reach of the torso, the head above the neck", () => {
    for (const [name, a] of Object.entries(meta.anchors)) {
      if (a[17] !== 0) continue; // rolls and falls turn the whole figure
      for (const xi of [0, 3]) if (a[xi] !== null) expect(Math.hypot((a[xi] as number) - (a[11] as number), (a[xi + 1] as number) - (a[12] as number)), name).toBeLessThan(34); // an overhead raise reaches ~31
      expect(a[7] as number, name).toBeLessThan(a[10] as number);
    }
  });

  it("holds the weapon in hand while running, at one steady angle per direction", () => {
    for (let d = 0; d < 8; d++) {
      const angles = new Set<number>();
      for (let k = 0; k < meta.anims.run; k++) {
        const a = meta.anchors[`run/${d}/${k}`];
        if (a[0] !== null) angles.add(a[2] as number);
      }
      expect(angles.size, `run/${d}`).toBeLessThanOrEqual(1);
    }
  });

  it("steadies the head: no frame-to-frame wobble over 3 art px within a run", () => {
    for (let d = 0; d < 8; d++)
      for (let k = 0; k < meta.anims.run; k++) {
        const a = meta.anchors[`run/${d}/${k}`];
        const b = meta.anchors[`run/${d}/${(k + 1) % meta.anims.run}`];
        expect(Math.abs((a[6] as number) - (b[6] as number)), `run/${d}/${k}`).toBeLessThanOrEqual(3);
      }
  });
});
