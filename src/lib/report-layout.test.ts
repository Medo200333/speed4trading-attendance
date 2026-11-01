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
