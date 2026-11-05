import type { Effect, PathDef, PathId, Shape, SkillAnim, SkillDef, StatusId } from "../combat/types.js";

/**
 * The eight paths (design.md §4): 2 melee, 4 magic, 2 ranged. No healers or pure tanks: every path
 * deals real damage, keeps itself alive its own way, and has a combo that makes the partner's
 * effects worth more. Slot 0 is the basic attack (LPM), slot 1 the right mouse button, 2–5 keys 1–4.
 * Numbers are tuned with the balance simulation (server/src/game/sim.test.ts).
 */

const dmg = (amount: number, poise = amount * 0.6): Effect => ({ kind: "damage", amount, poise });
const st = (status: StatusId, duration: number, value?: number, target: "enemy" | "self" | "partner" = "enemy"): Effect => ({ kind: "status", status, duration, value, target });

function skill(
  id: string,
  name: string,
  description: string,
  o: { cd: number; cost?: number; hp?: number; windup: number; shape: Shape; effects: Effect[]; anim?: SkillAnim; vfx: string; sfx: string },
): SkillDef {
  return { id, name, description, cooldown: o.cd, cost: o.cost ?? 0, hpCost: o.hp, windup: o.windup, shape: o.shape, effects: o.effects, anim: o.anim ?? "skill1", vfx: o.vfx, sfx: o.sfx };
}

const cone = (range: number, arc: number): Shape => ({ kind: "cone", range, arc });
const circle = (radius: number, at: "self" | "aim" = "self", reach?: number): Shape => ({ kind: "circle", radius, at, reach });
const line = (length: number, width: number): Shape => ({ kind: "line", length, width });
const bolt = (speed: number, range: number, radius = 0.35, extra: { pierce?: boolean; count?: number; spread?: number } = {}): Shape => ({ kind: "projectile", speed, range, radius, ...extra });
const self: Shape = { kind: "self" };

export const PATHS: Record<PathId, PathDef> = {
  thorn: {
    id: "thorn",
    name: "Ścieżka Ciernia",
    people: "thorn",
    type: "melee",
    hp: 170,
    speed: 1.08,
    resource: { id: "fury", name: "Furia", max: 100, start: 0, regen: -4, onHit: 7 },
    blurb: "Para zakrzywionych ostrzy, długie i krótkie. Szybkie cięcia, krwawienie, wykończenia, które odcinają kończyny.",
    sustain: "Krwawienie, które zadajesz, leczy cię o część obrażeń.",
    combo: "Żniwo zamienia każde krwawienie na wrogu — także to od partnera — w jeden cios.",
    skills: [
      skill("thorn_cut", "Cięcie ciernia", "Dwa szybkie cięcia przed sobą. Buduje Furię.", { cd: 0.42, windup: 0.12, shape: cone(1.9, 85), effects: [dmg(9), st("bleed", 3, 2)], anim: "attack", vfx: "slash", sfx: "blade" }),
      skill("thorn_draw", "Cięcie z pochwy", "Błyskawiczny doskok i cięcie przez wszystko na linii.", { cd: 6, cost: 25, windup: 0.08, shape: line(4.2, 1.2), effects: [{ kind: "dash", distance: 3.6 }, dmg(36, 40), st("bleed", 4, 3)], anim: "skill2", vfx: "dash_slash", sfx: "blade_heavy" }),
      skill("thorn_whirl", "Wir cierni", "Obrót z oboma ostrzami. Rani wszystko wokół.", { cd: 8, cost: 30, windup: 0.15, shape: circle(2.4), effects: [dmg(20, 30), st("bleed", 4, 3)], anim: "skill1", vfx: "whirl", sfx: "blade_spin" }),
      skill("thorn_harvest", "Żniwo", "Zrywa każde krwawienie z wrogów przed tobą w jednym cięciu.", { cd: 10, cost: 35, windup: 0.2, shape: cone(2.6, 140), effects: [dmg(18), { kind: "detonate", status: "bleed", damage: 26 }], anim: "attack", vfx: "slash_red", sfx: "gore" }),
      skill("thorn_feint", "Zwód", "Odskok w tył zostawiający cięcie. Chwilowy pęd.", { cd: 9, windup: 0.05, shape: cone(2, 100), effects: [dmg(16), { kind: "dash", distance: -3 }, st("haste", 2.5, 0.35, "self")], anim: "skill2", vfx: "slash", sfx: "whoosh" }),
      skill("thorn_oath", "Przysięga ciernia", "Na krótko każde cięcie leczy cię z rozlanej krwi.", { cd: 22, cost: 40, windup: 0.1, shape: self, effects: [st("haste", 6, 0.2, "self"), { kind: "heal", amount: 30, target: "self" }], anim: "skill1", vfx: "oath", sfx: "gong_small" }),
    ],
  },
  bark: {
    id: "bark",
    name: "Ścieżka Kory",
    people: "bark",
    type: "melee",
    hp: 240,
    speed: 0.94,
    resource: { id: "stamina", name: "Wytrzymałość", max: 100, start: 100, regen: 14 },
    blurb: "Ogromne dwuręczne ostrza i korzenie. Wolne, potężne ciosy; ciężko cię powalić.",
    sustain: "Każdy otrzymany cios nakłada na ciebie osłonę z kory.",
    combo: "Korzenie unieruchamiają wrogów — unieruchomieni otrzymują więcej obrażeń od partnera.",
    skills: [
      skill("bark_cleave", "Rąbnięcie", "Szeroki, ciężki zamach.", { cd: 0.85, windup: 0.3, shape: cone(2.4, 130), effects: [dmg(28, 30)], anim: "attack", vfx: "cleave", sfx: "blade_heavy" }),
      skill("bark_roots", "Korzenie", "Korzenie wyrywają się z ziemi i trzymają wrogów w miejscu.", { cd: 9, cost: 30, windup: 0.35, shape: circle(2.4, "aim", 7), effects: [dmg(18), st("rooted", 2.6)], anim: "skill2", vfx: "roots", sfx: "roots" }),
      skill("bark_quake", "Wstrząs", "Uderzenie ostrzem w ziemię. Wszystkich wokół rzuca w tył.", { cd: 10, cost: 35, windup: 0.4, shape: circle(2.8), effects: [dmg(40, 60), { kind: "knockback", distance: 2.2 }], anim: "skill1", vfx: "quake", sfx: "slam" }),
      skill("bark_hide", "Kora", "Gruba osłona z kory wchłania obrażenia.", { cd: 16, cost: 30, windup: 0.1, shape: self, effects: [st("shield", 6, 70, "self")], anim: "skill1", vfx: "bark", sfx: "roots" }),
      skill("bark_charge", "Taran", "Szarża przez wrogów z ostrzem przed sobą.", { cd: 11, cost: 30, windup: 0.15, shape: line(5, 1.6), effects: [{ kind: "dash", distance: 4.5 }, dmg(34, 50), { kind: "knockback", distance: 1.5 }], anim: "skill2", vfx: "dash_slash", sfx: "slam" }),
      skill("bark_grove", "Gaj cierni", "Ciernie wyrastają wokół: ranią i spowalniają, a ciebie i partnera osłaniają.", { cd: 24, cost: 45, windup: 0.4, shape: circle(3.2), effects: [{ kind: "zone", radius: 3.2, duration: 6, dps: 10, status: "slow", statusDuration: 1 }, st("shield", 5, 40, "self"), st("shield", 5, 40, "partner")], anim: "skill1", vfx: "grove", sfx: "roots" }),
    ],
  },
  blood: {
    id: "blood",
    name: "Ścieżka Krwi",
    people: "lacquer",
    type: "magic",
    hp: 150,
    speed: 1.0,
    resource: { id: "none", name: "Krew", max: 0, start: 0, regen: 0 },
    blurb: "Pisarz krwi: pędzlem i własną krwią kreśli pieczęcie. Płaci życiem, pije z ran.",
    sustain: "Pijesz z krwawiących wrogów: twoje zaklęcia leczą cię, gdy cel krwawi.",
    combo: "Krwawienie od Ścieżki Ciernia czy Żądła karmi cię tak samo jak twoje.",
    skills: [
      skill("blood_stroke", "Krwawy znak", "Rzut kroplą krwi zaostrzoną w igłę. Nie kosztuje życia.", { cd: 0.5, windup: 0.14, shape: bolt(16, 9, 0.3), effects: [dmg(10), st("bleed", 3, 2), { kind: "lifesteal", fraction: 0.4, onlyIf: "bleed" }], anim: "attack", vfx: "blood_bolt", sfx: "blood" }),
      skill("blood_lance", "Włócznia krwi", "Przeszywająca włócznia z twojej krwi.", { cd: 4, hp: 10, windup: 0.3, shape: bolt(22, 11, 0.4, { pierce: true }), effects: [dmg(44, 40), st("bleed", 4, 4), { kind: "lifesteal", fraction: 0.5, onlyIf: "bleed" }], anim: "skill1", vfx: "blood_lance", sfx: "blood_heavy" }),
      skill("blood_sigil", "Pieczęć wrzenia", "Pieczęć na ziemi: krew wrogów w niej wrze.", { cd: 9, hp: 12, windup: 0.4, shape: circle(2.4, "aim", 8), effects: [dmg(22), { kind: "zone", radius: 2.4, duration: 4, dps: 14, status: "bleed", statusDuration: 2 }], anim: "attack", vfx: "sigil", sfx: "blood" }),
      skill("blood_drink", "Pić z ran", "Wyrywa krew z krwawiących wrogów wokół i pije ją.", { cd: 10, windup: 0.3, shape: circle(3.6), effects: [{ kind: "detonate", status: "bleed", damage: 26 }, { kind: "lifesteal", fraction: 0.8 }], anim: "skill2", vfx: "drink", sfx: "blood_heavy" }),
      skill("blood_veil", "Zasłona z krwi", "Krwawa mgła: osłona dla ciebie i partnera.", { cd: 18, hp: 15, windup: 0.15, shape: self, effects: [st("shield", 5, 45, "self"), st("shield", 5, 45, "partner")], anim: "skill2", vfx: "veil", sfx: "blood" }),
      skill("blood_flood", "Potop", "Fala krwi zalewająca wszystko przed tobą.", { cd: 20, hp: 22, windup: 0.5, shape: cone(5, 70), effects: [dmg(70, 70), st("bleed", 5, 6), st("slow", 2, 0.4), { kind: "lifesteal", fraction: 0.35, onlyIf: "bleed" }], anim: "skill1", vfx: "flood", sfx: "blood_heavy" }),
    ],
  },
  ash: {
    id: "ash",
    name: "Ścieżka Popiołu",
    people: "ember",
    type: "magic",
    hp: 145,
    speed: 1.0,
    resource: { id: "heat", name: "Żar", max: 100, start: 0, regen: -12, heat: true },
    blurb: "Papierowe talizmany, które buchają ogniem. Płonąca ziemia i wybuchy. Uważaj na przegrzanie.",
    sustain: "Ogień, który pali wrogów, oddaje ci część żaru jako życie.",
    combo: "Zapłon wybucha na każdym zatrutym wrogu — trucizna Żądła czy Grobów to opał.",
    skills: [
      skill("ash_talisman", "Płonący talizman", "Rzucony talizman wybucha płomieniem.", { cd: 0.55, cost: 4, windup: 0.14, shape: bolt(14, 9, 0.35), effects: [dmg(14), st("burn", 3, 3)], anim: "attack", vfx: "fire_bolt", sfx: "fire" }),
      skill("ash_fan", "Wachlarz iskier", "Pięć talizmanów naraz, wachlarzem.", { cd: 5, cost: 18, windup: 0.25, shape: bolt(15, 7, 0.3, { count: 5, spread: 50 }), effects: [dmg(15), st("burn", 3, 3)], anim: "skill1", vfx: "fire_bolt", sfx: "fire" }),
      skill("ash_pyre", "Stos", "Ziemia w miejscu celu zaczyna płonąć.", { cd: 8, cost: 22, windup: 0.4, shape: circle(2.5, "aim", 8), effects: [dmg(24), { kind: "zone", radius: 2.5, duration: 5, dps: 13, status: "burn", statusDuration: 2 }], anim: "skill2", vfx: "pyre", sfx: "fire_heavy" }),
      skill("ash_ignite", "Zapłon", "Każda trucizna i płomień na wrogach wokół wybucha naraz.", { cd: 9, cost: 20, windup: 0.3, shape: circle(4), effects: [{ kind: "detonate", status: "poison", damage: 40 }, { kind: "detonate", status: "burn", damage: 22 }], anim: "skill2", vfx: "ignite", sfx: "fire_heavy" }),
      skill("ash_vent", "Upust żaru", "Zrzucasz żar w podmuchu ognia wokół siebie.", { cd: 12, cost: -45, windup: 0.2, shape: circle(2.6), effects: [dmg(30, 30), st("burn", 3, 4), { kind: "knockback", distance: 1.5 }], anim: "skill1", vfx: "nova_fire", sfx: "fire_heavy" }),
      skill("ash_phoenix", "Popielny ptak", "Ognisty ptak z popiołu przelatuje przez wszystko na drodze.", { cd: 20, cost: 35, windup: 0.5, shape: bolt(11, 13, 0.9, { pierce: true }), effects: [dmg(75, 70), st("burn", 5, 6)], anim: "skill1", vfx: "phoenix", sfx: "fire_heavy" }),
    ],
  },
  storm: {
    id: "storm",
    name: "Ścieżka Burzy",
    people: "wind",
    type: "magic",
    hp: 150,
    speed: 1.1,
    resource: { id: "charge", name: "Ładunek", max: 100, start: 30, regen: 2, onMove: 6, onHit: 3 },
    blurb: "Wachlarze bojowe rzucające wiatr i błyskawice. Najszybszy z magów: ładunek zbierasz w ruchu.",
    sustain: "Gdy masz dużo ładunku, wokół ciebie wiruje statyczna osłona.",
    combo: "Naznaczasz wrogów ładunkiem; trafienie partnera przeskakuje błyskawicą.",
    skills: [
      skill("storm_gust", "Cięcie wiatru", "Ostry podmuch z wachlarza.", { cd: 0.45, windup: 0.1, shape: cone(3.4, 50), effects: [dmg(12), st("static", 4)], anim: "attack", vfx: "gust", sfx: "wind" }),
      skill("storm_bolt", "Piorun", "Błyskawica w cel, przeskakuje na ładunki statyczne.", { cd: 3.5, cost: 22, windup: 0.2, shape: line(9, 1.0), effects: [dmg(30, 20), { kind: "detonate", status: "static", damage: 20 }], anim: "skill1", vfx: "lightning", sfx: "thunder" }),
      skill("storm_blink", "Podmuch", "Wiatr niesie cię kawałek dalej, zostawiając wir.", { cd: 7, cost: 15, windup: 0.0, shape: circle(1.8), effects: [{ kind: "dash", distance: 4.5 }, dmg(16), st("slow", 2, 0.4)], anim: "skill2", vfx: "blink", sfx: "wind" }),
      skill("storm_wall", "Ściana wichru", "Wichura odrzuca wszystkich przed tobą.", { cd: 10, cost: 30, windup: 0.3, shape: cone(4.2, 120), effects: [dmg(28, 50), { kind: "knockback", distance: 3 }], anim: "skill2", vfx: "gale", sfx: "wind" }),
      skill("storm_ward", "Statyczna osłona", "Wiatr i iskry wokół ciebie wchłaniają ciosy.", { cd: 15, cost: 30, windup: 0.1, shape: self, effects: [st("shield", 6, 55, "self"), st("haste", 4, 0.25, "self")], anim: "skill1", vfx: "ward", sfx: "thunder" }),
      skill("storm_tempest", "Nawałnica", "Burza nad wskazanym miejscem: pioruny biją raz za razem.", { cd: 20, cost: 50, windup: 0.5, shape: circle(3, "aim", 9), effects: [dmg(30), { kind: "zone", radius: 3, duration: 5, dps: 18, status: "static", statusDuration: 2 }], anim: "skill1", vfx: "tempest", sfx: "thunder" }),
    ],
  },
  graves: {
    id: "graves",
    name: "Ścieżka Grobów",
    people: "lantern",
    type: "magic",
    hp: 155,
    speed: 0.98,
    resource: { id: "ash", name: "Popiół", max: 100, start: 40, regen: 5, onHit: 5, onDeathNearby: 22 },
    blurb: "Latarnia, która wiąże duchy. Podnosisz Szarych, by walczyli dla ciebie. Trupy to twój zasób.",
    sustain: "Wysysasz życie z przywołanych sług.",
    combo: "Klątwa sprawia, że przeklęci otrzymują więcej obrażeń od każdego.",
    skills: [
      skill("graves_wisp", "Błędny ognik", "Blady ognik z latarni gryzie najbliższego wroga.", { cd: 0.55, windup: 0.14, shape: bolt(12, 9, 0.35), effects: [dmg(17), st("poison", 3, 3)], anim: "attack", vfx: "wisp", sfx: "spirit" }),
      skill("graves_raise", "Powstańcie", "Podnosi dwóch Szarych, którzy walczą u twego boku.", { cd: 14, cost: 40, windup: 0.5, shape: self, effects: [{ kind: "summon", count: 2, duration: 18 }], anim: "skill1", vfx: "raise", sfx: "spirit_heavy" }),
      skill("graves_curse", "Klątwa", "Przeklina wrogów w miejscu: otrzymują więcej obrażeń i chudną z sił.", { cd: 8, cost: 20, windup: 0.3, shape: circle(2.6, "aim", 8), effects: [st("weaken", 6), st("poison", 4, 3)], anim: "skill2", vfx: "curse", sfx: "spirit" }),
      skill("graves_rot", "Zgnilizna", "Chmura grobowego rozkładu.", { cd: 9, cost: 22, windup: 0.35, shape: circle(2.6, "aim", 8), effects: [{ kind: "zone", radius: 2.6, duration: 5, dps: 12, status: "poison", statusDuration: 2 }], anim: "skill2", vfx: "rot", sfx: "poison" }),
      skill("graves_toll", "Dzwon pogrzebowy", "Latarnia bije jak dzwon: duchy rozrywają wszystko wokół.", { cd: 11, cost: 30, windup: 0.35, shape: circle(3.2), effects: [dmg(46, 40), { kind: "detonate", status: "poison", damage: 24 }], anim: "skill1", vfx: "toll", sfx: "bell" }),
      skill("graves_feast", "Uczta", "Wysysa życie z wrogów przed tobą i dzieli je z partnerem.", { cd: 16, cost: 35, windup: 0.4, shape: cone(4, 80), effects: [dmg(34), { kind: "lifesteal", fraction: 0.6 }, { kind: "heal", amount: 18, target: "partner" }], anim: "skill1", vfx: "feast", sfx: "spirit_heavy" }),
    ],
  },
  dusk: {
    id: "dusk",
    name: "Ścieżka Zmierzchu",
    people: "dusk",
    type: "ranged",
    hp: 150,
    speed: 1.04,
    resource: { id: "focus", name: "Skupienie", max: 100, start: 60, regen: 15 },
    blurb: "Asymetryczny łuk stepu. Pułapki, ukrycie, strzały z ciemności.",
    sustain: "W ukryciu szybko wracasz do sił.",
    combo: "Naznaczony cel otrzymuje więcej obrażeń od partnera; Strzała łowcy zrywa naznaczenie.",
    skills: [
      skill("dusk_arrow", "Strzała", "Szybki strzał z łuku.", { cd: 0.5, windup: 0.16, shape: bolt(24, 12, 0.25), effects: [dmg(21)], anim: "attack", vfx: "arrow", sfx: "bow" }),
      skill("dusk_mark", "Naznaczenie", "Strzała znacząca cel: wszyscy ranią go mocniej.", { cd: 6, cost: 20, windup: 0.25, shape: bolt(26, 13, 0.3), effects: [dmg(24), st("mark", 8, 0.25)], anim: "skill1", vfx: "arrow_mark", sfx: "bow" }),
      skill("dusk_hunter", "Strzała łowcy", "Ciężka strzała, która rozdziera naznaczonych.", { cd: 8, cost: 30, windup: 0.45, shape: bolt(30, 14, 0.35, { pierce: true }), effects: [dmg(50, 50), { kind: "detonate", status: "mark", damage: 60 }], anim: "skill1", vfx: "arrow_heavy", sfx: "bow_heavy" }),
      skill("dusk_volley", "Grad strzał", "Deszcz strzał w miejsce celu.", { cd: 10, cost: 35, windup: 0.4, shape: circle(2.6, "aim", 11), effects: [dmg(44), st("slow", 2, 0.35)], anim: "skill1", vfx: "volley", sfx: "bow_heavy" }),
      skill("dusk_snare", "Sidła", "Rzucone sidła unieruchamiają i ranią.", { cd: 9, cost: 20, windup: 0.25, shape: circle(1.8, "aim", 7), effects: [dmg(14), st("rooted", 2.5), { kind: "zone", radius: 1.8, duration: 4, dps: 6, status: "slow", statusDuration: 1 }], anim: "skill2", vfx: "snare", sfx: "throw" }),
      skill("dusk_fade", "Zmierzch", "Znikasz w półmroku i odskakujesz.", { cd: 16, cost: 25, windup: 0.0, shape: self, effects: [{ kind: "dash", distance: -3.5 }, st("stealth", 4, 0, "self"), st("haste", 4, 0.3, "self")], anim: "skill2", vfx: "fade", sfx: "whoosh" }),
    ],
  },
  sting: {
    id: "sting",
    name: "Ścieżka Żądła",
    people: "reed",
    type: "ranged",
    hp: 155,
    speed: 1.08,
    resource: { id: "doses", name: "Dawki", max: 5, start: 5, regen: 0.6 },
    blurb: "Noże do rzucania, dmuchawka, trucizny, dym. Średni dystans i ciągły ruch.",
    sustain: "Odtrutka: oczyszcza cię z trucizn i leczy.",
    combo: "Trucizna na płonącym wrogu wrze — Ścieżka Popiołu ją podpali, a Żniwo i Zapłon zerwą.",
    skills: [
      skill("sting_knife", "Rzut nożem", "Dwa noże, jeden po drugim.", { cd: 0.4, windup: 0.1, shape: bolt(20, 8, 0.25, { count: 2, spread: 8 }), effects: [dmg(12), st("poison", 3, 2)], anim: "attack", vfx: "knife", sfx: "throw" }),
      skill("sting_dart", "Zatruta strzałka", "Dmuchawka: strzałka z gęstą trucizną.", { cd: 3, cost: 1, windup: 0.2, shape: bolt(26, 11, 0.25), effects: [dmg(16), st("poison", 6, 8)], anim: "skill2", vfx: "dart", sfx: "blowpipe" }),
      skill("sting_fan", "Wachlarz noży", "Pięć noży wachlarzem.", { cd: 5, cost: 1, windup: 0.2, shape: bolt(18, 7, 0.25, { count: 5, spread: 60 }), effects: [dmg(18), st("poison", 3, 2), st("bleed", 3, 2)], anim: "skill2", vfx: "knife", sfx: "throw" }),
      skill("sting_smoke", "Bomba dymna", "Dym oślepia i spowalnia wrogów; ty znikasz.", { cd: 12, cost: 1, windup: 0.15, shape: circle(2.5), effects: [st("slow", 3, 0.5), st("stealth", 3, 0, "self"), { kind: "zone", radius: 2.5, duration: 4, dps: 4, status: "slow", statusDuration: 1 }], anim: "skill2", vfx: "smoke", sfx: "smoke" }),
      skill("sting_boil", "Wrzący jad", "Trucizna we wszystkich wokół wrze naraz.", { cd: 9, cost: 2, windup: 0.3, shape: circle(3.5), effects: [{ kind: "detonate", status: "poison", damage: 38 }, st("bleed", 3, 3)], anim: "skill1", vfx: "boil", sfx: "poison" }),
      skill("sting_antidote", "Odtrutka", "Oczyszcza cię i leczy; następne noże są szybsze.", { cd: 18, cost: 1, windup: 0.0, shape: self, effects: [{ kind: "heal", amount: 45, target: "self" }, st("haste", 4, 0.3, "self")], anim: "skill1", vfx: "antidote", sfx: "drink" }),
    ],
  },
};

export const PATH_IDS = Object.keys(PATHS) as PathId[];

export const PEOPLES: { id: import("../combat/types.js").PeopleId; name: string }[] = [
  { id: "lacquer", name: "Lakowy Dwór" },
  { id: "thorn", name: "Klan Ciernia" },
  { id: "bark", name: "Klasztory Kory" },
  { id: "reed", name: "Lud Trzcin" },
  { id: "dusk", name: "Jeźdźcy Zmierzchu" },
  { id: "ember", name: "Lud Żaru" },
  { id: "wind", name: "Klan Wiatru" },
  { id: "lantern", name: "Strażnicy Latarni" },
];
