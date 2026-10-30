import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCompanySetup, companySetupNeeded, validateCompanySetup } from "./company-setup-core.ts";
const platform = () => ({ companies: [{ id: "legacy", nameAr: "الشركة الحالية", nameEn: "Skyline", logo: "", createdAt: "" }], accounts: [{ username: "skyline", name: "مسؤول SKY LINE", enabled: true, salt: "s", hash: "h" }, { username: "op", name: "Operator", enabled: true }] });
test("existing install with placeholder company needs setup", () => { assert.equal(companySetupNeeded(platform()), true); });
test("named company does not need setup", () => { const p = platform(); p.companies[0].nameAr = "Acme"; assert.equal(companySetupNeeded(p), false); });
test("Skyline as company name is rejected and still needs setup", () => {
  assert.throws(() => validateCompanySetup({ companyName: "Skyline" }, "skyline"));
  const p = platform(); p.companies[0].nameAr = "SKY LINE"; assert.equal(companySetupNeeded(p), true);
});
test("apply keeps all accounts and removes Skyline branding", () => {
  const p = platform();
  const r = applyCompanySetup(p, "skyline", undefined, validateCompanySetup({ companyName: "Acme" }, "skyline"));
  assert.equal(p.accounts.length, 2); assert.equal(p.companies[0].nameAr, "Acme"); assert.equal(p.companies[0].nameEn, "Acme");
  assert.equal(p.accounts[0].name, "مسؤول Acme"); assert.equal(p.accounts[0].hash, "h"); assert.equal(r.credentialsChanged, false);
  assert.doesNotMatch(JSON.stringify(p.companies) + p.accounts.map((a) => a.name).join(), /sky\s*line/i);
});
test("optional username and password change", () => {
  const p = platform();
  const v = validateCompanySetup({ companyName: "Acme", newUsername: "Admin1", newPassword: "Str0ng!Pass", confirm: "Str0ng!Pass" }, "skyline");
  const r = applyCompanySetup(p, "skyline", undefined, v, { salt: "n", hash: "m" });
  assert.equal(r.username, "admin1"); assert.equal(p.accounts[0].hash, "m"); assert.equal(r.credentialsChanged, true);
  assert.throws(() => applyCompanySetup(platform(), "skyline", undefined, validateCompanySetup({ companyName: "A", newUsername: "op" }, "skyline")));
  assert.throws(() => validateCompanySetup({ companyName: "A", newPassword: "weak", confirm: "weak" }, "skyline"));
});
