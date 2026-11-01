import { test } from "node:test";
import assert from "node:assert/strict";
import { captureFace, parseCaptureReply, type Reply, type CaptureDeps } from "./face-capture-core.ts";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const enc = (s: string) => new TextEncoder().encode(s);
function multipart(xml: string, img?: Uint8Array): Reply {
  const b = "MIME_boundary";
  const parts: Uint8Array[] = [enc(`--${b}\r\nContent-Type: application/xml; charset="UTF-8"\r\nContent-Length: ${xml.length}\r\n\r\n${xml}\r\n`)];
  if (img) parts.push(enc(`--${b}\r\nContent-Disposition: form-data; name="FaceImage"\r\nContent-Type: image/jpeg\r\nContent-Length: ${img.length}\r\n\r\n`), img, enc("\r\n"));
  parts.push(enc(`--${b}--\r\n`));
  return { status: 200, text: "", bytes: new Uint8Array(Buffer.concat(parts.map((p) => Buffer.from(p)))), contentType: `multipart/mixed; boundary=${b}` };
}
const xml = (p: number, over = false, url = "") => `<CaptureFaceData><captureProgress>${p}</captureProgress><isCurRequestOver>${over}</isCurRequestOver>${url ? `<faceDataUrl>${url}</faceDataUrl>` : ""}</CaptureFaceData>`;
const deps = (o: Partial<CaptureDeps>): CaptureDeps & { steps: string[] } => {
  const steps: string[] = [];
  return { steps, post: async () => multipart(xml(0)), progress: async () => multipart(xml(0)), picture: async () => ({ status: 200, text: "", bytes: jpeg, contentType: "image/jpeg" }), sleep: async () => {}, onStep: (_p, m) => steps.push(m), stopped: () => false, ...o };
};

test("multipart reply with JPEG part is parsed (DS-K1T342 binary mode)", () => {
  const r = parseCaptureReply(multipart(xml(100), jpeg));
  assert.deepEqual([...r.photo!], [...jpeg]); assert.match(r.text, /captureProgress>100/);
});
test("blocking POST returns the face directly", async () => {
  let timeout = 0;
  const d = deps({ post: async (_b, t) => { timeout = t; return multipart(xml(100), jpeg); } });
  assert.deepEqual([...(await captureFace(d, false))], [...jpeg]);
  assert.ok(timeout >= 60_000, "capture request must stay open longer than the old 20 s");
  assert.match(d.steps.at(-1)!, /3\/3/);
});
test("POST dropped -> progress polling -> faceDataUrl fetched", async () => {
  let n = 0;
  const d = deps({ post: async () => { throw new Error("timeout"); }, progress: async () => multipart(++n < 3 ? xml(40) : xml(100, true, "http://x/LOCALS/pic/face.jpg")) });
  assert.deepEqual([...(await captureFace(d, false))], [...jpeg]);
  assert.ok(d.steps.some((s) => s.startsWith("2/3")));
});
test("device timeout without a face gives a clear Arabic instruction", async () => {
  const d = deps({ post: async () => multipart(xml(0, true)) });
  await assert.rejects(captureFace(d, false), /قف أمام الكاميرا/);
});
test("busy device", async () => {
  const d = deps({ post: async () => ({ status: 400, text: "<subStatusCode>deviceBusy</subStatusCode>", bytes: enc("<subStatusCode>deviceBusy</subStatusCode>"), contentType: "application/xml" }) });
  await assert.rejects(captureFace(d, false), /مشغول/);
});
