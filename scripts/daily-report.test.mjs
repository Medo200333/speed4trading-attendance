import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(createRequire(path.join(root, "package.json")).resolve("vite"));
const { rolldown } = await import(pathToFileURL(req.resolve("rolldown")).href);
const tmp = mkdtempSync(path.join(os.tmpdir(), "dr-"));
const entry = path.join(root, "src", "lib", "__daily_entry.ts");
writeFileSync(entry, 'export * from "./daily-report"; export { isEnglishName } from "./access/domain";');
let code;
try {
  const bundle = await rolldown({ input: entry, platform: "node", resolve: { alias: { "@": path.join(root, "src") } } });
  code = (await bundle.generate({ format: "esm" })).output[0].code;
} finally { rmSync(entry, { force: true }); }
const file = path.join(tmp, "b.mjs"); writeFileSync(file, code);
const { dailyRows, dailyPdfBytes, dailyXlsxBytes, workedTime, isEnglishName } = await import(pathToFileURL(file).href);
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));

const row = (o) => ({ personId: "d:1", employeeNo: "1", name: "mk", date: "2026-10-25", shift: "x", first: "", last: "", count: 0, minutes: null, grossMinutes: null, breakMinutes: 0, overtimeMinutes: null, lateMinutes: 0, earlyMinutes: 0, status: "غياب", exception: true, ...o });
test("worked time is last-first hh:mm, blank for one punch", () => {
  assert.equal(workedTime("08:05:00", "16:47:30", 3), "08:42");
  assert.equal(workedTime("08:05:00", "08:05:00", 1), "");
});
test("daily rows use English names, mark absent and keep everyone", () => {
  const rows = dailyRows([row({}), row({ personId: "d:2", employeeNo: "2", name: "محمود", count: 2, first: "20:56:41", last: "20:57:28", status: "منتظم" }), row({ personId: "d:3", employeeNo: "3", status: "عطلة أسبوعية" })], [
    { id: "d:1", name: "mk", employeeNo: "1" },
    { id: "d:2", name: "محمود", employeeNo: "2" },
    { id: "d:3", name: "Ali Hassan", employeeNo: "3" },
  ]);
  assert.equal(rows.length, 3);
  const absent = rows.find((r) => r.employeeNo === "1");
  assert.equal(absent.absent, true); assert.equal(absent.status, "Absent");
  const two = rows.find((r) => r.employeeNo === "2");
  assert.equal(two.name, "(English name missing) #2"); assert.equal(two.first, "20:56"); assert.equal(two.last, "20:57"); assert.equal(two.worked, "00:00");
  assert.equal(rows.find((r) => r.employeeNo === "3").status, "Weekend");
});
test("english name validation", () => {
  assert.ok(isEnglishName("Mohamed Kamal")); assert.ok(isEnglishName("O'Neil-2"));
  assert.ok(!isEnglishName("محمد")); assert.ok(!isEnglishName("123")); assert.ok(!isEnglishName(""));
});
test("pdf and xlsx are produced", () => {
  const rows = dailyRows([row({})], [{ id: "d:1", name: "mk", employeeNo: "1" }]);
  const pdf = dailyPdfBytes("2026-10-25", "2026-10-25", rows, "Demo Co");
  assert.equal(new TextDecoder().decode(pdf.slice(0, 8)), "%PDF-1.4");
  const files = unzipSync(dailyXlsxBytes("2026-10-25", "2026-10-25", rows, "Demo Co"));
  assert.match(strFromU8(files["xl/sharedStrings.xml"]), /Absent/);
});
