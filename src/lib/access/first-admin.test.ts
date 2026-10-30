import test from "node:test";
import assert from "node:assert/strict";
import { applySetup, validateSetup, setupOriginAllowed, needsSetup, SetupError } from "./first-admin-core.ts";

const fresh = () => ({ companies: [{ id: "legacy", nameAr: "الشركة الحالية", createdAt: "" }], accounts: [] as any[] });
const good = { name: "Mohamed", username: "Owner", password: "Speed#2026x", confirm: "Speed#2026x", companyName: "شركة النور", companyNameEn: "Al Nour" };
const h = { salt: "s", hash: "h" };
test("zero users: setup creates the system-owner admin", () => {
  const p = fresh();
  const a = applySetup(p, validateSetup(good), h);
  assert.equal(a.username, "owner"); assert.equal(a.role, "admin"); assert.equal(a.systemAdmin, true);
  assert.equal(p.companies[0].nameAr, "شركة النور"); assert.equal(needsSetup(p), false);
});
test("second setup is refused", () => {
  const p = fresh(); applySetup(p, validateSetup(good), h);
  assert.throws(() => applySetup(p, validateSetup({ ...good, username: "other" }), h), (e: SetupError) => e.code === "SETUP_DONE");
});
test("setup refused when users exist (even disabled)", () => {
  const p = fresh(); p.accounts.push({ username: "x", enabled: false });
  assert.throws(() => applySetup(p, validateSetup(good), h), (e: SetupError) => e.code === "SETUP_DONE");
});
test("weak / mismatched passwords rejected", () => {
  for (const password of ["short1A", "alllowercase", "12345678"]) assert.throws(() => validateSetup({ ...good, password, confirm: password }), (e: SetupError) => e.code === "WEAK_PASSWORD");
  assert.throws(() => validateSetup({ ...good, confirm: "nope" }), (e: SetupError) => e.code === "SETUP_INPUT");
  assert.throws(() => validateSetup({ ...good, password: "Owner#2026x", confirm: "Owner#2026x" }), (e: SetupError) => e.code === "WEAK_PASSWORD");
});
test("origin rules", () => {
  assert.equal(setupOriginAllowed("http://127.0.0.1:3910", "127.0.0.1:3910", []), true);
  assert.equal(setupOriginAllowed("http://localhost:3910", "localhost:3910", []), true);
  assert.equal(setupOriginAllowed("http://192.168.1.50:3910", "192.168.1.9:3910", []), false);
  assert.equal(setupOriginAllowed("http://evil.example", "127.0.0.1:3910", []), false);
  assert.equal(setupOriginAllowed(null, "127.0.0.1:3910", []), false);
  assert.equal(setupOriginAllowed("https://app.example", "10.0.0.2", ["https://app.example"]), true);
});

const png = "data:image/png;base64,iVBORw0KGgo=";
test("onboarding stores company name + logo with the admin in one step", () => {
  const p = fresh();
  applySetup(p, validateSetup({ ...good, logo: png }), h);
  assert.equal((p.companies[0] as any).logo, png); assert.equal(p.accounts.length, 1);
});
test("company name is required; bad or oversized logos rejected", () => {
  assert.throws(() => validateSetup({ ...good, companyName: "  " }), (e: SetupError) => e.code === "SETUP_INPUT");
  assert.throws(() => validateSetup({ ...good, logo: "data:image/svg+xml;base64,PHN2Zz4=" }), (e: SetupError) => e.code === "SETUP_INPUT");
  assert.throws(() => validateSetup({ ...good, logo: "data:image/png;base64," + "A".repeat(1_500_000) }), (e: SetupError) => e.code === "SETUP_INPUT");
});
test("refused after done: nothing in the platform changes", () => {
  const p = fresh(); applySetup(p, validateSetup(good), h);
  const before = JSON.stringify(p);
  assert.throws(() => applySetup(p, validateSetup({ ...good, username: "x2", companyName: "Other" }), h));
  assert.equal(JSON.stringify(p), before);
});
test("fresh data has no default user (no skyline / sky)", () => {
  const p = fresh();
  assert.equal(needsSetup(p), true);
  assert.equal(p.accounts.some((a: any) => /^(skyline|sky)$/.test(a.username)), false);
});
