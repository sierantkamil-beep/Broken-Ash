import { INTERP_DELAY_MS } from "@broken-ash/shared";

export interface Snapshot {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  dodgeT: number;
}

/** Renders a remote player slightly in the past, between the two snapshots around that moment. */
export class Interpolation {
  private buf: Snapshot[] = [];

  push(s: Snapshot) {
    this.buf.push(s);
    if (this.buf.length > 40) this.buf.shift();
  }

  sample(now: number): Snapshot | null {
    if (!this.buf.length) return null;
    const t = now - INTERP_DELAY_MS;
    let i = this.buf.length - 1;
    while (i > 0 && this.buf[i - 1].t > t) i--;
    const b = this.buf[i];
    const a = this.buf[i - 1];
    if (!a || t >= b.t) return b;
    const k = (t - a.t) / (b.t - a.t);
    const turn = Math.atan2(Math.sin(b.facing - a.facing), Math.cos(b.facing - a.facing));
    return {
      t,
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      vx: a.vx + (b.vx - a.vx) * k,
      vy: a.vy + (b.vy - a.vy) * k,
      // Small turns blend; a sharp one (an about-face to cast) switches halfway, instead of
      // sweeping through every sprite direction in between (and flipping the mirrored gear twice).
      facing: Math.abs(turn) > Math.PI / 2 ? (k < 0.5 ? a.facing : b.facing) : a.facing + turn * k,
      dodgeT: k < 0.5 ? a.dodgeT : b.dodgeT,
    };
  }
}
