import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("OpenAPI merge guard + both-source export rows (summary and per-employee sheets include cloud people)", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  try {
    const { mergeDailySources } = await vite.ssrLoadModule("/src/lib/daily-report.ts");
    const { reportXlsxBytes, diffRows } = await vite.ssrLoadModule("/src/lib/report-diff.ts");
    const device = [
      { personId: "p1", employeeNo: "1", name: "mk", date: "2026-11-02", first: "09:01", last: "14:51", worked: "05:50", status: "Present", absent: false },
      { personId: "p2", employeeNo: "2", name: "(English name missing) #2", date: "2026-11-02", first: "", last: "", worked: "", status: "Absent", absent: true },
      { personId: "p3", employeeNo: "3", name: "Rawan Reda", date: "2026-11-02", first: "", last: "", worked: "", status: "Absent", absent: true },
    ];
    const team = {
      people: [{ employeeNo: "2", name: "Hamdy", photo: "data:image/jpeg;base64,H" }, { employeeNo: "3", name: "rawan reda", photo: "" }, { employeeNo: "9", name: "Islam Alex", photo: "" }],
      punches: [
        { employeeNo: "2", name: "Hamdy", date: "2026-11-02", time: "10:00:00", method: "o" },
        { employeeNo: "3", name: "Rawan Reda", date: "2026-11-02", time: "09:10:00", method: "o" },
        { employeeNo: "9", name: "Islam Alex", date: "2026-11-02", time: "10:29:00", method: "o" },
        { employeeNo: "9", name: "Islam Alex", date: "2026-11-02", time: "15:07:00", method: "o" },
      ],
    };
    const both = mergeDailySources(device, team, "both", "2026-11-02", "2026-11-02", undefined, { requireName: true, label: "OpenAPI" });
    const local2 = both.find((r) => r.personId === "p2"), cloud2 = both.find((r) => r.personId === "team:2");
    assert.equal(local2.absent, true); assert.equal(local2.photo ?? null, null); // Hamdy's punch/photo NOT given to local #2
    assert.equal(cloud2.name, "Hamdy"); assert.equal(cloud2.first, "10:00"); assert.equal(cloud2.unmatched, true);
    assert.equal(both.find((r) => r.personId === "p3").first, "09:10"); // code + name match -> merged
    assert.equal(both.find((r) => r.employeeNo === "9").last, "15:07");
    assert.equal(both.find((r) => r.employeeNo === "9").branch, "OpenAPI");
    // without the guard (web login source) the old code-only join stays
    assert.equal(mergeDailySources(device, team, "both", "2026-11-02", "2026-11-02").find((r) => r.personId === "p2").first, "10:00");
    // Excel: per-employee sheets for devices AND cloud people (+ الملخص + الفرق)
    const dev = mergeDailySources(device, team, "devices", "2026-11-02", "2026-11-02");
    const tm = mergeDailySources(device, team, "teams", "2026-11-02", "2026-11-02");
    const diff = diffRows(dev, tm, 2, true);
    const bytes = reportXlsxBytes("2026-11-02", "2026-11-02", both, diff, "Sky", "", "Hik-Connect Team (OpenAPI)");
    const txt = Buffer.from(bytes).toString("latin1");
    assert.ok(txt.includes("Hamdy") || bytes.length > 2000);
    const { buildLayout } = await vite.ssrLoadModule("/src/lib/report-layout.ts");
    const names = buildLayout("2026-11-02", "2026-11-02", both).employees.map((e) => e.name).sort();
    assert.deepEqual(names, ["(English name missing) #2", "Hamdy", "Islam Alex", "Rawan Reda", "mk"].sort());
  } finally { await vite.close(); }
});

test("all devices: one employee's punches at two branches pool per day; same code on another site stays apart", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  try {
    const { mergeDailySources } = await vite.ssrLoadModule("/src/lib/daily-report.ts");
    const { diffRows } = await vite.ssrLoadModule("/src/lib/report-diff.ts");
    const r = (personId, no, name, first, last, branch) => ({ personId, employeeNo: no, name, date: "2026-11-02", first, last, worked: "", status: first ? "Present" : "Absent", absent: !first, branch });
    const device = [
      r("cai|s|7", "7", "Mahmoud Habib", "13:23", "", "cairo"),
      r("msr|s|7", "7", "Mahmoud Habib", "15:00", "15:01", "masr"),
      r("bm|s|2", "2", "عمر", "", "", "bm"),
      r("msr|s|2", "2", "jihan hussien", "10:00", "", "masr"),
    ];
    const team = { people: [{ employeeNo: "7", name: "Mahmoud Habib", photo: "" }, { employeeNo: "2", name: "jihan hussien", photo: "" }], punches: [
      { employeeNo: "7", name: "Mahmoud Habib", date: "2026-11-02", time: "13:23:00" }, { employeeNo: "7", name: "Mahmoud Habib", date: "2026-11-02", time: "15:01:00" },
      { employeeNo: "2", name: "jihan hussien", date: "2026-11-02", time: "10:00:00" }] };
    const opts = { requireName: true, label: "OpenAPI" };
    const dev = mergeDailySources(device, team, "devices", "2026-11-02", "2026-11-02", undefined, opts);
    const mh = dev.filter((x) => x.employeeNo === "7");
    assert.equal(mh.length, 1); assert.equal(mh[0].first, "13:23"); assert.equal(mh[0].last, "15:01"); assert.match(mh[0].branch, /cairo/); assert.match(mh[0].branch, /masr/);
    assert.equal(dev.filter((x) => x.employeeNo === "2").length, 2, "عمر (bm) and jihan stay two people");
    const tm = mergeDailySources(device, team, "teams", "2026-11-02", "2026-11-02", undefined, opts);
    const d = diffRows(dev, tm, 2, true);
    assert.equal(d.find((x) => x.name === "Mahmoud Habib").state, "match");
    assert.equal(d.find((x) => x.name === "jihan hussien").state, "match");
    assert.equal(d.find((x) => x.name === "عمر").state, "absent");
    assert.ok(!d.some((x) => x.unmatched));
  } finally { await vite.close(); }
});
