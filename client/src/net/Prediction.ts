import { copyBody, newBody, SIM_DT, stepBody, type Body, type CollisionGrid, type InputFrame } from "@broken-ash/shared";

export interface Intent {
  mx: number;
  my: number;
  dodge: boolean;
  aim?: number;
  aimDist?: number;
  act?: boolean;
  /** Movement multiplier the server will apply (path speed, slows, rooted, downed). */
  speedMul?: number;
  canDodge?: boolean;
}

/**
 * Client-side prediction for your own character. Inputs are simulated locally at once (same fixed
 * step and same code as the server), kept until the server acknowledges them, and replayed on top
 * of every authoritative snapshot. Corrections are blended out over a few frames instead of snapping.
 */
export class Prediction {
  readonly body: Body;
  private prevX: number;
  private prevY: number;
  private pending: InputFrame[] = [];
  private speedMul = 1;
  private canDodge = true;
  private seq = 0;
  private acc = 0;
  /** Visual offset left over from the last correction; decays to zero. */
  private errX = 0;
  private errY = 0;
  private dodgeLatched = false;
  private castLatched: number | null = null;

  constructor(
    private readonly grid: CollisionGrid,
    x: number,
    y: number,
  ) {
    this.body = newBody(x, y);
    this.prevX = x;
    this.prevY = y;
  }

  /** Remember a dodge press until the next simulation step uses it, so short taps are never lost. */
  pressDodge() {
    this.dodgeLatched = true;
  }

  /** A skill key pressed: sent with the next simulation step. */
  pressCast(slot: number) {
    this.castLatched = slot;
  }

  /** Advances the fixed-step simulation; returns the frames to send to the server. */
  tick(deltaMs: number, intent: Intent, enabled: boolean): InputFrame[] {
    const out: InputFrame[] = [];
    this.acc = Math.min(this.acc + deltaMs / 1000, SIM_DT * 8);
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      if (!enabled) {
        this.dodgeLatched = false;
        continue;
      }
      const frame: InputFrame = { seq: ++this.seq, mx: intent.mx, my: intent.my, dodge: intent.dodge || this.dodgeLatched, aim: intent.aim, aimDist: intent.aimDist };
      if (intent.act) frame.act = true;
      if (this.castLatched !== null) {
        frame.cast = this.castLatched;
        this.castLatched = null;
      }
      this.dodgeLatched = false;
      this.prevX = this.body.x;
      this.prevY = this.body.y;
      this.speedMul = intent.speedMul ?? 1;
      this.canDodge = intent.canDodge ?? true;
      stepBody(this.body, frame, SIM_DT, this.grid, this.speedMul, this.canDodge);
      if (frame.cast !== undefined && frame.aim !== undefined) this.body.facing = frame.aim;
      this.pending.push(frame);
      out.push(frame);
    }
    // Corrections fade out with a ~100 ms time constant.
    const k = Math.exp(-deltaMs / 100);
    this.errX *= k;
    this.errY *= k;
    return out;
  }

  /** Applies an authoritative snapshot and replays the inputs the server hasn't seen yet. */
  reconcile(server: Body, lastSeq: number) {
    const beforeX = this.renderX();
    const beforeY = this.renderY();
    this.pending = this.pending.filter((f) => f.seq > lastSeq);
    copyBody(this.body, server);
    for (const f of this.pending) stepBody(this.body, f, SIM_DT, this.grid, this.speedMul, this.canDodge);
    this.prevX = this.body.x;
    this.prevY = this.body.y;
    const dx = beforeX - this.body.x;
    const dy = beforeY - this.body.y;
    // Tiny drifts are blended; a big jump (teleport, long lag) is taken as is.
    if (Math.hypot(dx, dy) < 1.5) {
      this.errX = dx;
      this.errY = dy;
    } else {
      this.errX = this.errY = 0;
    }
  }

  private renderX() {
    const a = this.acc / SIM_DT;
    return this.prevX + (this.body.x - this.prevX) * a + this.errX;
  }

  private renderY() {
    const a = this.acc / SIM_DT;
    return this.prevY + (this.body.y - this.prevY) * a + this.errY;
  }

  /** Smoothed position for rendering (between the last two steps, plus any correction offset). */
  render(): { x: number; y: number } {
    return { x: this.renderX(), y: this.renderY() };
  }
}
