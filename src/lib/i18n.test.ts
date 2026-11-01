import test from "node:test";
import assert from "node:assert/strict";
import { t } from "./i18n.ts";
import { EN } from "./i18n-en.ts";

test("language toggle translates UI strings to English and keeps Arabic as source", () => {
  assert.equal(t("الأجهزة", "en"), "Devices");
  assert.equal(t("  الموظفون  ", "en"), "  Employees  ");
  assert.equal(t("الأجهزة", "ar"), "الأجهزة");
  assert.equal(t("نص غير معروف", "en"), "نص غير معروف");
  assert.ok(Object.keys(EN).length > 300);
  for (const [ar, en] of Object.entries(EN)) assert.ok(en && !/[\u0600-\u06FF]/.test(en), `untranslated: ${ar}`);
});
