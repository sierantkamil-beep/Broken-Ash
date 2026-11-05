import Phaser from "phaser";

/**
 * Character atlases are big (one per path and body, one per Greyed), so they load on demand:
 * only the two players' sets and the enemies actually present. While one is missing (or still
 * being rendered by tools/art/characters.py), the closest available set stands in.
 */
const loading = new Map<string, Promise<boolean>>();
let available: Set<string> | null = null;

/** Which atlases exist (from the build's file list), fetched once. */
async function manifest(): Promise<Set<string>> {
  if (available) return available;
  try {
    const res = await fetch("assets/chars/index.json");
    available = new Set((await res.json()) as string[]);
  } catch {
    available = new Set();
  }
  return available;
}

export function charKey(path: string, body: string) {
  return `${path}_${body}`;
}

export function greyedKey(kind: string) {
  return `${kind === "thrall" ? "shambler" : kind}_greyed`;
}

/** Loads an atlas if it exists; resolves to whether it's usable. */
export function ensureAtlas(scene: Phaser.Scene, key: string): Promise<boolean> {
  if (scene.textures.exists(key)) return Promise.resolve(true);
  let p = loading.get(key);
  if (!p) {
    p = manifest().then(
      (list) =>
        new Promise<boolean>((resolve) => {
          if (!list.has(key)) return resolve(false);
          scene.load.atlas(key, `assets/chars/${key}.webp`, `assets/chars/${key}.json`);
          scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve(scene.textures.exists(key)));
          scene.load.start();
        }),
    );
    loading.set(key, p);
  }
  return p;
}

/** The best atlas available right now for a wanted key. */
export function atlasOr(scene: Phaser.Scene, key: string, fallbacks: string[]): string | null {
  if (scene.textures.exists(key)) return key;
  return fallbacks.find((k) => scene.textures.exists(k)) ?? null;
}
