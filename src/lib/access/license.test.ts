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
test("demo lasts 30 days", () => {
  assert.equal(TRIAL_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(run(null, { trialStarts: [now - 29 * 24 * 3600e3] }).mode, "trial");
  assert.equal(run(null, { trialStarts: [now - 31 * 24 * 3600e3] }).reason, "TRIAL_OVER");
});

// ---- v2: hashed hardware ids, tolerant match, time-limited ----
import { hashComponent, idsMatch, sealTrial, openTrial, VIRTUAL_ADAPTER, isLocalAdminMac, type Machine } from "./license-core.ts";
const ids = { g: hashComponent("g", "guid-1"), u: hashComponent("u", "uuid-1"), c: hashComponent("c", "cpu-1"), d: hashComponent("d", "disk-1") };
const m2: Machine = { name: "PC", macs: [], ids: ids as Record<string, string> };
const m2ids = ids as Record<string, string>;
function issue2(p: Record<string, unknown>, key = privateKey) {
  const body = Buffer.from(JSON.stringify({ v: 2, product: "speed-for-training", customer: "Test", ids, issued: "2026-11-02", expires: null, ...p }));
  return "SFT-LIC-" + body.toString("base64url") + "." + sign(null, body, key).toString("base64url");
}
const run2 = (code: string, machine: Machine = m2, extra = {}) => evaluate({ now, code, machine, trialStarts: [], lastSeen: [], publicKey: pub, ...extra });
test("v2 permanent license", () => assert.equal(run2(issue2({})).mode, "licensed"));
test("v2 tolerates one or two changed parts (disk swap, VPN irrelevant)", () => {
  assert.equal(run2(issue2({}), { ...m2, ids: { ...m2ids, d: "x", c: "y" } }).mode, "licensed");
  assert.equal(run2(issue2({}), { ...m2, ids: { g: ids.g, u: "z", c: "y", d: "x" } }).reason, "MACHINE");
  assert.equal(run2(issue2({}), { name: "OTHER-NAME", macs: ["AABBCCDDEEFF"], ids }).mode, "licensed");
});
test("v2 single-id (Android) needs that id", () => {
  const a = { a: hashComponent("a", "ANDROID1") };
  assert.equal(run2(issue2({ ids: a }), { name: "x", macs: [], ids: a }).mode, "licensed");
  assert.equal(run2(issue2({ ids: a }), { name: "x", macs: [], ids: { a: "nope" } }).reason, "MACHINE");
});
test("v2 time-limited: month / year", () => {
  assert.equal(run2(issue2({ expires: "2026-11-30T23:59:59Z" })).mode, "licensed");
  assert.equal(run2(issue2({ expires: "2026-10-23T23:59:59Z" })).reason, "EXPIRED");
  assert.equal(run2(issue2({ expires: "garbage" })).reason, "EXPIRED");
});
test("v2 foreign key rejected, v3 rejected", () => {
  assert.equal(run2(issue2({}, generateKeyPairSync("ed25519").privateKey)).reason, "SIGNATURE");
  assert.equal(run2(issue2({ v: 3 })).reason, "PRODUCT");
});
test("machine-id request code round-trip", () => assert.deepEqual(parseRequestCode(requestCode(m2)), m2));
test("idsMatch / junk serials ignored", () => {
  assert.equal(idsMatch({}, ids), false);
  assert.equal(hashComponent("d", "To be filled by O.E.M."), "");
  assert.equal(hashComponent("u", "00000000-0000-0000-0000-000000000000"), "");
});
test("virtual adapters and local-admin MACs are ignored", () => {
  for (const n of ["Tailscale", "vEthernet (WSL)", "ZeroTier One", "VMware Network Adapter VMnet8", "OpenVPN TAP-Windows6"]) assert.ok(VIRTUAL_ADAPTER.test(n), n);
  assert.ok(!VIRTUAL_ADAPTER.test("Ethernet"));
  assert.ok(isLocalAdminMac("02:11:22:33:44:55"));
  assert.ok(!isLocalAdminMac("00:11:22:33:44:55"));
});
test("trial seal: valid, legacy, tampered, tampered locks trial but not a license", () => {
  const r = sealTrial(m2, { trialStart: now - 1000, lastSeen: now });
  assert.deepEqual(openTrial(m2, r), { trialStart: now - 1000, lastSeen: now });
  assert.equal(openTrial(m2, { ...r, trialStart: now }), "tampered");
  assert.deepEqual(openTrial(m2, { trialStart: 5, lastSeen: 6 }), { trialStart: 5, lastSeen: 6 });
  assert.equal(openTrial(m2, {}), undefined);
  assert.equal(evaluate({ now, code: null, machine: m2, trialStarts: [], lastSeen: [], tampered: true, publicKey: pub }).reason, "TAMPER");
  assert.equal(run2(issue2({}), m2, { tampered: true }).mode, "licensed");
});
test("monotonic floor catches clock moved back while running", () => {
  assert.equal(run2(issue2({}), m2, { monotonicFloor: now + 3_600_000 }).reason, "CLOCK");
  assert.equal(run2(issue2({}), m2, { monotonicFloor: now - 5_000 }).mode, "licensed");
});
