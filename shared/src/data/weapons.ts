import { bolt, circle, cone, dmg, line, skill, st } from "../combat/build.js";
import type { Effect, SkillDef, StatusId, WeaponId } from "../combat/types.js";

/**
 * The nine weapon types (design.md §4 "Weapons and mastery"). Any path can wield any of them; the
 * weapon gives the basic attack (LMB), the RMB skill and one key-1 skill, chosen from its own mastery
 * tree. Passive rows (one of two per row) modify the weapon's skills; they are generic modifiers so the
 * combat engine never needs to know about a particular tree (shared/src/loadout.ts applies them).
 *
 * Every skill's `vfx` is a shadow-ink composition (client/src/fx/Vfx.ts), coloured by the wielder's path.
 */

/** Which weapon-skill a passive touches. */
export type SkillSlot = "basic" | "rmb" | "key" | "all";

export type Mod =
  | { kind: "damage"; pct: number; slot?: SkillSlot }
  | { kind: "cooldown"; pct: number; slot?: SkillSlot }
  /** Range of cones and lines, radius of circles, flight range of bolts. */
  | { kind: "reach"; pct: number; slot?: SkillSlot }
  | { kind: "projectiles"; add: number; slot?: SkillSlot }
  | { kind: "pierce"; slot?: SkillSlot }
  | { kind: "poise"; pct: number; slot?: SkillSlot }
  /** An effect added to every damaging skill in the slot. */
  | { kind: "rider"; effect: Effect; slot?: SkillSlot }
  /** A new form of one skill: its look changes (design.md "skill evolution") and it gains an effect. */
  | { kind: "form"; slot: Exclude<SkillSlot, "all">; vfx: string; effect?: Effect };

export interface PassiveDef {
  id: string;
  name: string;
  description: string;
  mods: Mod[];
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Player-facing description for the character screen. */
  blurb: string;
  /**
   * How it's held: one hand, both hands, a bow (off hand), or a pair (main + off hand). The client
   * pins the weapon sprite to the hand anchors accordingly.
   */
  grip: "one" | "two" | "bow" | "pair";
  /** The body move all its skills play (the shared bodies' strike or cast). */
  anim: "strike" | "cast";
  range: "melee" | "ranged";
  basic: SkillDef;
  /** RMB: one of two (unlocked at BALANCE.mastery.rmbUnlock). */
  rmb: [SkillDef, SkillDef];
  /** Key 1: one of three (BALANCE.mastery.keyUnlock). */
  key: [SkillDef, SkillDef, SkillDef];
  /** Five rows of two passives (BALANCE.mastery.passiveUnlock). */
  passives: [PassiveDef, PassiveDef][];
}

type Opts = Parameters<typeof skill>[3];

/** Builds a weapon's skills with its id and body move filled in. */
function maker(weapon: WeaponId, anim: "strike" | "cast") {
  return (id: string, name: string, description: string, o: Omit<Opts, "weapon" | "anim">) => skill(`${weapon}_${id}`, name, description, { ...o, anim, weapon });
}

const p = (id: string, name: string, description: string, ...mods: Mod[]): PassiveDef => ({ id, name, description, mods });

/**
 * The passive rows most weapons share in shape (numbers in one place), each with the weapon's own
 * names and its row-6 rider and row-10 keystone.
 */
function rows(
  w: WeaponId,
  o: {
    rider: [StatusId, number, number, string];
    form: { name: string; description: string; vfx: string; effect?: Effect };
    wide: PassiveDef;
    keystone: [PassiveDef, PassiveDef];
    names?: Partial<Record<"edge" | "rhythm" | "reach" | "drink" | "weight", string>>;
  },
): [PassiveDef, PassiveDef][] {
  const n = o.names ?? {};
  const [status, duration, value, riderName] = o.rider;
  return [
    [
      p(`${w}_edge`, n.edge ?? "Ostrość", "Umiejętności broni zadają 10% więcej obrażeń.", { kind: "damage", pct: 0.1 }),
      p(`${w}_rhythm`, n.rhythm ?? "Rytm", "Umiejętności broni odnawiają się 12% szybciej.", { kind: "cooldown", pct: -0.12 }),
    ],
    [
      p(`${w}_reach`, n.reach ?? "Zasięg", "Umiejętności broni sięgają o 20% dalej.", { kind: "reach", pct: 0.2 }),
      p(`${w}_rider`, riderName, `Atak podstawowy nakłada ${statusName(status)}.`, { kind: "rider", slot: "basic", effect: st(status, duration, value) }),
    ],
    [
      p(`${w}_form`, o.form.name, o.form.description, { kind: "form", slot: "basic", vfx: o.form.vfx, effect: o.form.effect }),
      p(`${w}_drink`, n.drink ?? "Głód", "Umiejętności broni leczą cię o 8% zadanych obrażeń.", { kind: "rider", effect: { kind: "lifesteal", fraction: 0.08 } }),
    ],
    [o.wide, p(`${w}_weight`, n.weight ?? "Ciężar", "Umiejętności broni łamią postawę o 40% mocniej.", { kind: "poise", pct: 0.4 })],
    o.keystone,
  ];
}

const STATUS_PL: Partial<Record<StatusId, string>> = {
  bleed: "krwawienie",
  burn: "płonięcie",
  poison: "truciznę",
  slow: "spowolnienie",
  static: "ładunek statyczny",
  weaken: "klątwę",
  mark: "naznaczenie",
  rooted: "unieruchomienie",
};
const statusName = (s: StatusId) => STATUS_PL[s] ?? s;

// ------------------------------------------------------------------------------------- melee

const b = maker("blades", "strike");
const blades: WeaponDef = {
  id: "blades",
  name: "Para ostrzy",
  blurb: "Długie i krótkie zakrzywione ostrze. Najszybsza broń: cięcia jedno po drugim, doskoki, wykończenia.",
  grip: "pair",
  anim: "strike",
  range: "melee",
  basic: b("cut", "Cięcie", "Dwa szybkie cięcia przed sobą.", { cd: 0.42, windup: 0.12, shape: cone(1.9, 85), effects: [dmg(11)], vfx: "ink_slash", sfx: "blade" }),
  rmb: [
    b("draw", "Cięcie z pochwy", "Błyskawiczny doskok i cięcie przez wszystko na linii.", { cd: 6, windup: 0.08, shape: line(4.2, 1.2), effects: [{ kind: "dash", distance: 3.6 }, dmg(36, 40)], vfx: "ink_dash", sfx: "blade_heavy" }),
    b("cross", "Krzyżowe cięcie", "Oba ostrza naraz, na krzyż: łamie postawę.", { cd: 5, windup: 0.2, shape: cone(2.2, 60), effects: [dmg(34, 55)], vfx: "ink_cross", sfx: "blade_heavy" }),
  ],
  key: [
    b("whirl", "Wir ostrzy", "Obrót z oboma ostrzami. Rani wszystko wokół.", { cd: 8, windup: 0.15, shape: circle(2.4), effects: [dmg(26, 30)], vfx: "ink_whirl", sfx: "blade_spin" }),
    b("flurry", "Grad cięć", "Seria cięć przed sobą i chwilowy pęd.", { cd: 9, windup: 0.1, shape: cone(2.1, 95), effects: [dmg(42, 25), st("haste", 2.5, 0.3, "self")], vfx: "ink_flurry", sfx: "blade_spin" }),
    b("behead", "Ścięcie", "Krótki doskok i jedno cięcie, które ma odciąć głowę.", { cd: 12, windup: 0.3, shape: line(3.2, 1.0), effects: [{ kind: "dash", distance: 2 }, dmg(70, 80)], vfx: "ink_dash_heavy", sfx: "execute" }),
  ],
  passives: rows("blades", {
    rider: ["bleed", 3, 2, "Ząbkowane ostrze"],
    form: { name: "Cięcie płatka", description: "Cięcie zostawia na ziemi płatki tuszu i spowalnia.", vfx: "ink_slash_petal", effect: st("slow", 1.2, 0.3) },
    wide: p("blades_wide", "Szeroki zamach", "Cięcia obejmują o 25% więcej.", { kind: "reach", pct: 0.25, slot: "basic" }),
    keystone: [
      p("blades_dance", "Taniec ostrzy", "Umiejętność z klawisza 1 odnawia się o 25% szybciej.", { kind: "cooldown", pct: -0.25, slot: "key" }),
      p("blades_iai", "Iaijutsu", "Umiejętność prawego przycisku zadaje 30% więcej obrażeń.", { kind: "damage", pct: 0.3, slot: "rmb" }),
    ],
  }),
};

const g = maker("glaive", "strike");
const glaive: WeaponDef = {
  id: "glaive",
  name: "Glewia",
  blurb: "Długie drzewce z zakrzywionym ostrzem. Trzyma wrogów na dystans: szerokie cięcia, pchnięcia przez szeregi.",
  grip: "two",
  anim: "strike",
  range: "melee",
  basic: g("sweep", "Zamach glewią", "Szerokie cięcie na długość drzewca.", { cd: 0.6, windup: 0.18, shape: cone(2.8, 70), effects: [dmg(15)], vfx: "ink_sweep", sfx: "blade" }),
  rmb: [
    g("thrust", "Pchnięcie", "Pchnięcie przez wszystkich na linii.", { cd: 5, windup: 0.22, shape: line(4.2, 0.8), effects: [dmg(36, 40)], vfx: "ink_thrust", sfx: "blade_heavy" }),
    g("vault", "Skok o drzewcu", "Skok naprzód i cięcie przy lądowaniu.", { cd: 7, windup: 0.15, shape: line(3.6, 1.4), effects: [{ kind: "dash", distance: 3.2 }, dmg(30, 40), { kind: "knockback", distance: 1 }], vfx: "ink_dash", sfx: "whoosh" }),
  ],
  key: [
    g("reap", "Kosa", "Pełny obrót glewią: rani i spowalnia wokół.", { cd: 8, windup: 0.25, shape: circle(3), effects: [dmg(28, 30), st("slow", 2, 0.35)], vfx: "ink_whirl", sfx: "blade_spin" }),
    g("hook", "Hak", "Hak ostrza łapie wrogów przed tobą i trzyma w miejscu.", { cd: 9, windup: 0.2, shape: cone(3.6, 40), effects: [dmg(24, 30), st("rooted", 1.4)], vfx: "ink_hook", sfx: "blade" }),
    g("moon", "Księżycowy łuk", "Wielkie cięcie w kształcie sierpu księżyca, odrzuca.", { cd: 13, windup: 0.4, shape: circle(3.4), effects: [dmg(56, 60), { kind: "knockback", distance: 2 }], vfx: "ink_enso", sfx: "blade_heavy" }),
  ],
  passives: rows("glaive", {
    rider: ["slow", 1.5, 0.3, "Podcięcie"],
    form: { name: "Cięcie żurawia", description: "Zamach zostawia tusz w kształcie skrzydła i odrzuca lekko.", vfx: "ink_sweep_wing", effect: { kind: "knockback", distance: 0.6 } },
    wide: p("glaive_wide", "Długie drzewce", "Zamach sięga o 30% dalej.", { kind: "reach", pct: 0.3, slot: "basic" }),
    keystone: [
      p("glaive_wall", "Mur ostrzy", "Wszystkie umiejętności glewii łamią postawę o 60% mocniej.", { kind: "poise", pct: 0.6 }),
      p("glaive_pierce", "Przez szeregi", "Umiejętność prawego przycisku zadaje 30% więcej obrażeń.", { kind: "damage", pct: 0.3, slot: "rmb" }),
    ],
  }),
};

const gb = maker("greatblade", "strike");
const greatblade: WeaponDef = {
  id: "greatblade",
  name: "Ostrze dwuręczne",
  blurb: "Ogromne ostrze na dwie ręce. Wolne, miażdżące ciosy, które łamią postawę i odrzucają.",
  grip: "two",
  anim: "strike",
  range: "melee",
  basic: gb("cleave", "Rąbnięcie", "Szeroki, ciężki zamach.", { cd: 0.85, windup: 0.3, shape: cone(2.4, 130), effects: [dmg(24, 30)], vfx: "ink_cleave", sfx: "blade_heavy" }),
  rmb: [
    gb("charge", "Taran", "Szarża przez wrogów z ostrzem przed sobą.", { cd: 11, windup: 0.15, shape: line(5, 1.6), effects: [{ kind: "dash", distance: 4.5 }, dmg(36, 50), { kind: "knockback", distance: 1.5 }], vfx: "ink_dash_heavy", sfx: "slam" }),
    gb("overhead", "Cios z góry", "Ostrze spada z całej wysokości.", { cd: 7, windup: 0.55, shape: cone(2.6, 50), effects: [dmg(64, 85)], vfx: "ink_overhead", sfx: "slam" }),
  ],
  key: [
    gb("quake", "Wstrząs", "Uderzenie ostrzem w ziemię. Wszystkich wokół rzuca w tył.", { cd: 10, windup: 0.4, shape: circle(2.8), effects: [dmg(36, 60), { kind: "knockback", distance: 2.2 }], vfx: "ink_quake", sfx: "slam" }),
    gb("spin", "Młyn", "Ciężki obrót z ostrzem: rani i spowalnia.", { cd: 9, windup: 0.3, shape: circle(2.8), effects: [dmg(36, 40), st("slow", 2, 0.4)], vfx: "ink_whirl", sfx: "blade_spin" }),
    gb("sunder", "Rozłupanie", "Cięcie, które rozłupuje ziemię na linii i osłabia trafionych.", { cd: 14, windup: 0.45, shape: line(5, 1.2), effects: [dmg(70, 70), st("weaken", 5)], vfx: "ink_sunder", sfx: "slam" }),
  ],
  passives: rows("greatblade", {
    rider: ["slow", 1.5, 0.35, "Gruchotanie"],
    form: { name: "Cios góry", description: "Rąbnięcie wybija krąg tuszu i odrzuca.", vfx: "ink_cleave_mountain", effect: { kind: "knockback", distance: 1 } },
    wide: p("greatblade_wide", "Szeroki łuk", "Rąbnięcie obejmuje o 25% więcej.", { kind: "reach", pct: 0.25, slot: "basic" }),
    keystone: [
      p("greatblade_titan", "Tytan", "Umiejętności ostrza zadają 15% więcej obrażeń i łamią postawę o 30% mocniej.", { kind: "damage", pct: 0.15 }, { kind: "poise", pct: 0.3 }),
      p("greatblade_storm", "Burza stali", "Umiejętność z klawisza 1 odnawia się o 30% szybciej.", { kind: "cooldown", pct: -0.3, slot: "key" }),
    ],
  }),
};

// ------------------------------------------------------------------------------------- casters

const br = maker("brush", "cast");
const brush: WeaponDef = {
  id: "brush",
  name: "Pędzel krwi",
  blurb: "Pędzel pisarza pieczęci. Kreśli znaki, które lecą jak igły i więżą wrogów. W rękach Ścieżki Krwi pije z ran.",
  grip: "one",
  anim: "cast",
  range: "ranged",
  basic: br("stroke", "Kreska", "Rzut kroplą tuszu zaostrzoną w igłę.", { cd: 0.5, windup: 0.14, shape: bolt(16, 9, 0.3), effects: [dmg(15)], vfx: "ink_needle", sfx: "blood" }),
  rmb: [
    br("lance", "Włócznia znaku", "Przeszywająca włócznia z jednego pociągnięcia pędzla.", { cd: 4.5, windup: 0.3, shape: bolt(22, 11, 0.4, { pierce: true }), effects: [dmg(44, 40)], vfx: "ink_lance", sfx: "blood_heavy" }),
    br("seal", "Pieczęć więzów", "Pieczęć na ziemi więzi wszystkich w niej.", { cd: 7, windup: 0.35, shape: circle(2.2, "aim", 8), effects: [dmg(28), st("rooted", 1.6)], vfx: "ink_seal", sfx: "blood" }),
  ],
  key: [
    br("sigil", "Pieczęć wrzenia", "Pieczęć na ziemi: wrogowie w niej wrą.", { cd: 9, windup: 0.4, shape: circle(2.4, "aim", 8), effects: [dmg(24), { kind: "zone", radius: 2.4, duration: 4, dps: 14 }], vfx: "ink_sigil", sfx: "blood" }),
    br("glyphs", "Trzy znaki", "Trzy znaki naraz, wachlarzem.", { cd: 7, windup: 0.25, shape: bolt(17, 9, 0.3, { count: 3, spread: 30 }), effects: [dmg(22)], vfx: "ink_needle", sfx: "blood" }),
    br("flood", "Potop tuszu", "Fala tuszu zalewająca wszystko przed tobą.", { cd: 18, windup: 0.5, shape: cone(5, 70), effects: [dmg(72, 70), st("slow", 2, 0.4)], vfx: "ink_flood", sfx: "blood_heavy" }),
  ],
  passives: rows("brush", {
    rider: ["bleed", 3, 2, "Krwawy tusz"],
    form: { name: "Igła żurawia", description: "Kreska przebija pierwszego wroga.", vfx: "ink_needle_crane" },
    wide: p("brush_more", "Druga kreska", "Kreska wylatuje podwójnie.", { kind: "projectiles", add: 1, slot: "basic" }),
    keystone: [
      p("brush_master", "Mistrz kaligrafii", "Umiejętności pędzla zadają 18% więcej obrażeń.", { kind: "damage", pct: 0.18 }),
      p("brush_haste", "Szybka ręka", "Wszystkie umiejętności pędzla odnawiają się o 18% szybciej.", { kind: "cooldown", pct: -0.18 }),
    ],
  }),
};
// The Crane form makes the stroke pierce.
brush.passives[2][0].mods.push({ kind: "pierce", slot: "basic" });

const t = maker("talismans", "cast");
const talismans: WeaponDef = {
  id: "talismans",
  name: "Talizmany",
  blurb: "Plik papierowych talizmanów z modlitwą, która płonie. Rzucasz, a one wybuchają.",
  grip: "pair",
  anim: "cast",
  range: "ranged",
  basic: t("throw", "Płonący talizman", "Rzucony talizman wybucha płomieniem.", { cd: 0.55, windup: 0.14, shape: bolt(14, 9, 0.35), effects: [dmg(14), st("burn", 3, 2)], vfx: "ink_talisman", sfx: "fire", fire: true }),
  rmb: [
    t("fan", "Wachlarz talizmanów", "Pięć talizmanów naraz, wachlarzem.", { cd: 5, windup: 0.25, shape: bolt(15, 7, 0.3, { count: 5, spread: 50 }), effects: [dmg(14), st("burn", 3, 2)], vfx: "ink_talisman", sfx: "fire", fire: true }),
    t("ward", "Krąg pieczęci", "Krąg talizmanów płonie na ziemi.", { cd: 8, windup: 0.35, shape: circle(2.4, "aim", 8), effects: [dmg(20), { kind: "zone", radius: 2.4, duration: 4, dps: 10, status: "burn", statusDuration: 2 }], vfx: "ink_ring_fire", sfx: "fire_heavy", fire: true }),
  ],
  key: [
    t("mine", "Papierowa mina", "Talizman przyklejony do ziemi wybucha pod wrogami.", { cd: 10, windup: 0.3, shape: circle(1.8, "aim", 7), effects: [dmg(52, 55), st("burn", 3, 3)], vfx: "ink_burst_fire", sfx: "fire_heavy", fire: true }),
    t("chain", "Łańcuch talizmanów", "Sznur talizmanów przelatuje przez szereg wrogów.", { cd: 7, windup: 0.25, shape: bolt(16, 12, 0.4, { pierce: true }), effects: [dmg(34), st("burn", 3, 3)], vfx: "ink_talisman_chain", sfx: "fire", fire: true }),
    t("phoenix", "Popielny ptak", "Ognisty ptak z popiołu przelatuje przez wszystko na drodze.", { cd: 20, windup: 0.5, shape: bolt(11, 13, 0.9, { pierce: true }), effects: [dmg(75, 70), st("burn", 5, 5)], vfx: "ink_phoenix", sfx: "fire_heavy", fire: true }),
  ],
  passives: rows("talismans", {
    rider: ["burn", 3, 3, "Smoła"],
    form: { name: "Lisi ogień", description: "Talizman wybucha szerzej i oślepia na chwilę.", vfx: "ink_talisman_fox", effect: st("slow", 1, 0.3) },
    wide: p("talismans_more", "Gruby plik", "Talizman leci podwójnie.", { kind: "projectiles", add: 1, slot: "basic" }),
    keystone: [
      p("talismans_pyro", "Piroman", "Umiejętności talizmanów zadają 18% więcej obrażeń.", { kind: "damage", pct: 0.18 }),
      p("talismans_storm", "Burza papieru", "Wachlarz i łańcuch wypuszczają o dwa talizmany więcej.", { kind: "projectiles", add: 2, slot: "rmb" }),
    ],
  }),
};

const f = maker("fan", "cast");
const fan: WeaponDef = {
  id: "fan",
  name: "Wachlarz bojowy",
  blurb: "Żelazny wachlarz Klanu Wiatru. Tnie podmuchem, rzuca wiatrem, niesie cię po polu bitwy.",
  grip: "one",
  anim: "cast",
  range: "ranged",
  basic: f("gust", "Cięcie wiatru", "Ostry podmuch z wachlarza.", { cd: 0.45, windup: 0.1, shape: cone(3.4, 50), effects: [dmg(12)], vfx: "ink_gust", sfx: "wind" }),
  rmb: [
    f("blink", "Podmuch", "Wiatr niesie cię kawałek dalej, zostawiając wir.", { cd: 7, windup: 0, shape: circle(1.8), effects: [{ kind: "dash", distance: 4.5 }, dmg(18), st("slow", 2, 0.4)], vfx: "ink_blink", sfx: "wind" }),
    f("blades", "Wirujące ostrza", "Trzy ostrza wiatru przelatują przez wrogów.", { cd: 6, windup: 0.2, shape: bolt(16, 9, 0.35, { count: 3, spread: 40, pierce: true }), effects: [dmg(20)], vfx: "ink_wind_blade", sfx: "wind" }),
  ],
  key: [
    f("gale", "Ściana wichru", "Wichura odrzuca wszystkich przed tobą.", { cd: 10, windup: 0.3, shape: cone(4.2, 120), effects: [dmg(30, 50), { kind: "knockback", distance: 3 }], vfx: "ink_gale", sfx: "wind" }),
    f("updraft", "Wznoszący wir", "Wir wokół ciebie podrzuca i spowalnia.", { cd: 9, windup: 0.25, shape: circle(2.6), effects: [dmg(30, 45), st("slow", 2.5, 0.45)], vfx: "ink_cyclone", sfx: "wind" }),
    f("cyclone", "Cyklon", "Cyklon w miejscu celu wciąga i tnie.", { cd: 15, windup: 0.4, shape: circle(2.8, "aim", 8), effects: [dmg(26), { kind: "zone", radius: 2.8, duration: 5, dps: 14, status: "slow", statusDuration: 1 }], vfx: "ink_cyclone", sfx: "wind" }),
  ],
  passives: rows("fan", {
    rider: ["static", 4, 1, "Iskra w podmuchu"],
    form: { name: "Wiatr sosny", description: "Cięcie wiatru zostawia igły tuszu i odpycha.", vfx: "ink_gust_pine", effect: { kind: "knockback", distance: 0.8 } },
    wide: p("fan_wide", "Szeroki wachlarz", "Cięcie wiatru obejmuje o 30% więcej.", { kind: "reach", pct: 0.3, slot: "basic" }),
    keystone: [
      p("fan_eye", "Oko cyklonu", "Umiejętności wachlarza zadają 16% więcej obrażeń.", { kind: "damage", pct: 0.16 }),
      p("fan_tempo", "Tempo wiatru", "Wszystkie umiejętności wachlarza odnawiają się o 18% szybciej.", { kind: "cooldown", pct: -0.18 }),
    ],
  }),
};

const l = maker("lantern", "cast");
const lantern: WeaponDef = {
  id: "lantern",
  name: "Latarnia duchów",
  blurb: "Latarnia na kiju, która wiąże zmarłych. Ogniki gryzą, dzwon latarni rozrywa, duchy idą orszakiem.",
  grip: "one",
  anim: "cast",
  range: "ranged",
  basic: l("wisp", "Błędny ognik", "Blady ognik z latarni gryzie wroga.", { cd: 0.55, windup: 0.14, shape: bolt(12, 9, 0.35), effects: [dmg(15), st("poison", 3, 2)], vfx: "ink_wisp", sfx: "spirit" }),
  rmb: [
    l("toll", "Dzwon pogrzebowy", "Latarnia bije jak dzwon: duchy rozrywają wszystko wokół.", { cd: 9, windup: 0.35, shape: circle(3.2), effects: [dmg(44, 40)], vfx: "ink_toll", sfx: "bell" }),
    l("chain", "Łańcuch dusz", "Łańcuch duchów przeszywa szereg i spowalnia.", { cd: 5, windup: 0.25, shape: bolt(14, 10, 0.4, { pierce: true }), effects: [dmg(28), st("slow", 2, 0.35)], vfx: "ink_soul_chain", sfx: "spirit" }),
  ],
  key: [
    l("rot", "Zgnilizna", "Chmura grobowego rozkładu.", { cd: 9, windup: 0.35, shape: circle(2.6, "aim", 8), effects: [{ kind: "zone", radius: 2.6, duration: 5, dps: 13, status: "poison", statusDuration: 2 }], vfx: "ink_rot", sfx: "poison" }),
    l("flare", "Rozbłysk latarni", "Latarnia rozbłyska: rani i osłabia wokół.", { cd: 10, windup: 0.3, shape: circle(3), effects: [dmg(32, 30), st("weaken", 4)], vfx: "ink_flare", sfx: "spirit_heavy" }),
    l("procession", "Orszak duchów", "Pięć duchów rusza wachlarzem przed tobą.", { cd: 14, windup: 0.4, shape: bolt(10, 10, 0.45, { count: 5, spread: 70 }), effects: [dmg(24), st("poison", 3, 3)], vfx: "ink_wisp", sfx: "spirit_heavy" }),
  ],
  passives: rows("lantern", {
    rider: ["weaken", 2, 1, "Zimny dotyk"],
    form: { name: "Ćma", description: "Ognik leci szybciej i spowalnia.", vfx: "ink_wisp_moth", effect: st("slow", 1.2, 0.3) },
    wide: p("lantern_more", "Dwa ogniki", "Ognik wylatuje podwójnie.", { kind: "projectiles", add: 1, slot: "basic" }),
    keystone: [
      p("lantern_keeper", "Strażnik", "Umiejętności latarni zadają 16% więcej obrażeń.", { kind: "damage", pct: 0.16 }),
      p("lantern_vigil", "Czuwanie", "Wszystkie umiejętności latarni odnawiają się o 18% szybciej.", { kind: "cooldown", pct: -0.18 }),
    ],
  }),
};

// ------------------------------------------------------------------------------------- ranged

const w = maker("bow", "cast");
const bow: WeaponDef = {
  id: "bow",
  name: "Łuk",
  blurb: "Asymetryczny łuk stepu, dłuższy niż strzelec. Najdalszy zasięg: strzały, salwy, przyszpilanie.",
  grip: "bow",
  anim: "cast",
  range: "ranged",
  basic: w("arrow", "Strzała", "Szybki strzał z łuku.", { cd: 0.5, windup: 0.16, shape: bolt(24, 12, 0.25), effects: [dmg(25)], vfx: "ink_arrow", sfx: "bow" }),
  rmb: [
    w("hunter", "Strzała łowcy", "Ciężka strzała przebijająca wszystko; rozdziera naznaczonych.", { cd: 8, windup: 0.45, shape: bolt(30, 14, 0.35, { pierce: true }), effects: [dmg(50, 50), { kind: "detonate", status: "mark", damage: 50 }], vfx: "ink_arrow_heavy", sfx: "bow_heavy" }),
    w("split", "Rozszczepiona strzała", "Trzy strzały naraz.", { cd: 4, windup: 0.25, shape: bolt(24, 11, 0.25, { count: 3, spread: 20 }), effects: [dmg(22)], vfx: "ink_arrow", sfx: "bow" }),
  ],
  key: [
    w("volley", "Grad strzał", "Deszcz strzał w miejsce celu.", { cd: 10, windup: 0.4, shape: circle(2.6, "aim", 11), effects: [dmg(46), st("slow", 2, 0.35)], vfx: "ink_volley", sfx: "bow_heavy" }),
    w("pin", "Przyszpilenie", "Strzała przybija wroga do ziemi.", { cd: 8, windup: 0.3, shape: bolt(26, 12, 0.3), effects: [dmg(36, 40), st("rooted", 1.6)], vfx: "ink_arrow_heavy", sfx: "bow_heavy" }),
    w("barrage", "Nawała", "Ulewa strzał na szerokim obszarze.", { cd: 16, windup: 0.5, shape: circle(3.2, "aim", 12), effects: [dmg(72, 50)], vfx: "ink_volley", sfx: "bow_heavy" }),
  ],
  passives: rows("bow", {
    rider: ["mark", 3, 0.12, "Grot łowcy"],
    form: { name: "Strzała jastrzębia", description: "Strzała przebija pierwszego wroga.", vfx: "ink_arrow_hawk" },
    wide: p("bow_more", "Dwie cięciwy", "Strzała wylatuje podwójnie.", { kind: "projectiles", add: 1, slot: "basic" }),
    keystone: [
      p("bow_eye", "Sokole oko", "Umiejętności łuku zadają 16% więcej obrażeń i sięgają dalej.", { kind: "damage", pct: 0.16 }, { kind: "reach", pct: 0.15 }),
      p("bow_quick", "Szybki naciąg", "Wszystkie umiejętności łuku odnawiają się o 18% szybciej.", { kind: "cooldown", pct: -0.18 }),
    ],
  }),
};
bow.passives[2][0].mods.push({ kind: "pierce", slot: "basic" });

const k = maker("knives", "cast");
const knives: WeaponDef = {
  id: "knives",
  name: "Noże do rzucania",
  blurb: "Pas cienkich noży i dmuchawka. Średni dystans, ciągły ruch, krew i trucizna.",
  grip: "pair",
  anim: "cast",
  range: "ranged",
  basic: k("throw", "Rzut nożem", "Dwa noże, jeden po drugim.", { cd: 0.4, windup: 0.1, shape: bolt(20, 8, 0.25, { count: 2, spread: 8 }), effects: [dmg(19)], vfx: "ink_knife", sfx: "throw" }),
  rmb: [
    k("fan", "Wachlarz noży", "Pięć noży wachlarzem.", { cd: 5, windup: 0.2, shape: bolt(18, 7, 0.25, { count: 5, spread: 60 }), effects: [dmg(20), st("bleed", 3, 2)], vfx: "ink_knife", sfx: "throw" }),
    k("dart", "Zatruta strzałka", "Dmuchawka: strzałka z gęstą trucizną.", { cd: 3, windup: 0.2, shape: bolt(26, 11, 0.25), effects: [dmg(16), st("poison", 6, 6)], vfx: "ink_dart", sfx: "blowpipe" }),
  ],
  key: [
    k("hamstring", "Rzut w ścięgna", "Nóż w nogi: krwawienie i spowolnienie.", { cd: 6, windup: 0.2, shape: bolt(22, 9, 0.3), effects: [dmg(34), st("bleed", 4, 3), st("slow", 2.5, 0.45)], vfx: "ink_knife", sfx: "throw" }),
    k("ricochet", "Rykoszet", "Dwa noże, które przelatują przez wrogów.", { cd: 7, windup: 0.2, shape: bolt(20, 10, 0.3, { count: 2, spread: 10, pierce: true }), effects: [dmg(26)], vfx: "ink_knife", sfx: "throw" }),
    k("rain", "Deszcz ostrzy", "Garść noży spada na wskazane miejsce.", { cd: 13, windup: 0.35, shape: circle(2.6, "aim", 8), effects: [dmg(48), st("poison", 4, 3)], vfx: "ink_volley_knives", sfx: "throw" }),
  ],
  passives: rows("knives", {
    rider: ["poison", 3, 2, "Natarte ostrza"],
    form: { name: "Skrzydło jaskółki", description: "Noże lecą łukiem i przebijają.", vfx: "ink_knife_swallow" },
    wide: p("knives_more", "Trzeci nóż", "Rzut nożem wypuszcza nóż więcej.", { kind: "projectiles", add: 1, slot: "basic" }),
    keystone: [
      p("knives_venom", "Mistrz jadów", "Umiejętności noży zadają 16% więcej obrażeń.", { kind: "damage", pct: 0.16 }),
      p("knives_flow", "Ciągły ruch", "Wszystkie umiejętności noży odnawiają się o 18% szybciej.", { kind: "cooldown", pct: -0.18 }),
    ],
  }),
};
knives.passives[2][0].mods.push({ kind: "pierce", slot: "basic" });

export const WEAPONS: Record<WeaponId, WeaponDef> = { blades, glaive, greatblade, brush, talismans, fan, lantern, bow, knives };
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** Every weapon skill by id (for clients resolving a fx event to its skill). */
export const WEAPON_SKILLS: Map<string, SkillDef> = new Map(
  Object.values(WEAPONS).flatMap((wd) => [wd.basic, ...wd.rmb, ...wd.key].map((s) => [s.id, s] as const)),
);
