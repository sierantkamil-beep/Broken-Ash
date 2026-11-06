import { describe, expect, it } from "vitest";
import { allSkills, GREYED, PATHS, WEAPONS } from "@broken-ash/shared";
import { ENEMY } from "./enemies";
import { FORMS, RECIPES } from "./index";

describe("skill effect recipes", () => {
  const skills = [...allSkills(PATHS).values()];

  it("gives every castable skill its own recipe", () => {
    expect(skills.filter((s) => !RECIPES[s.id]).map((s) => s.id)).toEqual([]);
  });

  it("gives every mastery form a recipe", () => {
    const forms = Object.values(WEAPONS).flatMap((w) => w.passives.flat().flatMap((p) => p.mods).filter((m) => m.kind === "form").map((m) => (m as { vfx: string }).vfx));
    expect(forms.length).toBe(Object.keys(WEAPONS).length);
    expect(forms.filter((v) => !FORMS[v])).toEqual([]);
  });

  it("never repeats a recipe (each names a different set of beats)", () => {
    const sigs = [...Object.values(RECIPES), ...Object.values(FORMS)].map((r) => r.sig);
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it("covers each skill's shape: bolts fly, thrown circles land, the rest release", () => {
    for (const s of skills) {
      const r = RECIPES[s.id];
      const sh = s.shape;
      if (sh.kind === "projectile") expect(r.bolt, s.id).toBeDefined();
      else if (sh.kind === "circle" && sh.at === "aim") expect(r.land, s.id).toBeDefined();
      else expect(r.release, s.id).toBeDefined();
      if (s.effects.some((e) => e.kind === "zone")) expect(r.zone ?? r.release, s.id).toBeDefined();
    }
  });

  it("gives every enemy attack its own look: a blow, or a shot for ranged ones", () => {
    for (const def of Object.values(GREYED))
      for (const at of def.attacks) {
        const r = ENEMY[`${def.kind}_${at.id}`];
        expect(r, `${def.kind}_${at.id}`).toBeDefined();
        expect(at.bolt ? r.bolt : r.blow, `${def.kind}_${at.id}`).toBeDefined();
      }
    const sigs = Object.values(ENEMY).map((r) => r.sig);
    expect(new Set(sigs).size).toBe(sigs.length);
  });
});
