// Making the host reachable from another network without extra software.
//
// 1. UPnP IGD: ask the home router to forward the game port to this PC (and, on IGDv2 routers,
//    to open an IPv6 pinhole). No dependency: SSDP discovery over UDP + a few SOAP calls.
// 2. Detect CGNAT: if the router's own "external" address is private/shared, or differs from the
//    address the internet sees, nothing on this side can open a port — say so instead of failing
//    silently.
// 3. List every address the partner could type, best first.
import dgram from "node:dgram";
import os from "node:os";

export interface HostReport {
  port: number;
  /** Same Wi-Fi / LAN addresses. */
  lan: string[];
  /** Tailscale addresses (100.64.0.0/10 on a local interface). */
  tailscale: string[];
  /** Global IPv6 addresses of this PC (reachable directly if both sides have IPv6). */
  ipv6: string[];
  /** IPv4 address the internet sees, if we could ask. */
  publicIp?: string;
  /** Did the router forward the port for us? */
  upnp: "open" | "failed" | "none";
  /** The router opened an IPv6 pinhole too. */
  pinhole: boolean;
  /** Our provider shares the public address (or a second router sits in front): port forwarding can't work. */
  cgnat: boolean;
}

// ------------------------------------------------------------------ address helpers (pure, tested)

export function ipv4Parts(ip: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/** 10/8, 172.16/12, 192.168/16, 169.254/16. */
export function isPrivateV4(ip: string): boolean {
  const p = ipv4Parts(ip);
  if (!p) return false;
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254);
}

/** 100.64.0.0/10: carrier-grade NAT space, also what Tailscale hands out. */
export function isSharedV4(ip: string): boolean {
  const p = ipv4Parts(ip);
  return !!p && p[0] === 100 && p[1] >= 64 && p[1] <= 127;
}

/** Global unicast IPv6 (2000::/3), i.e. not link-local, ULA or loopback. */
export function isGlobalV6(ip: string): boolean {
  return /^[23][0-9a-f]{0,3}:/i.test(ip);
}

/**
 * Port forwarding can't work if the router itself only has a private/shared address, or if the
 * internet sees a different address than the router thinks it has.
 */
export function detectCgnat(routerIp: string | undefined, publicIp: string | undefined): boolean {
  if (routerIp && (isPrivateV4(routerIp) || isSharedV4(routerIp))) return true;
  return !!routerIp && !!publicIp && routerIp !== publicIp;
}

export function localAddresses(): { lan: string[]; tailscale: string[]; ipv6: string[] } {
  const all = Object.values(os.networkInterfaces()).flat().filter((i): i is os.NetworkInterfaceInfo => !!i && !i.internal);
  const v4 = all.filter((i) => i.family === "IPv4").map((i) => i.address);
  const v6 = all.filter((i) => i.family === "IPv6" && isGlobalV6(i.address)).map((i) => i.address);
  return {
    tailscale: v4.filter(isSharedV4),
    lan: v4.filter((a) => !isSharedV4(a)),
    ipv6: [...new Set(v6)],
  };
}

// ------------------------------------------------------------------ UPnP parsing (pure, tested)

export function ssdpLocation(response: string): string | undefined {
  return /^location:\s*(\S+)/im.exec(response)?.[1];
}

export interface IgdService {
  type: string;
  control: string;
}

/** The WAN connection (IPv4 forwarding) and IPv6 firewall services from a device description. */
export function parseServices(xml: string, location: string): IgdService[] {
  const base = /<URLBase>\s*([^<\s]+)\s*<\/URLBase>/i.exec(xml)?.[1] ?? location;
  const out: IgdService[] = [];
  for (const block of xml.match(/<service>[\s\S]*?<\/service>/gi) ?? []) {
    const type = /<serviceType>\s*([^<\s]+)\s*<\/serviceType>/i.exec(block)?.[1];
    const control = /<controlURL>\s*([^<\s]+)\s*<\/controlURL>/i.exec(block)?.[1];
    if (!type || !control || !/WAN(IP|PPP)Connection|WANIPv6FirewallControl/.test(type)) continue;
    out.push({ type, control: new URL(control, base).toString() });
  }
  return out;
}

export function soapBody(serviceType: string, action: string, args: Record<string, string | number>): string {
  const inner = Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join("");
  return `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${serviceType}">${inner}</u:${action}></s:Body></s:Envelope>`;
}

export function soapValue(xml: string, tag: string): string | undefined {
  return new RegExp(`<(?:\\w+:)?${tag}>\\s*([^<]*?)\\s*</(?:\\w+:)?${tag}>`, "i").exec(xml)?.[1];
}

// ------------------------------------------------------------------ network calls

const SSDP_TARGETS = [
  "urn:schemas-upnp-org:device:InternetGatewayDevice:2",
  "urn:schemas-upnp-org:device:InternetGatewayDevice:1",
  "urn:schemas-upnp-org:service:WANIPConnection:1",
  "urn:schemas-upnp-org:service:WANPPPConnection:1",
];

/** Finds routers on the LAN; resolves with their description URLs. */
function discover(timeoutMs: number): Promise<string[]> {
  return new Promise((resolve) => {
    const found = new Set<string>();
    const socket = dgram.createSocket("udp4");
    const done = () => {
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      resolve([...found]);
    };
    socket.on("message", (msg) => {
      const loc = ssdpLocation(msg.toString());
      if (loc) found.add(loc);
    });
    socket.on("error", done);
    socket.bind(() => {
      for (const st of SSDP_TARGETS) {
        const req = `M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`;
        socket.send(req, 1900, "239.255.255.250");
      }
    });
    setTimeout(done, timeoutMs);
  });
}

async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 3000): Promise<string> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(soapValue(text, "errorDescription") ?? `HTTP ${res.status}`);
  return text;
}

function soap(svc: IgdService, action: string, args: Record<string, string | number> = {}) {
  return fetchText(svc.control, {
    method: "POST",
    headers: { "Content-Type": 'text/xml; charset="utf-8"', SOAPAction: `"${svc.type}#${action}"` },
    body: soapBody(svc.type, action, args),
  });
}

/** The LAN address of ours that sits in the same subnet as the router (it must forward there). */
function lanAddressFor(routerUrl: string, lan: string[]): string | undefined {
  const host = new URL(routerUrl).hostname;
  const prefix = host.split(".").slice(0, 3).join(".");
  return lan.find((a) => a.startsWith(prefix + ".")) ?? lan.find(isPrivateV4);
}

/** Asks the internet which IPv4 address we come from (one small HTTPS request). */
async function publicIpv4(): Promise<string | undefined> {
  for (const url of ["https://api.ipify.org", "https://ipv4.icanhazip.com"]) {
    try {
      const ip = (await fetchText(url, {}, 3000)).trim();
      if (ipv4Parts(ip)) return ip;
    } catch {
      /* try the next one */
    }
  }
  return undefined;
}

const LEASE_S = 3600;

/** Keeps the router mappings alive while hosting and removes them on close. */
export class PortOpener {
  private wan?: IgdService;
  private fw?: IgdService;
  private pinholeId?: string;
  private permanent = false;
  private renewTimer?: NodeJS.Timeout;
  private internal?: string;

  /** `find` and `whoAmI` are swappable so tests can run against a fake router. */
  constructor(
    private readonly port: number,
    private readonly find: (timeoutMs: number) => Promise<string[]> = discover,
    private readonly whoAmI: () => Promise<string | undefined> = publicIpv4,
    private readonly addresses: () => ReturnType<typeof localAddresses> = localAddresses,
  ) {}

  async open(): Promise<HostReport> {
    const local = this.addresses();
    const report: HostReport = { port: this.port, ...local, upnp: "none", pinhole: false, cgnat: false };
    const [locations, publicIp] = await Promise.all([this.find(2500), this.whoAmI()]);
    report.publicIp = publicIp;
    let routerIp: string | undefined;
    for (const loc of locations) {
      try {
        const services = parseServices(await fetchText(loc), loc);
        const wan = services.find((s) => /WAN(IP|PPP)Connection/.test(s.type));
        if (wan && !this.wan) {
          this.wan = wan;
          this.internal = lanAddressFor(loc, local.lan);
        }
        this.fw ??= services.find((s) => /WANIPv6FirewallControl/.test(s.type));
      } catch {
        /* not a router we can talk to */
      }
    }
    if (this.wan && this.internal) {
      try {
        routerIp = soapValue(await soap(this.wan, "GetExternalIPAddress"), "NewExternalIPAddress");
      } catch {
        /* some routers hide it; the mapping may still work */
      }
      report.upnp = (await this.mapPort()) ? "open" : "failed";
      if (report.upnp === "open" && !this.permanent) this.renewTimer = setInterval(() => void this.mapPort(), (LEASE_S / 2) * 1000);
    }
    if (this.fw && local.ipv6.length) report.pinhole = await this.openPinhole(local.ipv6[0]);
    report.cgnat = detectCgnat(routerIp, publicIp);
    return report;
  }

  private async mapPort(): Promise<boolean> {
    const args = (lease: number) => ({
      NewRemoteHost: "",
      NewExternalPort: this.port,
      NewProtocol: "TCP",
      NewInternalPort: this.port,
      NewInternalClient: this.internal!,
      NewEnabled: 1,
      NewPortMappingDescription: "Broken Ash",
      NewLeaseDuration: lease,
    });
    try {
      await soap(this.wan!, "AddPortMapping", args(this.permanent ? 0 : LEASE_S));
      return true;
    } catch {
      // Older routers only accept permanent mappings (UPnP error 725); we remove it on close.
      if (this.permanent) return false;
      try {
        await soap(this.wan!, "AddPortMapping", args(0));
        this.permanent = true;
        return true;
      } catch {
        return false;
      }
    }
  }

  private async openPinhole(ipv6: string): Promise<boolean> {
    try {
      const xml = await soap(this.fw!, "AddPinhole", { RemoteHost: "", RemotePort: 0, InternalClient: ipv6, InternalPort: this.port, Protocol: 6, LeaseTime: 86400 });
      this.pinholeId = soapValue(xml, "UniqueID");
      return true;
    } catch {
      return false;
    }
  }

  /** Best effort, called when the app quits. */
  async close() {
    clearInterval(this.renewTimer);
    const jobs: Promise<unknown>[] = [];
    if (this.wan && this.internal) jobs.push(soap(this.wan, "DeletePortMapping", { NewRemoteHost: "", NewExternalPort: this.port, NewProtocol: "TCP" }).catch(() => {}));
    if (this.fw && this.pinholeId) jobs.push(soap(this.fw, "DeletePinhole", { UniqueID: this.pinholeId }).catch(() => {}));
    await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 1500))]);
  }
}
