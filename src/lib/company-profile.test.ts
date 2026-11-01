import test from "node:test";
import assert from "node:assert/strict";
import { profileFrom, reportHeader, reportSheetHeader, reportFileName } from "./company-profile.ts";

const logo = "data:image/png;base64,iVBORw0KGgo=";
test("report header uses the customer company, product only as powered-by", () => {
  const p = profileFrom({ nameAr: "شركة النور", logo });
  const h = reportHeader(p, "تقرير الحضور");
  assert.equal(h.owner, "شركة النور"); assert.match(h.title, /^شركة النور/); assert.equal(h.poweredBy, "speed4trading");
  const rows = reportSheetHeader(p, "تقرير الحضور", "2026-10-01 — 2026-10-24");
  assert.deepEqual(rows[1], ["الشركة", "شركة النور"]);
  assert.equal(reportFileName(p, "attendance", "xlsx"), "شركة النور-attendance.xlsx");
  assert.equal(p.logo, logo);
});
test("placeholders and owner names never become the report owner", () => {
  assert.equal(profileFrom({ nameAr: "الشركة الحالية" }).name, "");
  assert.equal(profileFrom({ nameAr: "x", logo: "javascript:alert(1)" }).logo, "");
  const all = JSON.stringify([reportHeader(profileFrom({ nameAr: "Acme" }), "t"), reportSheetHeader(profileFrom({ nameAr: "Acme" }), "t")]);
  assert.doesNotMatch(all, /Mohamed Kamal|محمد كمال|Skyline|Zubayd/);
});
