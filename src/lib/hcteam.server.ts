// Per-install storage for the customer's own Hik-Connect for Teams AppKey/AppSecret.
// The secret is AES-256-GCM sealed with a key derived from a random install secret + machine name.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { companyDirectory } from "./access/tenant-context.server";
import { deriveKey, hcClient, HcError, open, personsToPeople, publicConfig, rateLimiter, recordsToPunches, regionUrl, seal, type HcStored } from "./hcteam-core";

const dir = () => { const d = companyDirectory(); mkdirSync(d, { recursive: true }); return d; };
const file = () => join(dir(), "hcteam.json");
function key() {
  const p = join(dir(), ".hcteam-install-key");
  if (!existsSync(p)) writeFileSync(p, randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" });
  return deriveKey(Buffer.from(readFileSync(p, "utf8").trim(), "base64"), hostname());
}
function read(): HcStored | null { try { return JSON.parse(readFileSync(file(), "utf8")); } catch { return null; } }
function write(s: HcStored) { const t = file() + ".tmp"; writeFileSync(t, JSON.stringify(s, null, 2), { mode: 0o600 }); renameSync(t, file()); }
const take = rateLimiter(5, 1000); // shared by every call in this process

export const hcStatus = () => publicConfig(read());

export function hcSave(input: { appKey: string; secret?: string; region: string }) {
  if (!regionUrl(input.region)) throw new HcError("REGION", "اختر منطقة الخادم.");
  const prev = read();
  const keep = prev && prev.appKey === input.appKey ? prev.secretEnc : "";
  const secretEnc = input.secret ? seal(key(), input.secret) : keep;
  if (!secretEnc) throw new HcError("SECRET", "أدخل AppSecret.");
  write({ appKey: input.appKey, region: input.region, secretEnc, savedAt: new Date().toISOString() });
  return publicConfig(read());
}
export function hcClear() { if (read()) write({ appKey: "", region: "isgp", secretEnc: "", savedAt: new Date().toISOString() }); return publicConfig(read()); }

function client() {
  const s = read();
  if (!s?.appKey || !s.secretEnc) throw new HcError("NOT_CONFIGURED", "لم يتم ربط Hik-Connect Team بعد. أدخل AppKey و AppSecret من الإعدادات.");
  const k = key();
  let cached = null;
  if (s.token?.enc) try { cached = { accessToken: open(k, s.token.enc), expiresAt: s.token.expiresAt, areaDomain: s.token.areaDomain }; } catch { cached = null; }
  return hcClient({
    baseUrl: regionUrl(s.region), appKey: s.appKey, secret: open(k, s.secretEnc), fetch: fetch as never, take, cached,
    onToken: (t) => { const cur = read(); if (cur) write({ ...cur, token: { enc: seal(k, t.accessToken), expiresAt: t.expiresAt, areaDomain: t.areaDomain } }); },
  });
}

export async function hcTest() {
  try { const t = await client().getToken(true); return { ok: true as const, validUntil: new Date(t.expiresAt).toISOString(), status: hcStatus() }; }
  catch (e) { return { ok: false as const, error: e instanceof HcError ? e.message : "تعذر اختبار الاتصال." }; }
}

const cairo = (d: string, end: boolean) => `${d}T${end ? "23:59:59" : "00:00:00"}+03:00`;
export async function hcPull(from: string, to: string, pageIndex: number) {
  try {
    const c = client();
    const data = await c.records(cairo(from, false), cairo(to, true), pageIndex);
    const list: unknown[] = data?.recordList ?? [];
    const total = Number(data?.totalNum ?? list.length);
    let people: ReturnType<typeof personsToPeople> | undefined;
    if (pageIndex === 1) { try { people = personsToPeople(await c.persons(1)); } catch { people = undefined; } }
    return { ok: true as const, punches: recordsToPunches(list as never[]), people, pageIndex: pageIndex + 1, done: !list.length || pageIndex * 200 >= total };
  } catch (e) { return { ok: false as const, error: e instanceof HcError ? e.message : "تعذر سحب الحضور من Hik-Connect Team." }; }
}
