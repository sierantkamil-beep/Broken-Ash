import type { Cinematic } from "../cinematic.js";
import { scene } from "./scene.js";

/*
 * The scenes of Act 1 (design.md §3). Tone: Itheru kind and dry, Maeve foul-mouthed and warm, the
 * narration cold. The players are addressed as "wy" without gendered verb forms (they may be any two
 * people). Camera positions are cells of the area each scene plays in.
 */

const ITHERU = "Itheru";
const MAEVE = "Maeve";

/** Pień, the first thing you see: the title over your cell, then the dead begin to move. */
const CELLS_INTRO = scene({
  id: "cells_intro",
  cam: [4, 9.5, 1.3],
  fromBlack: true,
  desaturate: 0.3,
  title: { dur: 6000, title: "BROKEN ASH", subtitle: "Aeldrith. Dziewiętnaście lat po Złamaniu." },
  events: [
    { t: 800, kind: "sound", key: "sfx_title_gong", volume: 0.9 },
    { t: 3000, kind: "sound", key: "sfx_bell", volume: 0.4 },
  ],
  lines: [
    { text: "Pień. Lochy pod Twierdzą Soramei, gdzie Popielnych upuszcza się z żywicy aż do śmierci.", cam: [5, 9.5, 1.2] },
    { text: "Kraty waszej celi pękły godzinę temu. Strażnicy nie wrócili.", cam: [15, 9, 1.05] },
    { speaker: "Głos z sąsiedniej celi", text: "Słyszycie? Oni już nie krzyczą. Oni wstają.", cam: [3.5, 4, 1.3], events: [{ t: 400, kind: "sound", key: "sfx_groan_1", volume: 0.8 }] },
    { text: "Na górze bije dzwon. Tu, na dole, martwi zaczynają chodzić.", cam: [4, 9.5, 1.25], events: [{ t: 0, kind: "sound", key: "sfx_bell", volume: 0.6 }] },
  ],
});

/** The gate held: Itheru's squire gets you out of the keep, on purpose. */
const ESCAPE = scene({
  id: "escape",
  cam: [14.5, 6, 1.2],
  toBlack: true,
  lines: [
    { speaker: "Fenshō, giermek", text: "Wy! Tak, wy, z popiołem na czołach. Pan Itheru chce was żywych." },
    { speaker: "Fenshō, giermek", text: "Brama padła, ale mury trzymają. Za mną, przez furtkę w bambusach, zanim przyjdą następni.", cam: [26, 14, 1.1] },
    { text: "Nikt nie ucieka z Pnia. Chyba że ktoś na górze bardzo tego chce.", cam: [26.5, 14, 1.2] },
  ],
  onEnd: { flags: ["escaped"], travel: { to: "farmstead", spawn: 0 } },
});

/** Pogorzelisko: Itheru gives you the farmstead and a purpose; Maeve. */
const FARM_INTRO = scene({
  id: "farm_intro",
  cam: [15, 14, 1.05],
  fromBlack: true,
  lines: [
    { text: "Pogorzelisko. Gospodarstwo spalone przez Szarych zeszłej zimy. Nikt się o nie nie upomni." },
    { speaker: ITHERU, text: "Witajcie. Nazywam się Itheru, z rodu Soramei. To ja kazałem otworzyć wasze kraty.", cam: [13.5, 15, 1.35] },
    { speaker: ITHERU, text: "Prawo uznaje was za martwych. Dla mnie to zaleta: martwych nikt nie szuka i nikt nie przesłuchuje." },
    { speaker: ITHERU, text: "Dostaniecie dach, chleb i miecz. W zamian zrobicie to, czego nie mogą zrobić moi rycerze." },
    { speaker: MAEVE, text: "Dach? Panie, ta chata nie ma dachu. Ma za to cholernie dużo nieba.", cam: [17.6, 15.4, 1.35] },
    { speaker: ITHERU, text: "To Maeve, zwana Rdzą. Najemniczka. Klnie gorzej niż flisak, ale nie chybia.", cam: [15.5, 15, 1.25] },
    { speaker: MAEVE, text: "Chybiam. Tylko nikt, kto to widział, już o tym nie opowie.", cam: [17.6, 15.4, 1.35] },
    { speaker: ITHERU, text: "Na wschodzie jest zatopiona kopalnia żywicy. Ktoś tam znowu pompuje. Dowiedzcie się, kto.", cam: [13.5, 15, 1.35] },
    { speaker: ITHERU, text: "I wróćcie żywi, jeśli to nie za duży kłopot.", cam: [15, 15, 1.2] },
  ],
});

const ITHERU_TALK = scene({
  id: "itheru_talk",
  cam: [13.5, 15, 1.4],
  lead: 700,
  lines: [
    { speaker: ITHERU, text: "Kopalnia jest na wschód stąd. Uważajcie na wodę. W tej kopalni topili się ludzie, a utopieni nie lubią samotności." },
    { speaker: ITHERU, text: "Pompy stoją na dwóch krańcach chodnika. Jedna osoba ich nie ruszy. Dwie, w tej samej chwili, może tak." },
  ],
});

const ITHERU_ROAD = scene({
  id: "itheru_road",
  cam: [13.5, 15, 1.4],
  lead: 700,
  lines: [
    { speaker: ITHERU, text: "Klatki pełne naszych. Upuszczanych jak drzewa. Ktoś z wysokiego rodu za to zapłaci." },
    { speaker: ITHERU, text: "Na trakcie na zachodzie krążą zwiadowcy Harrowa. Ludzie z Żelaznej Marchii. Przepędźcie ich, zanim znajdą to miejsce." },
  ],
});

const MAEVE_TALK = scene({
  id: "maeve_talk",
  cam: [17.6, 15.4, 1.4],
  lead: 700,
  lines: [
    { speaker: MAEVE, text: "Czego? Jak chodzi o uczucia, to zły adres. Jak o wódkę, to też." },
    { speaker: MAEVE, text: "Stary jest w porządku. Za dobry na ten świat, i to mnie, kurwa, martwi." },
    { speaker: MAEVE, text: "A jak zginiecie w tej kopalni, zabieram wasze buty. Bez urazy." },
  ],
});

const FREED_TALK = scene({
  id: "freed_talk",
  cam: [9.5, 17.5, 1.4],
  lead: 700,
  lines: [
    { speaker: "Uwolniona", text: "Zostaniemy tu, jeśli pozwolicie. Umiemy budować, a nie mamy już dokąd wracać." },
    { speaker: "Uwolniona", text: "Na beczkach w kopalni był znak rodu Velaren. Wysokiego rodu z Dworu Laki. Zapamiętajcie to." },
  ],
});

/** The sap-mine, the first time. */
const MINE_INTRO = scene({
  id: "mine_intro",
  cam: [5, 27, 1.2],
  fromBlack: true,
  lines: [
    { text: "Zatopiona Kopalnia Żywicy. Zamknięta od Złamania. Woda, która tu stoi, pachnie słodko." },
    { text: "Gdzieś w głębi chodzą pompy. Ktoś tu wciąż upuszcza żywicę. Tylko z czego?", cam: [18, 22, 0.95] },
  ],
});

/** The Tapper falls; the cages. */
const TAPPER_DEAD = scene({
  id: "tapper_dead",
  cam: [18, 5, 1.15],
  lines: [
    { text: "Upuszczacz pada. Wąż jego pompy wciąż ssie, choć nie ma już z czego." },
    { speaker: "Głos z klatki", text: "Tutaj! Na litość korzeni, tutaj!", cam: [12.5, 2.5, 1.35], events: [{ t: 0, kind: "shake", intensity: 0.003, dur: 300 }] },
    { text: "W klatkach siedzą elfy. W ich żyły wbito kraniki, jak w pnie drzew." },
  ],
});

const CAPTIVES_FREE = scene({
  id: "captives_free",
  cam: [12.5, 2.8, 1.4],
  lead: 700,
  lines: [
    { speaker: "Więzień", text: "Myśleliśmy, że nikt nie przyjdzie. Że wszyscy uważają nas za zmarłych." },
    { text: "Uwolnieni idą za wami, chwiejnie, w stronę Pogorzeliska." },
  ],
  onEnd: { flags: ["captives_saved"] },
});

/** The forest road, the first time. */
const ROAD_INTRO = scene({
  id: "road_intro",
  cam: [6, 10, 1.1],
  fromBlack: true,
  lines: [
    { text: "Trakt Harrowa. Kiedyś szlak kupców. Dziś wydeptany przez buty ludzi z Żelaznej Marchii." },
    { text: "Na wschodzie dym z ogniska. Zwiadowcy nie kryją się nawet w cudzym lesie.", cam: [31, 10, 1.05] },
  ],
});

/** The scouts beaten: what do you do with them? Harrow remembers either way (Act 5). */
const SCOUTS_CHOICE = scene({
  id: "scouts_choice",
  cam: [32, 10, 1.3],
  desaturate: 0.2,
  lines: [
    { text: "Ostatni zwiadowcy klęczą w błocie. Ludzie: brody, stal, strach w oczach." },
    { speaker: "Zwiadowca Marchii", text: "Margrabia Harrow dotrzymuje słowa. Puśćcie nas, a zapamięta. Zabijcie, a też zapamięta." },
  ],
  choice: {
    prompt: "Co zrobić ze zwiadowcami?",
    options: [
      { label: "Ściąć ich", flag: "scouts_executed", then: "scouts_dead" },
      { label: "Puścić wolno", flag: "scouts_spared", then: "scouts_free" },
    ],
  },
  onEnd: { flags: ["scouts_decided"] },
});

const SCOUTS_DEAD = scene({
  id: "scouts_dead",
  cam: [32, 10, 1.35],
  desaturate: 0.4,
  toBlack: true,
  lead: 500,
  lines: [
    { text: "Stal schodzi dwa razy. Błoto pije krew tak samo chętnie jak żywicę.", events: [{ t: 0, kind: "sound", key: "sfx_execute", volume: 1 }, { t: 0, kind: "flash", color: 0x8a0a10, dur: 400 }] },
    { text: "Harrow się dowie. Harrow zawsze się dowiaduje." },
  ],
  onEnd: { travel: { to: "farmstead", spawn: 4 }, next: "downer" },
});

const SCOUTS_FREE = scene({
  id: "scouts_free",
  cam: [32, 10, 1.35],
  toBlack: true,
  lead: 500,
  lines: [
    { speaker: "Zwiadowca Marchii", text: "Elfy, które znają litość. Margrabia w to nie uwierzy." },
    { text: "Uciekają w las, nie oglądając się za siebie. Harrow się dowie." },
  ],
  onEnd: { travel: { to: "farmstead", spawn: 4 }, next: "downer" },
});

/** The downer: the North-Grove burns, Itheru is summoned to the capital and goes. End of Act 1. */
const DOWNER = scene({
  id: "downer",
  cam: [15, 9, 0.95],
  fromBlack: true,
  desaturate: 0.55,
  events: [
    { t: 0, kind: "sound", key: "sfx_fire_heavy", volume: 0.6 },
    { t: 400, kind: "petals", amount: 60 },
  ],
  lines: [
    { text: "Wracacie o zmierzchu. Dym widać z daleka." },
    { text: "Północny Gaj płonie. Nie podpalili go Szarzy, tylko królewskie wojska. Na rozkaz." },
    { speaker: ITHERU, text: "Wezwano mnie do stolicy. Mam odpowiedzieć przed tronem za to, że chroniłem swoich.", cam: [13.5, 15, 1.3] },
    { speaker: MAEVE, text: "To pułapka, stary. Śmierdzi z daleka, jak ten dym.", cam: [17.6, 15.4, 1.3] },
    { speaker: ITHERU, text: "Być może. Ale prawda nie potrzebuje miecza. Pojadę, a prawda pojedzie ze mną.", cam: [13.5, 15, 1.35] },
    { text: "Jedziecie z nim. Pogorzelisko zostaje puste. Znowu.", cam: [15, 12, 0.9], pause: 600 },
  ],
  onEnd: { flags: ["act1_done"], next: "act1_end" },
});

/** The act's title card, on black. */
const ACT1_END: Cinematic = {
  ...scene({ id: "act1_end", cam: [15, 12, 0.9], lead: 7600, lines: [], title: { t: 900, dur: 6000, title: "KONIEC AKTU I", subtitle: "Popiół na czole" } }),
  startFade: 1,
  desaturate: 0.6,
};

export const ACT1_SCENES: Cinematic[] = [
  CELLS_INTRO,
  ESCAPE,
  FARM_INTRO,
  ITHERU_TALK,
  ITHERU_ROAD,
  MAEVE_TALK,
  FREED_TALK,
  MINE_INTRO,
  TAPPER_DEAD,
  CAPTIVES_FREE,
  ROAD_INTRO,
  SCOUTS_CHOICE,
  SCOUTS_DEAD,
  SCOUTS_FREE,
  DOWNER,
  ACT1_END,
];
