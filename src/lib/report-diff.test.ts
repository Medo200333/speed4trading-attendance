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
  assert.deepEqual(diffSummary(rows), { match: 1, time: 1, "device-only": 1, "teams-only": 1, unmatched: 0, absent: 1 });
  assert.equal(fmtDiff(-5), "−5 د");
  assert.equal(diffSheet(rows).rows.length, 7);
  assert.match(diffHtml(rows, "Sky", "2026-11-01", "2026-11-01"), /في Hik-Connect Team بس/);
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
import { sameName } from "./name-match.ts";
test("OpenAPI guard: code AND name must match, otherwise the cloud person is listed apart", () => {
  const dev = [r("2", "2026-11-02", "", "", { name: "(English name missing) #2" }), r("7", "2026-11-02", "09:00", "17:00", { name: "Mohamed Ali" })];
  const api = [r("2", "2026-11-02", "10:00", "", { personId: "team:2", name: "Hamdy" }), r("7", "2026-11-02", "09:01", "17:00", { personId: "team:7", name: "mohamed  ali hassan" })];
  const rows = diffRows(dev, api, 2, true);
  const hamdy = rows.find((x) => x.name === "Hamdy")!;
  assert.equal(hamdy.state, "unmatched"); assert.equal(hamdy.unmatched, true);
  assert.equal(rows.find((x) => x.name === "(English name missing) #2")!.state, "absent");
  assert.equal(rows.find((x) => x.employeeNo === "7")!.state, "match");
  assert.equal(rows[rows.length - 1].name, "Hamdy"); // unmatched block last
  assert.equal(diffSummary(rows).unmatched, 1);
  // without the guard (Team web login) the old code-only join is kept
  assert.equal(diffRows(dev, api).find((x) => x.employeeNo === "2")!.state, "teams-only");
  assert.ok(sameName("Mohamed  Ali", "mohamed ali hassan")); assert.ok(!sameName("Ali", "Hamdy")); assert.ok(!sameName("(English name missing) #2", "Hamdy"));
});
test("diff labels name the compared source in sheet and PDF (no hard-coded Teams)", () => {
  const rows = diffRows([r("1", "2026-11-02", "08:00", "17:00")], [r("4", "2026-11-02", "08:00", "", { personId: "team:4" })], 2, true);
  const src = "Hik-Connect Team (OpenAPI)";
  const sheet = diffSheet(rows, src);
  assert.deepEqual(sheet.rows[1].slice(6, 8), [`أول (${src})`, `آخر (${src})`]);
  assert.ok(!JSON.stringify(sheet.rows).includes("Teams"));
  const html = diffHtml(rows, "Sky", "2026-11-02", "2026-11-02", src);
  assert.ok(html.includes(`أول (${src})`) && html.includes(`في ${src} بس`)); assert.ok(!/\bTeams\b/.test(html));
});
test("layout keeps an unmatched cloud person apart from the local employee with the same code", () => {
  const rows = [r("2", "2026-11-02", "", "", { name: "Local" }), r("2", "2026-11-02", "10:00", "15:00", { personId: "team:2", name: "Hamdy", unmatched: true })];
  const l = buildLayout("2026-11-02", "2026-11-02", rows);
  assert.equal(l.employees.length, 2);
});
