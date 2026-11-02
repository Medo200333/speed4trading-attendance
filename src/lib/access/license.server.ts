import { networkInterfaces, hostname, homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import configuration from "../../../brand.config.json";
import { evaluate, hashComponent, isLocalAdminMac, machineFingerprint, normalizeMac, openTrial, requestCode, sealTrial, verifyLicense, VIRTUAL_ADAPTER, type LicenseState, type Machine, type TrialRecord } from "./license-core";

/** Licensing is active only in packaged builds (desktop main sets SKYLINE_LICENSE_ENFORCE=1). */
export const licenseEnforced = () => process.env.SKYLINE_LICENSE_ENFORCE === "1";
const REG = "HKCU\\Software\\SpeedForTraining\\License";
function dataDir() {
  const dir = process.env.SKYLINE_ACCESS_DATA_DIR || join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  return dir;
}
const isWin = () => process.platform === "win32";
function run(cmd: string, args: string[]) {
  try { return execFileSync(cmd, args, { encoding: "utf8", windowsHide: true, timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; }
}
let hwCache: Record<string, string> | null = null;
/** Stable hardware ids, read once per process. VPN/virtual adapters are never used. */
function hardwareIds(): Record<string, string> {
  if (hwCache) return hwCache;
  const ids: Record<string, string> = {};
  const android = normalizeMac(process.env.SPEED_DEVICE_ID || "");
  if (android) ids.a = hashComponent("a", android);
  else if (isWin() && process.env.SKYLINE_LICENSE_NO_HW !== "1") {
    const guid = (run("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid", "/reg:64"]).match(/MachineGuid\s+REG_SZ\s+(\S+)/) || [])[1] || "";
    const ps = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "$u=(Get-CimInstance Win32_ComputerSystemProduct).UUID;$c=(Get-CimInstance Win32_Processor|Select-Object -First 1).ProcessorId;" +
      "$d=(Get-CimInstance Win32_DiskDrive|Where-Object {$_.Index -eq 0}).SerialNumber;\"u=$u`nc=$c`nd=$d\""]);
    const kv = Object.fromEntries(ps.split(/\r?\n/).map((l) => l.split("=")).filter((x) => x.length >= 2).map(([k, ...v]) => [k.trim(), v.join("=").trim()]));
    for (const [k, raw] of [["g", guid], ["u", kv.u], ["c", kv.c], ["d", kv.d]] as const) { const h = hashComponent(k, raw || ""); if (h) ids[k] = h; }
  } else if (process.platform === "linux") {
    const mid = (() => { try { return readFileSync("/etc/machine-id", "utf8"); } catch { return ""; } })();
    const h = hashComponent("g", mid); if (h) ids.g = h;
  }
  hwCache = ids;
  return ids;
}
export function machineIdentity(): Machine {
  const macs = new Set<string>();
  // Android host (nodejs-mobile) passes a stable 12-hex id derived from sha256(ANDROID_ID + model); Android hides real MACs.
  const fixed = normalizeMac(process.env.SPEED_DEVICE_ID || "");
  if (fixed) return { name: process.env.SPEED_DEVICE_NAME || hostname(), macs: [fixed], ids: hardwareIds() };
  for (const [name, rows] of Object.entries(networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const row of rows || []) {
      const mac = normalizeMac(row.mac || "");
      if (!row.internal && mac && !/^0+$/.test(mac) && !isLocalAdminMac(mac)) macs.add(mac);
    }
  }
  return { name: hostname(), macs: [...macs].sort(), ids: hardwareIds() };
}
const noRegistry = () => !isWin() || process.env.SKYLINE_LICENSE_NO_REGISTRY === "1";
function regGet(name: string) {
  if (noRegistry()) return "";
  const out = run("reg", ["query", REG, "/v", name]);
  return (out.match(new RegExp(name + "\\s+REG_SZ\\s+(.*)")) || [])[1]?.trim() || "";
}
function regSet(name: string, value: string) {
  if (noRegistry()) return;
  run("reg", ["add", REG, "/v", name, "/t", "REG_SZ", "/d", value, "/f"]);
}
type Stored = { trialStart?: number; lastSeen?: number; mac?: string; code?: string; requestId?: string; requestEmail?: string };
const stateFile = () => join(dataDir(), "license-state.json");
function readJson(path: string): Stored { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return {}; } }
function writeJson(path: string, value: unknown) {
  try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value), { mode: 0o600 }); } catch { /* best effort */ }
}
const readFile = () => readJson(stateFile());
/** Extra trial stores outside the app data folder (survive an uninstall that wipes app data). Windows only; skipped in tests. */
function extraStores(): string[] {
  if (process.env.SKYLINE_LICENSE_NO_EXTRA_STORES === "1" || !isWin()) return [];
  const pd = process.env.ProgramData || "C:\\ProgramData", la = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  return [join(pd, "SpeedForTrainingLic", "t.json"), join(la, "SpeedForTrainingLic", "t.json")];
}
/** Wall-clock lower bound from the monotonic clock: catches the clock being moved back while the app runs. */
const boot = { wall: Date.now(), mono: Number(process.hrtime.bigint() / 1000000n) };
const monotonicFloor = () => boot.wall + (Number(process.hrtime.bigint() / 1000000n) - boot.mono);

let cache: { at: number; state: LicenseState } | null = null;
export function licenseState(now = Date.now()): LicenseState & { machine: Machine; requestCode: string; machineId: string; enforced: boolean } {
  const machine = machineIdentity();
  const extra = { machine, requestCode: requestCode(machine), machineId: machineFingerprint(machine), enforced: licenseEnforced() };
  if (!licenseEnforced()) return { mode: "licensed", reason: "", trialEndsAt: null, customer: "", expires: null, ...extra };
  if (cache && now - cache.at < 15_000 && now >= cache.at) return { ...cache.state, ...extra };
  const file = readFile();
  const reg = { trialStart: Number(regGet("TrialStart")) || 0, lastSeen: Number(regGet("LastSeen")) || 0, mac: regGet("Seal") || undefined };
  const others = extraStores().map((p) => readJson(p));
  const opened = [file, reg, ...others].map((r) => openTrial(machine, r));
  const valid = opened.filter((r): r is TrialRecord => Boolean(r) && r !== "tampered");
  const tampered = opened.includes("tampered");
  const code = file.code || regGet("Code") || null;
  const state = evaluate({ now, code, machine, trialStarts: valid.map((r) => r.trialStart), lastSeen: valid.map((r) => r.lastSeen), monotonicFloor: monotonicFloor(), tampered });
  if (state.reason !== "CLOCK" && state.reason !== "TAMPER") {
    const trialStart = Math.min(now, ...valid.map((r) => r.trialStart).filter((v) => v > 0));
    const lastSeen = Math.max(now, ...valid.map((r) => r.lastSeen));
    const sealed = sealTrial(machine, { trialStart, lastSeen });
    writeJson(stateFile(), { ...file, ...sealed });
    regSet("TrialStart", String(trialStart));
    regSet("LastSeen", String(lastSeen));
    regSet("Seal", sealed.mac!);
    for (const p of extraStores()) writeJson(p, sealed);
  }
  cache = { at: now, state };
  return { ...state, ...extra };
}
export function activateLicense(code: string) {
  const verdict = verifyLicense(code, machineIdentity(), Date.now());
  if (!verdict.ok) return verdict;
  const file = readFile();
  writeJson(stateFile(), { ...file, code: code.trim() });
  regSet("Code", code.trim());
  cache = null;
  return verdict;
}
export const LICENSE_MESSAGES: Record<string, string> = {
  TRIAL_OVER: "انتهت الفترة التجريبية (30 يوم). أدخل كود التفعيل للمتابعة.",
  TAMPER: "تم اكتشاف تعديل في بيانات الفترة التجريبية. أدخل كود التفعيل للمتابعة.",
  CLOCK: "تم اكتشاف رجوع ساعة الجهاز للخلف. صحح التاريخ والوقت ثم أعد فتح البرنامج.",
  SIGNATURE: "كود التفعيل غير صالح.",
  FORMAT: "كود التفعيل غير مكتمل. انسخه كاملاً.",
  PRODUCT: "كود التفعيل لا يخص هذا البرنامج.",
  MACHINE: "كود التفعيل صادر لجهاز آخر. اطلب كوداً لهذا الجهاز.",
  EXPIRED: "انتهت صلاحية الترخيص. اطلب تجديده.",
};
export function assertLicensed() {
  const state = licenseState();
  if (state.mode === "locked") {
    const error = new Error(LICENSE_MESSAGES[state.reason] || "البرنامج غير مفعّل.") as Error & { code: string };
    error.code = "LICENSE";
    throw error;
  }
}

const licenseServer = () => String(process.env.SPEED_LICENSE_SERVER || (configuration as { licenseServer?: string }).licenseServer || "").replace(/\/+$/, "");
const platform = () => (process.env.SPEED_DEVICE_ID ? "android" : "windows");
async function callServer(path: string, init?: RequestInit) {
  const base = licenseServer();
  if (!base) throw new Error("NO_SERVER");
  const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(15_000), headers: { "content-type": "application/json" } });
  const body = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) throw Object.assign(new Error(body.error || "HTTP_" + res.status), { status: res.status });
  return body;
}
export async function requestOnlineLicense(input: { email: string; company: string }) {
  const machine = machineIdentity();
  const deviceId = machine.macs[0] || machineFingerprint(machine).replace(/-/g, "").slice(0, 12);
  if (!deviceId) throw new Error("NO_DEVICE_ID");
  const body = await callServer("/v1/request", { method: "POST", body: JSON.stringify({ email: input.email, company: input.company, deviceName: machine.name, deviceId, machineCode: requestCode(machine), platform: platform(), appVersion: (configuration as { version?: string }).version || "" }) });
  const file = readFile();
  writeFileSync(join(dataDir(), "license-state.json"), JSON.stringify({ ...file, requestId: body.id, requestEmail: input.email }), { mode: 0o600 });
  if (body.status === "issued" && body.code) activateLicense(body.code);
  return { id: body.id, status: body.status };
}
export async function pollOnlineLicense() {
  const file = readFile();
  if (!file.requestId) return { status: "none" as const };
  const body = await callServer("/v1/status/" + encodeURIComponent(file.requestId));
  if (body.status === "issued" && body.code) {
    const v = activateLicense(body.code);
    return v.ok ? { status: "activated" as const, customer: v.license.customer } : { status: "error" as const, error: LICENSE_MESSAGES[v.reason] || "" };
  }
  return { status: body.status as string, email: file.requestEmail || "" };
}
export const licenseContact = () => ({ server: Boolean(licenseServer()), email: String((configuration as { licenseEmail?: string }).licenseEmail || "") });
export const REQUEST_ERRORS: Record<string, string> = {
  EMAIL: "البريد الإلكتروني غير صحيح.", RATE_LIMIT: "طلبات كثيرة. حاول بعد ساعة.", NO_SERVER: "خادم التراخيص غير مضبوط. استخدم الطلب اليدوي.", NO_DEVICE_ID: "تعذر قراءة معرف الجهاز. استخدم الطلب اليدوي.",
};
