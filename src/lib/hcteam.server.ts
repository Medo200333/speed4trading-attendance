// Per-install storage for the customer's own Hik-Connect for Teams AppKey/AppSecret.
// The secret is AES-256-GCM sealed. In the desktop app the key derives from the vault key that Electron safeStorage
// (DPAPI on Windows) protects and passes as SKYLINE_VAULT_KEY; elsewhere from a random install secret + machine name.
// Older installs sealed with the install key are read and re-sealed with the safeStorage-backed key.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { companyDirectory } from "./access/tenant-context.server";
import { clockOffsets, deriveKey, hcClient, HcError, open, personsToPeople, publicConfig, pullWindow, rateLimiter, recordsToPunches, regionUrl, seal, type HcMethod, type HcStored } from "./hcteam-core";

const dir = () => { const d = companyDirectory(); mkdirSync(d, { recursive: true }); return d; };
const file = () => join(dir(), "hcteam.json");
function installKey() {
  const p = join(dir(), ".hcteam-install-key");
  if (!existsSync(p)) writeFileSync(p, randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" });
  return deriveKey(Buffer.from(readFileSync(p, "utf8").trim(), "base64"), hostname());
}
const vaultKey = () => { const v = process.env.SKYLINE_VAULT_KEY; return v ? deriveKey(Buffer.from(v, "base64"), "speed-hcteam-safestorage") : null; };
function key() { return vaultKey() ?? installKey(); }
/** Opens with the current key, falling back to the legacy install key (then migrates the file). */
function openAny(enc: string) {
  try { return open(key(), enc); } catch (e) { if (!vaultKey()) throw e; }
  const plain = open(installKey(), enc);
  const cur = read(); if (cur && cur.secretEnc === enc) write({ ...cur, secretEnc: seal(key(), plain), token: undefined });
  return plain;
}
function read(): HcStored | null { try { return JSON.parse(readFileSync(file(), "utf8")); } catch { return null; } }
function write(s: HcStored) { const t = file() + ".tmp"; writeFileSync(t, JSON.stringify(s, null, 2), { mode: 0o600 }); renameSync(t, file()); }
const take = rateLimiter(5, 1000); // shared by every call in this process

export const hcStatus = () => publicConfig(read());

export function hcSetMethod(method: HcMethod) {
  const cur = read() ?? { appKey: "", region: "isgp", secretEnc: "", savedAt: new Date().toISOString() };
  write({ ...cur, method });
  return publicConfig(read());
}
export function hcSave(input: { appKey: string; secret?: string; region: string }) {
  if (!regionUrl(input.region)) throw new HcError("REGION", "اختر منطقة الخادم.");
  const prev = read();
  const keep = prev && prev.appKey === input.appKey ? prev.secretEnc : "";
  const secretEnc = input.secret ? seal(key(), input.secret) : keep;
  if (!secretEnc) throw new HcError("SECRET", "أدخل AppSecret.");
  write({ appKey: input.appKey, region: input.region, secretEnc, savedAt: new Date().toISOString(), method: "openapi" });
  return publicConfig(read());
}
export function hcClear() { if (read()) write({ appKey: "", region: "isgp", secretEnc: "", savedAt: new Date().toISOString() }); return publicConfig(read()); }

function client() {
  const s = read();
  if (!s?.appKey || !s.secretEnc) throw new HcError("NOT_CONFIGURED", "لم يتم ربط Hik-Connect Team بعد. أدخل AppKey و AppSecret من الإعدادات.");
  const secret = openAny(s.secretEnc);
  const k = key(), t = read()?.token;
  let cached = null;
  if (t?.enc) try { cached = { accessToken: open(k, t.enc), expiresAt: t.expiresAt, areaDomain: t.areaDomain }; } catch { cached = null; }
  return hcClient({
    baseUrl: regionUrl(s.region), appKey: s.appKey, secret, fetch: fetch as never, take, cached,
    onToken: (t) => { const cur = read(); if (cur) write({ ...cur, token: { enc: seal(k, t.accessToken), expiresAt: t.expiresAt, areaDomain: t.areaDomain } }); },
  });
}

export async function hcTest() {
  try { const t = await client().getToken(true); return { ok: true as const, validUntil: new Date(t.expiresAt).toISOString(), status: hcStatus() }; }
  catch (e) { return { ok: false as const, error: e instanceof HcError ? e.message : "تعذر اختبار الاتصال." }; }
}

// Photo URLs from OpenAPI are signed S3 links valid ~1 h, so pictures are downloaded at pull time and kept locally.
const photoDir = () => { const d = join(dir(), "hcteam-photos"); mkdirSync(d, { recursive: true }); return d; };
async function cachePhoto(code: string, url: string): Promise<string> {
  const f = join(photoDir(), createHash("sha256").update(code).digest("hex").slice(0, 32) + ".jpg");
  const fresh = existsSync(f) && Date.now() - statSync(f).mtimeMs < 24 * 3600e3;
  if (url && !fresh && /^https:\/\//.test(url)) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const type = r.headers.get("content-type") || "";
      if (r.ok && /^image\//.test(type)) { const b = Buffer.from(await r.arrayBuffer()); if (b.length && b.length < 1_000_000) writeFileSync(f, b, { mode: 0o600 }); }
    } catch { /* keep the older copy if any */ }
  }
  return existsSync(f) ? `data:image/jpeg;base64,${readFileSync(f).toString("base64")}` : "";
}

const addDays = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400e3).toISOString().slice(0, 10);
/** One call = one Cairo day (pageIndex = day number from `from`); each day is fully paged and split if it hits the cap. */
export async function hcPull(from: string, to: string, pageIndex: number) {
  try {
    const c = client();
    const day = addDays(from, pageIndex - 1);
    if (day > to) return { ok: true as const, punches: [], attempts: [], clock: [], people: undefined, pageIndex, done: true };
    const begin = Date.parse(day + "T00:00:00Z") - 3 * 3600e3, end = Date.parse(day + "T23:59:59Z") + 3 * 3600e3;
    const list = await pullWindow((b, e, p, size) => c.records(b, e, p, size), begin, end);
    const all = recordsToPunches(list).filter((p) => p.date === day);
    // people: directory (personCode + name) plus everyone seen in today's records, with cached photos.
    const people = new Map<string, { employeeNo: string; name: string; photo: string; photoUrl: string }>();
    if (pageIndex === 1) { try { for (const p of personsToPeople(await c.persons(1))) people.set(p.employeeNo || p.name, p); } catch { /* records still carry names */ } }
    for (const r of list) {
      const b = r?.personInfo?.baseInfo ?? {}; const code = String(b.personCode || ""), name = [b.firstName, b.lastName].filter(Boolean).join(" ").trim();
      const k = code || name; if (!k) continue;
      const cur = people.get(k); people.set(k, { employeeNo: code, name: cur?.name || name, photo: "", photoUrl: String(b.photoUrl || cur?.photoUrl || "") });
    }
    const out = [];
    for (const p of people.values()) out.push({ employeeNo: p.employeeNo, name: p.name, photo: await cachePhoto(p.employeeNo || p.name, p.photoUrl) });
    return {
      ok: true as const,
      punches: all.filter((p) => !p.failed),
      attempts: all.filter((p) => p.failed),
      clock: clockOffsets(all),
      people: out.length ? out : undefined,
      pageIndex: pageIndex + 1,
      done: day >= to,
    };
  } catch (e) { return { ok: false as const, error: e instanceof HcError ? e.message : "تعذر سحب الحضور من Hik-Connect Team." }; }
}
