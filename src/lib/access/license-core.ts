import { createPublicKey, verify } from "node:crypto";

/** Pure license logic (no I/O) so it can be unit tested. */
export const LICENSE_PUBLIC_KEY = "MCowBQYDK2VwAyEAUtgdtZmxHCqklG8F/5bzQwePrfmh1GQs4PnK3YMwmkw=";
export const TRIAL_MS = 24 * 60 * 60 * 1000;
export const ROLLBACK_TOLERANCE_MS = 10 * 60 * 1000;
export type LicensePayload = { v: 1; product: "speed-for-training"; customer: string; machine: string; mac: string; issued: string; expires?: string | null };
export type Machine = { name: string; macs: string[] };
export const normalizeMac = (mac: string) => mac.replace(/[^0-9a-f]/gi, "").toUpperCase();
export const normalizeName = (name: string) => name.trim().toUpperCase();
const b64u = (buffer: Buffer) => buffer.toString("base64url");
export function requestCode(machine: Machine) {
  return "SFT-REQ-" + b64u(Buffer.from(JSON.stringify({ machine: machine.name, macs: machine.macs })));
}
export function parseRequestCode(code: string): Machine | null {
  try {
    const value = JSON.parse(Buffer.from(code.trim().replace(/^SFT-REQ-/, ""), "base64url").toString("utf8"));
    if (typeof value.machine !== "string" || !Array.isArray(value.macs)) return null;
    return { name: value.machine, macs: value.macs.map(String) };
  } catch {
    return null;
  }
}
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
  if (license.v !== 1 || license.product !== "speed-for-training") return { ok: false, reason: "PRODUCT" };
  const macs = machine.macs.map(normalizeMac);
  if (normalizeName(license.machine) !== normalizeName(machine.name) || !macs.includes(normalizeMac(license.mac))) return { ok: false, reason: "MACHINE" };
  if (license.expires && Date.parse(license.expires) < now) return { ok: false, reason: "EXPIRED" };
  return { ok: true, license };
}
export type LicenseState = {
  mode: "licensed" | "trial" | "locked";
  reason: "" | "TRIAL_OVER" | "CLOCK" | Exclude<Verdict & { ok: false }, never>["reason"];
  trialEndsAt: string | null;
  customer: string;
  expires: string | null;
};
/** trialStarts: every stored copy (file, registry...). The earliest wins; lastSeen is the max seen. */
export function evaluate(input: { now: number; code: string | null; machine: Machine; trialStarts: number[]; lastSeen: number[]; publicKey?: string }): LicenseState {
  const { now } = input;
  const last = Math.max(0, ...input.lastSeen.filter(Number.isFinite));
  if (last && now + ROLLBACK_TOLERANCE_MS < last) return { mode: "locked", reason: "CLOCK", trialEndsAt: null, customer: "", expires: null };
  if (input.code) {
    const verdict = verifyLicense(input.code, input.machine, now, input.publicKey);
    if (verdict.ok) return { mode: "licensed", reason: "", trialEndsAt: null, customer: verdict.license.customer, expires: verdict.license.expires || null };
    if (verdict.reason !== "FORMAT") return { mode: "locked", reason: verdict.reason, trialEndsAt: null, customer: "", expires: null };
  }
  const starts = input.trialStarts.filter((v) => Number.isFinite(v) && v > 0);
  const start = starts.length ? Math.min(...starts) : now;
  const end = start + TRIAL_MS;
  return now < end
    ? { mode: "trial", reason: "", trialEndsAt: new Date(end).toISOString(), customer: "", expires: null }
    : { mode: "locked", reason: "TRIAL_OVER", trialEndsAt: new Date(end).toISOString(), customer: "", expires: null };
}
