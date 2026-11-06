import type { CameraKey, Cinematic, CinematicEvent, TitleCard } from "../cinematic.js";

/** A line of a scene: who says it (narration when omitted) and where the camera is meanwhile. */
export interface Line {
  speaker?: string;
  text: string;
  /** Camera (cell x, cell y, zoom) for this line; it glides there during the gap before. */
  cam?: [number, number, number];
  /** Extra silence before the line (ms), for a beat. */
  pause?: number;
  /** Events fired when the line starts (a sound, a shake), offsets in ms from its start. */
  events?: CinematicEvent[];
}

export interface SceneSpec {
  id: string;
  /** Where the camera starts. */
  cam: [number, number, number];
  lines: Line[];
  /** Opens from black. */
  fromBlack?: boolean;
  /** Fades to black at the end (a cut to another place). */
  toBlack?: boolean;
  desaturate?: number;
  title?: Omit<TitleCard, "t"> & { t?: number };
  /** Silence before the first line (ms); longer when a title card opens the scene. */
  lead?: number;
  events?: CinematicEvent[];
  /** A decision once the lines are said (both players pick the same option). */
  choice?: Omit<NonNullable<Cinematic["choice"]>, "t">;
  onEnd?: Cinematic["onEnd"];
}

/** Reading time the validator asks for (about 15 characters a second plus a second), with room to breathe. */
export const readMs = (text: string) => Math.ceil((1000 + (text.length / 15) * 1000 + 700) / 100) * 100;

/**
 * Builds a cinematic from lines of dialogue, timing every subtitle from its length so each scene
 * passes `validateCinematic` by construction, and moving the camera between speakers.
 */
export function scene(s: SceneSpec): Cinematic {
  const GAP = 350;
  let t = s.lead ?? (s.title ? (s.title.t ?? 800) + s.title.dur + 400 : 1200);
  let cam = s.cam;
  const camera: CameraKey[] = [{ t: 0, x: cam[0], y: cam[1], zoom: cam[2] }];
  const subtitles: Cinematic["subtitles"] = [];
  const events: CinematicEvent[] = [...(s.events ?? [])];
  for (const line of s.lines) {
    t += line.pause ?? 0;
    if (line.cam && line.cam.join() !== cam.join()) {
      const from = Math.max(camera[camera.length - 1].t, t - 1400);
      camera.push({ t: from, x: cam[0], y: cam[1], zoom: cam[2] });
      cam = line.cam;
      camera.push({ t, x: cam[0], y: cam[1], zoom: cam[2] });
    }
    const dur = readMs(line.text);
    subtitles.push({ t, dur, speaker: line.speaker, text: line.text });
    for (const e of line.events ?? []) events.push({ ...e, t: t + e.t });
    t += dur + GAP;
  }
  const choiceT = s.choice ? t : undefined;
  const end = t + (s.choice ? 900 : 600) + (s.toBlack ? 900 : 0);
  camera.push({ t: end, x: cam[0], y: cam[1] + 0.15, zoom: cam[2] + 0.05, ease: "linear" });
  const fades: Cinematic["fades"] = [];
  if (s.fromBlack) fades.push({ t: 0, dur: 1600, to: 0 });
  if (s.toBlack) fades.push({ t: end - 1200, dur: 1100, to: 1 });
  events.sort((a, b) => a.t - b.t);
  const title = s.title ? [{ ...s.title, t: s.title.t ?? 800 }] : [];
  return {
    id: s.id,
    durationMs: end,
    letterboxMs: 900,
    desaturate: s.desaturate,
    camera,
    startFade: s.fromBlack ? 1 : 0,
    fades,
    titles: title,
    subtitles,
    actors: [],
    events,
    choice: s.choice && choiceT !== undefined ? { t: choiceT, ...s.choice } : undefined,
    onEnd: s.onEnd,
  };
}
