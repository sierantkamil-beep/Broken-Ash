import { PROPS, type PropKind } from "./data/props.js";

/**
 * An area of the world. Ground is a grid of cells; props stand on cells and may block some of them.
 * Positions are continuous (cells as units): cell (3, 4) covers x ∈ [3, 4), y ∈ [4, 5).
 */
export interface AreaMap {
  id: string;
  /** Player-facing name (Polish). */
  name: string;
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
}

export type GroundType = "paving" | "moss" | "gravel" | "dirt" | "water" | "void";

/** Ground you can't stand on. */
export const BLOCKING_GROUND: ReadonlySet<GroundType> = new Set(["water", "void"]);

export interface PropPlacement {
  kind: PropKind;
  /** Cell of the prop's footprint origin (its north corner). */
  x: number;
  y: number;
  /** Picks one of the prop's rendered variants. */
  variant?: number;
  /** Mirrors the sprite horizontally (cheap extra variety). */
  flip?: boolean;
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

  static fromMap(map: AreaMap): CollisionGrid {
    const grid = new CollisionGrid(map.width, map.height);
    for (let i = 0; i < map.ground.length; i++) {
      if (BLOCKING_GROUND.has(map.groundTypes[map.ground[i]])) grid.cells[i] = 1;
    }
    for (const p of map.props) {
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
