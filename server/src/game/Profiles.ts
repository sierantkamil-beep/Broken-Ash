import fs from "node:fs";
import path from "node:path";
import type { CharacterLook, PathId, Picks, WeaponId } from "@broken-ash/shared";

/**
 * What the host remembers about each character between sessions: weapon mastery, tree picks and the
 * last weapon, path and look. One JSON file in the host's data folder (the desktop app's userData,
 * `server/data/` in dev). Two players and a handful of characters: a JSON file is plenty, and it is
 * readable when something needs fixing by hand.
 */
export interface Profile {
  name: string;
  path?: PathId;
  weapon?: WeaponId;
  look?: CharacterLook;
  mastery: Partial<Record<WeaponId, number>>;
  picks: Partial<Record<WeaponId, Picks>>;
  updated: string;
}

export class Profiles {
  private data: Record<string, Profile> = {};
  private readonly file: string;

  constructor(dir: string) {
    this.file = path.join(dir, "characters.json");
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (raw && typeof raw === "object") this.data = raw;
    } catch {
      // No file yet (first run) or unreadable: start empty rather than refuse to host.
    }
  }

  /** Characters are keyed by name, case- and space-insensitive. */
  static key(name: string) {
    return name.trim().toLowerCase().replace(/\s+/g, " ");
  }

  get(name: string): Profile | undefined {
    return this.data[Profiles.key(name)];
  }

  put(p: Omit<Profile, "updated">) {
    this.data[Profiles.key(p.name)] = { ...p, updated: new Date().toISOString() };
    this.save();
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // Write then rename, so a crash mid-write never leaves a half file.
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.warn("[broken-ash] could not save characters:", e);
    }
  }
}
