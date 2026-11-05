import { DEFAULT_PORT } from "@broken-ash/shared";
import type { HostReport } from "../desktop";
import { el } from "./dom";

export interface HostLine {
  label: string;
  /** What the partner types (clickable to copy). */
  address?: string;
  note?: string;
  warn?: boolean;
}

/** The address as the partner should type it: the default port is filled in on their side. */
export function partnerAddress(ip: string, port: number): string {
  if (port === DEFAULT_PORT) return ip;
  return ip.includes(":") ? `[${ip}]:${port}` : `${ip}:${port}`;
}

/** Every way the partner can reach this host, best first, plus what to fix when the internet way failed. */
export function hostLines(r: HostReport): HostLine[] {
  const lines: HostLine[] = [];
  const at = (ip: string) => partnerAddress(ip, r.port);
  const lan = r.lan.find((a) => a.startsWith("192.168.")) ?? r.lan[0];
  if (r.publicIp && r.upnp === "open" && !r.cgnat) lines.push({ label: "Przez internet", address: at(r.publicIp), note: "port otwarty automatycznie" });
  if (r.ipv6.length) lines.push({ label: "Przez internet (IPv6)", address: at(r.ipv6[0]), note: r.pinhole ? "router wpuszcza ruch" : "zadziała, jeśli oboje macie IPv6" });
  if (r.tailscale.length) lines.push({ label: "Tailscale", address: at(r.tailscale[0]) });
  if (lan) lines.push({ label: "Ta sama sieć Wi-Fi", address: at(lan) });
  if (!lines.length) lines.push({ label: "Na tym komputerze", address: at("localhost") });

  const forward = `przekieruj ręcznie port ${r.port} (TCP) na ${lan ?? "ten komputer"}`;
  if (r.cgnat)
    lines.push({ label: "Uwaga", warn: true, note: "Dostawca internetu współdzieli twój adres IP (CGNAT), więc otwarcie portu nic nie da. Przez internet zadziała IPv6 (jeśli oboje go macie) albo Tailscale." });
  else if (r.upnp === "failed") lines.push({ label: "Uwaga", warn: true, note: `Router nie zgodził się otworzyć portu. Włącz UPnP w ustawieniach routera albo ${forward}${r.publicIp ? ` i podaj partnerowi ${at(r.publicIp)}` : ""}.` });
  else if (r.upnp === "none") lines.push({ label: "Uwaga", warn: true, note: `Nie znaleziono routera z UPnP. Aby grać przez internet, ${forward}${r.publicIp ? ` i podaj partnerowi ${at(r.publicIp)}` : ""}.` });
  return lines;
}

/** Renders the lines; clicking an address copies it. */
export function renderHostLines(r: HostReport, compact = false): HTMLElement {
  const box = el("div", `host-report${compact ? " compact" : ""}`);
  for (const line of hostLines(r)) {
    if (compact && line.warn) continue;
    const row = el("div", `host-line${line.warn ? " warn" : ""}`);
    row.append(el("span", "host-label", `${line.label}:`));
    if (line.address) {
      const addr = el("button", "host-addr", line.address);
      addr.title = "Kliknij, aby skopiować";
      addr.addEventListener("click", () => {
        void navigator.clipboard?.writeText(line.address!).then(() => {
          addr.textContent = "skopiowano ✓";
          setTimeout(() => (addr.textContent = line.address!), 1200);
        });
      });
      row.append(addr);
    }
    if (line.note && !compact) row.append(el("span", "host-note", line.address ? ` (${line.note})` : ` ${line.note}`));
    box.append(row);
  }
  if (!compact) box.append(el("div", "host-note", "Przy pierwszym hostowaniu Windows zapyta o zaporę — kliknij „Zezwól”."));
  return box;
}
