// Fingerprint add (CaptureFingerPrint → FingerPrintDownload → Progress) and delete (FingerPrint/Delete → DeleteProcess) against a mock.
import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

test("fingerprint enroll and delete per employee with readback", async () => {
  const fps = new Set(); const calls = [];
  let captureFails = false;
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const path = req.url.split("?")[0]; calls.push(`${req.method} ${path}`);
      const json = (o) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      if (path.endsWith("FingerPrintCfg/capabilities")) return json({ FingerPrintCfg: { fingerPrintID: { "@min": 1, "@max": 10 } } });
      if (path.endsWith("UserInfo/Search")) return json({ UserInfoSearch: { UserInfo: [{ employeeNo: "999901", numOfFP: fps.size }] } });
      if (path.endsWith("CaptureFingerPrint")) {
        if (captureFails === "timeout") { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ statusCode: 4, subStatusCode: "captureTimeout", errorMsg: "captureTimeout" })); }
        if (captureFails) { res.writeHead(200); return res.end("<CaptureFingerPrint></CaptureFingerPrint>"); }
        res.writeHead(200, { "Content-Type": "application/xml" }); return res.end("<CaptureFingerPrint><fingerData>QUJD</fingerData><fingerNo>1</fingerNo></CaptureFingerPrint>");
      }
      if (path.endsWith("FingerPrintDownload")) { fps.add(JSON.parse(body).FingerPrintCfg.fingerPrintID); return json({ statusCode: 1 }); }
      if (path.endsWith("FingerPrintProgress")) return json({ FingerPrintStatus: { totalStatus: 1, StatusList: [{ cardReaderRecvStatus: 1 }] } });
      if (path.endsWith("FingerPrint/Delete")) {
        const d = JSON.parse(body).FingerPrintDelete.EmployeeNoDetail; assert.equal(d.employeeNo, "999901");
        if (d.fingerPrintID) d.fingerPrintID.forEach((n) => fps.delete(n)); else fps.clear();
        return json({ statusCode: 1 });
      }
      if (path.endsWith("FingerPrint/DeleteProcess")) return json({ FingerPrintDeleteProcess: { status: "success" } });
      res.writeHead(404); res.end();
    });
  });
  await new Promise((r) => server.listen(0, "0.0.0.0", r));
  const port = server.address().port;
  const host = Object.values(networkInterfaces()).flat().find((i) => i && !i.internal && i.family === "IPv4").address;
  process.env.SKYLINE_ACCESS_DATA_DIR = mkdtempSync(join(tmpdir(), "fp-test-"));
  process.env.SKYLINE_DISABLE_SCHEDULER = "1";
  process.env.SKYLINE_VAULT_KEY = "fixture-vault-key-not-a-real-secret";
  process.env.SKYLINE_ALLOWED_DEVICE_TARGETS = `${host}:${port}`;
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  try {
    const store = await vite.ssrLoadModule("/src/lib/access/store.server.ts");
    const bio = await vite.ssrLoadModule("/src/lib/access/biometrics.server.ts");
    const device = { ...(await store.readState()).devices[0], host, port, https: false };
    store.runtime().secrets.set(device.id, { username: "admin", password: "fixture", until: Date.now() + 60000 });
    assert.equal((await bio.enrollFingerprint(device, "999901", 1)).count, 1);
    assert.equal((await bio.enrollFingerprint(device, "999901", 2)).count, 2);
    assert.equal((await bio.deleteFingerprints(device, "999901", 2)).count, 1);
    assert.equal((await bio.deleteFingerprints(device, "999901")).count, 0);
    captureFails = true;
    await assert.rejects(bio.enrollFingerprint(device, "999901", 1), (e) => e.code === "FP_CAPTURE");
    captureFails = "timeout";
    await assert.rejects(bio.enrollFingerprint(device, "999901", 1), (e) => e.code === "FP_CAPTURE_TIMEOUT");
    assert.ok(calls.includes("PUT /ISAPI/AccessControl/FingerPrint/Delete"));
  } finally { await vite.close(); server.close(); }
});
