/** Options a client sends when joining the room. */
export interface JoinOptions {
  name: string;
  path?: string;
  body?: string;
  people?: string;
}

/** A transient combat event the server broadcasts for visuals and sound (MSG.fx). */
export type FxEvent =
  | { t: "cast"; id: string; skill: string; aim: number; x: number; y: number }
  | { t: "bolt"; skill: string; x: number; y: number; aim: number; speed: number; range: number; owner: string }
  | { t: "zone"; skill: string; x: number; y: number; radius: number; duration: number }
  /** A circle skill landed (where its area is). */
  | { t: "area"; skill: string; x: number; y: number; radius: number }
  | { t: "hit"; id: string; amount: number; kind: "damage" | "dot" | "heal" | "shield"; status?: string; big?: boolean }
  | { t: "death"; id: string; gore: boolean; x: number; y: number }
  | { t: "burst"; x: number; y: number; radius: number }
  | { t: "execute"; by: string; id: string }
  | { t: "downed"; id: string }
  | { t: "revived"; id: string }
  | { t: "wave"; n: number; title: string }
  | { t: "victory" }
  | { t: "gate" }
  | { t: "overheat"; id: string };
