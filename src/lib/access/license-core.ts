import { createHash, createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";

/**
 * Pure license logic (no I/O) so it can be unit tested.
 * The app only VERIFIES Ed25519-signed codes with the embedded public key. Issuing (private key)
 * lives in the separate private repo Medo200333/speed4trading-license-tool.
 */
export const LICENSE_PUBLIC_KEY = "MCowBQYDK2VwAyEAUtgdtZmxHCqklG8F/5bzQwePrfmh1GQs4PnK3YMwmkw=";
export const PRODUCT = "speed-for-training";
/** 30-day demo, then a license is required. */
export const TRIAL_DAYS = 30;
export const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
export const ROLLBACK_TOLERANCE_MS = 10 * 60 * 1000;

/** v1 (legacy): bound to machine name + one MAC. v2: bound to hashed hardware ids, tolerant match. */
export type LicensePayloadV1 = { v: 1; product: string; customer: string; machine: string; mac: string; issued: string; expires?: string | null };
export type LicensePayloadV2 = { v: 2; product: string; customer: string; name?: string; ids: Record<string, string>; issued: string; expires?: string | null };
export type LicensePayload = LicensePayloadV1 | LicensePayloadV2;
/** ids: hashed stable components (g=MachineGuid, u=BIOS UUID, c=CPU id, d=system disk serial, a=Android id). */
export type Machine = { name: string; macs: string[]; ids?: Record<string, string> };
export const normalizeMac = (mac: string) => mac.replace(/[^0-9a-f]/gi, "").toUpperCase();
export const normalizeName = (name: string) => name.trim().toUpperCase();
const b64u = (buffer: Buffer) => buffer.toString("base64url");

/** Adapters that must never identify a machine (VPN/virtual/tunnel). Matched on the interface name. */
export const VIRTUAL_ADAPTER = /tailscale|zerotier|wireguard|openvpn|\bvpn\b|tap-|\btun\b|vethernet|hyper-v|virtualbox|vmware|vmnet|docker|wsl|loopback|bluetooth|npcap|teredo|isatap|utun|ppp/i;
/** Locally-administered MACs (bit 0x02 of first octet) are random/virtual. */
export const isLocalAdminMac = (mac: string) => (parseInt(normalizeMac(mac).slice(0, 2) || "0", 16) & 2) === 2;

/** Hash one raw hardware value into a short id (raw serials never leave the machine). */
export function hashComponent(kind: string, raw: string) {
  const v = String(raw || "").trim().toUpperCase();
  if (!v || /^(0+|F+|NONE|DEFAULT STRING|TO BE FILLED BY O\.E\.M\.|[0-]+)$/.test(v.replace(/-/g, ""))) return "";
  return createHash("sha256").update(`sft|${kind}|${v}`).digest("hex").slice(0, 16);
}
/** How many ids must match: 2 of the issued set (1 when only one was known, e.g. Android). */
export function idsMatch(issued: Record<string, string>, current: Record<string, string> = {}) {
  const keys = Object.keys(issued || {}).filter((k) => issued[k]);
  if (!keys.length) return false;
  const hits = keys.filter((k) => current[k] && current[k] === issued[k]).length;
  return hits >= Math.min(2, keys.length);
}

/** Request / machine id code shown to the customer and pasted into the license tool. */
export function requestCode(machine: Machine) {
  if (machine.ids && Object.keys(machine.ids).length) return "SFT-MID-" + b64u(Buffer.from(JSON.stringify({ n: machine.name, i: machine.ids })));
  return "SFT-REQ-" + b64u(Buffer.from(JSON.stringify({ machine: machine.name, macs: machine.macs })));
}
export function parseRequestCode(code: string): Machine | null {
  try {
    const t = code.trim();
    if (t.startsWith("SFT-MID-")) {
      const v = JSON.parse(Buffer.from(t.slice(8), "base64url").toString("utf8"));
      if (typeof v.n !== "string" || !v.i || typeof v.i !== "object") return null;
      return { name: v.n, macs: [], ids: Object.fromEntries(Object.entries(v.i).map(([k, x]) => [k, String(x)])) };
    }
    const value = JSON.parse(Buffer.from(t.replace(/^SFT-REQ-/, ""), "base64url").toString("utf8"));
    if (typeof value.machine !== "string" || !Array.isArray(value.macs)) return null;
    return { name: value.machine, macs: value.macs.map(String) };
  } catch {
    return null;
  }
}
/** Short human id shown in the UI (stable while ids are stable). */
export const machineFingerprint = (m: Machine) =>
  m.ids && Object.keys(m.ids).length
    ? createHash("sha256").update(Object.keys(m.ids).sort().map((k) => k + m.ids![k]).join("|")).digest("hex").slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, "$1-")
    : "";

export type Verdict = { ok: true; license: LicensePayload } | { ok: false; reason: "FORMAT" | "SIGNATURE" | "PRODUCT" | "MACHINE" | "EXPIRED" };
export function verifyLicense(code: string, machine: Machine, now: number, publicKey = LICENSE_PUBLIC_KEY): Verdict {
  const parts = code.trim().replace(/^SFT-LIC-/, "").split(".");
  if (parts.length !== 2) return { ok: false, reason: "FORMAT" };
  let body: Buffer, signature: Buffer, license: LicensePayload;
  try {
    body = Buffer.from(parts[0], "base64url");
    signature = Buffer.from(parts[1], "base64url");
    license = JSON.parse(body.toString("utf8"));
  } catch {
    return { ok: false, reason: "FORMAT" };
  }
  const key = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
  if (signature.length !== 64 || !verify(null, body, key, signature)) return { ok: false, reason: "SIGNATURE" };
  if (license.product !== PRODUCT || (license.v !== 1 && license.v !== 2)) return { ok: false, reason: "PRODUCT" };
  if (license.v === 2) {
    if (!idsMatch(license.ids, machine.ids)) return { ok: false, reason: "MACHINE" };
  } else {
    const macs = machine.macs.map(normalizeMac);
    if (normalizeName(license.machine) !== normalizeName(machine.name) || !macs.includes(normalizeMac(license.mac))) return { ok: false, reason: "MACHINE" };
  }
  if (license.expires) {
    const end = Date.parse(license.expires);
    if (!Number.isFinite(end) || end < now) return { ok: false, reason: "EXPIRED" };
  }
  return { ok: true, license };
}

/* ---- trial records: same value kept in several stores, each sealed with an HMAC bound to this machine ---- */
export type TrialRecord = { trialStart: number; lastSeen: number; mac?: string };
// Constant key on purpose: hardware changes must not lock a legit user; the seal only stops casual edits of one store.
const trialKey = (_machine: Machine) => createHash("sha256").update("sft-trial|" + PRODUCT).digest();
export function sealTrial(machine: Machine, r: { trialStart: number; lastSeen: number }): TrialRecord {
  const mac = createHmac("sha256", trialKey(machine)).update(`${r.trialStart}|${r.lastSeen}`).digest("base64url");
  return { trialStart: r.trialStart, lastSeen: r.lastSeen, mac };
}
/** undefined = store empty; "tampered" = present but the seal does not match; legacy unsealed values are accepted once. */
export function openTrial(machine: Machine, r: Partial<TrialRecord> | null | undefined): TrialRecord | "tampered" | undefined {
  if (!r || (!r.trialStart && !r.lastSeen)) return undefined;
  const start = Number(r.trialStart), seen = Number(r.lastSeen || 0);
  if (!Number.isFinite(start) || !Number.isFinite(seen)) return "tampered";
  if (!r.mac) return { trialStart: start, lastSeen: seen };
  const want = sealTrial(machine, { trialStart: start, lastSeen: seen }).mac!;
  const a = Buffer.from(want), b = Buffer.from(String(r.mac));
  return a.length === b.length && timingSafeEqual(a, b) ? { trialStart: start, lastSeen: seen } : "tampered";
}

export type LicenseState = {
  mode: "licensed" | "trial" | "locked";
  reason: "" | "TRIAL_OVER" | "CLOCK" | "TAMPER" | Exclude<Verdict & { ok: false }, never>["reason"];
  trialEndsAt: string | null;
  customer: string;
  expires: string | null;
};
/**
 * trialStarts / lastSeen: every stored copy (file, registry, ProgramData, LocalAppData). Earliest start wins,
 * newest lastSeen wins. monotonicFloor: wall-clock lower bound derived from the process monotonic clock.
 * tampered: a store had a record whose seal did not match (trial is treated as over; a valid license still works).
 */
export function evaluate(input: { now: number; code: string | null; machine: Machine; trialStarts: number[]; lastSeen: number[]; publicKey?: string; monotonicFloor?: number; tampered?: boolean }): LicenseState {
  const { now } = input;
  const last = Math.max(0, ...input.lastSeen.filter(Number.isFinite), input.monotonicFloor || 0);
  if (last && now + ROLLBACK_TOLERANCE_MS < last) return { mode: "locked", reason: "CLOCK", trialEndsAt: null, customer: "", expires: null };
  if (input.code) {
    const verdict = verifyLicense(input.code, input.machine, now, input.publicKey);
    if (verdict.ok) return { mode: "licensed", reason: "", trialEndsAt: null, customer: verdict.license.customer, expires: verdict.license.expires || null };
    if (verdict.reason !== "FORMAT") return { mode: "locked", reason: verdict.reason, trialEndsAt: null, customer: "", expires: null };
  }
  if (input.tampered) return { mode: "locked", reason: "TAMPER", trialEndsAt: null, customer: "", expires: null };
  const starts = input.trialStarts.filter((v) => Number.isFinite(v) && v > 0);
  const start = starts.length ? Math.min(...starts) : now;
  const end = start + TRIAL_MS;
  return now < end
    ? { mode: "trial", reason: "", trialEndsAt: new Date(end).toISOString(), customer: "", expires: null }
    : { mode: "locked", reason: "TRIAL_OVER", trialEndsAt: new Date(end).toISOString(), customer: "", expires: null };
}
