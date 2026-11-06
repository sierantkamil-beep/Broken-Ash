import Phaser from "phaser";

/**
 * Character atlases are big (one per path and body, one per Greyed), so they load on demand:
 * only the two players' sets and the enemies actually present. While one is missing (or still
 * being rendered by tools/art/characters.py), the closest available set stands in.
 */
const loading = new Map<string, Promise<boolean>>();
let available: Set<string> | null = null;

export interface AtlasMeta {
  /** Pixel art (PixelLab): nearest filtering and whole-pixel zoom steps. */
  pixel: boolean;
  /** Screen pixels per atlas pixel. */
  scale: number;
  /** Frames per animation, from the atlas (tools/pixellab/pack.py), or the legacy Blender counts. */
  anims: Record<string, number>;
  /** How tall the figure stands, in screen pixels (for name tags and health bars). */
  height: number;
  /**
   * Where gear attaches on each frame, relative to the feet, in atlas pixels (tools/pixellab/anchors.py):
   * [hand x, y, angle, off x, y, angle, head x, y, top y, neck x, y, torso x, y, shoulder L x, y, R x, y].
   */
  anchors?: Record<string, (number | null)[]>;
}

/** Frame counts of the older Blender-rendered sets (tools/art/anims.py), which carry no meta. */
const LEGACY_FRAMES: Record<string, number> = { idle: 6, run: 8, roll: 6, hit: 3, death: 6, attack: 6, skill1: 6, skill2: 6 };
const LEGACY: AtlasMeta = { pixel: false, scale: 1, anims: LEGACY_FRAMES, height: 150 };

/** What an atlas says about itself (its JSON "meta"). */
export function atlasMeta(scene: Phaser.Scene, key: string | null): AtlasMeta {
  if (!key || !scene.textures.exists(key)) return LEGACY;
  const m = (scene.textures.get(key).customData as { meta?: Partial<AtlasMeta> & { artScale?: number } }).meta;
  if (!m?.pixel) return LEGACY;
  const scale = m.artScale ?? 2;
  return { pixel: true, scale, anims: { ...LEGACY_FRAMES, ...m.anims }, height: (m.height ?? 70) * scale, anchors: m.anchors };
}

/**
 * The frame to show for an animation: clips that a set lacks borrow the closest one it has
 * (a dodge without a roll clip runs, a skill without its own clip uses the attack).
 */
const STAND_IN: Record<string, string[]> = { strike: ["cast", "attack"], cast: ["strike", "attack"], roll: ["run"], skill1: ["attack"], skill2: ["skill1", "attack"], hit: ["idle"], death: ["hit", "idle"], attack: ["idle"] };
export function resolveAnim(scene: Phaser.Scene, atlas: string, anim: string): string {
  const tex = scene.textures.get(atlas);
  const has = (a: string) => tex.has(`${a}/0/0`);
  if (has(anim)) return anim;
  for (const a of STAND_IN[anim] ?? []) if (has(a)) return a;
  return "idle";
}

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
          scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
            if (!scene.textures.exists(key)) return resolve(false);
            // PixelLab sets are pixel art: sample them crisp, never blurred.
            if (atlasMeta(scene, key).pixel) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
            resolve(true);
          });
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
