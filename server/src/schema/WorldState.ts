import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

/**
 * Synced player state. It carries the whole movement body, so the owning client can rewind its
 * prediction to exactly what the server simulated (see client/src/net/Prediction.ts), plus what the
 * HUD and the partner's view need: health, resource, cooldowns, statuses, downed.
 */
export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  /** Which of the two convict looks this player wears ("a" or "b"). */
  @type("string") look = "a";
  @type("string") path = "thorn";
  @type("string") body = "male";
  @type("string") people = "thorn";
  /** Weapon in hand, tree picks for it (JSON), and mastery XP per weapon (JSON): the bar is resolved from these on both sides. */
  @type("string") weapon = "blades";
  @type("string") picks = "";
  @type("string") mastery = "";
  /** Experience, level and talents (JSON list): the bar's open slots and bonuses come from these. */
  @type("number") xp = 0;
  @type("number") level = 1;
  @type("string") talents = "[]";
  /** Appearance (CharacterLook as JSON), so the partner sees the same dye and gear. */
  @type("string") appearance = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") facing = 0;
  @type("number") stamina = 0;
  @type("number") sinceSpend = 0;
  @type("number") dodgeT = 0;
  @type("number") dodgeCd = 0;
  @type("number") dodgeDx = 0;
  @type("number") dodgeDy = 0;
  /** Last input frame the server applied for this player. */
  @type("uint32") lastSeq = 0;
  @type("number") hp = 0;
  @type("number") hpMax = 0;
  @type("number") res = 0;
  @type("number") resMax = 0;
  /** Seconds left on each skill (rounded to 0.05). */
  @type(["number"]) cd = new ArraySchema<number>();
  /** Skill being cast ("" when none): drives the cast animation for the partner. */
  @type("string") cast = "";
  @type("number") castT = 0;
  /** Active statuses, comma-separated (HUD icons, movement modifiers for prediction). */
  @type("string") st = "";
  @type("number") shield = 0;
  @type("boolean") downed = false;
  @type("number") downT = 0;
  /** Revive progress 0..1. */
  @type("number") revive = 0;
}

/** A Greyed (or a thrall raised by the Path of Graves). */
export class UnitState extends Schema {
  @type("string") id = "";
  @type("string") kind = "";
  @type("string") faction = "greyed";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") facing = 0;
  @type("number") hp = 0;
  @type("number") hpMax = 0;
  /** idle / chase / windup / recover. */
  @type("string") state = "idle";
  @type("number") stagger = 0;
  @type("string") st = "";
  /** The telegraph: attack id, its total and remaining wind-up, the locked aim and landing point. */
  @type("string") atk = "";
  @type("number") atkT = 0;
  @type("number") atkTotal = 0;
  @type("number") aim = 0;
  @type("number") ax = 0;
  @type("number") ay = 0;
}

export class WorldState extends Schema {
  @type("string") mapId = "";
  /** The running cinematic ("" when none). Synced state, so a partner joining mid-scene sees it too. */
  @type("string") cinematic = "";
  @type("number") cinematicElapsed = 0;
  @type("uint8") skipVotes = 0;
  /** The gate assault: waiting / break / fight / victory, and the wave number (1-based, 0 before). */
  @type("string") phase = "waiting";
  @type("uint8") wave = 0;
  @type("string") waveTitle = "";
  @type("number") wipeT = 0;
  /** Story flags, comma-separated (the client shows exits, NPCs and choices by them). */
  @type("string") flags = "";
  /** The running scene's choice: each player's pick ("id:option,…") and the decided option (-1 none). */
  @type("string") choicePicks = "";
  @type("int8") chosen = -1;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: UnitState }) units = new MapSchema<UnitState>();
}
