import { MapSchema, Schema, type } from "@colyseus/schema";

/**
 * Synced player state. It carries the whole movement body, so the owning client can rewind its
 * prediction to exactly what the server simulated (see client/src/net/Prediction.ts).
 */
export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  /** Which of the two convict looks this player wears ("a" or "b"). */
  @type("string") look = "a";
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
}

export class WorldState extends Schema {
  @type("string") mapId = "";
  /** The running cinematic ("" when none). Synced state, so a partner joining mid-scene sees it too. */
  @type("string") cinematic = "";
  @type("number") cinematicElapsed = 0;
  @type("uint8") skipVotes = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
