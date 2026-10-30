/**
 * Reads the Tailscale client already installed on this Windows PC (`tailscale status --json`)
 * and returns the fingerprint addresses advertised as subnet routes, not the computers' 100.x addresses.
 */
import { AccessError } from "./store.server";
import { AUTH_URL, fingerprintRoutes, isDeviceAddress, isTailscaleAuthUrl, pickPrivateBrowser } from "./tailscale-core";
import { isapiFingerprint } from "./sadp.server";

type RawPeer = { HostName?: string; DNSName?: string; TailscaleIPs?: string[]; Online?: boolean; OS?: string; UserID?: number; PrimaryRoutes?: string[]; AllowedIPs?: string[] };
type Status = {
  BackendState?: string;
  AuthURL?: string;
  Self?: RawPeer;
  User?: Record<string, { LoginName?: string; DisplayName?: string }>;
  Peer?: Record<string, RawPeer>;
};
export type DeviceRow = { name: string; dns: string; ip: string; os: string; online: boolean };

function exeCandidates() {
  return [process.env.TAILSCALE_EXE || "", "C:\\Program Files\\Tailscale\\tailscale.exe", "C:\\Program Files (x86)\\Tailscale\\tailscale.exe"].filter(Boolean);
}

async function tailscaleExe() {
  const { existsSync } = await import("node:fs");
  for (const path of exeCandidates()) if (existsSync(path)) return path;
  return "tailscale";
}

function run(exe: string, args: string[], timeoutMs: number) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    import("node:child_process").then(({ spawn }) => {
      const child = spawn(exe, args, { windowsHide: true });
      let out = "", err = "", settled = false;
      const finish = (code: number) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code, out, err }); };
      const timer = setTimeout(() => finish(-1), timeoutMs);
      child.stdout?.on("data", (d) => { out += String(d); });
      child.stderr?.on("data", (d) => { err += String(d); });
      child.on("error", (e) => { err += e.message; finish(-1); });
      child.on("close", (code) => finish(code ?? 1));
    }).catch((e) => resolve({ code: -1, out: "", err: String(e) }));
  });
}

function parseStatus(text: string): Status | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  try { return JSON.parse(text.slice(start)) as Status; } catch { return null; }
}

function rowsOf(status: Status): DeviceRow[] {
  return fingerprintRoutes(status.Peer).map((row) => ({ ...row, dns: "" }));
}

async function readStatus() {
  const exe = await tailscaleExe();
  const r = await run(exe, ["status", "--json"], 12000);
  const status = parseStatus(r.out) || parseStatus(r.err);
  if (!status) throw new AccessError("TAILSCALE", "مش لاقي Tailscale على الويندوز، أو مش شغال. افتح برنامج Tailscale أولاً.");
  const self = status.Self || {};
  const user = status.User?.[String(self.UserID)] || {};
  return {
    state: status.BackendState || "",
    account: user.LoginName || "",
    displayName: user.DisplayName || "",
    selfName: self.HostName || "",
    selfIp: (self.TailscaleIPs || [])[0] || "",
    authUrl: status.AuthURL || "",
    devices: rowsOf(status),
  };
}

async function openPrivate(url: string) {
  if (!isTailscaleAuthUrl(url) || process.platform !== "win32") return false;
  const { existsSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const pick = pickPrivateBrowser(process.env, existsSync, url, mkdtempSync(join(tmpdir(), "speed-tailscale-")));
  if (!pick) return false;
  const { spawn } = await import("node:child_process");
  spawn(pick.exe, pick.args, { windowsHide: false, detached: true, stdio: "ignore" }).unref();
  return true;
}

/** Fingerprint addresses behind online Tailscale machines. */
export async function listTailscaleDevices() {
  return readStatus();
}

/**
 * Log this PC's Tailscale out and start a fresh login. The auth URL joins THIS computer,
 * unlike opening the admin website, which only shows machines and saves nothing back.
 */
export async function switchTailscaleAccount() {
  const exe = await tailscaleExe();
  await run(exe, ["logout"], 20000);
  const { spawn } = await import("node:child_process");
  const child = spawn(exe, ["login"], { windowsHide: true });
  let buf = "";
  const url = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve(AUTH_URL.exec(buf)?.[0] || ""), 10000);
    const take = (d: Buffer) => {
      buf += d.toString();
      const m = AUTH_URL.exec(buf);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    };
    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
    child.on("error", () => { clearTimeout(timer); resolve(""); });
  });
  child.unref();
  const opened = url ? await openPrivate(url) : false;
  return { url, opened };
}

export async function reachDevice(host: string, port: number) {
  if (!isDeviceAddress(host) || port < 1 || port > 65535) throw new AccessError("ENDPOINT", "العنوان لازم يكون IP خاص أو Tailscale، مش عنوان إنترنت عام.");
  const started = Date.now();
  try {
    const res = await fetch(`http://${host}:${port}/ISAPI/System/deviceInfo`, { redirect: "manual", signal: AbortSignal.timeout(4000) });
    const print = isapiFingerprint(res.status, res.headers.get("www-authenticate") || "", res.status === 200 ? (await res.text()).slice(0, 8000) : "");
    return { reachable: true, hikvision: Boolean(print), model: print?.model || "", ms: Date.now() - started };
  } catch {
    return { reachable: false, hikvision: false, model: "", ms: Date.now() - started };
  }
}
