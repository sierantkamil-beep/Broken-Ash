import fs from "node:fs";
import path from "node:path";

/**
 * The shared story the host remembers between sessions: the flags (choices made, areas cleared,
 * scenes seen) and the area you were in. One small JSON file next to the characters.
 */
export interface StorySave {
  flags: string[];
  area?: string;
}

export class Story {
  private readonly file: string;
  data: StorySave = { flags: [] };

  constructor(dir: string) {
    this.file = path.join(dir, "story.json");
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (raw && Array.isArray(raw.flags)) this.data = { flags: raw.flags.filter((f: unknown) => typeof f === "string"), area: typeof raw.area === "string" ? raw.area : undefined };
    } catch {
      // No story yet: a new game.
    }
  }

  save(flags: Iterable<string>, area: string) {
    this.data = { flags: [...flags].sort(), area };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.warn("[broken-ash] could not save the story:", e);
    }
  }
}
