import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { sadpEthernetFrame, sadpPayloadFromFrame } from "./activation-core.ts";

/** Optional raw L2 fallback (like SADP + Npcap). Needs Npcap installed and the native "cap" module next to the server.
 * Returns status "npcap-missing" / "module-missing" so the UI can offer the Npcap installer. */
export const NPCAP_URL = "https://npcap.com/#download";
export function npcapInstalled() {
  if (process.platform !== "win32") return false;
  const root = process.env.SystemRoot || "C:\\Windows";
  return existsSync(`${root}\\System32\\Npcap\\wpcap.dll`) || existsSync(`${root}\\System32\\wpcap.dll`);
}
type CapModule = { Cap: new () => { open(dev: string, filter: string, size: number, buf: Buffer): string; on(e: "packet", f: (n: number) => void): void; send(b: Buffer, n: number): void; close(): void }; Cap_findDevice?: unknown; findDevice?(ip: string): string };
function loadCap(): CapModule | null {
  try { return createRequire(import.meta.url)("cap") as CapModule; } catch { return null; }
}
export function pcapStatus(): "ready" | "npcap-missing" | "module-missing" | "unsupported" {
  if (process.platform !== "win32") return "unsupported";
  if (!npcapInstalled()) return "npcap-missing";
  return loadCap() ? "ready" : "module-missing";
}
/** Sends a SADP payload as a raw multicast frame on every NIC and collects SADP payloads seen within timeoutMs. */
export async function pcapExchange(payload: Buffer, timeoutMs = 3000): Promise<string[]> {
  const cap = loadCap();
  if (!cap || !npcapInstalled()) return [];
  const replies: string[] = [];
  const nics = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal && i.mac !== "00:00:00:00:00:00");
  const sessions = nics.flatMap((nic) => {
    try {
      const c = new cap.Cap(), buf = Buffer.alloc(65535);
      const dev = cap.findDevice?.(nic!.address);
      if (!dev) return [];
      c.open(dev, "udp port 37020", 10 * 1024 * 1024, buf);
      c.on("packet", (n) => { const p = sadpPayloadFromFrame(buf.subarray(0, n)); if (p && /<ProbeMatch/.test(p.toString())) replies.push(p.toString("utf8")); });
      const frame = sadpEthernetFrame(nic!.mac, payload, nic!.address);
      c.send(frame, frame.length);
      return [c];
    } catch { return []; }
  });
  await new Promise((ok) => setTimeout(ok, timeoutMs));
  for (const c of sessions) try { c.close(); } catch { /* closed */ }
  return replies;
}
