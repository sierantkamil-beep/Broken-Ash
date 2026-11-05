import { describe, expect, it } from "vitest";
import { DEFAULT_PORT } from "@broken-ash/shared";
import type { HostReport } from "../desktop";
import { hostLines, partnerAddress } from "./hostReport";

const base: HostReport = { port: DEFAULT_PORT, lan: ["192.168.1.20"], tailscale: [], ipv6: [], upnp: "none", pinhole: false, cgnat: false };

describe("host report", () => {
  it("leaves the default port out", () => {
    expect(partnerAddress("89.64.12.34", DEFAULT_PORT)).toBe("89.64.12.34");
    expect(partnerAddress("89.64.12.34", 3000)).toBe("89.64.12.34:3000");
    expect(partnerAddress("2a02::5", 3000)).toBe("[2a02::5]:3000");
  });

  it("puts the public address first when the router opened the port", () => {
    const lines = hostLines({ ...base, upnp: "open", publicIp: "89.64.12.34", ipv6: ["2a02::5"] });
    expect(lines[0]).toMatchObject({ label: "Przez internet", address: "89.64.12.34" });
    expect(lines.map((l) => l.label)).toEqual(["Przez internet", "Przez internet (IPv6)", "Ta sama sieć Wi-Fi"]);
  });

  it("explains CGNAT and how to forward by hand", () => {
    expect(hostLines({ ...base, upnp: "open", publicIp: "89.64.12.34", cgnat: true }).some((l) => l.warn && l.note!.includes("CGNAT"))).toBe(true);
    const failed = hostLines({ ...base, upnp: "failed", publicIp: "89.64.12.34" }).find((l) => l.warn)!;
    expect(failed.note).toContain(`port ${DEFAULT_PORT} (TCP) na 192.168.1.20`);
    expect(failed.note).toContain("89.64.12.34");
  });
});
