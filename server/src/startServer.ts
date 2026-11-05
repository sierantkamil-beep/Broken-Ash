import http from "node:http";
import os from "node:os";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_PORT, ROOM_NAME } from "@broken-ash/shared";
import { WorldRoom } from "./rooms/WorldRoom.js";

export interface RunningServer {
  port: number;
  stop(): Promise<void>;
}

export interface ServerOptions {
  port?: number;
}

/**
 * Starts the authoritative game server. Exported as a function (not just a script) so the
 * desktop app can embed it when a player clicks "Hostuj grę".
 */
export async function startServer(opts: ServerOptions | number = {}): Promise<RunningServer> {
  const { port = DEFAULT_PORT } = typeof opts === "number" ? { port: opts } : opts;
  const httpServer = http.createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define(ROOM_NAME, WorldRoom);
  // "::" accepts IPv4 and IPv6 alike, so a partner can join over IPv6 without port forwarding;
  // machines with IPv6 switched off fall back to the IPv4-only default.
  const hasIpv6 = Object.values(os.networkInterfaces()).some((list) => list?.some((i) => i.family === "IPv6"));
  if (hasIpv6) {
    try {
      await gameServer.listen(port, "::");
    } catch {
      await gameServer.listen(port);
    }
  } else await gameServer.listen(port);
  return { port, stop: () => gameServer.gracefullyShutdown(false) };
}
