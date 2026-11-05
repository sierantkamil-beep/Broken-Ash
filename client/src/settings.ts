/** Per-player preferences, kept in localStorage (wrapped: storage can be unavailable). */
export interface Settings {
  master: number;
  music: number;
  ambience: number;
  sfx: number;
  gore: "full" | "reduced";
  raids: "on" | "off";
  name: string;
  address: string;
  path: string;
  body: "male" | "female";
  people: string;
}

const KEY = "broken-ash.settings";
const DEFAULTS: Settings = { master: 80, music: 60, ambience: 70, sfx: 80, gore: "full", raids: "on", name: "", address: "", path: "thorn", body: "female", people: "" };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();
const listeners = new Set<() => void>();

export function saveSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private window or blocked storage: settings just won't persist.
  }
  for (const l of listeners) l();
}

export function onSettingsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
