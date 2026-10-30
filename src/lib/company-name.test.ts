import { test } from "node:test";
import assert from "node:assert/strict";
import { companyNameError, normalizeCompanyName, nameLength, COMPANY_NAME_MAX } from "./company-name.ts";
import { validateCompanySetup } from "./access/company-setup-core.ts";
import { validateSetup } from "./access/first-admin-core.ts";
test("Arabic and English names are accepted", () => {
  for (const n of ["شركة سبيد للتدريب", "Speed Training Co.", "مؤسسة الأمل - Al Amal", "شركة النور ٢٠٢٦"]) assert.equal(companyNameError(n), "", n);
});
test("NFC + invisible chars + spaces are normalised", () => {
  assert.equal(normalizeCompanyName("\u200f  شركة\u200b   سبيد \u202c\n"), "شركة سبيد");
  assert.equal(normalizeCompanyName("Cafe\u0301"), "Café");
  assert.equal(companyNameError("\u200f\u200e \u200b"), "اسم الشركة فارغ. اكتب اسم شركتك بالعربية أو الإنجليزية.");
});
test("exactly 120 Arabic characters (with diacritics) passes, 121 fails with a length message", () => {
  const ok = "شَ".repeat(COMPANY_NAME_MAX);
  assert.equal(nameLength(ok), COMPANY_NAME_MAX); assert.equal(companyNameError(ok), "");
  assert.match(companyNameError("ب".repeat(121)), /121 حرفاً، والحد الأقصى 120/);
});
test("legacy brand has its own explicit message", () => {
  assert.match(companyNameError("سكاي لاين"), /اسم البرنامج القديم/);
  assert.match(companyNameError("SKY-LINE"), /اسم البرنامج القديم/);
});
test("server validators use the normalised name and specific messages", () => {
  assert.equal(validateCompanySetup({ companyName: " \u200fشركة سبيد " }, "admin").companyName, "شركة سبيد");
  assert.throws(() => validateCompanySetup({ companyName: "" }, "admin"), /فارغ/);
  assert.throws(() => validateCompanySetup({ companyName: "Acme", logo: "data:image/gif;base64,AAAA" }, "admin"), /الشعار|شعار الشركة غير صالح/);
  const v = validateSetup({ name: "مدير", username: "owner", password: "Str0ng!Pass", confirm: "Str0ng!Pass", companyName: "شركة\u200b سبيد", companyNameEn: "Speed Co" });
  assert.equal(v.companyName, "شركة سبيد");
  assert.throws(() => validateSetup({ name: "مدير", username: "owner", password: "Str0ng!Pass", confirm: "Str0ng!Pass", companyName: "  ", companyNameEn: "Speed Co" }), /فارغ/);
});

test("English company name is required and restricted", async () => {
  const { englishCompanyNameError } = await import("./company-name.ts");
  assert.equal(englishCompanyNameError("Speed For Training_2-x"), "");
  assert.match(englishCompanyNameError(""), /مطلوب/);
  assert.match(englishCompanyNameError("شركة"), /حروف إنجليزية/);
  assert.match(englishCompanyNameError("a/b"), /حروف إنجليزية/);
  assert.match(englishCompanyNameError("x"), /حروف إنجليزية/);
});
