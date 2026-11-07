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
  mastery: {
    /**
     * Weapon-skill damage dealt needed to reach each mastery level (index = level; level 1 is free).
     * One gate assault deals roughly 4–6k per player, so the first run reaches about level 4 and the
     * whole tree takes several evenings: long enough to mean something, short enough for two people.
     */
    xpFor: [0, 0, 600, 1500, 2800, 4500, 6800, 9600, 13000, 17000, 22000],
    maxLevel: 10,
    /** Weapon-skill damage a home weapon deals extra (the path's people know this weapon). */
    affinityDamage: 0.15,
    /** Unlock levels: RMB options, key-1 options, passive rows. Two key-1/RMB skills are free at 1 so a new character has a full bar. */
    rmbUnlock: [1, 3],
    keyUnlock: [1, 5, 8],
    passiveUnlock: [4, 6, 7, 9, 10],
  },
  combat: {
    /** Seconds both players stand in an exit before travelling (no accidental trips). */
    exitDwell: 0.8,
    /** How close (cells) you must stand to talk to someone (F). */
    talkRange: 1.6,
    /** Thrown circles fly at this speed (cells/s), between these times: long enough to see and dodge. */
    throwSpeed: 22,
    throwMin: 0.12,
    throwMax: 0.4,
    /** A channel's pulses together deal this much of the skill's damage (holding still is rewarded). */
    channelBonus: 1.2,
    /** Seconds within which all levers of a group must be pulled: two people, not one running between them. */
    leverWindow: 1.5,
    /** Seconds a boss spends drinking a phase heal (long enough to punish with a stagger). */
    bossChannel: 3,
    /** Corpse-eaters: ignore bodies when a foe is this close; smell them this far; eat for this long; heal and grow by this much per body. */
    eater: { ignoreWithin: 3, smell: 10, eatTime: 1.6, heal: 0.3, grow: 0.15, maxRadius: 0.5 },
    /** A downed player bleeds out over this long, unless the partner revives them. */
    bleedOut: 20,
    /** Holding F next to a downed partner this long brings them back... */
    reviveTime: 2.0,
    /** ...at this share of their health. */
    reviveHealth: 0.35,
    /** How close you must be to revive or execute. */
    interactRange: 1.6,
    /** Both down: everyone gets up at the spawn after this long, and the current wave starts over. */
    wipeDelay: 4,
    /** A staggered enemy stands helpless this long: the window for an execution. */
    staggerTime: 1.6,
    /** An execution heals both players by this share of their health (design.md §5). */
    executionHeal: 0.12,
    /** Poise recovers this share per second when not hit. */
    poiseRegen: 0.15,
    /** Bleed ticks heal the Thorn who caused them by this share (Thorn's sustain). */
    thornBleedHeal: 0.35,
    /** Each hit taken grants Bark this share as shield (Bark's sustain), capped below. */
    barkShieldOnHit: 0.3,
    barkShieldCap: 60,
    /** Fire damage dealt heals Ash by this share (Ash's sustain). */
    ashFireHeal: 0.12,
    /** Overheating sets you on fire and silences you this long. */
    overheatSilence: 2.5,
    /** Storm above this charge regenerates a static shield (Storm's sustain). */
    stormShieldAt: 60,
    stormShieldRate: 4,
    /** Graves drains this share of max health per second per living thrall (Graves' sustain). */
    gravesDrain: 0.012,
    /** Dusk in stealth heals this share of max health per second (Dusk's sustain). */
    duskStealthHeal: 0.06,
    /** Damage taken by enemies under each debuff, as a multiplier bonus. */
    weakenBonus: 0.2,
    rootedBonus: 0.15,
    /** Damage over time ticks this often. */
    dotTick: 0.5,
    /** A killing blow that overshoots by more than this share of max health tears the body apart (gore). */
    goreOverkill: 0.25,
    thrall: { hp: 60, damage: 9, speed: 2.4 },
    /** Delay between waves. */
    waveDelay: 4,
    /** After the Tapper falls, the gate holds for this long before the night starts over (test loop). */
    victoryHold: 25,
  },
} as const;
