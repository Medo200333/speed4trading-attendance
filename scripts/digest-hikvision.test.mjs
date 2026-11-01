// Regression: real Hikvision (DS-K1T, realm DS-xxxx) challenge has qop="auth", opaque="", no algorithm.
// The device rejected the app's header (401) while curl --digest succeeded: the app added an
// unannounced algorithm=MD5 and dropped the empty opaque. This strict mock mirrors curl's accepted form.
import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import { createHash } from "node:crypto";
import { createServer } from "vite";

const md5 = (v) => createHash("md5").update(v).digest("hex");
const CHALLENGE = 'Digest qop="auth", realm="DS-469cf832", nonce="NmU5ZWFjMjY3MTg5N2Y5NGZmY2QzZGZlMDU2ZGI5MTE=", stale="false", opaque="", domain="::"';

test("digest auth matches Hikvision challenge exactly like curl (opaque echoed, no unannounced algorithm)", async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization || "";
    if (!auth) { res.writeHead(401, { "WWW-Authenticate": CHALLENGE }); return res.end(); }
    seen.push(auth);
    const f = {}; for (const m of auth.slice(7).matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) f[m[1]] = m[2] ?? m[3];
    const ha1 = md5(`admin:DS-469cf832:fixture-pass`), ha2 = md5(`${req.method}:${req.url}`);
    const good = f.response === md5(`${ha1}:${f.nonce}:${f.nc}:${f.cnonce}:auth:${ha2}`);
    const strict = !("algorithm" in f) && "opaque" in f && f.uri === req.url && f.qop === "auth";
    res.writeHead(good && strict ? 200 : 401, good && strict ? {} : { "WWW-Authenticate": CHALLENGE });
    res.end(good && strict ? "<DeviceInfo/>" : "");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  try {
    const m = await vite.ssrLoadModule("/src/lib/hikvision.server.ts");
    const base = `http://127.0.0.1:${server.address().port}`;
    const session = new m.DigestSession("admin", "fixture-pass");
    assert.equal((await session.request(`${base}/ISAPI/System/deviceInfo`, "GET")).status, 200);
    assert.equal((await session.request(`${base}/ISAPI/AccessControl/AcsEvent?format=json`, "POST", "{}")).status, 200);
    assert.equal((await new m.DigestSession("admin", "wrong").request(`${base}/ISAPI/System/deviceInfo`, "GET")).status, 401);
    assert.ok(seen.every((h) => !/algorithm=/.test(h) && /opaque=""/.test(h)));
    const c = m.parseChallenge('Digest realm="r", nonce="n", qop="auth", algorithm=SHA-256');
    assert.equal(c.algorithm, "SHA-256"); assert.equal(c.algorithmGiven, true); assert.equal(c.opaqueGiven, false);
  } finally { await vite.close(); server.close(); }
});
