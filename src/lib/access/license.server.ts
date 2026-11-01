import { networkInterfaces, hostname } from "node:os";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import configuration from "../../../brand.config.json";
import { evaluate, requestCode, normalizeMac, verifyLicense, type LicenseState, type Machine } from "./license-core";

/** Licensing is active only in packaged builds (desktop main sets SKYLINE_LICENSE_ENFORCE=1). */
export const licenseEnforced = () => process.env.SKYLINE_LICENSE_ENFORCE === "1";
const REG = "HKCU\\Software\\SpeedForTraining\\License";
function dataDir() {
  const dir = process.env.SKYLINE_ACCESS_DATA_DIR || join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  return dir;
}
export function machineIdentity(): Machine {
  const macs = new Set<string>();
  // Android host (nodejs-mobile) passes a stable 12-hex id derived from sha256(ANDROID_ID + model); Android hides real MACs.
  const fixed = normalizeMac(process.env.SPEED_DEVICE_ID || "");
  if (fixed) return { name: process.env.SPEED_DEVICE_NAME || hostname(), macs: [fixed] };
  for (const rows of Object.values(networkInterfaces()))
    for (const row of rows || []) {
      const mac = normalizeMac(row.mac || "");
      if (!row.internal && mac && !/^0+$/.test(mac)) macs.add(mac);
    }
  return { name: hostname(), macs: [...macs].sort() };
}
const noRegistry = () => process.platform !== "win32" || process.env.SKYLINE_LICENSE_NO_REGISTRY === "1";
function regGet(name: string) {
  if (noRegistry()) return "";
  try {
    const out = execFileSync("reg", ["query", REG, "/v", name], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    return (out.match(new RegExp(name + "\\s+REG_SZ\\s+(.*)")) || [])[1]?.trim() || "";
  } catch {
    return "";
  }
}
function regSet(name: string, value: string) {
  if (noRegistry()) return;
  try {
    execFileSync("reg", ["add", REG, "/v", name, "/t", "REG_SZ", "/d", value, "/f"], { windowsHide: true, stdio: "ignore" });
  } catch { /* best effort */ }
}
type Stored = { trialStart?: number; lastSeen?: number; code?: string; requestId?: string; requestEmail?: string };
function readFile(): Stored {
  try {
    return JSON.parse(readFileSync(join(dataDir(), "license-state.json"), "utf8"));
  } catch {
    return {};
  }
}
let cache: { at: number; state: LicenseState } | null = null;
export function licenseState(now = Date.now()): LicenseState & { machine: Machine; requestCode: string; enforced: boolean } {
  const machine = machineIdentity();
  const extra = { machine, requestCode: requestCode(machine), enforced: licenseEnforced() };
  if (!licenseEnforced()) return { mode: "licensed", reason: "", trialEndsAt: null, customer: "", expires: null, ...extra };
  if (cache && now - cache.at < 15_000 && now >= cache.at) return { ...cache.state, ...extra };
  const file = readFile();
  const regStart = Number(regGet("TrialStart")), regSeen = Number(regGet("LastSeen"));
  const code = file.code || regGet("Code") || null;
  const state = evaluate({ now, code, machine, trialStarts: [file.trialStart || 0, regStart || 0], lastSeen: [file.lastSeen || 0, regSeen || 0] });
  const trialStart = Math.min(...[file.trialStart, regStart].filter((v): v is number => Boolean(v) && Number.isFinite(v)), now);
  if (state.reason !== "CLOCK") {
    const lastSeen = Math.max(now, file.lastSeen || 0, regSeen || 0);
    writeFileSync(join(dataDir(), "license-state.json"), JSON.stringify({ ...file, trialStart, lastSeen }), { mode: 0o600 });
    regSet("TrialStart", String(trialStart));
    regSet("LastSeen", String(lastSeen));
  }
  cache = { at: now, state };
  return { ...state, ...extra };
}
export function activateLicense(code: string) {
  const verdict = verifyLicense(code, machineIdentity(), Date.now());
  if (!verdict.ok) return verdict;
  const file = readFile();
  writeFileSync(join(dataDir(), "license-state.json"), JSON.stringify({ ...file, code: code.trim() }), { mode: 0o600 });
  regSet("Code", code.trim());
  cache = null;
  return verdict;
}
export const LICENSE_MESSAGES: Record<string, string> = {
  TRIAL_OVER: "انتهت الفترة التجريبية (10 أيام). أدخل كود التفعيل للمتابعة.",
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
  const deviceId = machine.macs[0];
  if (!deviceId) throw new Error("NO_DEVICE_ID");
  const body = await callServer("/v1/request", { method: "POST", body: JSON.stringify({ email: input.email, company: input.company, deviceName: machine.name, deviceId, platform: platform(), appVersion: (configuration as { version?: string }).version || "" }) });
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
