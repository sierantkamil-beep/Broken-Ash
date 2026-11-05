import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { detectCgnat, isGlobalV6, isPrivateV4, isSharedV4, parseServices, PortOpener, soapValue, ssdpLocation } from "./network";

describe("address helpers", () => {
  it("classifies IPv4 and IPv6", () => {
    expect(isPrivateV4("192.168.1.20")).toBe(true);
    expect(isPrivateV4("172.20.0.1")).toBe(true);
    expect(isPrivateV4("89.64.12.34")).toBe(false);
    expect(isSharedV4("100.101.5.6")).toBe(true);
    expect(isSharedV4("100.20.5.6")).toBe(false);
    expect(isGlobalV6("2a02:a31a:1:2::5")).toBe(true);
    expect(isGlobalV6("fe80::1")).toBe(false);
    expect(isGlobalV6("fd00::1")).toBe(false);
  });

  it("spots CGNAT from the router's external address", () => {
    expect(detectCgnat("89.64.12.34", "89.64.12.34")).toBe(false);
    expect(detectCgnat("100.70.1.2", "89.64.12.34")).toBe(true);
    expect(detectCgnat("10.0.0.5", undefined)).toBe(true);
    expect(detectCgnat("89.64.12.34", "89.64.99.1")).toBe(true);
    expect(detectCgnat(undefined, "89.64.12.34")).toBe(false);
  });

  it("parses SSDP answers, device descriptions and SOAP replies", () => {
    expect(ssdpLocation("HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.1:5000/rootDesc.xml\r\n\r\n")).toBe("http://192.168.1.1:5000/rootDesc.xml");
    const xml = `<root><device><serviceList>
      <service><serviceType>urn:schemas-upnp-org:service:Layer3Forwarding:1</serviceType><controlURL>/l3f</controlURL></service>
      <service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><controlURL>/ctl/IPConn</controlURL></service>
    </serviceList></device></root>`;
    expect(parseServices(xml, "http://192.168.1.1:5000/rootDesc.xml")).toEqual([{ type: "urn:schemas-upnp-org:service:WANIPConnection:1", control: "http://192.168.1.1:5000/ctl/IPConn" }]);
    expect(soapValue("<s:Body><u:R><NewExternalIPAddress>89.64.12.34</NewExternalIPAddress></u:R></s:Body>", "NewExternalIPAddress")).toBe("89.64.12.34");
  });
});

/** A tiny fake IGD router: serves its description and answers SOAP actions. */
function fakeRouter(opts: { externalIp: string; refuseLease?: boolean; refuseAll?: boolean }) {
  const calls: { action: string; body: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "GET") {
        res.end(`<root><device><serviceList><service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><controlURL>/ctl</controlURL></service></serviceList></device></root>`);
        return;
      }
      const action = /#(\w+)"/.exec(String(req.headers.soapaction))?.[1] ?? "";
      calls.push({ action, body });
      const fault = () => {
        res.statusCode = 500;
        res.end("<s:Fault><detail><UPnPError><errorCode>725</errorCode><errorDescription>OnlyPermanentLeasesSupported</errorDescription></UPnPError></detail></s:Fault>");
      };
      if (action === "GetExternalIPAddress") return res.end(`<u:R><NewExternalIPAddress>${opts.externalIp}</NewExternalIPAddress></u:R>`);
      if (action === "AddPortMapping") {
        if (opts.refuseAll) return fault();
        if (opts.refuseLease && !body.includes("<NewLeaseDuration>0<")) return fault();
      }
      res.end("<ok/>");
    });
  });
  return new Promise<{ url: string; calls: typeof calls; close: () => void }>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/desc.xml`, calls, close: () => server.close() })),
  );
}

describe("PortOpener against a fake router", () => {
  let close = () => {};
  afterEach(() => close());
  const local = () => ({ lan: ["127.0.0.5"], tailscale: [], ipv6: [] });

  it("opens the port and reports the public address", async () => {
    const router = await fakeRouter({ externalIp: "89.64.12.34" });
    close = router.close;
    const opener = new PortOpener(2567, async () => [router.url], async () => "89.64.12.34", local);
    const report = await opener.open();
    expect(report).toMatchObject({ upnp: "open", cgnat: false, publicIp: "89.64.12.34" });
    const add = router.calls.find((c) => c.action === "AddPortMapping")!;
    expect(add.body).toContain("<NewInternalClient>127.0.0.5</NewInternalClient>");
    expect(add.body).toContain("<NewExternalPort>2567</NewExternalPort>");
    await opener.close();
    expect(router.calls.some((c) => c.action === "DeletePortMapping")).toBe(true);
  });

  it("falls back to a permanent mapping and spots CGNAT", async () => {
    const router = await fakeRouter({ externalIp: "100.72.3.4", refuseLease: true });
    close = router.close;
    const opener = new PortOpener(2567, async () => [router.url], async () => "89.64.12.34", local);
    const report = await opener.open();
    expect(report.upnp).toBe("open");
    expect(report.cgnat).toBe(true);
    expect(router.calls.filter((c) => c.action === "AddPortMapping")).toHaveLength(2);
    await opener.close();
  });

  it("reports a refusal and works without any router", async () => {
    const router = await fakeRouter({ externalIp: "89.64.12.34", refuseAll: true });
    close = router.close;
    expect((await new PortOpener(2567, async () => [router.url], async () => undefined, local).open()).upnp).toBe("failed");
    expect((await new PortOpener(2567, async () => [], async () => undefined, local).open()).upnp).toBe("none");
  });
});
