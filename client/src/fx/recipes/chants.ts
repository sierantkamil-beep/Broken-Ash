import type { Ramp } from "../fxkit";

/**
 * What a caster says as a spell is drawn (shown over their head through the wind-up, with a whispered
 * chant sound by element). Short Polish incantations, invented, no gendered verb forms. Only spells
 * and rites have them; a sword cut doesn't need words.
 */
export const CHANTS: Record<string, string> = {
  thorn_harvest: "Ciernie, zbierzcie plon!",
  thorn_feint: "Cień za cień.",
  thorn_oath: "Krew za krew, cierń za cierń.",
  bark_roots: "Korzenie, trzymajcie!",
  bark_hide: "Koro, okryj.",
  bark_grove: "Wyrośnij, gaju!",
  blood_drink: "Oddajcie mi krew.",
  blood_veil: "Krwawa mgło, osłoń.",
  blood_boil: "Wrzyj w żyłach!",
  ash_pyre: "Stos dla umarłych!",
  ash_ignite: "Zapłoń.",
  ash_vent: "Żarze, na zewnątrz!",
  storm_bolt: "Gromie, uderz!",
  storm_ward: "Burzo, stań przy mnie.",
  storm_tempest: "Niebo, pękaj!",
  graves_raise: "Powstańcie z popiołu.",
  graves_curse: "Niech zgniją.",
  graves_feast: "Ucztujcie, duchy.",
  dusk_mark: "Ty jesteś zwierzyną.",
  dusk_snare: "Pętla zmierzchu.",
  dusk_fade: "Zniknij w mroku.",
  sting_smoke: "Dym i cisza.",
  sting_boil: "Jadzie, wrzyj.",
  sting_antidote: "Gorzko. Na zdrowie.",
  brush_lance: "Pędzlu, przebij!",
  brush_seal: "Pieczęć więzów!",
  brush_sigil: "Znak wrzenia!",
  brush_glyphs: "Trzy znaki.",
  brush_flood: "Tuszu, zalej!",
  talismans_fan: "Talizmany, w ogień!",
  talismans_ward: "Krąg płomieni!",
  talismans_mine: "Czekaj… i płoń.",
  talismans_chain: "Łańcuch papieru!",
  talismans_phoenix: "Wstań z popiołu, ptaku!",
  fan_gale: "Wichrze, wiej!",
  fan_updraft: "W górę!",
  fan_cyclone: "Wiruj!",
  fan_blades: "Ostrza wiatru!",
  lantern_toll: "Dzwonie, bij!",
  lantern_chain: "Dusze, wiążcie!",
  lantern_rot: "Rozkład.",
  lantern_flare: "Światło umarłych!",
  lantern_procession: "Idźcie, duchy.",
};

/** Which chant sound a spell is spoken with, by its element. */
export function chantSound(ramp: Ramp): string {
  const kind = ramp === "spirit" || ramp === "dusk" || ramp === "gold" ? "choir" : ramp === "lightning" || ramp === "wind" ? "crackle" : ramp === "blood" || ramp === "nature" || ramp === "shadow" ? "growl" : "whisper";
  return `sfx_chant_${kind}_${Math.random() < 0.5 ? 0 : 1}`;
}
