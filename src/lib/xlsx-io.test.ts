import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { buildXlsx, decodeLogo } from "./xlsx-io.ts";

// 1x1 PNG
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
test("xlsx embeds the company logo on sheets that have one", () => {
  const files = unzipSync(buildXlsx([
    { name: "الحضور", logo: png, widths: [10, 10, 10, 10, 10], rows: [["speed4trading"], ["الشركة", "شركة النور"]] },
    { name: "info", widths: [10], rows: [["x"]] },
  ]));
  assert.ok(files["xl/media/logo1.png"]);
  assert.match(strFromU8(files["xl/worksheets/sheet1.xml"]), /<drawing r:id="rId1"\/>/);
  assert.doesNotMatch(strFromU8(files["xl/worksheets/sheet2.xml"]), /<drawing/);
  assert.match(strFromU8(files["[Content_Types].xml"]), /drawing1\.xml/);
  assert.match(strFromU8(files["xl/sharedStrings.xml"]), /شركة النور/);
});
test("decodeLogo reads PNG size and skips SVG", () => {
  const l = decodeLogo(png); assert.equal(l?.w, 1); assert.equal(l?.h, 1); assert.equal(l?.ext, "png");
  assert.equal(decodeLogo("data:image/svg+xml;base64,PHN2Zy8+"), null);
  assert.equal(decodeLogo(""), null);
});
