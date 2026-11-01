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
