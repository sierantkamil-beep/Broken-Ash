import type { Cinematic } from "../cinematic.js";

/**
 * Prolog — plays the first time the two of you enter the Soramei courtyard.
 * Tone: quiet, cold narration over the ruined courtyard; one violent beat (the splitting of the
 * tree); ends on the two convicts and a shout from the gate that throws you into the game.
 * The narrator is unnamed on purpose (it's Sanoe, which players learn in Act 3).
 */
const PROLOG: Cinematic = {
  id: "prolog",
  durationMs: 54000,
  letterboxMs: 1200,
  desaturate: 0.25,
  // Top-down framing (cells; zoom 1 = 1:1 pixels on a 1080 px tall window): the blossom trees, the
  // shrine where the tree's story is told, the broken gate and its dead, then the two of you.
  camera: [
    { t: 0, x: 9, y: 6, zoom: 1 },
    { t: 9000, x: 6.5, y: 6.5, zoom: 1.1, ease: "linear" },
    { t: 15000, x: 4, y: 14, zoom: 1.2 },
    { t: 21000, x: 4.2, y: 14.2, zoom: 1.3, ease: "linear" },
    { t: 27500, x: 14.5, y: 4, zoom: 1.2 },
    { t: 40000, x: 14.5, y: 5.5, zoom: 1.3, ease: "linear" },
    { t: 46000, x: 14.5, y: 15, zoom: 1.4 },
    { t: 52800, x: 14.5, y: 15.2, zoom: 1.5 },
  ],
  startFade: 1,
  fades: [{ t: 0, dur: 3500, to: 0 }],
  titles: [{ t: 1200, dur: 7000, title: "BROKEN ASH", subtitle: "Aeldrith. Dziewiętnaście lat po Złamaniu." }],
  subtitles: [
    { t: 9000, dur: 5300, text: "Przez trzy tysiące lat Jesion Świata kwitł na czerwono." },
    { t: 14600, dur: 5400, text: "Jego żywica dawała nam młodość, nieśmiertelność i pychę." },
    { t: 20400, dur: 6200, text: "Dziewiętnaście lat temu królowa Ysolde rozrąbała go jednym ciosem." },
    { t: 27000, dur: 7200, text: "Od tamtej nocy starzejemy się. Gnijemy. A nasi zmarli nie chcą leżeć w grobach." },
    { t: 34600, dur: 5200, text: "Tej nocy Szarzy wdarli się nawet do Twierdzy Soramei." },
    { t: 40200, dur: 7000, text: "A wy dwoje? Popielni. Skazani na upust żywicy. W świetle prawa już martwi." },
    { t: 47600, dur: 4600, speaker: "Głos zza bramy", text: "Ruszać się, do kurwy nędzy! Brama długo nie wytrzyma!" },
  ],
  actors: [],
  events: [
    { t: 0, kind: "music", key: "music_soramei_night" },
    { t: 500, kind: "petals", amount: 40 },
    { t: 1200, kind: "sound", key: "sfx_title_gong", volume: 0.9 },
    { t: 22200, kind: "sound", key: "sfx_cin_split", volume: 1 },
    { t: 22200, kind: "flash", color: 0xff2a14, dur: 700 },
    { t: 22200, kind: "shake", intensity: 0.012, dur: 1100 },
    { t: 22400, kind: "petals", amount: 140 },
    { t: 47300, kind: "sound", key: "sfx_gate_bang", volume: 0.9 },
    { t: 47300, kind: "shake", intensity: 0.004, dur: 300 },
    { t: 49900, kind: "sound", key: "sfx_gate_bang", volume: 1 },
    { t: 49900, kind: "shake", intensity: 0.006, dur: 350 },
  ],
};

export const CINEMATICS: Record<string, Cinematic> = {
  [PROLOG.id]: PROLOG,
};
