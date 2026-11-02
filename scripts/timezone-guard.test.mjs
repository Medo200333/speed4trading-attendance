import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("Egypt offset, Hikvision zone parsing and the device-zone warning", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  try {
    const tz = await vite.ssrLoadModule("/src/lib/access/timezone.ts");
    assert.equal(tz.cairoOffsetMinutes(new Date("2026-11-01T12:00:00Z")), 120); // winter
    assert.equal(tz.cairoOffsetMinutes(new Date("2026-07-01T12:00:00Z")), 180); // Egypt DST
    assert.equal(tz.hikZoneOffsetMinutes("CST-3:00:00"), 180);
    assert.equal(tz.hikZoneOffsetMinutes("CST-2:00:00"), 120);
    assert.equal(tz.hikZoneOffsetMinutes("CST+5:30:00"), -330);
    assert.equal(tz.hikZoneOffsetMinutes("garbage"), null);
    assert.equal(tz.hikZoneFor(120), "CST-2:00:00");
    assert.equal(tz.hikZoneFor(-330), "CST+5:30:00");
    const winter = new Date("2026-11-01T12:00:00Z");
    assert.match(tz.zoneMismatch("CST-3:00:00", winter), /UTC\+3.*UTC\+2/);
    assert.equal(tz.zoneMismatch("CST-2:00:00", winter), "");
    assert.equal(tz.zoneMismatch("CST-3:00:00", new Date("2026-07-01T12:00:00Z")), "");
    const xml = '<?xml version="1.0"?>\n<Time>\n<timeMode>manual</timeMode>\n<localTime>2026-11-01T15:03:33+03:00</localTime>\n<timeZone>CST-3:00:00</timeZone>\n<IANA>Asia/Shanghai</IANA>\n</Time>';
    assert.equal(tz.withZone(xml, "CST-2:00:00"), '<?xml version="1.0"?>\n<Time>\n<timeMode>manual</timeMode>\n<timeZone>CST-2:00:00</timeZone>\n</Time>');
  } finally { await vite.close(); }
});

test("Team punches shifted a whole hour by a mis-zoned terminal are corrected before de-duplication (anonymized 2026-11-01 pattern)", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  try {
    const { mergeDailySources } = await vite.ssrLoadModule("/src/lib/daily-report.ts");
    const D = "2026-11-01";
    const row = (no, branch, first, last = "") => ({ personId: `${branch}-${no}`, employeeNo: no, name: `Employee ${no}`, date: D, first, last, worked: "", status: last ? "Present" : "One punch only", absent: false, branch });
    // Branch A and B terminals were on UTC+3; branch C was correct (UTC+2). Device times are absolute Cairo time.
    const device = [
      row("101", "A", "09:07"), row("102", "A", "10:00"), row("103", "A", "12:14", "13:44"),
      row("201", "B", "10:18", "13:36"),
      row("301", "C", "09:20", "13:48"),
      row("401", "D", "09:14"), // single punch on its own branch: still enough when nothing lines up at 0
    ];
    const p = (no, time) => ({ employeeNo: no, name: "", date: D, time, method: "t" });
    const team = {
      people: [],
      punches: [
        p("101", "10:07:00"), p("102", "11:00:00"), p("103", "13:14:00"), p("103", "13:50:00"), p("103", "14:44:00"),
        p("201", "11:18:00"), p("201", "12:16:00"), p("201", "14:36:00"),
        p("301", "09:20:00"), p("301", "11:02:00"), p("301", "13:48:00"),
        p("401", "10:14:00"),
      ],
    };
    const warnings = [];
    const rows = mergeDailySources(device, team, "both", D, D, warnings);
    const by = Object.fromEntries(rows.map((r) => [r.employeeNo, [r.first, r.last, r.worked, r.status]]));
    assert.deepEqual(by["101"], ["09:07", "", "", "One punch only"]); // not a fake 1-hour shift any more
    assert.deepEqual(by["102"], ["10:00", "", "", "One punch only"]);
    assert.deepEqual(by["103"], ["12:14", "13:44", "01:30", "Present"]);
    assert.deepEqual(by["201"], ["10:18", "13:36", "03:18", "Present"]);
    assert.deepEqual(by["301"], ["09:20", "13:48", "04:28", "Present"]); // correct branch untouched
    assert.deepEqual(by["401"], ["09:14", "", "", "One punch only"]);
    assert.equal(warnings.filter((w) => /متقدمة \+1 ساعة/.test(w)).length, 3);
    assert.ok(!warnings.some((w) => w.includes("«C»")));
    // The Team-only view is corrected the same way (device rows are still the evidence).
    const w2 = [];
    const onlyTeam = mergeDailySources(device, team, "teams", D, D, w2);
    assert.equal(onlyTeam.find((r) => r.employeeNo === "101").first, "09:07");
    // Team-only employees (no device row) are never moved.
    const w3 = [];
    const extra = mergeDailySources(device, { people: [], punches: [...team.punches, p("999", "08:00:00")] }, "both", D, D, w3);
    assert.equal(extra.find((r) => r.employeeNo === "999").first, "08:00");
  } finally { await vite.close(); }
});

test("zone fixed mid-range: only the mis-zoned days shift, old history is one quiet line, device shown by name", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  try {
    const { mergeDailySources } = await vite.ssrLoadModule("/src/lib/daily-report.ts");
    const id = "76ad6d6b-1111-2222-3333-444455556666";
    const row = (date, first, last) => ({ personId: `${id}|S|7`, employeeNo: "7", name: "Emp", date, first, last, worked: "", status: "Present", absent: false });
    const p = (date, time) => ({ employeeNo: "7", name: "", date, time, method: "t" });
    const device = [row("2026-10-05", "09:00", "17:00"), row("2026-11-01", "09:10", "17:05"), row("2026-11-02", "09:20", "17:10")];
    const team = { people: [], punches: [p("2026-10-05", "10:00:00"), p("2026-10-05", "18:00:00"), p("2026-11-01", "09:10:00"), p("2026-11-01", "17:05:00"), p("2026-11-02", "10:20:00"), p("2026-11-02", "18:10:00")] };
    const w = [];
    const rows = mergeDailySources(device, team, "teams", "2026-10-01", "2026-11-02", w, { deviceNames: new Map([[id, "Masr el gdeda"]]) });
    const by = Object.fromEntries(rows.filter((r) => !r.absent).map((r) => [r.date, `${r.first}-${r.last}`]));
    assert.equal(by["2026-10-05"], "09:00-17:00");
    assert.equal(by["2026-11-01"], "09:10-17:05"); // already correct day is not moved
    assert.equal(by["2026-11-02"], "09:20-17:10");
    assert.ok(!w.some((x) => x.includes(id)));
    assert.equal(w.filter((x) => x.includes("«Masr el gdeda»") && x.includes("2026-11-02")).length, 1);
    assert.equal(w.filter((x) => x.startsWith("ℹ️") && x.includes("1 يوم")).length, 1);
  } finally { await vite.close(); }
});

test("Team-only report rows (no device rows) feed the simple layout over a range", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  try {
    const { mergeDailySources } = await vite.ssrLoadModule("/src/lib/daily-report.ts");
    const { buildLayout, simpleRows, simpleHeader } = await vite.ssrLoadModule("/src/lib/report-layout.ts");
    const p = (no, name, date, time) => ({ employeeNo: no, name, date, time, method: "t" });
    const team = { people: [], punches: [p("1", "Ali", "2026-11-01", "09:00:00"), p("1", "Ali", "2026-11-01", "17:00:00"), p("2", "Mona", "2026-11-02", "10:00:00")] };
    const rows = mergeDailySources([], team, "teams", "2026-11-01", "2026-11-02");
    const l = buildLayout("2026-11-01", "2026-11-02", rows);
    assert.deepEqual(simpleHeader(l), ["الاسم", "التاريخ", "أول بصمة", "آخر بصمة", "عدد ساعات العمل"]);
    const r = simpleRows(l);
    assert.deepEqual(r.find((x) => x[0] === "Ali" && x[1] === "01/11/2026"), ["Ali", "01/11/2026", "09:00", "17:00", "08:00"]);
    assert.deepEqual(r.find((x) => x[0] === "Mona" && x[1] === "02/11/2026"), ["Mona", "02/11/2026", "10:00", "—", "بصمة واحدة"]);
  } finally { await vite.close(); }
});
