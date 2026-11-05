/** Network and simulation constants shared by server and client. */
export const DEFAULT_PORT = 2580;
export const ROOM_NAME = "aeldrith";
/** The game is built for exactly two players. */
export const MAX_PLAYERS = 2;
/** Fixed simulation step. Client prediction and the server run the same step, so they agree. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
/** How often the server sends state patches. Remote players are rendered this far behind to interpolate. */
export const PATCH_HZ = 20;
export const INTERP_DELAY_MS = 110;
export const MAX_NAME_LENGTH = 20;

export const MSG = {
  /** client → server: a batch of input frames. */
  input: "input",
  /** client → server: vote to skip the running cinematic. */
  skip: "skip",
  /** server → client: a batch of FxEvents (hits, casts, deaths...) for visuals and sound. */
  fx: "fx",
} as const;
