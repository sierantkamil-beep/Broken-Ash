/** What the desktop app found out when it started hosting (mirrors desktop/src/network.ts). */
export interface HostReport {
  port: number;
  lan: string[];
  tailscale: string[];
  ipv6: string[];
  publicIp?: string;
  upnp: "open" | "failed" | "none";
  pinhole: boolean;
  cgnat: boolean;
}

/** API exposed by the Electron preload script. Absent when running in a normal browser. */
export interface DesktopBridge {
  startHost(): Promise<HostReport>;
}

declare global {
  interface Window {
    brokenAsh?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = window.brokenAsh;
