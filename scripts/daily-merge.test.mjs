import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("daily report merges device rows with Hik-Connect Team punches by source, without duplicates", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  try {
    const { mergeDailySources } = await vite.ssrLoadModule("/src/lib/daily-report.ts");
    const device = [
      { personId: "p1", employeeNo: "3", name: "Employee Three", date: "2026-11-01", first: "09:20", last: "11:53", worked: "02:33", status: "Present", absent: false },
      { personId: "p2", employeeNo: "8", name: "Device Only", date: "2026-11-01", first: "", last: "", worked: "", status: "Absent", absent: true },
    ];
    const team = {
      people: [{ employeeNo: "3", name: "employee three", photo: "data:image/jpeg;base64,AAA" }, { employeeNo: "6", name: "Employee Six", photo: "data:image/jpeg;base64,BBB" }],
      punches: [
        { employeeNo: "3", name: "", date: "2026-11-01", time: "09:20:30", method: "t" }, // same swipe as device first (<=45s)
        { employeeNo: "3", name: "", date: "2026-11-01", time: "13:05:00", method: "t" }, // later than device last
        { employeeNo: "6", name: "", date: "2026-11-01", time: "09:20:00", method: "t" },
        { employeeNo: "6", name: "", date: "2026-11-01", time: "10:02:00", method: "t" },
        { employeeNo: "6", name: "", date: "2026-11-01", time: "23:59:00", method: "t" }, // shift marker ignored
        { employeeNo: "6", name: "", date: "2026-10-31", time: "10:00:00", method: "t" }, // outside period
      ],
    };
    const dev = mergeDailySources(device, team, "devices", "2026-11-01", "2026-11-01");
    assert.equal(dev.length, 2); assert.equal(dev.find((r) => r.employeeNo === "3").last, "11:53");
    const only = mergeDailySources(device, team, "teams", "2026-11-01", "2026-11-01");
    assert.deepEqual(only.map((r) => [r.employeeNo, r.first, r.last, r.worked, Boolean(r.photo)]), [["6", "09:20", "10:02", "00:42", true], ["3", "09:20", "13:05", "03:45", true]]);
    const both = mergeDailySources(device, team, "both", "2026-11-01", "2026-11-01");
    const m = both.find((r) => r.employeeNo === "3");
    assert.equal(both.length, 3);
    assert.equal(m.personId, "p1"); assert.equal(m.name, "Employee Three");
    assert.equal(m.first, "09:20"); assert.equal(m.last, "13:05"); assert.equal(m.worked, "03:45"); assert.equal(m.photo, "data:image/jpeg;base64,AAA");
    assert.equal(both.find((r) => r.employeeNo === "8").absent, true);
    assert.equal(mergeDailySources(device, null, "teams", "2026-11-01", "2026-11-01").length, 0);
    // Same employee enrolled on several branches: an "Absent" row on a later device must not erase the punches.
    const multi = [
      { ...device[0], personId: "a1", branch: "Masr el gdeda" },
      { ...device[0], personId: "b1", branch: "alex", first: "08:10", last: "08:10", worked: "", status: "One punch only" },
      { ...device[0], personId: "c1", branch: "mansora", first: "", last: "", worked: "", status: "Absent", absent: true },
      { ...device[1], personId: "c2", branch: "mansora" },
    ];
    const md = mergeDailySources(multi, null, "devices", "2026-11-01", "2026-11-01");
    assert.equal(md.length, 2);
    const e = md.find((r) => r.employeeNo === "3");
    assert.deepEqual([e.first, e.last, e.worked, e.absent, e.branch, e.personId], ["08:10", "11:53", "03:43", false, "Masr el gdeda + alex", "a1"]);
    const ab = md.find((r) => r.employeeNo === "8");
    assert.deepEqual([ab.absent, ab.branch], [true, ""]);
    const mb = mergeDailySources(multi, team, "both", "2026-11-01", "2026-11-01").find((r) => r.employeeNo === "3");
    assert.deepEqual([mb.first, mb.last, mb.branch], ["08:10", "13:05", "Masr el gdeda + alex + Teams"]);
    const { dailyPdfBytes, dailyXlsxBytes } = await vite.ssrLoadModule("/src/lib/daily-report.ts");
    assert.ok(new TextDecoder("latin1").decode(dailyPdfBytes("2026-11-01", "2026-11-01", md, "X")).includes("Branch / source"));
    assert.ok(dailyXlsxBytes("2026-11-01", "2026-11-01", md, "X").length > 1000);
  } finally { await vite.close(); }
});
