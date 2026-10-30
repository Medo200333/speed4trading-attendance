import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { deriveKey, hcClient, open, publicConfig, rateLimiter, recordsToPunches, regionUrl, seal } from "./hcteam-core.ts";

const SECRET = "unit-test-fake-sk", AK = "unit-test-fake-ak";
function mock() {
  const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
  const fetch = async (url: string, init: any) => {
    const body = JSON.parse(init.body); calls.push({ url, body, headers: init.headers });
    if (url.endsWith("/platform/v1/token/get"))
      return { ok: true, status: 200, json: async () => body.secretKey === SECRET
        ? { errorCode: "0", data: { accessToken: "hcc.tok", expireTime: Math.floor(Date.now() / 1000) + 7 * 86400, userId: "u", areaDomain: "https://isgp.hikcentralconnect.com" } }
        : { errorCode: "OPEN000001", message: "bad ak/sk" } };
    return { ok: true, status: 200, json: async () => ({ errorCode: "0", data: { totalNum: 1, recordList: [{ deviceTime: "2026-10-20T08:01:22+03:00", personInfo: { baseInfo: { personCode: "7", firstName: "Ali", lastName: "Hassan" } } }] } }) };
  };
  return { calls, fetch };
}
const fast = async () => {};

test("token/get is called with AK/SK, cached, and reused for API calls on areaDomain", async () => {
  const m = mock(); let saved: any = null;
  const c = hcClient({ baseUrl: regionUrl("isgp"), appKey: AK, secret: SECRET, fetch: m.fetch, take: fast, onToken: (t) => (saved = t) });
  const t = await c.getToken(); await c.getToken();
  assert.equal(m.calls.filter((x) => x.url.endsWith("token/get")).length, 1);
  assert.equal(m.calls[0].url, "https://isgp-team.hikcentralconnect.com/api/hccgw/platform/v1/token/get");
  assert.deepEqual(m.calls[0].body, { appKey: AK, secretKey: SECRET });
  assert.equal(t.accessToken, "hcc.tok"); assert.ok(saved && saved.expiresAt - Date.now() <= 7 * 86400e3);
  const page = await c.records("2026-10-20T00:00:00+03:00", "2026-10-20T23:59:59+03:00", 1);
  const last = m.calls.at(-1)!;
  assert.equal(last.url, "https://isgp.hikcentralconnect.com/api/hccgw/acs/v1/event/certificaterecords/search");
  assert.equal(last.headers.Token, "hcc.tok");
  assert.deepEqual(recordsToPunches(page.recordList), [{ employeeNo: "7", name: "Ali Hassan", date: "2026-10-20", time: "08:01", method: "hik-connect-team" }]);
});
test("a cached token inside its 7 days is used without calling token/get", async () => {
  const m = mock();
  const c = hcClient({ baseUrl: regionUrl("ieu"), appKey: AK, secret: SECRET, fetch: m.fetch, take: fast, cached: { accessToken: "old", expiresAt: Date.now() + 86400e3, areaDomain: "https://ieu.x" } });
  await c.persons(1);
  assert.equal(m.calls.length, 1); assert.equal(m.calls[0].headers.Token, "old");
});
test("wrong secret gives a clear Arabic error that does not echo the secret", async () => {
  const m = mock();
  const c = hcClient({ baseUrl: regionUrl("isgp"), appKey: AK, secret: "wrong-secret-value", fetch: m.fetch, take: fast });
  await assert.rejects(c.getToken(), (e: Error) => /AppSecret/.test(e.message) && !e.message.includes("wrong-secret-value"));
});
test("secret is sealed at rest and never in the public status", () => {
  const k = deriveKey(randomBytes(32), "PC-1"), sealed = seal(k, SECRET);
  assert.ok(!sealed.includes(SECRET)); assert.equal(open(k, sealed), SECRET);
  assert.throws(() => open(deriveKey(randomBytes(32), "PC-1"), sealed));
  const pub = JSON.stringify(publicConfig({ appKey: AK, region: "isgp", secretEnc: sealed, savedAt: "x", token: { enc: seal(k, "hcc.tok"), expiresAt: 1, areaDomain: "d" } }));
  assert.ok(!pub.includes(SECRET) && !pub.includes(sealed) && !pub.includes("hcc.tok") && !pub.includes(AK));
  assert.match(pub, /"hasSecret":true/);
});
test("rate limiter allows at most 5 requests per second", async () => {
  let t = 0; const waits: number[] = [];
  const take = rateLimiter(5, 1000, () => t, async (ms) => { waits.push(ms); t += ms; });
  for (let i = 0; i < 6; i++) await take();
  assert.equal(waits.length, 1); assert.ok(t >= 1000);
});
