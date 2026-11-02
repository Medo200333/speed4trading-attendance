import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { buildLayout, layoutSheets, layoutHtml, layoutXlsxBytes, dayName, dateRange } from "./report-layout.ts";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const row = (o: object) => ({ personId: "p1", employeeNo: "1", name: "Mohamed", date: "2026-10-03", first: "09:00:00", last: "17:30:00", worked: "", status: "", absent: false, photo: png, branch: "alex", ...o });
const rows = [row({}), row({ date: "2026-10-04", first: "10:00:00", last: "10:00:00" }), row({ personId: "p2", employeeNo: "2", name: "Ali <x>", photo: null, date: "2026-10-05", first: "08:00", last: "16:00" })];

test("layout fills every date, marks absences and totals", () => {
  const l = buildLayout("2026-10-03", "2026-10-05", rows);
  assert.deepEqual(l.dates, dateRange("2026-10-03", "2026-10-05"));
  assert.equal(dayName("2026-10-03"), "السبت");
  const m = l.employees.find((e) => e.employeeNo === "1")!;
  assert.deepEqual(m.days.map((d) => d.state), ["present", "single", "absent"]);
  assert.equal(m.totalMinutes, 510); assert.equal(m.present, 2); assert.equal(m.absent, 1); assert.equal(m.branch, "alex");
});
test("xlsx: summary matrix + one sheet per employee with photo", () => {
  const sheets = layoutSheets(buildLayout("2026-10-03", "2026-10-05", rows));
  assert.equal(sheets.length, 3); assert.equal(sheets[0].name, "الملخص");
  assert.equal(sheets[0].rows[1].length, 3 + 3 + 2);
  const files = unzipSync(layoutXlsxBytes("2026-10-03", "2026-10-05", rows));
  assert.ok(Object.keys(files).some((f) => f.startsWith("xl/media/")));
  assert.match(strFromU8(files["xl/sharedStrings.xml"]), /غياب/);
});
test("html escapes names and drops non-image photos", () => {
  const html = layoutHtml(buildLayout("2026-10-03", "2026-10-05", [...rows, row({ personId: "p3", name: "Z", photo: "javascript:alert(1)" })]));
  assert.match(html, /dir="rtl"/); assert.match(html, /Ali &lt;x&gt;/); assert.doesNotMatch(html, /javascript:/);
});
import { simpleHtml, simpleSheets, simpleRows } from "./report-layout.ts";
test("simple report: one table, name/first/last/hours; date column always", () => {
  const one = buildLayout("2026-10-03", "2026-10-03", rows);
  const s1 = simpleSheets(one);
  assert.equal(s1.length, 1);
  assert.deepEqual(s1[0].rows[1], ["الاسم", "التاريخ", "أول بصمة", "آخر بصمة", "عدد ساعات العمل"]);
  assert.deepEqual(simpleRows(one).find((r) => r[0] === "Mohamed")?.filter((_, i) => i !== 1), ["Mohamed", "09:00", "17:30", "08:30"]);
  const h1 = simpleHtml(one, "Co");
  assert.equal((h1.match(/<table/g) || []).length, 1);
  assert.ok(h1.includes("توقيت القاهرة") && !h1.includes("تقرير موظف") && !h1.includes("<img") && h1.includes("Ali &lt;x&gt;"));
  const multi = buildLayout("2026-10-03", "2026-10-05", rows);
  const r = simpleRows(multi);
  assert.equal(r.length, 6);
  assert.equal(simpleSheets(multi)[0].rows[1][1], "التاريخ");
  assert.deepEqual(r.filter((x) => x[0] === "Mohamed").map((x) => x[4]), ["08:30", "بصمة واحدة", ""]);
  assert.equal(r.filter((x) => x[0] === "Mohamed")[2][2], "غياب");
});

test("layout never pools two different names that share an employee code", () => {
  const L = buildLayout("2026-11-02", "2026-11-02", [row({ personId: "a", employeeNo: "2", name: "", first: "", last: "", worked: "", absent: true }), row({ personId: "b", employeeNo: "2", name: "jihan hussien", date: "2026-11-02", first: "10:00", last: "17:37", worked: "07:37" })]);
  assert.equal(L.employees.length, 2);
  assert.ok(L.employees.some((e) => e.name === "jihan hussien" && e.present === 1));
});
