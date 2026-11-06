import { MELEE } from "./melee";
import { PATH_RECIPES } from "./paths";
import { FORMS, RANGED } from "./ranged";
import type { Recipe } from "./types";

/** Every castable skill's effect, by skill id (moves.ts gives the body's part). */
export const RECIPES: Record<string, Recipe> = { ...MELEE, ...RANGED, ...PATH_RECIPES };

/** A basic attack's mastery form changes its look: its recipe, by the form's vfx key. */
export { FORMS };

/** The recipe a cast uses: a mastery form's when the cast carries a form's look, else the skill's own. */
export function recipeFor(skillId: string, vfx?: string): Recipe | undefined {
  if (vfx && FORMS[vfx]) {
    const base = RECIPES[skillId];
    // A form overrides only what it defines (a bolt look, or the release); the rest stays the skill's.
    return base ? { ...base, ...FORMS[vfx], sig: FORMS[vfx].sig } : FORMS[vfx];
  }
  return RECIPES[skillId];
}
