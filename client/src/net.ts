import { Client, getStateCallbacks, type Room } from "colyseus.js";
import { DEFAULT_PORT, ROOM_NAME, type JoinOptions } from "@broken-ash/shared";

/** Accepts "host", "host:port", IPv6 (bare or "[addr]:port") or a full ws:// / http:// URL, so players can paste whatever they were given. */
export function toServerUrl(address: string): string {
  const trimmed = address.trim().replace(/\/+$/, "");
  if (/^wss?:\/\//.test(trimmed)) return trimmed;
  if (/^https?:\/\//.test(trimmed)) return toServerUrl(trimmed.replace(/^http(s?):\/\//, ""));
  // IPv6: "[addr]:port", "[addr]" or a bare address (several colons, so no port can be told apart).
  if (trimmed.startsWith("[")) return /\]:\d+$/.test(trimmed) ? `ws://${trimmed}` : `ws://${trimmed}:${DEFAULT_PORT}`;
  if ((trimmed.match(/:/g) ?? []).length > 1) return `ws://[${trimmed}]:${DEFAULT_PORT}`;
  const withPort = /:\d+$/.test(trimmed) ? trimmed : `${trimmed}:${DEFAULT_PORT}`;
  return `ws://${withPort}`;
}

export async function joinWorld(address: string, options: JoinOptions): Promise<Room> {
  const client = new Client(toServerUrl(address));
  return client.joinOrCreate(ROOM_NAME, options);
}

export { getStateCallbacks };
export type { Room };
