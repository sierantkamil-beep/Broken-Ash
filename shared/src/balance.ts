/**
 * Every tunable number lives here, with the reason it has its value.
 * Distances are in world cells (1 cell ≈ 1 metre), times in seconds.
 */
export const BALANCE = {
  player: {
    /** Brisk run, not a sprint: the courtyard should take a few seconds to cross, so the space feels real. */
    speed: 3.4,
    /** Velocity approaches the target at this rate: high enough to feel responsive, low enough to have weight. */
    accel: 26,
    /** Stopping is quicker than starting, so you never slide past where you meant to stand. */
    decel: 34,
    /** Body radius. Slightly under half a cell so two elves fit side by side through a two-cell gate. */
    radius: 0.3,
    staminaMax: 100,
    /** Regenerates fast enough for a dodge every ~1.5 s of not dodging, never for spamming. */
    staminaRegen: 34,
    /** Regen waits a moment after spending, so stamina is a real decision in a fight. */
    staminaRegenDelay: 0.6,
  },
  dodge: {
    /** Three dodges from full stamina, then you have to breathe. */
    cost: 30,
    distance: 3.0,
    duration: 0.36,
    /** Invulnerable for most of the roll but not the end: a late roll still gets punished. */
    iframes: 0.26,
    /** Short lockout after a roll, so rolling isn't faster than running. */
    cooldown: 0.18,
  },
  net: {
    /** Inputs the server keeps queued per player. More than this means a flood (or a speed hack): extras are dropped. */
    maxQueuedInputs: 24,
    /** Inputs processed per server step at most; lets a lagging client catch up without moving 10× faster. */
    maxInputsPerStep: 3,
  },
} as const;
