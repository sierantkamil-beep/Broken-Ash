import { PROPS, type PropKind } from "./data/props.js";
import type { Wave } from "./data/greyed.js";
import type { PathId } from "./combat/types.js";

/** A rectangle of cells (continuous: x ∈ [x, x + w), y ∈ [y, y + h)). */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function inRegion(r: Region, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** A way out: both players standing in it travel to `to`, arriving at its spawn number `spawn`. */
export interface Exit {
  region: Region;
  to: string;
  spawn: number;
  /** Where it leads (Polish), shown at the exit. */
  label: string;
  /** Closed until this story flag is set. */
  needs?: string;
}

/**
 * A fight in an area: it starts when someone enters `trigger` (or on arrival without one), sends its
 * waves from the spawn points, and can lock the exits until it's won (an ambush). Winning sets
 * `clearFlag` (so it doesn't come back unless it `repeat`s) and can play a cinematic.
 */
export interface Encounter {
  id: string;
  trigger?: Region;
  waves: Wave[];
  spawnAt: { x: number; y: number }[];
  lock?: boolean;
  repeat?: boolean;
  clearFlag?: string;
  clearCinematic?: string;
  /** Only once this flag is set. */
  needs?: string;
  /** The first wave bangs the gate (the courtyard's assault). */
  gate?: boolean;
  /** Items dropped where the last enemy fell when it's won (set bases, then random rolls). */
  reward?: { items?: string[]; rolls?: number; luck?: number };
}

/** Someone to talk to: drawn as a character; F nearby plays their scene. */
export interface Npc {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: number;
  /** Dressed like this path (its look), on this body. */
  path: PathId;
  body: "male" | "female";
  scene?: string;
  /** Present only once this flag is set / until this flag is set. */
  needs?: string;
  unless?: string;
}

/**
 * An area of the world. Ground is a grid of cells; props stand on cells and may block some of them.
 * Positions are continuous (cells as units): cell (3, 4) covers x ∈ [3, 4), y ∈ [4, 5).
 */
export interface AreaMap {
  id: string;
  /** Player-facing name (Polish). */
  name: string;
  /** Shown under the name when you arrive (e.g. the act). */
  subtitle?: string;
  width: number;
  height: number;
  /** Ground type ids, indexed by `ground`. */
  groundTypes: GroundType[];
  /** width × height indices into groundTypes, row-major. */
  ground: number[];
  props: PropPlacement[];
  spawns: { x: number; y: number }[];
  /** Ambient light colour of the darkness overlay (0xRRGGBB). */
  ambient: number;
  music?: string;
  ambience?: string;
  /** Cinematic played the first time the area is entered. */
  introCinematic?: string;
  exits?: Exit[];
  encounters?: Encounter[];
  /** Where you get up after you both fall (a campfire, *Ognisko*); the first spawn otherwise. */
  bonfire?: { x: number; y: number };
  npcs?: Npc[];
  /**
   * Levers: F pulls one; when every lever of a group has been pulled within a couple of seconds of
   * each other (two players, two levers), the group's flag is set.
   */
  levers?: { x: number; y: number; group: string; flag: string }[];
  /**
   * Chests and bodies to search (F): opened once per story (a flag `loot:<area>:<id>`), each gives
   * set items (`items`: item base ids, e.g. a story's unique) and `rolls` random ones.
   */
  caches?: { id: string; x: number; y: number; items?: string[]; rolls?: number; luck?: number; gold?: number; label: string }[];
}

export type GroundType = "paving" | "moss" | "gravel" | "dirt" | "water" | "void" | "slabs" | "rock" | "planks" | "mud" | "sap" | "scorched" | "grass";

/** Ground you can't stand on. */
export const BLOCKING_GROUND: ReadonlySet<GroundType> = new Set(["water", "void", "sap"]);

export interface PropPlacement {
  kind: PropKind;
  /** Cell of the prop's footprint origin (its north corner). */
  x: number;
  y: number;
  /** Picks one of the prop's rendered variants. */
  variant?: number;
  /** Mirrors the sprite horizontally (cheap extra variety). */
  flip?: boolean;
  /** A gate: stands (and blocks) only until this story flag is set. */
  until?: string;
  /** The other way round: appears (and blocks) only once this flag is set (an opened chest). */
  after?: string;
}

/** Which cells block movement. Built once per map; out-of-bounds is always blocked. */
export class CollisionGrid {
  private readonly cells: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = new Uint8Array(width * height);
  }

  /**
   * The walls of an area. Gates (props with `until`) stand while their flag is missing; pass the story
   * flags, or "open" to treat every gate as open (map checks).
   */
  static fromMap(map: AreaMap, flags: ReadonlySet<string> | "open" = new Set()): CollisionGrid {
    const grid = new CollisionGrid(map.width, map.height);
    for (let i = 0; i < map.ground.length; i++) {
      if (BLOCKING_GROUND.has(map.groundTypes[map.ground[i]])) grid.cells[i] = 1;
    }
    for (const p of map.props) {
      if (p.until && (flags === "open" || flags.has(p.until))) continue;
      if (p.after && flags !== "open" && !flags.has(p.after)) continue;
      for (const [dx, dy] of PROPS[p.kind].blocks) grid.set(p.x + dx, p.y + dy, true);
    }
    return grid;
  }

  set(x: number, y: number, blocked: boolean) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[y * this.width + x] = blocked ? 1 : 0;
  }

  blocked(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
    return this.cells[y * this.width + x] === 1;
  }
}
