import { createHash, randomBytes } from "node:crypto";
import { deviceBase } from "./access/target.server";
import type { Punch } from "./attendance";
import {
  isMore,
  parseDevicePayload,
  parseEventPayload,
  parseUserPayload,
  type DirectoryPerson,
} from "./hikvision-parse";

export type DeviceLink = {
  host: string;
  port: number;
  https: boolean;
  username: string;
  password: string;
};

export type ChunkRequest = DeviceLink & {
  startDate: string;
  endDate: string;
  timeZone: string;
  eventSearchId: string;
  eventPos: number;
  eventsDone: boolean;
  variant: number;
  pageSize: number;
  usersDone: boolean;
  userSearchId: string;
  userPos: number;
};

export type ChunkResult =
  | {
      ok: true;
      deviceName: string;
      model: string;
      punches: Punch[];
      users: DirectoryPerson[];
      eventPos: number;
      eventsDone: boolean;
      variant: number;
      pageSize: number;
      usersDone: boolean;
      userPos: number;
      userSearchId: string;
    }
  | { ok: false; error: string };

const PAGES_PER_CALL = 6;

type Challenge = {
  realm: string;
  nonce: string;
  opaque?: string;
  qop: string;
  algorithm: string;
  /** Hikvision firmware rejects an algorithm it did not announce and expects opaque echoed even when empty (like curl). */
  algorithmGiven?: boolean;
  opaqueGiven?: boolean;
};

type Variant = { major: number; pageSize: number; withOffset: boolean };

const VARIANTS: Variant[] = [
  { major: 5, pageSize: 30, withOffset: true },
  { major: 5, pageSize: 10, withOffset: true },
  { major: 5, pageSize: 10, withOffset: false },
  { major: 0, pageSize: 10, withOffset: true },
];

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function escapeDigest(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isBlockedIp(raw: string): boolean {
  let ip = raw.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  if (ip === "::1" || ip === "::" || ip === "0.0.0.0") return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/غير مسموح|تاريخ|الفترة|الآي بي|اسم الجهاز/.test(message)) return message;
  if (/abort|timeout|timed out/i.test(message)) return "الجهاز ما ردش في الوقت. اتأكد إنه شغال وحاول تاني.";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) return "مش لاقي العنوان ده. راجع الآي بي أو اسم الجهاز.";
  if (/ECONNREFUSED/i.test(message)) return "الجهاز رفض الاتصال. راجع البورت (غالباً 80).";
  if (/EHOSTUNREACH|ENETUNREACH|ECONNRESET|fetch failed|connect/i.test(message)) {
    return "مش قادر أوصل للجهاز من الإنترنت. لو البصمة على شبكة المكتب بس، صدّر التقرير وارفع الملف.";
  }
  return message || "حصل خطأ أثناء الاتصال بالجهاز.";
}

async function assertTarget(link: DeviceLink): Promise<string> {
  return deviceBase(link);
}

function requestUri(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

export function parseChallenge(header: string): Challenge | null {
  if (!/digest/i.test(header)) return null;
  const body = header.replace(/^digest\s+/i, "");
  const fields: Record<string, string> = {};
  const re = /([a-z]+)=("([^"]*)"|([^,\s]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) fields[match[1].toLowerCase()] = match[3] ?? match[4] ?? "";
  if (!fields.realm || !fields.nonce) return null;
  const qopList = (fields.qop ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return {
    realm: fields.realm,
    nonce: fields.nonce,
    opaque: fields.opaque,
    qop: qopList.includes("auth") ? "auth" : qopList[0] ?? "",
    algorithm: fields.algorithm || "MD5",
    algorithmGiven: Boolean(fields.algorithm),
    opaqueGiven: "opaque" in fields,
  };
}

export class DigestSession {
  private challenge: Challenge | null = null;
  private nc = 0;

  constructor(
    private readonly username: string,
    private readonly password: string,
  ) {}

  private authorization(method: string, url: string): string {
    const challenge = this.challenge;
    if (!challenge) return "";
    this.nc += 1;
    const nc = this.nc.toString(16).padStart(8, "0");
    const cnonce = randomBytes(8).toString("hex");
    const uri = requestUri(url);
    const algorithm = challenge.algorithm.toUpperCase();
    if (!["MD5", "MD5-SESS", "SHA-256", "SHA-256-SESS"].includes(algorithm) || challenge.qop && challenge.qop !== "auth") throw new Error("طريقة مصادقة الجهاز غير مدعومة.");
    const hash = (value: string) => createHash(algorithm.startsWith("SHA-256") ? "sha256" : "md5").update(value).digest("hex");
    const firstHa1 = hash(`${this.username}:${challenge.realm}:${this.password}`);
    const ha1 = algorithm.endsWith("-SESS") ? hash(`${firstHa1}:${challenge.nonce}:${cnonce}`) : firstHa1;
    const ha2 = hash(`${method}:${uri}`);
    const response = challenge.qop
      ? hash(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
      : hash(`${ha1}:${challenge.nonce}:${ha2}`);
    const parts = [
      `username="${escapeDigest(this.username)}"`,
      `realm="${escapeDigest(challenge.realm)}"`,
      `nonce="${escapeDigest(challenge.nonce)}"`,
      `uri="${uri}"`,
      ...(challenge.algorithmGiven === false ? [] : [`algorithm=${challenge.algorithm || "MD5"}`]),
      `response="${response}"`,
    ];
    if (challenge.qop) parts.push(`qop=${challenge.qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
    else if (algorithm.endsWith("-SESS")) parts.push(`cnonce="${cnonce}"`);
    if (challenge.opaque || challenge.opaqueGiven) parts.push(`opaque="${escapeDigest(challenge.opaque || "")}"`);
    return `Digest ${parts.join(", ")}`;
  }

  async request(url: string, method: string, body?: string | FormData, contentType?: string, binary = false): Promise<{ status: number; text: string; bytes: Uint8Array; contentType: string }> {
    const send = async (auth: string) => {
      const headers: Record<string, string> = { Accept: "application/json, application/xml, text/xml, */*" };
      if (typeof body === "string") headers["Content-Type"] = contentType || "application/json";
      if (auth) headers.Authorization = auth;
      const response = await fetch(url, {
        method,
        headers,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > 2_000_000) { await reader.cancel(); throw new Error("رد الجهاز أكبر من الحد المسموح."); }
        chunks.push(item.value);
      }
      const bytes = Buffer.concat(chunks);
      const text = binary && response.ok ? "" : bytes.toString("utf8").slice(0, 1_500_000);
      return { status: response.status, text, bytes, contentType: response.headers.get("content-type") || "", www: response.headers.get("www-authenticate") ?? "" };
    };

    const trace = (auth: string, status: number) => {
      if (process.env.SKYLINE_DIGEST_DEBUG !== "1") return;
      let path = url; try { path = new URL(url).pathname + new URL(url).search; } catch { /* keep */ }
      // Never log the response hash or cnonce; field layout only.
      const shape = auth.replace(/response="[^"]*"/, 'response="<h>"').replace(/cnonce="[^"]*"/, 'cnonce="<c>"').replace(/nonce="[^"]*"/, 'nonce="<n>"');
      console.warn(`[digest] ${method} ${path} -> ${status}${auth ? ` auth: ${shape}` : " (no auth)"}`);
    };
    const firstAuth = this.authorization(method, url);
    let result = await send(firstAuth);
    trace(firstAuth, result.status);
    if (result.status !== 401) return result;
    const challenge = parseChallenge(result.www);
    if (challenge) {
      this.challenge = challenge;
      this.nc = 0;
      const retryAuth = this.authorization(method, url);
      result = await send(retryAuth);
      trace(retryAuth, result.status);
      return result;
    }
    // Local Hikvision connections require Digest. Never downgrade to Basic over HTTP.
    return result;
  }
}

function statusError(status: number, body: string): string | null {
  if (status === 401) return "اسم المستخدم أو كلمة السر غلط. دول حساب الجهاز نفسه، مش حساب تطبيق هيك-كونكت.";
  if (status === 403) return "الحساب ده ملوش صلاحية يسحب السجلات. ادخل بحساب الأدمن.";
  if (status === 404) return "الجهاز مش بيدعم المسار ده. ارفع ملف التصدير بدل الاتصال.";
  if (status >= 400) {
    const parsed = parseEventPayload(body);
    return parsed.error || `الجهاز رجّع خطأ ${status}.`;
  }
  return null;
}

function zoneOffset(timeZone: string, day: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    }).formatToParts(new Date(`${day}T12:00:00Z`));
    const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);
    if (!match) return "+03:00";
    return `${match[1]}${match[2].padStart(2, "0")}:${(match[3] ?? "00").padStart(2, "0")}`;
  } catch {
    return "+03:00";
  }
}

function spanDays(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

async function readUserPage(
  session: DigestSession,
  base: string,
  searchId: string,
  position: number,
): Promise<{ people: DirectoryPerson[]; next: number; done: boolean; error?: string }> {
  const body = JSON.stringify({
    UserInfoSearchCond: { searchID: searchId, searchResultPosition: position, maxResults: 30 },
  });
  const response = await session.request(`${base}/ISAPI/AccessControl/UserInfo/Search?format=json`, "POST", body);
  if (response.status === 404) return { people: [], next: position, done: true };
  const problem = statusError(response.status, response.text);
  if (problem) return { people: [], next: position, done: true, error: problem };
  const parsed = parseUserPayload(response.text);
  if (parsed.error) return { people: [], next: position, done: true, error: parsed.error };
  const step = parsed.meta.count || parsed.people.length;
  const next = position + step;
  const done = step === 0 || (parsed.meta.total != null ? next >= parsed.meta.total : !isMore(parsed.meta.status));
  return { people: parsed.people, next, done };
}

async function readEventPage(
  session: DigestSession,
  base: string,
  input: ChunkRequest,
  variant: Variant,
  position: number,
  offsets: { start: string; end: string },
): Promise<{ punches: Punch[]; next: number; done: boolean; error?: string }> {
  const start = variant.withOffset ? `${input.startDate}T00:00:00${offsets.start}` : `${input.startDate}T00:00:00`;
  const end = variant.withOffset ? `${input.endDate}T23:59:59${offsets.end}` : `${input.endDate}T23:59:59`;
  const body = JSON.stringify({
    AcsEventCond: {
      searchID: input.eventSearchId,
      searchResultPosition: position,
      maxResults: variant.pageSize,
      major: variant.major,
      minor: 0,
      startTime: start,
      endTime: end,
    },
  });
  const response = await session.request(`${base}/ISAPI/AccessControl/AcsEvent?format=json`, "POST", body);
  const problem = statusError(response.status, response.text);
  if (problem) return { punches: [], next: position, done: true, error: problem };
  const parsed = parseEventPayload(response.text);
  if (parsed.error) return { punches: [], next: position, done: true, error: parsed.error };
  const step = parsed.meta.count || parsed.punches.length;
  const done = step === 0 || (parsed.meta.total != null ? position + step >= parsed.meta.total : !isMore(parsed.meta.status));
  return { punches: parsed.punches, next: position + (step || parsed.punches.length), done };
}

export async function testDevice(link: DeviceLink): Promise<{ ok: true; deviceName: string; model: string } | { ok: false; error: string }> {
  try {
    const base = await assertTarget(link);
    const session = new DigestSession(link.username, link.password);
    const response = await session.request(`${base}/ISAPI/System/deviceInfo`, "GET");
    const problem = statusError(response.status, response.text);
    if (problem) return { ok: false, error: problem };
    const info = parseDevicePayload(response.text);
    if (!info.model && !info.name && !/<device/i.test(response.text) && !response.text.includes("DeviceInfo")) {
      return { ok: false, error: "العنوان رد، بس مش شكل جهاز هيكفيجن." };
    }
    return { ok: true, deviceName: info.name || "جهاز هيكفيجن", model: info.model || "غير معروف" };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}

export async function pullChunk(input: ChunkRequest): Promise<ChunkResult> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
      return { ok: false, error: "التواريخ مش مظبوطة." };
    }
    const days = spanDays(input.startDate, input.endDate);
    if (days < 0) return { ok: false, error: "تاريخ النهاية قبل البداية." };
    if (days > 30) return { ok: false, error: "اقسم الفترة. كل سحبة لحد ٣١ يوم عشان الجهاز ما يتقفّلش." };

    const base = await assertTarget(input);
    const session = new DigestSession(input.username, input.password);
    const offsets = {
      start: zoneOffset(input.timeZone || "Africa/Cairo", input.startDate),
      end: zoneOffset(input.timeZone || "Africa/Cairo", input.endDate),
    };
    let deviceName = "";
    let model = "";
    if (input.eventPos === 0 && input.userPos === 0) {
      const probe = await session.request(`${base}/ISAPI/System/deviceInfo`, "GET");
      if (probe.status === 401) {
        return { ok: false, error: "اسم المستخدم أو كلمة السر غلط. دول حساب الجهاز نفسه، مش حساب تطبيق هيك-كونكت." };
      }
      if (probe.status < 400) {
        const info = parseDevicePayload(probe.text);
        deviceName = info.name;
        model = info.model;
      }
    }

    const users: DirectoryPerson[] = [];
    let usersDone = input.usersDone;
    let userPos = input.userPos;
    const userSearchId = input.userSearchId || input.eventSearchId;
    if (!usersDone) {
      for (let page = 0; page < 4 && !usersDone; page += 1) {
        const batch = await readUserPage(session, base, userSearchId, userPos);
        if (batch.error) return { ok: false, error: batch.error };
        users.push(...batch.people);
        userPos = batch.next;
        usersDone = batch.done;
      }
    }

    let variantIndex = Math.min(Math.max(input.variant, 0), VARIANTS.length - 1);
    let variant = { ...VARIANTS[variantIndex] };
    if (input.pageSize >= 10 && input.pageSize <= 30) variant.pageSize = input.pageSize;

    let eventPos = input.eventPos;
    let eventsDone = input.eventsDone;
    const punches: Punch[] = [];

    const first = eventsDone ? null : await readEventPage(session, base, input, variant, eventPos, offsets);
    if (first?.error && eventPos === 0) {
      let discovered = false;
      for (let index = 0; index < VARIANTS.length; index += 1) {
        const candidate = VARIANTS[index];
        const attempt = await readEventPage(session, base, input, candidate, 0, offsets);
        if (!attempt.error) {
          variantIndex = index;
          variant = candidate;
          punches.push(...attempt.punches);
          eventPos = attempt.next;
          eventsDone = attempt.done;
          discovered = true;
          break;
        }
        if (/كلمة السر|صلاحية|غير مسموح|مش قادر|ما ردش/.test(attempt.error)) {
          return { ok: false, error: attempt.error };
        }
        first.error = attempt.error;
      }
      if (!discovered) {
        return {
          ok: false,
          error: `${first.error ?? "الجهاز رفض طلب الحضور."} لو الموديل قديم، صدّر الملف من iVMS وارفعه.`,
        };
      }
    } else if (first?.error) {
      return { ok: false, error: first.error };
    } else if (first) {
      punches.push(...first.punches);
      eventPos = first.next;
      eventsDone = first.done;
    }

    for (let page = 1; page < PAGES_PER_CALL && !eventsDone; page += 1) {
      const batch = await readEventPage(session, base, input, variant, eventPos, offsets);
      if (batch.error) return { ok: false, error: batch.error };
      punches.push(...batch.punches);
      eventPos = batch.next;
      eventsDone = batch.done;
    }

    return {
      ok: true,
      deviceName,
      model,
      punches,
      users,
      eventPos,
      eventsDone,
      variant: variantIndex,
      pageSize: variant.pageSize,
      usersDone,
      userPos,
      userSearchId,
    };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}


// Face photos for the attendance roster. Read-only: FDLib list + FDSearch + image GET.
export async function devicePhotos(
  link: DeviceLink,
  employeeNos: string[],
): Promise<{ ok: true; photos: Record<string, string> } | { ok: false; error: string }> {
  try {
    const base = await assertTarget(link);
    const session = new DigestSession(link.username, link.password);
    const libsRes = await session.request(`${base}/ISAPI/Intelligent/FDLib?format=json`, "GET");
    if (libsRes.status >= 400) return { ok: true, photos: {} };
    let libs: { FDID: string; faceLibType: string }[] = [];
    try {
      const root = JSON.parse(libsRes.text) as Record<string, unknown>;
      const raw = (Array.isArray(root.FDLib) ? root.FDLib : Array.isArray((root.FDLibList as Record<string, unknown>)?.FDLib) ? (root.FDLibList as Record<string, unknown>).FDLib : []) as Record<string, unknown>[];
      libs = raw.map((x) => ({ FDID: String(x.FDID ?? ""), faceLibType: String(x.faceLibType ?? "blackFD") })).filter((x) => x.FDID);
    } catch { /* not JSON */ }
    if (!libs.length) libs = [{ FDID: "1", faceLibType: "blackFD" }];
    const photos: Record<string, string> = {};
    for (const employeeNo of employeeNos.slice(0, 40)) {
      if (!/^[\w-]{1,32}$/.test(employeeNo)) continue;
      for (const lib of libs) {
        const res = await session.request(`${base}/ISAPI/Intelligent/FDLib/FDSearch?format=json`, "POST", JSON.stringify({ searchResultPosition: 0, maxResults: 1, ...lib, FPID: employeeNo }));
        if (res.status >= 400) continue;
        let faceURL = "";
        try {
          const root = JSON.parse(res.text) as Record<string, unknown>;
          const body = (root.FDSearch ?? root) as Record<string, unknown>;
          const row = (Array.isArray(body.MatchList) ? body.MatchList[0] : null) as Record<string, unknown> | null;
          if (row && String(row.FPID) === employeeNo) faceURL = String(row.faceURL ?? "");
        } catch { /* ignore */ }
        if (!faceURL) continue;
        // Always fetch from the approved device address, whatever host the device reports.
        let path = faceURL;
        try { const u = new URL(faceURL); path = u.pathname + u.search; } catch { /* relative */ }
        if (!path.startsWith("/")) continue;
        const img = await session.request(base + path, "GET", undefined, undefined, true);
        if (img.status >= 400 || !img.bytes.length || img.bytes.length > 400_000) continue;
        if (img.bytes[0] !== 0xff || img.bytes[1] !== 0xd8) continue;
        photos[employeeNo] = "data:image/jpeg;base64," + Buffer.from(img.bytes).toString("base64");
        break;
      }
    }
    return { ok: true, photos };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}
