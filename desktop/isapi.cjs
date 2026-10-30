const { createHash, randomBytes } = require("node:crypto");

const METHODS = {
  1: "كارت",
  2: "كارت + رقم سري",
  16: "تحقق متعدد",
  38: "بصمة",
  40: "كارت + بصمة",
  46: "بصمة + رقم",
  54: "وجه + بصمة",
  75: "وجه",
  77: "رقم وظيفي + وجه",
  101: "رقم وظيفي + كلمة سر",
};

const VARIANTS = [
  { major: 5, pageSize: 30, withOffset: true },
  { major: 5, pageSize: 10, withOffset: true },
  { major: 5, pageSize: 10, withOffset: false },
  { major: 0, pageSize: 10, withOffset: true },
];

function allowedHost(raw) {
  const ip = String(raw || "").trim();
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function linkOf(input) {
  const host = String(input?.host || "").trim();
  const port = Number(input?.port || 80);
  const username = String(input?.username || "").trim();
  const password = String(input?.password || "");
  if (!allowedHost(host)) return { error: "العنوان لازم يكون على شبكة الفرع، زي 192.168.1.214." };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "البورت غير صحيح." };
  if (!username || !password) return { error: "اكتب حساب الجهاز وكلمة السر من تعديل الجهاز. ده حساب البصمة، مش إيميل هيك-كونكت." };
  if (username.length > 64 || password.length > 128) return { error: "بيانات الدخول أطول من المسموح." };
  return { host, port, username, password, base: `http://${host}:${port}` };
}

function explain(error) {
  const message = error instanceof Error ? error.message : "";
  if (/abort|timeout|timed out/i.test(message)) return "الجهاز ما ردش في الوقت. اتأكد إنه شغال وعلى نفس الشبكة.";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) return "مش لاقي العنوان ده.";
  if (/ECONNREFUSED/i.test(message)) return "الجهاز رفض الاتصال. راجع البورت، غالباً 80.";
  if (/EHOSTUNREACH|ENETUNREACH|ECONNRESET|fetch failed|connect/i.test(message)) return "مش قادر أوصل للجهاز. لازم البرنامج يشتغل على ويندوز الفرع، والأجهزة متوصلة بـ Tailscale.";
  return message || "حصل خطأ أثناء الاتصال بالجهاز.";
}

function parseChallenge(header) {
  if (!/digest/i.test(header || "")) return null;
  const body = header.replace(/^digest\s+/i, "");
  const fields = {};
  const re = /([a-z]+)=("([^"]*)"|([^,\s]+))/gi;
  let match;
  while ((match = re.exec(body))) fields[match[1].toLowerCase()] = match[3] ?? match[4] ?? "";
  if (!fields.realm || !fields.nonce) return null;
  const qopList = (fields.qop ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return {
    realm: fields.realm,
    nonce: fields.nonce,
    opaque: fields.opaque,
    qop: qopList.includes("auth") ? "auth" : qopList[0] ?? "",
    algorithm: fields.algorithm || "MD5",
  };
}

function escapeDigest(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

class DigestSession {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.challenge = null;
    this.nc = 0;
  }

  authorization(method, url) {
    const challenge = this.challenge;
    if (!challenge) return "";
    this.nc += 1;
    const nc = this.nc.toString(16).padStart(8, "0");
    const cnonce = randomBytes(8).toString("hex");
    const parsed = new URL(url);
    const uri = `${parsed.pathname}${parsed.search}`;
    const algorithm = challenge.algorithm.toUpperCase();
    if (!["MD5", "MD5-SESS", "SHA-256", "SHA-256-SESS"].includes(algorithm) || (challenge.qop && challenge.qop !== "auth")) {
      throw new Error("طريقة مصادقة الجهاز غير مدعومة.");
    }
    const hash = (value) => createHash(algorithm.startsWith("SHA-256") ? "sha256" : "md5").update(value).digest("hex");
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
      `algorithm=${challenge.algorithm || "MD5"}`,
      `response="${response}"`,
    ];
    if (challenge.qop) parts.push(`qop=${challenge.qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
    if (challenge.opaque) parts.push(`opaque="${escapeDigest(challenge.opaque)}"`);
    return `Digest ${parts.join(", ")}`;
  }

  async request(url, method, body, contentType) {
    const send = async (auth) => {
      const headers = { Accept: "application/json, application/xml, text/xml, */*" };
      if (typeof body === "string") headers["Content-Type"] = contentType || "application/json";
      if (auth) headers.Authorization = auth;
      const response = await fetch(url, { method, headers, body, redirect: "error", signal: AbortSignal.timeout(12_000) });
      const text = (await response.text()).slice(0, 1_500_000);
      return { status: response.status, text, www: response.headers.get("www-authenticate") ?? "" };
    };
    let result = await send(this.authorization(method, url));
    if (result.status !== 401) return result;
    const challenge = parseChallenge(result.www);
    if (!challenge) return result;
    this.challenge = challenge;
    this.nc = 0;
    return send(this.authorization(method, url));
  }
}

function statusError(status) {
  if (status === 401) return "اسم المستخدم أو كلمة السر غلط. دول حساب الجهاز نفسه، مش حساب هيك-كونكت.";
  if (status === 403) return "الحساب ده ملوش صلاحية على الجهاز.";
  if (status === 404) return "الجهاز مش بيدعم المسار ده.";
  if (status >= 400) return `الجهاز رجّع خطأ ${status}.`;
  return "";
}

function tag(block, name) {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
}

function textOf(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function deviceInfo(body) {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      const info = json.DeviceInfo ?? json;
      return {
        name: textOf(info.deviceName),
        model: textOf(info.model),
        firmware: textOf(info.firmwareVersion),
        serial: textOf(info.serialNumber),
      };
    } catch {
      return { name: "", model: "", firmware: "", serial: "" };
    }
  }
  return {
    name: tag(trimmed, "deviceName"),
    model: tag(trimmed, "model"),
    firmware: tag(trimmed, "firmwareVersion"),
    serial: tag(trimmed, "serialNumber"),
  };
}

function asList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
  if (typeof value === "object") {
    if ("Info" in value) return asList(value.Info);
    if ("UserInfo" in value) return asList(value.UserInfo);
    return [value];
  }
  return [];
}

function parseEventPayload(body) {
  const trimmed = body.trim();
  if (!trimmed) return { punches: [], error: "الجهاز رجّع رد فاضي." };
  let records = [];
  let status = "OK";
  let count = 0;
  let total = null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let json;
    try { json = JSON.parse(trimmed); } catch { return { punches: [], error: "رد الجهاز مش مفهوم." }; }
    if (!json.AcsEvent && (json.statusString || json.errorMsg || json.statusCode)) {
      return { punches: [], error: textOf(json.errorMsg || json.statusString) || "الجهاز رفض الطلب" };
    }
    const acs = json.AcsEvent ?? json;
    records = asList(acs.InfoList);
    status = textOf(acs.responseStatusStrg) || "OK";
    count = Number(acs.numOfMatches ?? records.length);
    total = acs.totalMatches == null ? null : Number(acs.totalMatches);
  } else {
    const infoRe = /<Info\b[^>]*>([\s\S]*?)<\/Info>/gi;
    let match;
    while ((match = infoRe.exec(trimmed))) {
      records.push({
        major: tag(match[1], "major"),
        minor: tag(match[1], "minor"),
        time: tag(match[1], "time") || tag(match[1], "dateTime"),
        employeeNoString: tag(match[1], "employeeNoString") || tag(match[1], "employeeNo"),
        name: tag(match[1], "name"),
      });
    }
    status = tag(trimmed, "responseStatusStrg") || "OK";
    count = Number(tag(trimmed, "numOfMatches") || records.length);
    total = tag(trimmed, "totalMatches") ? Number(tag(trimmed, "totalMatches")) : null;
  }
  const punches = [];
  for (const record of records) {
    const major = Number(record.major ?? record.majorEvent);
    const minor = Number(record.minor ?? record.minorEvent ?? 0);
    if (major !== 5 || !METHODS[minor]) continue;
    const employeeNo = textOf(record.employeeNoString ?? record.employeeNo ?? record.employeeNoInt);
    const name = textOf(record.name ?? record.employeeName ?? record.personName);
    const stamp = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(textOf(record.time ?? record.dateTime ?? record.eventTime));
    if ((!employeeNo && !name) || !stamp) continue;
    punches.push({ employeeNo: employeeNo || name, name: name || employeeNo, at: `${stamp[1]} ${stamp[2]}`, method: METHODS[minor] });
  }
  const more = status.toUpperCase().replace(/\s+/g, "_") === "MORE";
  const step = Number.isFinite(count) && count > 0 ? count : punches.length;
  const done = step === 0 || (total != null && Number.isFinite(total) ? false : !more);
  return { punches, step, total, done: total != null ? false : done, error: "" };
}

function parseUsers(body) {
  const trimmed = body.trim();
  if (!trimmed) return { users: [], step: 0, total: 0 };
  if (!trimmed.startsWith("{")) return { users: [], step: 0, total: 0 };
  let json;
  try { json = JSON.parse(trimmed); } catch { return { users: [], error: "رد الأسماء مش مفهوم." }; }
  const search = json.UserInfoSearch ?? json;
  const records = asList(search.UserInfo);
  const users = records.map((record) => ({
    employeeNo: textOf(record.employeeNo ?? record.employeeNoString),
    name: textOf(record.name) || textOf(record.employeeNo ?? record.employeeNoString),
    fingers: Number(record.numOfFP ?? record.numOfFingerPrint ?? 0) || 0,
    faces: Number(record.numOfFace ?? 0) || 0,
    cards: Number(record.numOfCard ?? 0) || 0,
  })).filter((person) => person.employeeNo);
  const count = Number(search.numOfMatches ?? records.length);
  return {
    users,
    step: Number.isFinite(count) ? count : users.length,
    total: search.totalMatches == null ? null : Number(search.totalMatches),
    status: textOf(search.responseStatusStrg) || "OK",
  };
}

function zoneOffset(day) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" }).formatToParts(new Date(`${day}T12:00:00Z`));
    const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);
    if (!match) return "+02:00";
    return `${match[1]}${match[2].padStart(2, "0")}:${(match[3] ?? "00").padStart(2, "0")}`;
  } catch {
    return "+02:00";
  }
}

async function probe(input) {
  const link = linkOf(input);
  if (link.error) return { ok: false, error: link.error };
  try {
    const session = new DigestSession(link.username, link.password);
    const response = await session.request(`${link.base}/ISAPI/System/deviceInfo`, "GET");
    const problem = statusError(response.status);
    if (problem) return { ok: false, error: problem };
    const info = deviceInfo(response.text);
    if (!info.model && !info.name && !/<device/i.test(response.text) && !response.text.includes("DeviceInfo")) {
      return { ok: false, error: "العنوان رد، بس مش شكل جهاز هيكفيجن." };
    }
    return { ok: true, name: info.name || "جهاز هيكفيجن", model: info.model || "DS-K1T342", firmware: info.firmware || "", serial: info.serial || "" };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}

async function readEvents(session, base, day, searchId) {
  const offset = zoneOffset(day);
  let lastError = "الجهاز رفض طلب الحضور.";
  for (const variant of VARIANTS) {
    const punches = [];
    let position = 0;
    let failed = false;
    for (let page = 0; page < 8; page += 1) {
      const start = variant.withOffset ? `${day}T00:00:00${offset}` : `${day}T00:00:00`;
      const end = variant.withOffset ? `${day}T23:59:59${offset}` : `${day}T23:59:59`;
      const body = JSON.stringify({
        AcsEventCond: { searchID: searchId, searchResultPosition: position, maxResults: variant.pageSize, major: variant.major, minor: 0, startTime: start, endTime: end },
      });
      const response = await session.request(`${base}/ISAPI/AccessControl/AcsEvent?format=json`, "POST", body);
      const problem = statusError(response.status);
      if (problem) {
        lastError = problem;
        failed = true;
        break;
      }
      const parsed = parseEventPayload(response.text);
      if (parsed.error) {
        lastError = parsed.error;
        failed = true;
        break;
      }
      punches.push(...parsed.punches);
      const step = parsed.step || parsed.punches.length;
      if (!step) break;
      position += step;
      const finished = parsed.total != null ? position >= parsed.total : parsed.done;
      if (finished) break;
    }
    if (!failed) return { punches };
    if (/كلمة السر|صلاحية|حساب/.test(lastError)) return { error: lastError };
  }
  return { error: lastError };
}

async function readUsers(session, base, searchId) {
  const users = [];
  let position = 0;
  for (let page = 0; page < 6; page += 1) {
    const body = JSON.stringify({ UserInfoSearchCond: { searchID: searchId, searchResultPosition: position, maxResults: 30 } });
    const response = await session.request(`${base}/ISAPI/AccessControl/UserInfo/Search?format=json`, "POST", body);
    if (response.status === 404) return { users };
    const problem = statusError(response.status);
    if (problem) return { users, error: problem };
    const parsed = parseUsers(response.text);
    if (parsed.error) return { users, error: parsed.error };
    users.push(...parsed.users);
    const step = parsed.step || parsed.users.length;
    if (!step) break;
    position += step;
    const more = (parsed.status || "").toUpperCase() === "MORE";
    if (parsed.total != null ? position >= parsed.total : !more) break;
  }
  return { users };
}

async function pull(input) {
  const link = linkOf(input);
  if (link.error) return { ok: false, error: link.error };
  const day = String(input?.day || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "تاريخ السحب مش مظبوط." };
  try {
    const session = new DigestSession(link.username, link.password);
    const info = await session.request(`${link.base}/ISAPI/System/deviceInfo`, "GET");
    if (info.status === 401) return { ok: false, error: statusError(401) };
    const searchId = randomBytes(8).toString("hex");
    const events = await readEvents(session, link.base, day, searchId);
    if (events.error) return { ok: false, error: events.error };
    const people = await readUsers(session, link.base, searchId);
    if (people.error && !events.punches.length) return { ok: false, error: people.error };
    const seen = new Set();
    const punches = [];
    for (const punch of events.punches) {
      const key = `${punch.employeeNo}|${punch.at}|${punch.method}`;
      if (seen.has(key)) continue;
      seen.add(key);
      punches.push(punch);
    }
    return { ok: true, punches, users: people.users || [], device: info.status < 400 ? deviceInfo(info.text) : { name: "", model: "", firmware: "", serial: "" } };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}

async function door(input) {
  const link = linkOf(input);
  if (link.error) return { ok: false, error: link.error };
  const cmd = input?.cmd;
  if (!["open", "close", "alwaysClose"].includes(cmd)) return { ok: false, error: "أمر الباب غير معروف." };
  const xml = `<?xml version="1.0" encoding="UTF-8"?><RemoteControlDoor version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><cmd>${cmd}</cmd></RemoteControlDoor>`;
  try {
    const session = new DigestSession(link.username, link.password);
    const response = await session.request(`${link.base}/ISAPI/AccessControl/RemoteControl/door/1`, "PUT", xml, "application/xml");
    const problem = statusError(response.status);
    if (problem) return { ok: false, error: problem };
    if (/notSupport|Invalid|badXml/i.test(response.text)) return { ok: false, error: "الجهاز رفض أمر الباب." };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}

module.exports = { probe, pull, door, parseEventPayload };
