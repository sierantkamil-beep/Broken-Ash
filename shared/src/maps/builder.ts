import type { AreaMap, GroundType, PropPlacement } from "../map.js";
import type { PropKind } from "../data/props.js";

/** Small helper for writing maps as code: readable, deterministic, diffable. */
export class MapBuilder {
  readonly groundTypes: GroundType[] = [];
  readonly ground: number[];
  readonly props: PropPlacement[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    fill: GroundType,
  ) {
    this.ground = new Array(width * height).fill(this.typeIndex(fill));
  }

  private typeIndex(t: GroundType): number {
    let i = this.groundTypes.indexOf(t);
    if (i < 0) i = this.groundTypes.push(t) - 1;
    return i;
  }

  /** Fills an inclusive rectangle of cells. */
  rect(t: GroundType, x0: number, y0: number, x1: number, y1: number): this {
    const idx = this.typeIndex(t);
    for (let y = Math.max(0, y0); y <= Math.min(this.height - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(this.width - 1, x1); x++) this.ground[y * this.width + x] = idx;
    return this;
  }

  /** Fills an ellipse of cells centred on (cx, cy). */
  blob(t: GroundType, cx: number, cy: number, rx: number, ry: number): this {
    const idx = this.typeIndex(t);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.ground[y * this.width + x] = idx;
      }
    return this;
  }

  groundAt(x: number, y: number): GroundType {
    return this.groundTypes[this.ground[y * this.width + x]];
  }

  prop(kind: PropKind, x: number, y: number, variant = 0, flip = false, until?: string): this {
    this.props.push({ kind, x, y, variant, flip: flip || undefined, until });
    return this;
  }

  /** A gate: a prop that stands (and blocks) only until the story flag is set. */
  gate(kind: PropKind, x: number, y: number, until: string, variant = 0): this {
    return this.prop(kind, x, y, variant, false, until);
  }

  build(meta: Omit<AreaMap, "width" | "height" | "groundTypes" | "ground" | "props">): AreaMap {
    return { ...meta, width: this.width, height: this.height, groundTypes: this.groundTypes, ground: this.ground, props: this.props };
  }
}
