var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../tmp/speed-old/Speed-for-Training-USB/src/lib/hik-connect.server.ts
var hik_connect_server_exports = {};
__export(hik_connect_server_exports, {
  hikInspectPeopleSchema: () => hikInspectPeopleSchema,
  hikLogin: () => hikLogin,
  hikPullChunk: () => hikPullChunk,
  hikReadMap: () => hikReadMap,
  normalizeAccount: () => normalizeAccount
});
module.exports = __toCommonJS(hik_connect_server_exports);
var import_node_crypto = require("node:crypto");

// ../tmp/speed-old/Speed-for-Training-USB/src/lib/hikvision-parse.ts
function textOf(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
function splitStamp(raw) {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/.exec(raw.trim());
  if (!match) return null;
  return { date: match[1], time: `${match[2]}:${match[3] ?? "00"}` };
}
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function punchesFromPortal(payload) {
  const json = asObject(payload) ?? {};
  const nested = asObject(json.data);
  const data = nested && (Array.isArray(nested.recordList) || nested.totalNum != null) ? nested : json;
  const list = Array.isArray(data.recordList) ? data.recordList : [];
  const totalRaw = data.totalNum;
  const totalNumber = typeof totalRaw === "number" ? totalRaw : Number(totalRaw);
  const punches = [];
  for (const item of list) {
    const row = asObject(item);
    if (!row) continue;
    const person = asObject(row.personInfo) ?? {};
    const name = textOf(person.fullName ?? person.name ?? row.fullName ?? row.personName);
    if (!name || name === "--") continue;
    const employeeNo = textOf(person.personCode ?? person.employeeNo ?? row.personCode ?? row.employeeNo ?? person.id) || name;
    const stamp = splitStamp(textOf(row.deviceTime ?? row.eventTime ?? row.time ?? row.occurTime));
    if (!stamp) continue;
    punches.push({ employeeNo, name, date: stamp.date, time: stamp.time, method: "\u0628\u0635\u0645\u0629" });
  }
  return { punches, total: Number.isFinite(totalNumber) ? totalNumber : null };
}

// ../tmp/speed-old/Speed-for-Training-USB/src/lib/hik-connect.server.ts
var PORTAL = "https://www.hik-connect.com";
var TEAM_API = "https://ieu-team.hikcentralconnect.com/hcc";
var PAGE_SIZE = 100;
var PAGES_PER_CALL = 2;
function md5(value) {
  return (0, import_node_crypto.createHash)("md5").update(value).digest("hex");
}
function featureCode(value) {
  const clean = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
  if (clean.length >= 8) return clean;
  return (0, import_node_crypto.randomBytes)(16).toString("hex");
}
function normalizeAccount(account) {
  const trimmed = account.trim().replace(/\s+/g, "");
  if (!trimmed) return "";
  if (trimmed.includes("@") || /[A-Za-z]/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/^\+/, "").replace(/\D/g, "");
  if (/^01\d{9}$/.test(digits)) return `20${digits}`;
  if (/^201\d{9}$/.test(digits)) return `200${digits.slice(2)}`;
  return digits || trimmed;
}
function assertPortal(value) {
  const raw = value.trim();
  let url;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    throw new Error("\u0639\u0646\u0648\u0627\u0646 \u0645\u0648\u0642\u0639 \u0647\u064A\u0643-\u0643\u0648\u0646\u0643\u062A \u0645\u0634 \u0645\u0641\u0647\u0648\u0645.");
  }
  if (url.protocol !== "https:") throw new Error("\u0639\u0646\u0648\u0627\u0646 \u0645\u0648\u0642\u0639 \u0647\u064A\u0643-\u0643\u0648\u0646\u0643\u062A \u0645\u0634 \u0645\u0641\u0647\u0648\u0645.");
  const host = url.hostname.toLowerCase();
  const allowed = host === "hik-connect.com" || host.endsWith(".hik-connect.com") || host.endsWith(".hik-connectru.com") || host.endsWith(".hikcentralconnect.com") || host.endsWith(".ltspartnerconnect.com");
  if (!allowed) throw new Error("\u0646\u0637\u0627\u0642 \u0647\u064A\u0643-\u0643\u0648\u0646\u0643\u062A \u0645\u0634 \u0645\u0639\u0631\u0648\u0641.");
  if (host.endsWith(".hikcentralconnect.com")) {
    const path = url.pathname.replace(/\/$/, "");
    return `https://${host}${path}`;
  }
  return `https://${host}`;
}
function portalMessage(code) {
  if (code === 1013 || code === 1014 || code === 1226) {
    return "\u0627\u0644\u062D\u0633\u0627\u0628 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0633\u0631 \u0645\u0634 \u0632\u064A \u0627\u0644\u0644\u064A \u0639\u0644\u0649 \u0645\u0648\u0642\u0639 hik-connect.com. \u0644\u0648 \u062F\u0627\u062E\u0644 \u0628\u0627\u0644\u0645\u0648\u0628\u0627\u064A\u0644 \u0633\u064A\u0628\u0647 0100xxxxxxxx \u0648\u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u064A\u0636\u064A\u0641 20.";
  }
  if (code === 1003 || code === 1005 || code === 1011 || code === 1012 || code === 1015 || code === 1101) {
    return "\u0627\u0644\u0645\u0648\u0642\u0639 \u0637\u0627\u0644\u0628 \u0643\u0648\u062F \u0627\u0644\u0635\u0648\u0631\u0629. \u0627\u0643\u062A\u0628\u0647 \u062A\u062D\u062A \u0648\u0627\u0636\u063A\u0637 \u0627\u062F\u062E\u0644 \u062A\u0627\u0646\u064A.";
  }
  if (code === 1043) return "\u0643\u0648\u062F \u0627\u0644\u0635\u0648\u0631\u0629 \u062E\u0644\u0651\u0635. \u0627\u0643\u062A\u0628 \u0627\u0644\u0643\u0648\u062F \u0627\u0644\u062C\u062F\u064A\u062F.";
  if (code === 1402) return "\u0627\u0644\u0645\u0648\u0642\u0639 \u0631\u0641\u0636 \u062A\u0634\u0641\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0633\u0631. \u062C\u0631\u0651\u0628 \u062A\u0627\u0646\u064A.";
  if (code === 1406) return "\u0627\u0644\u062D\u0633\u0627\u0628 \u062F\u0647 \u0648\u0627\u0642\u0641 \u0645\u0624\u0642\u062A\u0627\u064B. \u0627\u0641\u062A\u062D \u0627\u0644\u0645\u0648\u0642\u0639 \u0648\u062C\u0631\u0628 \u062A\u062F\u062E\u0644 \u0645\u0646\u0647.";
  if (code === 6002) {
    return "\u0627\u0644\u0645\u0648\u0642\u0639 \u0628\u0639\u062A \u0643\u0648\u062F \u0639\u0644\u0649 \u0627\u0644\u0645\u0648\u0628\u0627\u064A\u0644. \u0627\u0643\u062A\u0628\u0647 \u0641\u064A \u062E\u0627\u0646\u0629 \u0643\u0648\u062F \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0648\u0627\u0636\u063A\u0637 \u0627\u062F\u062E\u0644 \u062A\u0627\u0646\u064A.";
  }
  return `\u0645\u0648\u0642\u0639 \u0647\u064A\u0643-\u0643\u0648\u0646\u0643\u062A \u0631\u0641\u0636 \u0627\u0644\u062F\u062E\u0648\u0644 (${code}).`;
}
function needsCaptcha(code) {
  return code === 1003 || code === 1005 || code === 1011 || code === 1012 || code === 1015 || code === 1043 || code === 1101;
}
function headers(feature, sessionId) {
  const result = {
    clientType: "48",
    clientSource: "0",
    customno: "1000002",
    featureCode: feature,
    appId: "Hik-Connect-Portal",
    lang: "en-US",
    Accept: "application/json"
  };
  if (sessionId) {
    result.sessionId = sessionId;
    result.Cookie = `HC_sessionId=${sessionId}`;
  }
  return result;
}
async function readBody(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(25e3) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const type = response.headers.get("content-type") ?? "";
  const text = new TextDecoder().decode(bytes.slice(0, 15e5));
  if (type.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      return { status: response.status, json: JSON.parse(text), bytes, type };
    } catch {
      return { status: response.status, json: null, bytes, type };
    }
  }
  return { status: response.status, json: null, bytes, type };
}
function metaCode(json) {
  const meta = json?.meta;
  if (!meta || typeof meta !== "object") return null;
  const code = meta.code;
  return typeof code === "number" ? code : null;
}
function pem(key) {
  const body = key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PUBLIC KEY-----
${lines}
-----END PUBLIC KEY-----
`;
}
async function publicKey(base, feature) {
  const result = await readBody(`${base}/v3/users/publickey`, { method: "GET", headers: headers(feature) });
  const key = typeof result.json?.publicKey === "string" ? result.json.publicKey : "";
  if (!key) throw new Error("\u0645\u0648\u0642\u0639 \u0647\u064A\u0643-\u0643\u0648\u0646\u0643\u062A \u0645\u0627 \u0631\u062C\u0651\u0639\u0634 \u0645\u0641\u062A\u0627\u062D \u0627\u0644\u062F\u062E\u0648\u0644.");
  return key;
}
function encryptPassword(key, password) {
  const stamp = Math.floor(Date.now() / 1e3).toString();
  const plain = `${md5(password)},${stamp}`;
  return (0, import_node_crypto.publicEncrypt)({ key: pem(key), padding: import_node_crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(plain)).toString("base64");
}
async function captchaImage(base, account, feature) {
  const random = Math.floor(Math.random() * 1e4);
  const result = await readBody(
    `${base}/v3/captcha?account=${encodeURIComponent(account)}&featureCode=${feature}&useGetMethod=1&random=${random}`,
    { method: "GET", headers: headers(feature) }
  );
  if (!result.bytes.length || result.json) return "";
  const kind = result.type.includes("png") ? "image/png" : "image/jpeg";
  return `data:${kind};base64,${Buffer.from(result.bytes).toString("base64")}`;
}
async function loginAt(base, account, password, feature, imageCode, preset, smsCode = "") {
  const secret = preset?.password || encryptPassword(await publicKey(base, feature), password);
  const form = new URLSearchParams({
    account,
    password: secret,
    checkSign: "true",
    cuName: "Chrome",
    featureCode: feature
  });
  if (imageCode) form.set("imageCode", imageCode);
  if (preset?.index) form.set("enSecretIndex", preset.index);
  if (smsCode) {
    form.set("smsCode", smsCode);
    form.set("bizType", "TERMINAL_BIND");
    form.set("msgType", "1");
  }
  const result = await readBody(`${base}/v3/users/login/v6`, {
    method: "POST",
    headers: { ...headers(feature), "Content-Type": "application/x-www-form-urlencoded" },
    body: form
  });
  const code = metaCode(result.json);
  const area = result.json?.loginArea;
  const domain = area && typeof area === "object" ? String(area.webDomain || area.apiDomain || "") : "";
  const packed = result.json?.encryptLoginInfo;
  if (code === 1100 && domain) {
    const info = packed && typeof packed === "object" ? packed : {};
    return {
      redirect: assertPortal(domain),
      account: String(info.account || account),
      password: String(info.password || ""),
      index: String(info.enSecretIndex || "")
    };
  }
  if (code === 1402) return { ok: false, error: portalMessage(1402), code };
  if (code !== 200) return { ok: false, error: portalMessage(code ?? result.status), code: code ?? result.status };
  const session = result.json?.loginSession;
  const sessionId = session && typeof session === "object" ? String(session.sessionId ?? "") : "";
  if (!sessionId) return { ok: false, error: "\u0627\u0644\u062F\u062E\u0648\u0644 \u062A\u0645 \u0628\u0633 \u0627\u0644\u062C\u0644\u0633\u0629 \u0645\u0627 \u0631\u062C\u0639\u062A\u0634. \u062C\u0631\u0651\u0628 \u062A\u0627\u0646\u064A.", code: 0 };
  return { ok: true, base, sessionId };
}
async function hikLogin(account, password, imageCode = "", featureInput = "", smsCode = "") {
  const feature = featureCode(featureInput);
  const name = normalizeAccount(account);
  const codeFromPhone = smsCode.trim();
  try {
    let base = PORTAL;
    let preset;
    let accountOnHost = name;
    let hit = { ok: false, error: "\u0627\u0644\u062F\u062E\u0648\u0644 \u0641\u0634\u0644.", code: 0 };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      hit = await loginAt(base, accountOnHost, password, feature, imageCode.trim(), preset, codeFromPhone);
      if ("redirect" in hit) {
        base = hit.redirect;
        accountOnHost = hit.account || name;
        preset = hit.password ? { password: hit.password, index: hit.index } : void 0;
        continue;
      }
      if (!hit.ok && hit.code === 1402 && attempt === 0) {
        preset = void 0;
        continue;
      }
      break;
    }
    if ("redirect" in hit) return { ok: false, error: "\u0647\u064A\u0643-\u0643\u0648\u0646\u0643\u062A \u062D\u0648\u0651\u0644 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0623\u0643\u062A\u0631 \u0645\u0646 \u0645\u0631\u0629.", featureCode: feature };
    if (!hit.ok) {
      const image = needsCaptcha(hit.code) ? await captchaImage(base, name, feature).catch(() => "") : "";
      return {
        ok: false,
        error: hit.error,
        featureCode: feature,
        captcha: image || void 0,
        needSms: hit.code === 6002 || void 0
      };
    }
    const gate = await enterAttendance(hit.base, hit.sessionId, name, feature, codeFromPhone);
    if (!gate.ok) return { ok: false, error: gate.error, featureCode: feature, needSms: gate.needSms };
    return {
      ok: true,
      apiBase: gate.apiBase,
      sessionId: gate.sessionId,
      featureCode: feature,
      teams: gate.teams,
      teamName: gate.teams[0]?.name ?? "",
      notice: gate.notice
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/timeout|abort/i.test(message)) return { ok: false, error: "\u0645\u0648\u0642\u0639 \u0647\u064A\u0643-\u0643\u0648\u0646\u0643\u062A \u0645\u0627 \u0631\u062F\u0634 \u0641\u064A \u0627\u0644\u0648\u0642\u062A. \u062C\u0631\u0651\u0628 \u062A\u0627\u0646\u064A.", featureCode: feature };
    return { ok: false, error: message || "\u0645\u0634 \u0642\u0627\u062F\u0631 \u0623\u0648\u0635\u0644 \u0644\u0645\u0648\u0642\u0639 \u0647\u064A\u0643-\u0643\u0648\u0646\u0643\u062A.", featureCode: feature };
  }
}
async function enterAttendance(base, sessionId, account, feature, smsCode) {
  if (smsCode) {
    await readBody(`${base}/v3/terminals`, {
      method: "POST",
      headers: { ...headers(feature, sessionId), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        msgType: "1",
        cname: "Chrome",
        featureCode: feature,
        checkcode: smsCode,
        bizType: "TERMINAL_BIND"
      })
    });
  }
  const ticketResponse = await fetch(`${TEAM_API}/auth/security/v1/ticket/login`, {
    method: "POST",
    headers: {
      clientSource: "0",
      clientType: "48",
      lang: "en-US",
      Accept: "application/json",
      "Content-Type": "application/json",
      sessionId
    },
    body: JSON.stringify({
      loginType: 2,
      sessionId,
      account,
      chooseTenantId: "",
      twoFactorToken: smsCode,
      deviceName: "Chrome",
      terminalCode: feature
    }),
    signal: AbortSignal.timeout(25e3)
  });
  const ticketJson = await ticketResponse.json();
  const errorCode = String(ticketJson.errorCode ?? "");
  if (errorCode === "VMS002039") {
    if (!smsCode) {
      await readBody(`${base}/v3/users/checkcode/mt`, {
        method: "POST",
        headers: { ...headers(feature, sessionId), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ from: account, bizType: "TERMINAL_BIND" })
      });
    }
    return {
      ok: false,
      error: smsCode ? "\u0627\u0644\u0643\u0648\u062F \u0627\u062A\u0631\u0641\u0636. \u0627\u0637\u0644\u0628 \u0643\u0648\u062F \u062C\u062F\u064A\u062F \u0645\u0646 \u0627\u0644\u0645\u0648\u0642\u0639 \u0648\u0627\u0628\u0639\u062A \u0627\u0644\u0644\u064A \u064A\u0648\u0635\u0644." : "\u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0627\u062A\u0646\u062F\u0646\u0633 \u0637\u0644\u0628\u062A \u0643\u0648\u062F \u0627\u0644\u0631\u0633\u0627\u0644\u0629. \u0627\u0643\u062A\u0628\u0647 \u0641\u064A \u062E\u0627\u0646\u0629 \u0643\u0648\u062F \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0648\u0627\u0636\u063A\u0637 \u0627\u062F\u062E\u0644 \u062A\u0627\u0646\u064A.",
      needSms: true
    };
  }
  if (errorCode && errorCode !== "0") {
    return { ok: false, error: `\u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0627\u062A\u0646\u062F\u0646\u0633 \u0631\u0641\u0636\u062A \u0627\u0644\u062F\u062E\u0648\u0644 (${errorCode}).` };
  }
  const data = ticketJson.data && typeof ticketJson.data === "object" ? ticketJson.data : {};
  const cookie = ticketResponse.headers.getSetCookie?.().find((item) => item.startsWith("JSESSIONID="));
  const nextSession = cookie?.split(";")[0]?.slice("JSESSIONID=".length) || String(data.sessionId ?? "");
  if (!nextSession) return { ok: false, error: "\u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u0641\u062A\u062D\u062A \u0628\u0633 \u0627\u0644\u062C\u0644\u0633\u0629 \u0645\u0627 \u0631\u062C\u0639\u062A\u0634." };
  const teamName = String(data.systemName ?? "\u0627\u0644\u0641\u0631\u064A\u0642");
  const points = await readBody(`${TEAM_API}/hccattendance/checkPoint/v1/list`, {
    method: "POST",
    headers: {
      clientSource: "0",
      clientType: "48",
      lang: "en-US",
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `JSESSIONID=${nextSession}`
    },
    body: JSON.stringify({ page: 1, pageSize: 50, name: "" })
  });
  const pointData = points.json?.data && typeof points.json.data === "object" ? points.json.data : {};
  const raw = pointData.checkPoints;
  const teams = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item;
      const id = String(row.elementId ?? row.id ?? "");
      const label = String(row.name ?? "\u062C\u0647\u0627\u0632");
      if (id) teams.push({ id, name: label });
    }
  }
  const notice = teams.length ? `\u0627\u062A\u0641\u062A\u062D \u0641\u0631\u064A\u0642 ${teamName}. \u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u062D\u0636\u0648\u0631: ${teams.map((team) => team.name).join("\u060C ")}.` : `\u0627\u062A\u0641\u062A\u062D \u0641\u0631\u064A\u0642 ${teamName}.`;
  return { ok: true, apiBase: TEAM_API, sessionId: nextSession, teams, notice };
}
function zoneOffset(timeZone, day) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset"
    }).formatToParts(/* @__PURE__ */ new Date(`${day}T12:00:00Z`));
    const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);
    if (!match) return "+03:00";
    return `${match[1]}${match[2].padStart(2, "0")}:${(match[3] ?? "00").padStart(2, "0")}`;
  } catch {
    return "+03:00";
  }
}
function portalError(json, status) {
  const code = metaCode(json);
  const errorCode = json?.errorCode;
  if (status === 401 || code === 401 || errorCode === "VMS002004") return "\u062C\u0644\u0633\u0629 \u0627\u0644\u0645\u0648\u0642\u0639 \u062E\u0644\u0635\u062A. \u0627\u0636\u063A\u0637 \u0627\u062F\u062E\u0644 \u0639\u0644\u0649 \u0627\u0644\u0645\u0648\u0642\u0639 \u062A\u0627\u0646\u064A.";
  if (typeof errorCode === "string" && errorCode !== "0") return `\u0627\u0644\u0645\u0648\u0642\u0639 \u0631\u0641\u0636 \u0637\u0644\u0628 \u0627\u0644\u062D\u0636\u0648\u0631 (${errorCode}).`;
  if (code != null && code !== 200 && code !== 0) return portalMessage(code);
  return "";
}
function teamHeaders(sessionId) {
  return {
    clientSource: "0",
    clientType: "48",
    lang: "en-US",
    Accept: "application/json",
    "Content-Type": "application/json",
    Cookie: `JSESSIONID=${sessionId}`
  };
}
function menuNodes(value, into = []) {
  if (!value || typeof value !== "object") return into;
  if (Array.isArray(value)) {
    for (const item of value) menuNodes(item, into);
    return into;
  }
  const node = value;
  if (node.translatedName || node.name || node.reportTypeId != null) into.push(node);
  if (Array.isArray(node.children)) menuNodes(node.children, into);
  return into;
}
function reportKind(node) {
  const text = `${node.translatedName ?? ""} ${node.name ?? ""} ${node.componentName ?? ""}`.toLowerCase();
  if (text.includes("mobile")) return "";
  if (/\btransaction\b/.test(text) || text.includes("original") || /\brecord\b/.test(text)) return "transaction";
  if (/first[\s_-]*in/.test(text) && /last/.test(text) && /out/.test(text)) return "firstlast";
  return "";
}
function plainCell(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value;
    if ("value" in record) return plainCell(record.value);
    if ("text" in record) return plainCell(record.text);
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
function genderOf(info) {
  const raw = plainCell(info.gender ?? info.sex ?? info.personGender).toLowerCase();
  if (raw === "1" || raw === "male" || raw === "m" || raw.includes("\u0630\u0643\u0631")) return "male";
  if (raw === "2" || raw === "female" || raw === "f" || raw.includes("\u0627\u0646\u062B") || raw.includes("\u0623\u0646\u062B")) return "female";
  return "";
}
function pictureUrl(info) {
  const direct = plainCell(info.headPicUrl || info.photoUrl || info.faceUrl || info.smallPicUrl);
  if (direct) return direct;
  const stack = [info];
  while (stack.length) {
    const current = stack.pop();
    if (typeof current === "string" && (/^https?:\/\//.test(current) || current.startsWith("/")) && /pic|photo|face|head|image/i.test(current)) {
      return current;
    }
    if (current && typeof current === "object") {
      for (const value of Object.values(current)) stack.push(value);
    }
  }
  return "";
}
function allClocks(value) {
  const clocks = [];
  const pattern = /(?:^|[^\d])(\d{2}:\d{2})(?::(\d{2}))?/g;
  let match;
  while (match = pattern.exec(value)) {
    const hour = Number(match[1].slice(0, 2));
    const minute = Number(match[1].slice(3));
    if (hour > 23 || minute > 59) continue;
    clocks.push(`${match[1]}:${match[2] ?? "00"}`);
  }
  return clocks;
}
function shiftBound(clock) {
  return clock.startsWith("00:00") || clock.startsWith("23:59");
}
function cellText(value) {
  const plain = plainCell(value);
  if (plain) return plain;
  if (value && typeof value === "object") {
    return Object.values(value).map((item) => plainCell(item)).filter(Boolean).join(" ");
  }
  return "";
}
function punchesFromReport(rows, columns) {
  const punches = [];
  for (const item of rows) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item;
    const cells = [];
    if (columns.length) {
      for (const column of columns) {
        const name2 = plainCell(column.name);
        const id = plainCell(column.id);
        const label = `${plainCell(column.translatedName)} ${name2} ${id}`.toLowerCase();
        const value = cellText(row[name2] ?? (id ? row[id] : void 0));
        if (value) cells.push({ label, value });
      }
    }
    if (!cells.length) {
      for (const [key, value] of Object.entries(row)) {
        const text = cellText(value);
        if (text) cells.push({ label: key.toLowerCase(), value: text });
      }
    }
    let firstName = "";
    let lastName = "";
    let fullName = "";
    let employee = "";
    let date = "";
    const times = [];
    for (const cell of cells) {
      if (/first\s*name/.test(cell.label)) firstName = cell.value;
      else if (/last\s*name|family/.test(cell.label)) lastName = cell.value;
      else if (/(^| )name$|full\s*name|person\s*name/.test(cell.label) && !/device|depart/.test(cell.label)) fullName = cell.value;
      else if (/(^|\s)id$|person\s*code|employee|person\s*id/.test(cell.label)) employee = cell.value;
      const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(cell.value);
      if (!date && dateMatch && /date|day/.test(cell.label)) date = dateMatch[1];
      const skipLabel = /duration|hour|weekday|shift|valid|schedule|timetable|range|plan|period/.test(cell.label);
      if (skipLabel) continue;
      for (const clock of allClocks(cell.value)) {
        if (!shiftBound(clock)) times.push(clock);
      }
    }
    if (!date) {
      for (const cell of cells) {
        const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(cell.value);
        if (dateMatch) {
          date = dateMatch[1];
          break;
        }
      }
    }
    const name = fullName || [firstName, lastName].filter(Boolean).join(" ");
    if (!name || !date || !times.length) continue;
    for (const time of times) {
      punches.push({ employeeNo: employee || name, name, date, time, method: "\u0628\u0635\u0645\u0629" });
    }
  }
  return punches;
}
async function photoData(base, sessionId, url) {
  const origin = new URL(base).origin;
  const target = url.startsWith("//") ? `https:${url}` : url.startsWith("/") ? `${origin}${url}` : url;
  if (!target.startsWith("https://")) return "";
  try {
    const response = await fetch(target, {
      headers: { ...teamHeaders(sessionId), Referer: `${origin}/` },
      signal: AbortSignal.timeout(8e3)
    });
    if (!response.ok) return "";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 30 || bytes.length > 5e5) return "";
    let type = (response.headers.get("content-type") ?? "").split(";")[0];
    if (!type.startsWith("image/")) {
      if (bytes[0] === 255 && bytes[1] === 216) type = "image/jpeg";
      else if (bytes[0] === 137 && bytes[1] === 80) type = "image/png";
      else return "";
    }
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}
function readPersonList(json) {
  if (!json) return [];
  const body = json.data && typeof json.data === "object" ? json.data : json;
  const response = body.personResponse && typeof body.personResponse === "object" ? body.personResponse : body;
  const list = response.personList ?? response.list ?? body.personList;
  return Array.isArray(list) ? list : [];
}
async function personPhotoUrl(base, sessionId, id) {
  if (!id) return "";
  const result = await readBody(`${base}/ccfperson/v2/persons/${encodeURIComponent(id)}/search`, {
    method: "POST",
    headers: teamHeaders(sessionId),
    body: JSON.stringify({ personRequest: { field: "fullPath,HeadPic", additionalInfoField: "1,53,57" } })
  });
  if (portalError(result.json, result.status) || !result.json) return "";
  const body = result.json.data && typeof result.json.data === "object" ? result.json.data : result.json;
  const info = body.personInfo && typeof body.personInfo === "object" ? body.personInfo : body;
  return pictureUrl(info) || plainCell(info.headPicUrl) || plainCell(info.faceUrl);
}
async function fetchPeople(base, sessionId) {
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  const criteriaList = [
    { personName: { fullName: "" }, personCode: "", logicalOperation: 1 },
    { personGroup: { groupId: "1" }, personName: { fullName: "" }, personCode: "", logicalOperation: 1 }
  ];
  const groups = await readBody(`${base}/ccfperson/v1/groups/search`, {
    method: "POST",
    headers: teamHeaders(sessionId),
    body: JSON.stringify({ personGroupSearchRequest: { depthTraversal: true } })
  });
  const groupBody = groups.json?.data && typeof groups.json.data === "object" ? groups.json.data : groups.json ?? {};
  const groupList = Array.isArray(groupBody.personGroupList) ? groupBody.personGroupList : [];
  for (const group of groupList.slice(0, 6)) {
    if (!group || typeof group !== "object") continue;
    const id = plainCell(group.id ?? group.groupId);
    if (id) criteriaList.push({ personGroup: { groupId: id }, logicalOperation: 1 });
  }
  for (const searchCriteria of criteriaList) {
    if (found.length) break;
    for (let page = 1; page <= 4 && found.length < 80; page += 1) {
      const result = await readBody(`${base}/ccfperson/v1/persons/search`, {
        method: "POST",
        headers: teamHeaders(sessionId),
        body: JSON.stringify({
          pageSize: 100,
          pageIndex: page,
          responseMode: 0,
          productId: "3",
          field: "FullPath",
          searchCriteria
        })
      });
      const list = readPersonList(result.json);
      if (portalError(result.json, result.status) || !list.length) break;
      for (const item of list) {
        const info = item.personInfo && typeof item.personInfo === "object" ? item.personInfo : item;
        const name = plainCell(info.fullName) || [plainCell(info.firstName), plainCell(info.lastName)].filter(Boolean).join(" ");
        const employeeNo = plainCell(info.personCode ?? info.employeeNo ?? item.personCode);
        const id = plainCell(info.id ?? item.id);
        const key = employeeNo || id || name;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const url = pictureUrl(info) || plainCell(info.faceUrl) || plainCell(item.faceUrl) || plainCell(info.headPicUrl);
        found.push({ id, employeeNo: employeeNo || name, name: name || employeeNo, url, gender: genderOf(info) });
      }
      if (list.length < 100) break;
    }
  }
  const missing = found.filter((person) => person.id && !person.url).slice(0, 40);
  let cursor = 0;
  async function fillUrl() {
    while (cursor < missing.length) {
      const person = missing[cursor];
      cursor += 1;
      person.url = await personPhotoUrl(base, sessionId, person.id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, missing.length) }, () => fillUrl()));
  const withPhoto = found.filter((person) => person.url).slice(0, 40);
  const photos = /* @__PURE__ */ new Map();
  cursor = 0;
  async function download() {
    while (cursor < withPhoto.length) {
      const person = withPhoto[cursor];
      cursor += 1;
      const photo = await photoData(base, sessionId, person.url);
      if (photo) photos.set(person.employeeNo, photo);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, withPhoto.length) }, () => download()));
  return found.map((person) => ({
    employeeNo: person.employeeNo,
    name: person.name,
    photo: photos.get(person.employeeNo) ?? "",
    gender: person.gender
  }));
}
async function openReport(base, headersForRead, reportTypeId) {
  const head = await readBody(`${base}/hccattendance/ability/v1/report/${reportTypeId}/get`, {
    method: "POST",
    headers: headersForRead,
    body: JSON.stringify({ language: "en" })
  });
  if (portalError(head.json, head.status) || !head.json) return null;
  const headBody = head.json.data && typeof head.json.data === "object" ? head.json.data : head.json;
  return {
    columns: Array.isArray(headBody.columnList) ? headBody.columnList : [],
    filters: Array.isArray(headBody.filterList) ? headBody.filterList : []
  };
}
async function readReportPage(base, headersForRead, reportTypeId, page, filters, range) {
  const filterList = filters.flatMap((filter) => {
    const columnName = plainCell(filter.target ?? filter.columnName);
    const operation = plainCell(filter.operation) || "BETWEEN";
    const inputType = Number(filter.inputType);
    const dateFilter = inputType === 3 || inputType === 5 || /date|time|period/.test(columnName);
    if (!dateFilter || !columnName) return [];
    return [{ columnName, operation: operation === "IN" ? "BETWEEN" : operation, value: range }];
  });
  const result = await readBody(`${base}/hccattendance/report/v1/list`, {
    method: "POST",
    headers: headersForRead,
    body: JSON.stringify({
      page,
      pageSize: PAGE_SIZE,
      language: "en",
      reportTypeId,
      columnIdList: [],
      filterList
    })
  });
  const reason = portalError(result.json, result.status);
  if (reason) return { rows: [], error: reason, noMore: true };
  const body = result.json?.data && typeof result.json.data === "object" ? result.json.data : result.json ?? {};
  const rows = Array.isArray(body.reportDataList) ? body.reportDataList : [];
  return { rows, error: "", noMore: body.nextPageExists === false };
}
async function pullFirstLastReport(base, input, offset) {
  const headersForTeam = teamHeaders(input.sessionId);
  const menu = await readBody(`${base}/hccattendance/ability/v1/menu/list`, {
    method: "POST",
    headers: headersForTeam,
    body: JSON.stringify({ language: "en" })
  });
  if (portalError(menu.json, menu.status) || !menu.json) return null;
  const payload = menu.json.data && typeof menu.json.data === "object" ? menu.json.data : menu.json;
  const nodes = menuNodes(payload.menuList ?? payload);
  const textOf2 = (node) => `${node.translatedName ?? ""} ${node.name ?? ""} ${node.componentName ?? ""}`.toLowerCase();
  const candidates = nodes.filter((node) => {
    if (node.reportTypeId == null || node.reportTypeId < 0) return false;
    const text = textOf2(node);
    if (text.includes("mobile")) return false;
    if (input.kind === "transaction") return /\btransaction\b/.test(text);
    return reportKind(node) !== "";
  }).sort((a, b) => Number(/\btransaction\b/.test(textOf2(b))) - Number(/\btransaction\b/.test(textOf2(a))));
  if (!candidates.length) {
    const titles = nodes.map((node) => node.translatedName || node.name).filter(Boolean).slice(0, 8).join("\u060C ");
    return { ok: false, error: input.kind === "transaction" ? `\u0645\u0641\u064A\u0634 \u062A\u0642\u0631\u064A\u0631 Transaction. \u0627\u0644\u0644\u064A \u0638\u0627\u0647\u0631: ${titles || "\u0648\u0644\u0627 \u062D\u0627\u062C\u0629"}` : titles ? `\u0645\u0641\u064A\u0634 \u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u062D\u0636\u0648\u0631. \u0627\u0644\u0644\u064A \u0638\u0627\u0647\u0631: ${titles}` : "\u0645\u0641\u064A\u0634 \u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u062D\u0636\u0648\u0631 \u0641\u064A \u0627\u0644\u0642\u0627\u0626\u0645\u0629." };
  }
  const headersForRead = headersForTeam;
  const ranges = [
    `${input.startDate}T00:00:00${offset},${input.endDate}T23:59:59${offset}`,
    `${input.startDate} 00:00:00,${input.endDate} 23:59:59`
  ];
  let report = candidates[0];
  let columns = [];
  let filters = [];
  let range = ranges[0];
  for (const candidate of candidates) {
    const opened = await openReport(base, headersForRead, candidate.reportTypeId);
    if (!opened) continue;
    let sample = await readReportPage(base, headersForRead, candidate.reportTypeId, 1, opened.filters, ranges[0]);
    let parsed = punchesFromReport(sample.rows, opened.columns);
    if (!parsed.length) {
      sample = await readReportPage(base, headersForRead, candidate.reportTypeId, 1, opened.filters, ranges[1]);
      parsed = punchesFromReport(sample.rows, opened.columns);
      if (parsed.length) range = ranges[1];
    }
    report = candidate;
    columns = opened.columns;
    filters = opened.filters;
    if (parsed.length) break;
  }
  const title = report.translatedName || report.name || "\u0627\u0644\u062D\u0636\u0648\u0631";
  let page = Math.max(1, input.pageIndex || 1);
  const punches = [];
  let done = false;
  for (let step = 0; step < PAGES_PER_CALL && !done; step += 1) {
    const loaded = await readReportPage(base, headersForRead, report.reportTypeId, page, filters, range);
    if (loaded.error) return { ok: false, error: loaded.error };
    const parsed = punchesFromReport(loaded.rows, columns);
    if (!parsed.length && !punches.length && step === 0 && range === ranges[0]) {
      range = ranges[1];
      step -= 1;
      continue;
    }
    punches.push(...parsed);
    done = !loaded.rows.length || loaded.noMore || loaded.rows.length < PAGE_SIZE;
    page += 1;
  }
  const notice = punches.length ? `\u0627\u0644\u062A\u0642\u0631\u064A\u0631: ${title}. \u0627\u0644\u0623\u0648\u0642\u0627\u062A 00:00 \u0648 23:59 \u0627\u062A\u0633\u0627\u0628\u062A \u0644\u0623\u0646\u0647\u0627 \u0627\u0644\u0634\u064A\u0641\u062A.` : `\u062A\u0642\u0631\u064A\u0631 ${title} \u0631\u062C\u0651\u0639 \u0645\u0648\u0627\u0639\u064A\u062F \u0627\u0644\u0634\u064A\u0641\u062A \u0628\u0633 (00:00\u201323:59) \u0648\u0645\u0641\u064A\u0634 \u0648\u0642\u062A \u0628\u0635\u0645\u0629.`;
  return { ok: true, punches, pageIndex: page, done, notice };
}
async function hikPullChunk(input) {
  try {
    const days = (Date.parse(`${input.endDate}T00:00:00Z`) - Date.parse(`${input.startDate}T00:00:00Z`)) / 864e5;
    if (days < 0) return { ok: false, error: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0646\u0647\u0627\u064A\u0629 \u0642\u0628\u0644 \u0627\u0644\u0628\u062F\u0627\u064A\u0629." };
    if (days > 40) return { ok: false, error: "\u0627\u0642\u0633\u0645 \u0627\u0644\u0641\u062A\u0631\u0629. \u0643\u0644 \u0633\u062D\u0628\u0629 \u0644\u062D\u062F \u0664\u0660 \u064A\u0648\u0645." };
    const base = assertPortal(input.apiBase);
    const feature = featureCode(input.featureCode);
    const team = base.includes("hikcentralconnect.com");
    const offset = zoneOffset(input.timeZone || "Africa/Cairo", input.startDate);
    if (team) {
      const people = input.pageIndex <= 1 ? await fetchPeople(base, input.sessionId) : [];
      const report = await pullFirstLastReport(base, input, offset);
      if (report?.ok) return { ...report, people };
      if (report) return report;
    }
    let page = Math.max(1, input.pageIndex || 1);
    const punches = [];
    let done = false;
    const path = team ? "/hccacs/v1/event/certificateRecords/search" : "/customer/proxy/hccacs/v1/event/certificateRecords/search";
    const callHeaders = team ? {
      clientSource: "0",
      clientType: "48",
      lang: "en-US",
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `JSESSIONID=${input.sessionId}`
    } : { ...headers(feature, input.sessionId), "Content-Type": "application/json" };
    for (let step = 0; step < PAGES_PER_CALL && !done; step += 1) {
      const body = {
        pageIndex: page,
        pageSize: PAGE_SIZE,
        searchCriteria: {
          beginTime: `${input.startDate}T00:00:00${offset}`,
          endTime: `${input.endDate}T23:59:59${offset}`,
          type: 0,
          eventTypes: "",
          elementIDs: input.elementIds?.trim() || "",
          searchType: 0,
          cardNumber: "",
          personCondition: {}
        }
      };
      const result = await readBody(`${base}${path}`, {
        method: "POST",
        headers: callHeaders,
        body: JSON.stringify(body)
      });
      const reason = portalError(result.json, result.status);
      if (reason) return { ok: false, error: reason };
      if (!result.json) return { ok: false, error: "\u0631\u062F \u0627\u0644\u0645\u0648\u0642\u0639 \u0645\u0634 \u0645\u0641\u0647\u0648\u0645." };
      const parsed = punchesFromPortal(result.json);
      punches.push(...parsed.punches);
      const seen = page * PAGE_SIZE;
      done = parsed.punches.length === 0 || parsed.total != null && seen >= parsed.total || parsed.punches.length < PAGE_SIZE;
      page += 1;
    }
    return { ok: true, punches, pageIndex: page, done };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/timeout|abort/i.test(message)) return { ok: false, error: "\u0627\u0644\u0645\u0648\u0642\u0639 \u0645\u0627 \u0631\u062F\u0634 \u0641\u064A \u0627\u0644\u0648\u0642\u062A. \u062C\u0631\u0651\u0628 \u0641\u062A\u0631\u0629 \u0623\u0642\u0635\u0631." };
    return { ok: false, error: message || "\u0627\u0644\u0633\u062D\u0628 \u0645\u0646 \u0645\u0648\u0642\u0639 \u0647\u064A\u0643-\u0643\u0648\u0646\u0643\u062A \u0641\u0634\u0644." };
  }
}
async function hikInspectPeopleSchema(apiBase, sessionId) {
  let http = 0;
  try {
    const base = assertPortal(apiBase);
    if (sessionId.length < 8 || sessionId.length > 4096) {
      return { ok: false, http, state: "INVALID_SESSION", structures: [] };
    }
    const response = await fetch(base + "/ccfperson/v1/persons/search", {
      method: "POST",
      headers: teamHeaders(sessionId),
      body: JSON.stringify({
        pageSize: 5,
        pageIndex: 1,
        responseMode: 0,
        productId: "3",
        field: "FullPath",
        searchCriteria: { personName: { fullName: "" }, logicalOperation: 1 }
      }),
      signal: AbortSignal.timeout(15e3)
    });
    http = response.status;
    if (http === 401 || http === 403) return { ok: false, http, state: "ACCESS_DENIED", structures: [] };
    if (!response.ok) return { ok: false, http, state: "HTTP_ERROR", structures: [] };
    const reader = response.body?.getReader();
    if (!reader) return { ok: false, http, state: "NO_BODY", structures: [] };
    const chunks = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        return { ok: false, http, state: "RESPONSE_TOO_LARGE", structures: [] };
      }
      chunks.push(part.value);
    }
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return { ok: false, http, state: "INVALID_JSON", structures: [] };
    }
    const obj = (x) => x && typeof x === "object" && !Array.isArray(x) ? x : null;
    const root = obj(payload);
    if (!root) return { ok: false, http, state: "INVALID_SCHEMA", structures: [] };
    if (typeof root.errorCode === "string" && root.errorCode !== "0") {
      return { ok: false, http, state: "APPLICATION_REJECTED", structures: [] };
    }
    const data = obj(root.data);
    const envelope = obj(data?.personResponse ?? root.personResponse);
    const list = envelope?.personList ?? envelope?.list ?? data?.personList ?? root.personList;
    const structures = [];
    const inspect = (path, x) => {
      const record = obj(Array.isArray(x) ? x[0] : x);
      if (!record) return;
      const fields = Object.entries(record).slice(0, 40).filter(([key]) => /^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(key) && !/password|cookie|token|secret|session|credential|email|phone|mobile|image|photo|picture|url/i.test(key)).slice(0, 24).map(([key, value]) => key + ":" + (Array.isArray(value) ? "array" : value === null ? "null" : typeof value));
      structures.push({ path, kind: Array.isArray(x) ? "array" : "object", length: Array.isArray(x) ? x.length : null, fields });
    };
    inspect("root", root);
    inspect("data", data);
    inspect("personResponse", envelope);
    inspect("personList", list);
    if (Array.isArray(list)) inspect("personInfo", obj(list[0])?.personInfo);
    return {
      ok: Array.isArray(list),
      http,
      state: Array.isArray(list) ? list.length ? "LIST_FOUND" : "EMPTY_LIST" : "SCHEMA_UNVERIFIED",
      structures
    };
  } catch {
    return { ok: false, http, state: "NETWORK_OR_TIMEOUT", structures: [] };
  }
}
var TEAM_BUTTONS = [
  {
    key: "area",
    ar: "\u0627\u0644\u0645\u0646\u0637\u0642\u0629",
    en: "Area",
    meaning: "\u0628\u062A\u062C\u0645\u0639 \u0627\u0644\u0623\u062C\u0647\u0632\u0629 \u0648\u0627\u0644\u0646\u0627\u0633. \u0645\u0646\u0637\u0642\u0629 \u0648\u0627\u062D\u062F\u0629 \u064A\u0639\u0646\u064A \u0627\u0644\u0643\u0644 \u064A\u0628\u0635\u0645 \u0645\u0646 \u0623\u064A \u062C\u0647\u0627\u0632 \u0641\u064A\u0647\u0627. \u0643\u0644 \u0641\u0631\u0639 \u0645\u0646\u0637\u0642\u0629 \u064A\u0639\u0646\u064A \u0627\u0644\u0645\u0648\u0638\u0641 \u064A\u0646\u0632\u0644 \u0639\u0644\u0649 \u0623\u062C\u0647\u0632\u0629 \u0641\u0631\u0639\u0647 \u0628\u0633.",
    keys: ["areaName", "parentAreaName", "name"],
    probes: [
      { path: "/ccfres/v1/areas/search", body: { areaSearchRequest: { pageIndex: 1, pageSize: 200 } } },
      { path: "/ccfres/v1/logicalresource/area/list", body: { pageIndex: 1, pageSize: 200 } },
      { path: "/hccattendance/checkPoint/v1/list", body: { page: 1, pageSize: 100, name: "" } }
    ]
  },
  {
    key: "department",
    ar: "\u0627\u0644\u0642\u0633\u0645",
    en: "Department",
    meaning: "\u062A\u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646. \u0627\u0644\u0642\u0633\u0645 \u064A\u062A\u0631\u0628\u0637 \u0628\u0645\u0646\u0637\u0642\u0629 \u0639\u0634\u0627\u0646 \u0627\u0644\u0645\u062F\u064A\u0631 \u064A\u0634\u0648\u0641 \u0646\u0627\u0633 \u0627\u0644\u0642\u0633\u0645 \u0628\u062A\u0627\u0639\u0647.",
    keys: ["groupName", "name"],
    probes: [{ path: "/ccfperson/v1/groups/search", body: { personGroupSearchRequest: { depthTraversal: true } } }]
  },
  {
    key: "person",
    ar: "\u0627\u0644\u0623\u0634\u062E\u0627\u0635",
    en: "Person",
    meaning: "\u0627\u0644\u0645\u0648\u0638\u0641. \u0631\u0642\u0645 \u0627\u0644\u0634\u062E\u0635 \u0639\u0644\u0649 \u0627\u0644\u062A\u064A\u0645 \u0644\u0627\u0632\u0645 \u064A\u0641\u0636\u0644 \u0646\u0641\u0633 \u0627\u0644\u0631\u0642\u0645 \u0639\u0644\u0649 \u0627\u0644\u062C\u0647\u0627\u0632\u060C \u0648\u0625\u0644\u0627 \u0627\u0644\u0628\u0635\u0645\u0627\u062A \u0645\u0627 \u062A\u062A\u062C\u0645\u0639\u0634.",
    keys: ["fullName", "firstName", "lastName", "personName"],
    probes: [
      {
        path: "/ccfperson/v1/persons/search",
        body: {
          pageSize: 100,
          pageIndex: 1,
          responseMode: 0,
          productId: "3",
          field: "FullPath",
          searchCriteria: { personName: { fullName: "" }, logicalOperation: 1 }
        }
      }
    ]
  },
  {
    key: "device",
    ar: "\u0627\u0644\u0623\u062C\u0647\u0632\u0629",
    en: "Device",
    meaning: "\u0627\u0644\u0628\u0635\u0645\u0629 \u0623\u0648 \u0643\u0646\u062A\u0631\u0648\u0644 \u0627\u0644\u0628\u0627\u0628. \u0628\u064A\u062A\u0636\u0627\u0641 \u0628\u0627\u0644\u0633\u064A\u0631\u064A\u0627\u0644 \u0648\u0643\u0648\u062F \u0627\u0644\u062A\u062D\u0642\u0642 \u062C\u0648\u0647 \u0627\u0644\u0645\u0646\u0637\u0642\u0629.",
    keys: ["name", "deviceName"],
    probes: [
      { path: "/hccattendance/checkPoint/v1/list", body: { page: 1, pageSize: 100, name: "" } },
      { path: "/ccfres/v1/devices/search", body: { pageIndex: 1, pageSize: 100 } }
    ]
  },
  {
    key: "access",
    ar: "\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0648\u0635\u0648\u0644",
    en: "Access level",
    meaning: "\u0628\u064A\u0642\u0648\u0644 \u0627\u0644\u0634\u062E\u0635 \u064A\u062F\u062E\u0644 \u0623\u0646\u0647\u064A \u0628\u0627\u0628 \u0648\u0641\u064A \u0623\u064A \u0648\u0642\u062A. \u0645\u0646 \u063A\u064A\u0631\u0647 \u0627\u0644\u062C\u0647\u0627\u0632 \u0623\u0648\u0646\u0644\u0627\u064A\u0646 \u0648\u0627\u0644\u0634\u062E\u0635 \u0645\u0634 \u0638\u0627\u0647\u0631 \u0639\u0644\u064A\u0647.",
    keys: ["accessLevelName", "name"],
    probes: [
      { path: "/acspm/v1/accesslevel/list", body: { accessLevelSearchRequest: { pageIndex: 1, pageSize: 100 } } },
      { path: "/acspm/v1/accesslevel/search", body: { pageIndex: 1, pageSize: 100 } },
      { path: "/hccacs/v1/accesslevel/search", body: { accessLevelSearchRequest: { pageIndex: 1, pageSize: 100 } } }
    ]
  },
  {
    key: "report",
    ar: "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u062D\u0636\u0648\u0631",
    en: "Attendance",
    meaning: "Transaction \u0647\u0648 \u0643\u0644 \u0627\u0644\u0628\u0635\u0645\u0627\u062A \u0627\u0644\u062E\u0627\u0645. First in \u0648 Last out \u0623\u0648\u0644 \u0648\u0622\u062E\u0631 \u0648\u0642\u062A. \u0644\u0648 \u0645\u062F\u0649 \u0627\u0644\u0648\u0631\u062F\u064A\u0629 \u0636\u064A\u0642 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u064A\u0637\u0644\u0639 \u0641\u0627\u0636\u064A.",
    keys: ["translatedName", "name"],
    probes: [{ path: "/hccattendance/ability/v1/menu/list", body: {} }]
  }
];
function namedValues(value, keys, into = [], depth = 0) {
  if (!value || depth > 7 || into.length > 60) return into;
  if (Array.isArray(value)) {
    for (const item of value) namedValues(item, keys, into, depth + 1);
    return into;
  }
  if (typeof value !== "object") return into;
  const row = value;
  for (const key of keys) {
    const cell = row[key];
    if (typeof cell === "string" && cell.trim().length > 1) into.push(cell.trim());
  }
  for (const cell of Object.values(row)) {
    if (cell && typeof cell === "object") namedValues(cell, keys, into, depth + 1);
  }
  return into;
}
function payloadOpened(json, status) {
  if (!json || portalError(json, status)) return false;
  const code = metaCode(json);
  return json.errorCode === "0" || code === 200 || code === 0 || json.data != null;
}
async function hikReadMap(apiBase, sessionId) {
  try {
    const base = assertPortal(apiBase);
    const buttons = [];
    for (const spec of TEAM_BUTTONS) {
      let foundPath = "";
      let names = [];
      const diagnostics = [];
      for (const probe of spec.probes) {
        try {
          const result = await readBody(`${base}${probe.path}`, {
            method: "POST",
            headers: teamHeaders(sessionId),
            body: JSON.stringify(probe.body)
          });
          const recognized = payloadOpened(result.json, result.status);
          const got = recognized ? [...new Set(namedValues(result.json, spec.keys))].slice(0, 24) : [];
          diagnostics.push({
            path: probe.path,
            http: result.status,
            recognized,
            nameCount: got.length
          });
          if (!recognized) continue;
          if (!foundPath || got.length > names.length) {
            foundPath = probe.path;
            names = got;
          }
          if (names.length) break;
        } catch {
          diagnostics.push({
            path: probe.path,
            http: 0,
            recognized: false,
            nameCount: 0
          });
        }
      }
      buttons.push({
        key: spec.key,
        ar: spec.ar,
        en: spec.en,
        meaning: spec.meaning,
        found: Boolean(foundPath),
        path: foundPath,
        count: names.length,
        names,
        diagnostics
      });
    }
    const people = buttons.find((button) => button.key === "person");
    if (people && people.count === 0) {
      const groups = await readBody(`${base}/ccfperson/v1/groups/search`, {
        method: "POST",
        headers: teamHeaders(sessionId),
        body: JSON.stringify({ personGroupSearchRequest: { depthTraversal: true } })
      });
      const groupIds = [...new Set(namedValues(groups.json, ["groupId", "id"]))].slice(0, 8);
      for (const groupId of ["1", ...groupIds]) {
        const result = await readBody(`${base}/ccfperson/v1/persons/search`, {
          method: "POST",
          headers: teamHeaders(sessionId),
          body: JSON.stringify({
            pageSize: 100,
            pageIndex: 1,
            responseMode: 0,
            productId: "3",
            field: "FullPath",
            searchCriteria: { personGroup: { groupId }, logicalOperation: 1 }
          })
        });
        const got = [...new Set(namedValues(result.json, ["fullName", "firstName", "lastName"]))].slice(0, 24);
        if (!got.length) continue;
        people.found = true;
        people.path = "/ccfperson/v1/persons/search";
        people.names = got;
        people.count = got.length;
        break;
      }
    }
    const fingerprint = buttons.map((button) => `${button.key}:${button.path}:${button.count}:${button.names.join("|")}`).join(";");
    return { ok: true, stamp: (/* @__PURE__ */ new Date()).toISOString(), fingerprint, buttons };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/timeout|abort/i.test(message)) return { ok: false, error: "\u0627\u0644\u0645\u0648\u0642\u0639 \u0645\u0627 \u0631\u062F\u0634. \u0627\u062F\u062E\u0644 \u062A\u0627\u0646\u064A \u0648\u0628\u0639\u062F\u064A\u0646 \u0627\u0642\u0631\u0623 \u0627\u0644\u062A\u064A\u0645." };
    return { ok: false, error: message || "\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u062A\u064A\u0645 \u0641\u0634\u0644\u062A." };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  hikInspectPeopleSchema,
  hikLogin,
  hikPullChunk,
  hikReadMap,
  normalizeAccount
});
