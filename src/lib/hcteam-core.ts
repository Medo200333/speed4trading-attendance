// Hik-Connect for Teams OpenAPI (V2.15.500 guide): AK/SK -> token (valid 7 days), max 5 requests/second.
// Pure + injectable so it can be unit tested with a mock fetch. Never logs or returns the secret.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

import { HC_OK_EVENT, HC_REGIONS, regionUrl, type HcMethod, type HcRegion, type HcStored, type HcPublic } from "./hcteam-shared.ts";
export { HC_OK_EVENT, HC_REGIONS, regionUrl, type HcMethod, type HcRegion, type HcStored, type HcPublic };

/** What the browser may see: never the secret, never the token. */
export function publicConfig(s: HcStored | null): HcPublic {
  return {
    configured: Boolean(s?.appKey && s?.secretEnc),
    appKey: s?.appKey ? s.appKey.slice(0, 4) + "…" + s.appKey.slice(-4) : "",
    region: s?.region || "isgp",
    hasSecret: Boolean(s?.secretEnc),
    savedAt: s?.savedAt || "",
    tokenValidUntil: s?.token?.expiresAt ? new Date(s.token.expiresAt).toISOString() : "",
    method: s?.method === "phone" ? "phone" : s?.method === "openapi" || (s?.appKey && s?.secretEnc) ? "openapi" : "phone",
  };
}

/** Per-install key: HKDF(random install secret kept in the data dir, machine identity). */
export function deriveKey(installSecret: Buffer, machine: string) {
  return Buffer.from(hkdfSync("sha256", installSecret, createHash("sha256").update(machine).digest(), "speed-hcteam-v1", 32));
}
export function seal(key: Buffer, plain: string) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}
export function open(key: Buffer, sealed: string) {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1") throw new Error("HC_SEALED_FORMAT");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
}

/** Sliding-window limiter: at most `max` calls in any `windowMs`. */
export function rateLimiter(max = 5, windowMs = 1000, now = () => Date.now(), sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  const stamps: number[] = [];
  return async function take() {
    for (;;) {
      const t = now();
      while (stamps.length && t - stamps[0] >= windowMs) stamps.shift();
      if (stamps.length < max) { stamps.push(t); return; }
      await sleep(windowMs - (t - stamps[0]) + 1);
    }
  };
}

export class HcError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } }
const arabic: Record<string, string> = {
  OPEN000001: "AppKey أو AppSecret غير صحيح.", OPEN000002: "المفتاح غير مفعّل أو انتهت صلاحيته.",
};
export function hcMessage(code: string, fallback = "") {
  return arabic[code] || (fallback ? `رد Hik-Connect: ${fallback} (${code})` : `رفض Hik-Connect الطلب (${code}).`);
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;
export type HcToken = { accessToken: string; expiresAt: number; areaDomain: string };

export type HcClientOptions = {
  baseUrl: string; appKey: string; secret: string; fetch: Fetch;
  cached?: HcToken | null; onToken?: (t: HcToken) => void; take?: () => Promise<void>; now?: () => number;
};
export const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;

export function hcClient(o: HcClientOptions) {
  const now = o.now ?? (() => Date.now()), take = o.take ?? rateLimiter();
  let token = o.cached && o.cached.expiresAt - now() > 3600_000 ? o.cached : null;
  async function call(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
    await take();
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await o.fetch(base.replace(/\/+$/, "") + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctl.signal });
      const json = await res.json().catch(() => null);
      if (!json) throw new HcError(`HTTP_${res.status}`, `تعذر قراءة رد Hik-Connect (HTTP ${res.status}).`);
      if (String(json.errorCode ?? "") !== "0") throw new HcError(String(json.errorCode || `HTTP_${res.status}`), hcMessage(String(json.errorCode || res.status), json.message || json.errorMsg || ""));
      return json.data;
    } catch (e) {
      if (e instanceof HcError) throw e;
      throw new HcError("NETWORK", "تعذر الوصول إلى خادم Hik-Connect. راجع المنطقة والاتصال بالإنترنت.");
    } finally { clearTimeout(timer); }
  }
  async function getToken(force = false): Promise<HcToken> {
    if (token && !force) return token;
    const d = await call(o.baseUrl, "/api/hccgw/platform/v1/token/get", { appKey: o.appKey, secretKey: o.secret });
    if (!d?.accessToken) throw new HcError("NO_TOKEN", "لم يرجع Hik-Connect رمز دخول.");
    const exp = Number(d.expireTime) > 0 ? Number(d.expireTime) * (Number(d.expireTime) < 1e12 ? 1000 : 1) : now() + TOKEN_TTL_MS;
    token = { accessToken: String(d.accessToken), expiresAt: Math.min(exp, now() + TOKEN_TTL_MS), areaDomain: String(d.areaDomain || o.baseUrl) };
    o.onToken?.(token);
    return token;
  }
  async function api(path: string, body: unknown) {
    const t = await getToken();
    try { return await call(t.areaDomain, path, body, { Token: t.accessToken }); }
    catch (e) {
      if (e instanceof HcError && /^(OPEN000006|OPEN000007|EVZ10002|HTTP_401)$/.test(e.code)) { const t2 = await getToken(true); return call(t2.areaDomain, path, body, { Token: t2.accessToken }); }
      throw e;
    }
  }
  return {
    getToken,
    /** Card/face/fingerprint swipe records page (pageSize ≤ 200). type 0 / swipeAuthResult 0 = all records, so failed
     *  attempts come back too and are flagged (eventType ≠ 110013) instead of silently dropped. */
    records: (begin: string, end: string, pageIndex: number, pageSize = 200) =>
      api("/api/hccgw/acs/v1/event/certificaterecords/search", { pageIndex, pageSize, searchCriteria: { beginTime: begin, endTime: end, type: 0, swipeAuthResult: 0 } }),
    persons: (pageIndex: number, pageSize = 200) => api("/api/hccgw/person/v1/persons/list", { pageIndex, pageSize, filter: {} }),
  };
}

export type HcPunch = { employeeNo: string; name: string; date: string; time: string; method: string; failed?: boolean; eventType?: number; device?: string; offsetMin?: number };
const two = (n: number) => String(n).padStart(2, "0");
const cairoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
/** Instant -> Cairo wall clock (occurTime is UTC "…Z"; Egypt DST handled by ICU). */
export function cairoWall(iso: string) {
  const d = new Date(iso || ""); if (!iso || isNaN(+d)) return null;
  const p = Object.fromEntries(cairoFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, sec: `${p.hour}:${p.minute}:${p.second}` };
}
/** The wall time exactly as the device wrote it (deviceTime keeps the device's own offset). */
function literalWall(iso: string) {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(iso || "");
  return m ? { date: m[1], min: Number(m[2]) * 60 + Number(m[3]) } : null;
}
const dayMin = (date: string, min: number) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 60000 + min;
export function personName(p: any) {
  const b = p?.baseInfo ?? p?.personBaseInfo ?? p ?? {};
  return [b.firstName, b.lastName].filter(Boolean).join(" ").trim() || String(b.fullName || b.personName || "");
}
export function personCode(p: any) {
  const b = p?.baseInfo ?? p?.personBaseInfo ?? p ?? {};
  return String(b.personCode || b.employeeNo || p?.personCode || "");
}
export function personPhotoUrl(p: any) {
  const b = p?.baseInfo ?? p?.personBaseInfo ?? p ?? {};
  return String(b.photoUrl || p?.photoUrl || "");
}
/** OpenAPI records -> punches. Time = occurTime (UTC) shown in Cairo time; mapped by personCode, then by name.
 *  failed = eventType present and ≠ 110013. offsetMin = device clock − real Cairo time (deviceTime vs occurTime). */
export function recordsToPunches(list: any[]): HcPunch[] {
  const out: HcPunch[] = [];
  for (const r of list || []) {
    const w = cairoWall(r.occurTime || r.recordTime || r.deviceTime); if (!w) continue;
    const p = r.personInfo ?? {};
    const name = personName(p), code = personCode(p) || String(r.cardNumber || "");
    if (!code && !name) continue;
    const punch: HcPunch = { employeeNo: code, name, date: w.date, time: w.time, method: "hik-connect-openapi" };
    const ev = r.eventType == null || r.eventType === "" ? NaN : Number(r.eventType);
    if (Number.isFinite(ev)) { punch.eventType = ev; if (ev !== HC_OK_EVENT) punch.failed = true; }
    const dev = String(r.deviceName || r.elementName || ""); if (dev) punch.device = dev;
    const lw = literalWall(r.deviceTime);
    if (lw && r.occurTime) { const c = literalWall(w.date + "T" + w.time)!; punch.offsetMin = dayMin(lw.date, lw.min) - dayMin(c.date, c.min); }
    out.push(punch);
  }
  return out;
}
/** Devices whose clock is off by ≥ `min` minutes (median per device). */
export function clockOffsets(punches: HcPunch[], min = 2) {
  const by = new Map<string, number[]>();
  for (const p of punches) if (p.device && p.offsetMin != null) by.set(p.device, [...(by.get(p.device) || []), p.offsetMin]);
  const out: { device: string; offsetMin: number; samples: number }[] = [];
  for (const [device, v] of by) { const s = [...v].sort((a, b) => a - b), med = s[Math.floor(s.length / 2)]; if (Math.abs(med) >= min) out.push({ device, offsetMin: med, samples: v.length }); }
  return out;
}
/** Cairo-offset ISO for an instant (beginTime/endTime of a search window). */
export function cairoIso(ms: number) {
  const w = cairoWall(new Date(ms).toISOString())!;
  const off = Math.round((dayMin(w.date, Number(w.sec.slice(0, 2)) * 60 + Number(w.sec.slice(3, 5))) * 60000 + Number(w.sec.slice(6, 8)) * 1000 - Math.floor(ms / 1000) * 1000) / 60000);
  const sign = off < 0 ? "-" : "+", a = Math.abs(off);
  return `${w.date}T${w.sec}${sign}${two(Math.floor(a / 60))}:${two(a % 60)}`;
}
/** Reads every record of [begin, end] (ms). Pages of `size`; if the window holds more than `cap` records it is split in two. */
export async function pullWindow(records: (b: string, e: string, page: number, size: number) => Promise<any>, beginMs: number, endMs: number, cap = 10000, size = 200): Promise<any[]> {
  const first = await records(cairoIso(beginMs), cairoIso(endMs), 1, size);
  const total = Number(first?.totalNum ?? 0);
  if (total > cap && endMs - beginMs >= 120_000) {
    const mid = Math.floor((beginMs + endMs) / 2000) * 1000;
    return [...(await pullWindow(records, beginMs, mid, cap, size)), ...(await pullWindow(records, mid + 1000, endMs, cap, size))];
  }
  const list: any[] = [...(first?.recordList ?? [])];
  let page = 1, got = list.length;
  while (!pageDone(page, got, total, size) && page < Math.ceil(cap / size)) {
    page += 1;
    const d = await records(cairoIso(beginMs), cairoIso(endMs), page, size);
    const rl = d?.recordList ?? []; got = rl.length; list.push(...rl);
  }
  return list;
}
export function personsToPeople(data: any) {
  const list: any[] = data?.personList ?? data?.list ?? data?.persons ?? [];
  return list.map((x) => { const p = x?.personInfo ?? x; return { employeeNo: personCode(p), name: personName(p), photo: "", photoUrl: personPhotoUrl(p), gender: "" }; }).filter((p) => p.employeeNo || p.name);
}

/** Egypt observes DST again (UTC+2 winter / UTC+3 summer): build the day bounds with the real Cairo offset. */
export function cairoBound(day: string, end: boolean) {
  const probe = new Date(`${day}T12:00:00Z`);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" }).formatToParts(probe).find((p) => p.type === "timeZoneName")?.value || "GMT+02:00";
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(name);
  const off = m ? `${m[1]}:${m[2] || "00"}` : "+02:00";
  return `${day}T${end ? "23:59:59" : "00:00:00"}${off}`;
}
export const pageDone = (pageIndex: number, got: number, total: number, size = 200) => !got || pageIndex * size >= total;
