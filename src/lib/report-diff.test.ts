import test from "node:test";
import assert from "node:assert/strict";
import { diffRows, diffSummary, diffSheet, diffHtml, reportXlsxBytes, fmtDiff } from "./report-diff.ts";
const r = (no: string, date: string, first: string, last: string, extra = {}) => ({ personId: no, employeeNo: no, name: `P${no}`, date, first, last, worked: "", status: "", absent: !first, ...extra });
test("diff states", () => {
  const dev = [r("1", "2026-11-01", "08:00:10", "17:00"), r("2", "2026-11-01", "09:00", "16:00"), r("3", "2026-11-01", "10:00", ""), r("5", "2026-11-01", "", "")];
  const team = [r("1", "2026-11-01", "08:01", "17:00"), r("2", "2026-11-01", "09:10", "16:00"), r("4", "2026-11-01", "11:00", "12:00", { personId: "team:4" })];
  const rows = diffRows(dev, team);
  const by = Object.fromEntries(rows.map((x) => [x.employeeNo, x]));
  assert.equal(by["1"].state, "match");
  assert.equal(by["2"].state, "time"); assert.equal(by["2"].firstDiff, 10);
  assert.equal(by["3"].state, "device-only");
  assert.equal(by["4"].state, "teams-only");
  assert.equal(by["5"].state, "absent");
  assert.deepEqual(diffSummary(rows), { match: 1, time: 1, "device-only": 1, "teams-only": 1, absent: 1 });
  assert.equal(fmtDiff(-5), "−5 د");
  assert.equal(diffSheet(rows).rows.length, 7);
  assert.match(diffHtml(rows, "Sky", "2026-11-01", "2026-11-01"), /في Teams بس/);
  const bytes = reportXlsxBytes("2026-11-01", "2026-11-01", dev, rows, "Sky");
  assert.ok(bytes.length > 1000);
});
import { buildLayout } from "./report-layout.ts";
test("layout groups one employee across devices/Teams", () => {
  const rows = [r("7", "2026-11-01", "08:00", "17:00", { personId: "devA|s|7" }), r("7", "2026-11-02", "08:00", "17:00", { personId: "team:7" })];
  const l = buildLayout("2026-11-01", "2026-11-02", rows);
  assert.equal(l.employees.length, 1); assert.equal(l.employees[0].present, 2);
});
import { parseDateTime } from "./attendance.ts";
test("parseDateTime: M/D/Y fallback and 12h clocks", () => {
  assert.deepEqual(parseDateTime("05/13/2026 8:05 PM"), { date: "2026-05-13", time: "20:05:00" });
  assert.deepEqual(parseDateTime("13/05/2026 08:05"), { date: "2026-05-13", time: "08:05:00" });
  assert.deepEqual(parseDateTime("02/11/2026 9:00 م"), { date: "2026-11-02", time: "21:00:00" });
  assert.deepEqual(parseDateTime("03/04/2026 12:10 AM"), { date: "2026-04-03", time: "00:10:00" });
});
