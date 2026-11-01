// The PDF generator must put the customer company (not the owner/product) in the report header + metadata.
import test from "node:test";
import assert from "node:assert/strict";
import { rolldown } from "rolldown";
import { resolve } from "node:path";

async function load() {
  const bundle = await rolldown({ input: "src/lib/sheet-pdf.ts", platform: "node", logLevel: "silent", resolve: { alias: { "@": resolve("src") } } });
  const { output } = await bundle.generate({ format: "esm" });
  return import("data:text/javascript;base64," + Buffer.from(output[0].code).toString("base64"));
}
const hex = (s) => "FEFF" + [...s].map((c) => c.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()).join("");
const row = { employeeNo: "1", name: "Ali Hassan", date: "2026-10-20", weekday: "", first: "08:00", last: "16:00", count: 2, minutes: 480, hours: 8, late: false, missingOut: false, status: "" };

test("attendance PDF carries the company name in header and metadata", async () => {
  const { attendancePdfBytes } = await load();
  const pdf = Buffer.from(attendancePdfBytes("2026-10-18", "2026-10-24", [row], [], "Acme Trading")).toString("latin1");
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\(Acme Trading - Attendance report\) Tj/);
  assert.ok(pdf.includes(hex("Acme Trading")), "Author/Title metadata is the company");
  assert.match(pdf, /\/Producer \(speed4trading\)/);
  assert.doesNotMatch(pdf, /Mohamed Kamal|Skyline|Zubayd/);
});
test("attendance PDF embeds the company logo when given", async () => {
  const { attendancePdfBytes } = await load();
  // 2x2 baseline JPEG
  const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDx6iiivSOM/9k=";
  const pdf = Buffer.from(attendancePdfBytes("2026-10-18", "2026-10-24", [row], [], "Acme", jpeg)).toString("latin1");
  assert.match(pdf, /\/Subtype \/Image/);
  assert.match(pdf, /\/Im1 Do/);
});
