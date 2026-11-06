import type { Effect, Shape, SkillAnim, SkillDef, StatusId, WeaponId } from "./types.js";

/** Small builders for writing skills as data (paths.ts, weapons.ts). */

export const dmg = (amount: number, poise = amount * 0.6): Effect => ({ kind: "damage", amount, poise });
export const st = (status: StatusId, duration: number, value?: number, target: "enemy" | "self" | "partner" = "enemy"): Effect => ({ kind: "status", status, duration, value, target });

export interface SkillOpts {
  cd: number;
  cost?: number;
  hp?: number;
  windup: number;
  shape: Shape;
  effects: Effect[];
  anim?: SkillAnim;
  vfx: string;
  sfx: string;
  fire?: boolean;
  weapon?: WeaponId;
}

export function skill(id: string, name: string, description: string, o: SkillOpts): SkillDef {
  return {
    id,
    name,
    description,
    cooldown: o.cd,
    cost: o.cost ?? 0,
    hpCost: o.hp,
    windup: o.windup,
    shape: o.shape,
    effects: o.effects,
    anim: o.anim ?? "skill1",
    vfx: o.vfx,
    sfx: o.sfx,
    fire: o.fire,
    weapon: o.weapon,
  };
}

export const cone = (range: number, arc: number): Shape => ({ kind: "cone", range, arc });
export const circle = (radius: number, at: "self" | "aim" = "self", reach?: number): Shape => ({ kind: "circle", radius, at, reach });
export const line = (length: number, width: number): Shape => ({ kind: "line", length, width });
export const bolt = (speed: number, range: number, radius = 0.35, extra: { pierce?: boolean; count?: number; spread?: number } = {}): Shape => ({ kind: "projectile", speed, range, radius, ...extra });
export const self: Shape = { kind: "self" };
