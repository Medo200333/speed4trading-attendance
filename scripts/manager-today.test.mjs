import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createServer } from "vite";

test("manager summary counts present/absent and inside vs left", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  try {
    const { managerSummary } = await vite.ssrLoadModule("/src/lib/daily-report.ts");
    const base = { date: "2026-11-01", worked: "", status: "", personId: "", employeeNo: "" };
    const s = managerSummary([
      { ...base, name: "C", first: "", last: "", absent: true },
      { ...base, name: "B", first: "09:10", last: "17:00", absent: false },
      { ...base, name: "A", first: "08:55", last: "", absent: false },
    ]);
    assert.deepEqual([s.present, s.absent, s.inside, s.left], [2, 1, 1, 1]);
    assert.deepEqual(s.list.map((r) => r.label), ["حضر", "خرج", "غائب"]);
  } finally { await vite.close(); }
});

test("manager role is read-only and limited to today on the server", () => {
  const svc = readFileSync("src/lib/access/service.server.ts", "utf8");
  assert.match(svc, /actor\.role === "manager" && !\(input\.action === "sync" && !input\.usersOnly && input\.start === today\(\) && input\.end === today\(\)\)/);
  assert.match(svc, /actor\.role === "manager" && !\["attendance", "photo"\]\.includes\(input\.action\)/);
  const ui = readFileSync("src/components/manager-today.tsx", "utf8");
  assert.doesNotMatch(ui, /Tailscale|Teams|سحب/);
  assert.match(readFileSync("src/components/access-center.tsx", "utf8"), /manager \? <ManagerToday \/>/);
});
