import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { evaluate, verifyLicense, requestCode, parseRequestCode, TRIAL_MS } from "./license-core.ts";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pub = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const machine = { name: "FAKE-PC-01", macs: ["AABBCCDDEEFF", "112233445566"] };
const now = Date.parse("2026-10-24T12:00:00Z");
function issue(p: Record<string, unknown>, key = privateKey) {
  const body = Buffer.from(JSON.stringify({ v: 1, product: "speed-for-training", customer: "Test", machine: "fake-pc-01", mac: "11-22-33-44-55-66", issued: "2026-10-24", ...p }));
  return "SFT-LIC-" + body.toString("base64url") + "." + sign(null, body, key).toString("base64url");
}
const run = (code: string | null, extra: Partial<Parameters<typeof evaluate>[0]> = {}) => evaluate({ now, code, machine, trialStarts: [], lastSeen: [], publicKey: pub, ...extra });
test("valid license on any NIC, case-insensitive name", () => assert.equal(run(issue({})).mode, "licensed"));
test("tampered / foreign-key license is invalid", () => {
  const code = issue({});
  // Flip the FIRST signature character: the last base64url char carries padding bits and may decode identically.
  const dot = code.indexOf(".") + 1;
  const tampered = code.slice(0, dot) + (code[dot] === "A" ? "B" : "A") + code.slice(dot + 1);
  assert.equal(verifyLicense(tampered, machine, now, pub).ok, false);
  assert.equal(run(issue({}, generateKeyPairSync("ed25519").privateKey)).reason, "SIGNATURE");
  assert.equal(run("garbage").mode, "trial");
});
test("wrong machine name or MAC", () => {
  assert.equal(run(issue({ machine: "OTHER" })).reason, "MACHINE");
  assert.equal(run(issue({ mac: "00:11:22:33:44:99" })).reason, "MACHINE");
});
test("expired license", () => {
  assert.equal(run(issue({ expires: "2026-10-01T00:00:00Z" })).reason, "EXPIRED");
  assert.equal(run(issue({ expires: "2027-01-01T00:00:00Z" })).mode, "licensed");
});
test("trial 24h from earliest stored start", () => {
  assert.equal(run(null).mode, "trial");
  assert.equal(run(null, { trialStarts: [now - TRIAL_MS + 1000] }).mode, "trial");
  assert.equal(run(null, { trialStarts: [now - 1000, now - TRIAL_MS - 1] }).reason, "TRIAL_OVER");
});
test("clock rollback locks even when licensed", () => {
  assert.equal(run(issue({}), { lastSeen: [now + 3_600_000] }).reason, "CLOCK");
  assert.equal(run(null, { lastSeen: [now + 60_000] }).mode, "trial");
});
test("request code round-trip", () => assert.deepEqual(parseRequestCode(requestCode(machine)), machine));
test("demo lasts 10 days", () => {
  assert.equal(TRIAL_MS, 10 * 24 * 60 * 60 * 1000);
  assert.equal(run(null, { trialStarts: [now - 9 * 24 * 3600e3] }).mode, "trial");
  assert.equal(run(null, { trialStarts: [now - 11 * 24 * 3600e3] }).reason, "TRIAL_OVER");
});
