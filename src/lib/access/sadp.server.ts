import dgram from "node:dgram";
import { networkInterfaces } from "node:os";
import { randomUUID } from "node:crypto";

/** Read-only Hikvision discovery (SADP-compatible multicast probe + optional ISAPI fingerprint).
 * Never activates, re-addresses or authenticates against a device. */
export type FoundDevice = {
  source: "sadp" | "isapi";
  model: string;
  ip: string;
  httpPort: number;
  mac: string;
  serial: string;
  firmware: string;
  activated: boolean | null;
};
export const SADP_GROUP = "239.255.255.250";
export const SADP_PORT = 37020;
export function probeXml(uuid = randomUUID().toUpperCase()) {
  return `<?xml version="1.0" encoding="utf-8"?><Probe><Uuid>${uuid}</Uuid><Types>inquiry</Types></Probe>`;
}
const tag = (xml: string, name: string) =>
  (xml.match(new RegExp(`<${name}>([^<]*)</${name}>`)) || [])[1]?.trim() || "";
function isPrivate(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return false;
  const [a, b] = p;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
export function parseProbeMatch(xml: string, from = ""): FoundDevice | null {
  if (!/<ProbeMatch[\s>]/.test(xml)) return null;
  const ip = tag(xml, "IPv4Address") || from;
  if (!isPrivate(ip)) return null;
  const port = Number(tag(xml, "HttpPort")) || 80;
  const activated = tag(xml, "Activated").toLowerCase();
  return {
    source: "sadp",
    model: tag(xml, "DeviceDescription") || tag(xml, "DeviceType"),
    ip,
    httpPort: port > 0 && port < 65536 ? port : 80,
    mac: tag(xml, "MAC").toLowerCase(),
    serial: tag(xml, "DeviceSN"),
    firmware: tag(xml, "SoftwareVersion"),
    activated: activated === "true" ? true : activated === "false" ? false : null,
  };
}
export function localIPv4() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => ({ address: i!.address, netmask: i!.netmask }));
}
export async function sadpDiscover(timeoutMs = 3000): Promise<FoundDevice[]> {
  const found = new Map<string, FoundDevice>();
  const message = Buffer.from(probeXml());
  await Promise.all(
    localIPv4().map(
      ({ address }) =>
        new Promise<void>((done) => {
          const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
          const finish = () => {
            try { socket.close(); } catch { /* closed */ }
            done();
          };
          socket.on("error", finish);
          socket.on("message", (buffer, remote) => {
            const row = parseProbeMatch(buffer.toString("utf8"), remote.address);
            if (row) found.set(row.mac || row.ip, row);
          });
          socket.bind(0, address, () => {
            try { socket.setMulticastInterface(address); } catch { /* default route */ }
            const send = () => socket.send(message, SADP_PORT, SADP_GROUP, () => {});
            send();
            setTimeout(send, 700);
            setTimeout(finish, timeoutMs);
          });
        }),
    ),
  );
  return [...found.values()];
}
/** Fingerprint from an unauthenticated response: 401 Digest on /ISAPI or a DeviceInfo body. */
export function isapiFingerprint(status: number, authenticate: string, body: string) {
  if (status === 200 && /<DeviceInfo[\s>]/.test(body))
    return { model: tag(body, "model"), serial: tag(body, "serialNumber"), mac: tag(body, "macAddress").toLowerCase(), firmware: tag(body, "firmwareVersion") };
  if (status === 401 && /digest/i.test(authenticate))
    return { model: (authenticate.match(/realm="([^"]*)"/i) || [])[1] || "", serial: "", mac: "", firmware: "" };
  return null;
}
export function subnetHosts(address: string, netmask: string) {
  const n = (ip: string) => ip.split(".").reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
  const ip = n(address), mask = n(netmask);
  const prefix = (mask >>> 0).toString(2).replace(/0+$/, "").length;
  if (prefix < 22 || prefix > 30) return [];
  const net = ip & mask, size = 2 ** (32 - prefix);
  const out: string[] = [];
  for (let i = 1; i < size - 1; i++) {
    const v = (net + i) >>> 0;
    if (v !== ip) out.push([v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join("."));
  }
  return out;
}
export async function isapiScan(ports = [80, 8000], timeoutMs = 900): Promise<FoundDevice[]> {
  const targets = localIPv4()
    .filter(({ address }) => isPrivate(address) && !address.startsWith("100."))
    .flatMap(({ address, netmask }) => subnetHosts(address, netmask))
    .flatMap((ip) => ports.map((port) => ({ ip, port })));
  const found: FoundDevice[] = [];
  let next = 0;
  async function worker() {
    while (next < targets.length) {
      const { ip, port } = targets[next++];
      try {
        const response = await fetch(`http://${ip}:${port}/ISAPI/System/deviceInfo`, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
        const body = response.status === 200 ? (await response.text()).slice(0, 8000) : "";
        const print = isapiFingerprint(response.status, response.headers.get("www-authenticate") || "", body);
        if (print && !found.some((row) => row.ip === ip))
          found.push({ source: "isapi", ip, httpPort: port, activated: null, ...print });
      } catch { /* closed or not Hikvision */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(64, targets.length) }, worker));
  return found;
}
export async function discoverDevices(options: { deepScan?: boolean } = {}) {
  const sadp = await sadpDiscover();
  const extra = options.deepScan || sadp.length === 0 ? await isapiScan() : [];
  const devices = [...sadp, ...extra.filter((row) => !sadp.some((s) => s.ip === row.ip))];
  return { devices, interfaces: localIPv4().map((i) => i.address), sadp: sadp.length, scanned: options.deepScan || sadp.length === 0 };
}
