import assert from "node:assert/strict";
import { test } from "node:test";
import { csvRows, peoplePreview, safeCsv } from "./import.ts";

test("employee import previews Arabic names, quoted commas and duplicate numbers without writing", () => {
  const rows = csvRows(
    '\uFEFFemployeeNo,name\r\n1,mk\r\n2,"يوسف, محمد"\r\n2,مكرر\r\n3,\r\n',
  );
  const preview = peoplePreview(rows, new Set(["1"]));
  assert.equal(preview[0].error, "موجود في قائمة الجهاز المسحوبة");
  assert.equal(preview[1].name, "يوسف, محمد");
  assert.equal(preview[1].error, "");
  assert.equal(preview[2].error, "مكرر داخل الملف");
  assert.ok(preview[3].error);
  assert.throws(
    () =>
      peoplePreview(
        Array.from({ length: 52 }, () => ["employeeNo", "name"]),
        new Set(),
      ),
    /50/,
  );
  assert.throws(() => csvRows('employeeNo,name\n1,"unfinished'), /اقتباس/);
});

test("CSV export preserves literal data and neutralizes spreadsheet formula prefixes", () => {
  const cells = csvRows(
    safeCsv([
      ["=cmd()", "+formula", "@formula", "-formula", 'اسم "عربي"', "100"],
    ]),
  );
  assert.deepEqual(cells[0], [
    "'=cmd()",
    "'+formula",
    "'@formula",
    "'-formula",
    'اسم "عربي"',
    "100",
  ]);
});
