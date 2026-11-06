/**
 * Cinematics are timelines, not scripts: every track is keyframed in milliseconds, and
 * `evaluateCinematic(c, t)` gives the full picture at any moment. That makes them seekable (a
 * partner who joins mid-scene sees the right frame), skippable, and testable without a renderer.
 * Instant things (a sound, a shake) are events; the player fires those it crosses.
 */
export type Ease = "linear" | "inOut" | "out" | "in";

export interface CameraKey {
  t: number;
  /** World cell the camera centres on. */
  x: number;
  y: number;
  zoom: number;
  ease?: Ease;
}

export interface ActorKey {
  t: number;
  x: number;
  y: number;
  /** Sprite direction 0–7 (see view.ts directionIndex). */
  dir?: number;
  anim?: string;
  ease?: Ease;
}

export interface CinematicActor {
  id: string;
  sprite: string;
  keys: ActorKey[];
}

export interface Subtitle {
  t: number;
  dur: number;
  /** Speaker label; omitted for narration. */
  speaker?: string;
  text: string;
}

export interface Fade {
  t: number;
  dur: number;
  /** Target opacity of the black overlay. */
  to: number;
}

export interface TitleCard {
  t: number;
  dur: number;
  title: string;
  subtitle?: string;
}

export type CinematicEvent =
  | { t: number; kind: "sound"; key: string; volume?: number }
  | { t: number; kind: "music"; key: string }
  | { t: number; kind: "shake"; intensity: number; dur: number }
  | { t: number; kind: "flash"; color: number; dur: number }
  | { t: number; kind: "petals"; amount: number };

export interface Cinematic {
  id: string;
  durationMs: number;
  /** Players' own characters may appear; the camera may start anywhere. */
  camera: CameraKey[];
  /** Letterbox bars slide in over the first and out over the last `letterboxMs`. */
  letterboxMs: number;
  fades: Fade[];
  subtitles: Subtitle[];
  titles: TitleCard[];
  actors: CinematicActor[];
  events: CinematicEvent[];
  /** Black overlay opacity at t = 0 (1 = the scene opens from black). */
  startFade?: number;
  /** Colour grading during the scene: 0 = normal, 1 = fully desaturated. */
  desaturate?: number;
  /**
   * A decision: at `t` the scene holds until both players pick the same option (each sees the other's
   * pick). The option's flag is set, and its `then` scene (if any) plays next.
   */
  choice?: { t: number; prompt: string; options: { label: string; flag: string; then?: string }[] };
  /** When the scene ends (played out or skipped): set these flags, and/or travel somewhere. */
  onEnd?: { flags?: string[]; travel?: { to: string; spawn: number } };
}

export interface CinematicFrame {
  camera: { x: number; y: number; zoom: number };
  /** 0 = no bars, 1 = full bars. */
  letterbox: number;
  /** Black overlay opacity. */
  fade: number;
  subtitle: Subtitle | null;
  /** Subtitle opacity (fades in and out over 300 ms). */
  subtitleAlpha: number;
  title: TitleCard | null;
  titleAlpha: number;
  actors: { id: string; sprite: string; x: number; y: number; dir: number; anim: string }[];
  done: boolean;
}

export function ease(kind: Ease | undefined, k: number): number {
  const t = Math.min(1, Math.max(0, k));
  switch (kind ?? "inOut") {
    case "linear":
      return t;
    case "in":
      return t * t * t;
    case "out":
      return 1 - (1 - t) ** 3;
    default:
      return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  }
}

/** Interpolates keyframes; the ease of the *destination* key shapes the segment leading to it. */
function sampleKeys<K extends { t: number; ease?: Ease }>(keys: K[], t: number, lerp: (a: K, b: K, k: number) => K): K {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t < b.t) {
      const a = keys[i - 1];
      return lerp(a, b, ease(b.ease, (t - a.t) / (b.t - a.t)));
    }
  }
  return keys[keys.length - 1];
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** Fades in/out over `edge` ms at both ends of a [t, t+dur) window. */
function windowAlpha(t: number, start: number, dur: number, edge: number): number {
  if (t < start || t >= start + dur) return 0;
  return Math.min(1, (t - start) / edge, (start + dur - t) / edge);
}

export function evaluateCinematic(c: Cinematic, t: number): CinematicFrame {
  const cam = sampleKeys(c.camera, t, (a, b, k) => ({ t, x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), zoom: mix(a.zoom, b.zoom, k) }));

  const lb = c.letterboxMs;
  const letterbox = Math.max(0, Math.min(1, t / lb, (c.durationMs - t) / lb));

  // Fades hold their last value until the next fade starts.
  let fade = c.startFade ?? 0;
  for (const f of c.fades) {
    if (t < f.t) break;
    const from = fade;
    fade = t >= f.t + f.dur ? f.to : mix(from, f.to, ease("inOut", (t - f.t) / f.dur));
  }

  const subtitle = c.subtitles.find((s) => t >= s.t && t < s.t + s.dur) ?? null;
  const title = c.titles.find((s) => t >= s.t && t < s.t + s.dur) ?? null;

  const actors = c.actors.map((a) => {
    const k = sampleKeys(a.keys, t, (p, q, m) => ({ t, x: mix(p.x, q.x, m), y: mix(p.y, q.y, m), dir: m < 0.5 ? p.dir : q.dir, anim: m < 1 ? q.anim ?? p.anim : q.anim }));
    return { id: a.id, sprite: a.sprite, x: k.x, y: k.y, dir: k.dir ?? 0, anim: k.anim ?? "idle" };
  });

  return {
    camera: { x: cam.x, y: cam.y, zoom: cam.zoom },
    letterbox,
    fade,
    subtitle,
    subtitleAlpha: subtitle ? windowAlpha(t, subtitle.t, subtitle.dur, 300) : 0,
    title,
    titleAlpha: title ? windowAlpha(t, title.t, title.dur, 900) : 0,
    actors,
    done: t >= c.durationMs,
  };
}

/** Events with from < t ≤ to, in order. Seeking past events skips them, except music (so a late joiner hears the right track). */
export function eventsBetween(c: Cinematic, from: number, to: number): CinematicEvent[] {
  return c.events.filter((e) => e.t > from && e.t <= to);
}

/** Problems with a cinematic's data, for tests. */
export function validateCinematic(c: Cinematic): string[] {
  const errors: string[] = [];
  const sorted = (name: string, list: { t: number }[]) => {
    for (let i = 1; i < list.length; i++) if (list[i].t < list[i - 1].t) errors.push(`${c.id}: ${name} not sorted at ${i}`);
  };
  if (c.camera.length === 0) errors.push(`${c.id}: no camera keys`);
  sorted("camera", c.camera);
  sorted("fades", c.fades);
  sorted("subtitles", c.subtitles);
  sorted("events", c.events);
  for (const a of c.actors) sorted(`actor ${a.id}`, a.keys);
  for (const s of c.subtitles) {
    if (s.t + s.dur > c.durationMs) errors.push(`${c.id}: subtitle "${s.text.slice(0, 20)}" runs past the end`);
    // Reading speed: about 15 characters a second plus a second to notice the line.
    const needed = 1000 + (s.text.length / 15) * 1000;
    if (s.dur < needed) errors.push(`${c.id}: subtitle "${s.text.slice(0, 20)}" is too short to read (${s.dur} < ${Math.round(needed)} ms)`);
  }
  for (let i = 1; i < c.subtitles.length; i++) {
    const p = c.subtitles[i - 1];
    if (c.subtitles[i].t < p.t + p.dur) errors.push(`${c.id}: subtitles overlap at "${c.subtitles[i].text.slice(0, 20)}"`);
  }
  return errors;
}
