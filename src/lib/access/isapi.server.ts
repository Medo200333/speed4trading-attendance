import { describeHttpStatus, describeIsapiStatus, describeNetworkError } from "./device-errors";
import { DigestSession } from "../hikvision.server";
import { parseDevicePayload } from "../hikvision-parse";
import { parseSearchPage, eventTimeBounds } from "./search-page";
import { deviceBase, allowDeviceTarget } from "./target.server";
import { credential, AccessError } from "./store.server";
import {
  emptyCapabilities,
  normalizeEvent,
  type Device,
  type Feature,
  type Person,
  type Probe,
  type Support,
  type EventSearchAttempt,
  repairDeviceText,
  hasArabic,
} from "./domain";

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : {};
const string = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
export function flattened(
  body: string,
): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  const add = (key: string, value: unknown) => {
    const passwordLimit =
      /password\.@(?:min|max)$/i.test(key) && /^\d+$/.test(String(value));
    if (
      !passwordLimit &&
      /password|secret|token|salt|nonce|cookie|(?:^|\.)key(?:\.|$)|fingerPrintData|faceData|pictureURL|imageURL/i.test(
        key,
      )
    )
      return;
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      typeof value === "number"
    )
      output[key] = typeof value === "string" ? value.slice(0, 512) : value;
  };
  if (body.trim().startsWith("{")) {
    const visit = (value: unknown, path: string) => {
      if (value && typeof value === "object")
        for (const [key, child] of Object.entries(value))
          visit(child, path ? `${path}.${key}` : key);
      else add(path, value);
    };
    try {
      visit(JSON.parse(body), "");
    } catch {
      /* Invalid stays unknown. */
    }
  } else {
    const stack: { name: string; text: string }[] = [];
    for (const token of body
      .replace(/<!--[\s\S]*?-->/g, "")
      .match(/<[^>]+>|[^<]+/g) || []) {
      if (/^<\//.test(token)) {
        const element = stack.pop();
        if (element && element.text.trim())
          add(
            [...stack.map((x) => x.name), element.name].join("."),
            element.text.trim(),
          );
      } else if (/^<[^!?/]/.test(token)) {
        const name = /^<([\w:]+)/.exec(token)?.[1];
        if (!name) continue;
        const path = [...stack.map((x) => x.name), name].join(".");
        for (const match of token.matchAll(/([\w]+)="([^"]*)"/g))
          if (["min", "max", "opt"].includes(match[1]))
            add(`${path}.@${match[1]}`, match[2]);
        if (!/\/>$/.test(token)) stack.push({ name, text: "" });
      } else if (stack.length && !token.startsWith("<"))
        stack.at(-1)!.text += token;
    }
  }
  return output;
}
export function field(fields: Probe["fields"], name: string) {
  return Object.entries(fields).find(
    ([key]) =>
      key.toLowerCase() === name.toLowerCase() ||
      key.toLowerCase().endsWith(`.${name.toLowerCase()}`),
  )?.[1];
}
const flag = (fields: Probe["fields"], name: string): boolean | null => {
  const value = field(fields, name);
  return value === true || value === "true" || value === 1
    ? true
    : value === false || value === "false" || value === 0
      ? false
      : null;
};
function functions(probe?: Probe) {
  return probe
    ? Object.entries(probe.fields)
        .filter(([key]) => /supportFunction(?:\.@opt)?(?:\.\d+)?$/i.test(key))
        .flatMap(([, value]) => String(value).split(/[,\s]+/))
    : [];
}
export function checkResponse(response: { status: number; text: string }) {
  if (response.status === 401)
    throw new AccessError("DEVICE_AUTH", describeHttpStatus(401));
  if (response.status === 403)
    throw new AccessError("DEVICE_FORBIDDEN", describeHttpStatus(403));
  if (response.status < 200 || response.status >= 300) {
    const failed = flattened(response.text);
    const sub = field(failed, "subStatusCode");
    throw new AccessError(
      "DEVICE_HTTP",
      sub ? describeIsapiStatus(field(failed, "statusCode"), sub, field(failed, "errorMsg")) : describeHttpStatus(response.status),
    );
  }
  const fields = flattened(response.text);
  const code = field(fields, "statusCode");
  if (code != null && !["0", "1"].includes(String(code)))
    throw new AccessError(
      "DEVICE_REJECTED",
      describeIsapiStatus(code, field(fields, "subStatusCode"), field(fields, "errorMsg")),
    );
  return fields;
}
export async function isapi(device: Device) {
  allowDeviceTarget(device.host, device.port);
  const secret = await credential(device.id);
  const base = deviceBase(device);
  const session = new DigestSession(secret.username, secret.password);
  return {
    /** Fetch a picture the device itself referenced (e.g. FDSearch faceURL), always from the saved device host. */
    picture: async (url: string) => {
      let path = "";
      try {
        const parsed = new URL(url, base);
        path = parsed.pathname + parsed.search;
      } catch {
        throw new AccessError("ENDPOINT", "رابط صورة غير صالح.");
      }
      if (!/^\/(LOCALS|ISAPI|pic|picture)\//i.test(path) || /[\r\n]|\.\./.test(path))
        throw new AccessError("ENDPOINT", "مسار الصورة غير مسموح.");
      return session
        .request(base + path, "GET", undefined, undefined, true)
        .catch(() => {
          throw new AccessError("DEVICE_NETWORK", "تعذر تحميل صورة الموظف من الجهاز.");
        });
    },
    summarize: (response: { status: number; text: string }) =>
      safeSearchResponse(response, [secret.password, secret.username]),
    request: (
      path: string,
      method = "GET",
      body?: string | FormData,
      contentType?: string,
      binary = false,
      /** Blocking device-side captures (face/finger) keep the HTTP request open until the person acts. */
      timeoutMs = 20_000,
    ) => {
      if (!path.startsWith("/ISAPI/") || /[\r\n]|\.\.|:\/\//.test(path))
        throw new AccessError("ENDPOINT", "مسار الجهاز غير مسموح.");
      return session
        .request(base + path, method, body, contentType, binary, timeoutMs)
        .catch((error: unknown) => {
          if (
            error instanceof Error &&
            /طريقة مصادقة|رد الجهاز أكبر/.test(error.message)
          )
            throw new AccessError(
              "DEVICE_PROTOCOL",
              "بروتوكول المصادقة أو حجم رد الجهاز غير مدعوم. راجع تشخيص ISAPI.",
            );
          const described = describeNetworkError(error);
          throw new AccessError(described.code, described.message);
        });
    },
  };
}

// Only status/search metadata are retained. Never persist an event list, headers or raw body.
function safeSearchResponse(
  response: { status: number; text: string },
  secrets: string[],
) {
  let safeText = response.text;
  // Redact before the generic field reader truncates long strings, including JSON/XML escaping.
  for (const secret of secrets
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    for (const spelling of new Set([
      secret,
      JSON.stringify(secret).slice(1, -1),
      secret
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;"),
    ]))
      safeText = safeText.split(spelling).join("[محجوب]");
  }
  const values = flattened(safeText);
  const sanitize = (value: unknown) => {
    let result = String(value);
    for (const secret of secrets
      .filter(Boolean)
      .sort((a, b) => b.length - a.length))
      result = result.split(secret).join("[محجوب]");
    return result
      .replace(/(?:Digest|Bearer|Basic)\s+[^\r\n<]+/gi, "[مصادقة محجوبة]")
      .replace(/https?:\/\/[^\s<>"']+/gi, "[رابط محجوب]")
      .replace(
        /((?:password|passwd|pwd|token|secret|nonce|cookie|authorization|username|employeeNoString|employeeNo|cardNo|serialNumber)\s*[=:]\s*)[^,;\s<]+/gi,
        "$1[محجوب]",
      )
      // eslint-disable-next-line no-control-regex -- strips control characters on purpose
      .replace(/[\x00-\x1f]/g, " ")
      .slice(0, 350);
  };
  const result: Record<string, string | number> = {};
  for (const key of [
    "statusCode",
    "statusString",
    "subStatusCode",
    "errorCode",
    "errorMsg",
    "responseStatusStrg",
    "numOfMatches",
    "totalMatches",
  ]) {
    const value = field(values, key);
    if (value !== undefined) result[key] = sanitize(value);
  }
  return {
    response: result,
    excerpt: Object.keys(result).length
      ? JSON.stringify(result).slice(0, 1400)
      : "[رد غير معروف؛ حُجب محتواه لحماية البيانات]",
  };
}
export class AcsEventError extends AccessError {
  constructor(
    code: string,
    message: string,
    public attempts: EventSearchAttempt[],
  ) {
    super(code, message);
  }
}
type EventProfile = {
  name: string;
  major: number;
  size: number;
  time: "utc" | "device" | "local" | "none";
  picture: boolean;
};
export type EventSearchContext = {
  attempts: EventSearchAttempt[];
  selected?: EventProfile;
  searchID?: string;
  offset?: string;
  client: Awaited<ReturnType<typeof isapi>>;
};
export async function eventSearchContext(
  device: Device,
): Promise<EventSearchContext> {
  return {
    attempts: [],
    client: await isapi(device),
    offset: device.clock?.offset,
  };
}
function requestBounds(
  start: string,
  end: string,
  style: EventProfile["time"],
  offset: string,
) {
  if (style === "none") return {};
  const bounds = eventTimeBounds(start, end);
  if (style === "utc") return bounds;
  if (style === "local")
    return {
      startTime: bounds.startTime.slice(0, 19),
      endTime: bounds.endTime.slice(0, 19),
    };
  const valid = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!valid) return bounds;
  const delta =
    (Number(valid[2]) * 60 + Number(valid[3])) *
    (valid[1] === "-" ? -1 : 1) *
    60000;
  const format = (stamp: string) =>
    new Date(Date.parse(stamp) + delta).toISOString().slice(0, 19) + offset;
  return {
    startTime: format(bounds.startTime),
    endTime: format(bounds.endTime),
  };
}
function searchProfiles(device: Device): EventProfile[] {
  const limits =
    device.capabilities.find((c) => c.feature === "events")?.limits || {};
  const maximum = Number(field(limits, "maxResults.@max"));
  const size = Math.max(
    1,
    Math.min(30, Number.isInteger(maximum) && maximum > 0 ? maximum : 30),
  );
  const small = Math.min(10, size);
  return [
    { name: "all-utc-seconds", major: 0, size, time: "utc", picture: true },
    { name: "all-small", major: 0, size: small, time: "utc", picture: true },
    { name: "all-minimal", major: 0, size: small, time: "utc", picture: false },
    {
      name: "all-device-offset",
      major: 0,
      size: small,
      time: "device",
      picture: false,
    },
    {
      name: "all-local-compat",
      major: 0,
      size: small,
      time: "local",
      picture: false,
    },
    {
      name: "all-unfiltered",
      major: 0,
      size: small,
      time: "none",
      picture: false,
    },
    {
      name: "legacy-major5",
      major: 5,
      size: small,
      time: "utc",
      picture: false,
    },
    {
      name: "legacy-major5-device-offset",
      major: 5,
      size: small,
      time: "device",
      picture: false,
    },
    {
      name: "legacy-major5-local",
      major: 5,
      size: small,
      time: "local",
      picture: false,
    },
    {
      name: "legacy-major5-unfiltered",
      major: 5,
      size: small,
      time: "none",
      picture: false,
    },
  ];
}
async function requestEventSearch(
  context: EventSearchContext,
  profile: EventProfile,
  start: string | undefined,
  end: string | undefined,
  position: number,
  searchID: string,
  purpose: "period" | "basic",
  minor = 0,
) {
  const request: EventSearchAttempt["request"] = {
    AcsEventCond: {
      searchID,
      searchResultPosition: position,
      maxResults: profile.size,
      major: profile.major,
      minor,
      ...(start && end
        ? requestBounds(start, end, profile.time, context.offset || "")
        : {}),
      ...(profile.picture ? { picEnable: false } : {}),
    },
  };
  const response = await context.client.request(
    "/ISAPI/AccessControl/AcsEvent?format=json",
    "POST",
    JSON.stringify(request),
  );
  const summary = context.client.summarize(response);
  const attempt: EventSearchAttempt = {
    purpose,
    profile: profile.name,
    http: response.status,
    accepted: false,
    request,
    ...summary,
  };
  // Retain rejected variants and representative first-page requests, bounded independently of page count.
  if (
    context.attempts.length < 24 &&
    (position === 0 || response.status !== 200)
  )
    context.attempts.push(attempt);
  try {
    checkResponse(response);
  } catch (error) {
    if (error instanceof AccessError) {
      const detail =
        summary.response.errorMsg ||
        summary.response.subStatusCode ||
        summary.response.statusString ||
        "لا توجد تفاصيل حالة قابلة للعرض";
      throw new AcsEventError(
        error.code,
        `${error.message} ${detail}`,
        context.attempts,
      );
    }
    throw error;
  }
  let page;
  try {
    page = parseSearchPage(response.text, "events", position, searchID);
  } catch {
    throw new AcsEventError(
      "DEVICE_PROTOCOL",
      "رد AcsEvent غير صالح؛ لم يُعتبر سجلات فارغة.",
      context.attempts,
    );
  }
  attempt.accepted = true;
  return page;
}
// Diagnostic probes never import records and never turn failed HTTP requests into zero results.
export async function basicEventProbes(
  device: Device,
  context: EventSearchContext,
) {
  const token = Date.now().toString(36);
  for (const [index, pair] of [
    [0, 0],
    [5, 0],
    [5, 75],
  ].entries()) {
    try {
      await requestEventSearch(
        context,
        {
          name: `basic-${pair[0]}-${pair[1]}`,
          major: pair[0],
          size: 1,
          time: "utc",
          picture: false,
        },
        undefined,
        undefined,
        0,
        `b${token}${index}`,
        "basic",
        pair[1],
      );
    } catch (error) {
      if (
        !(error instanceof AcsEventError) ||
        !["DEVICE_HTTP", "DEVICE_REJECTED"].includes(error.code) ||
        ![400, 405, 501].includes(context.attempts.at(-1)?.http || 0)
      )
        throw error;
    }
  }
}
export const probePaths = [
  "/ISAPI/AccessControl/capabilities",
  "/ISAPI/AccessControl/UserInfo/capabilities?format=json",
  "/ISAPI/AccessControl/CardInfo/capabilities?format=json",
  "/ISAPI/AccessControl/FingerPrintCfg/capabilities?format=json",
  "/ISAPI/Intelligent/FDLib/capabilities?format=json",
  "/ISAPI/AccessControl/RemoteControl/door/capabilities",
  "/ISAPI/AccessControl/CardReaderCfg/capabilities?format=json",
  "/ISAPI/AccessControl/AcsWorkStatus/capabilities?format=json",
  "/ISAPI/AccessControl/UserRightWeekPlanCfg/capabilities?format=json",
  "/ISAPI/AccessControl/UserRightPlanTemplate/capabilities?format=json",
  "/ISAPI/AccessControl/UserRightHolidayPlanCfg/capabilities?format=json",
  "/ISAPI/AccessControl/UserRightHolidayGroupCfg/capabilities?format=json",
  "/ISAPI/AccessControl/AcsEvent/capabilities?format=json",
  "/ISAPI/System/time",
  "/ISAPI/System/time/ntpServers",
  "/ISAPI/System/time/dst",
];
export function capabilityMatrix(probes: Probe[], doorIds: number[]) {
  const global = probes.find((probe) => probe.endpoint === probePaths[0]);
  const users = probes.find((probe) => probe.endpoint === probePaths[1]);
  const cards = probes.find((probe) => probe.endpoint === probePaths[2]);
  const choose = (feature: Feature) => {
    if (
      feature.startsWith("users.") ||
      feature === "pin" ||
      feature === "permissions"
    )
      return users;
    if (feature.startsWith("cards.")) return cards;
    return probes.find(
      (probe) =>
        probe.endpoint ===
        emptyCapabilities().find((row) => row.feature === feature)?.endpoint,
    );
  };
  const schema = (feature: Feature, pattern: RegExp): true | null =>
    Object.keys(choose(feature)?.fields || {}).some((key) => pattern.test(key))
      ? true
      : null;
  const declaredRead = (
    feature: Feature,
    globalFlag: string,
    pattern: RegExp,
  ) =>
    global && flag(global.fields, globalFlag) === false
      ? false
      : schema(feature, pattern);
  const tests: Record<Feature, boolean | null> = {
    "users.read": functions(users).includes("get"),
    "users.add": functions(users).includes("post"),
    "users.edit": functions(users).includes("put"),
    "users.delete": global
      ? flag(global.fields, "isSupportUserInfoDetailDelete")
      : null,
    "cards.read": functions(cards).includes("get"),
    "cards.add": functions(cards).includes("post"),
    "cards.delete": functions(cards).includes("delete"),
    "fingerprint.capture": global
      ? flag(global.fields, "isSupportCaptureFingerPrint")
      : null,
    fingerprints: declaredRead(
      "fingerprints",
      "isSupportFingerPrintCfg",
      /^FingerPrint(?:Cfg|Cap)/i,
    ),
    faces:
      global && flag(global.fields, "isSupportFDLib") === false
        ? false
        : schema(
            "faces",
            /^(?:FDLib\.)?(?:supportFDFunction|supportFunction|FDRecordDataMaxNum)$/i,
          ),
    schedules: schema("schedules", /UserRightWeekPlanCfg\.planNo\.@max$/i),
    holidays: schema("holidays", /UserRightHolidayPlanCfg\.planNo\.@max$/i),
    events: declaredRead("events", "isSupportAcsEvent", /^AcsEvent/i),
    time: Number.isFinite(
      Date.parse(
        String(field(choose("time")?.fields || {}, "localTime") || ""),
      ),
    )
      ? true
      : null,
    ntp: schema("ntp", /^NTPServer/i),
    dst: schema("dst", /^DST/i),
    pin: users
      ? Object.keys(users.fields).some((key) =>
          /\.password(?:\.|$)/i.test(key),
        ) && functions(users).includes("put")
      : null,
    permissions:
      users && doorIds.length
        ? Object.keys(users.fields).some((key) => /\.RightPlan\./i.test(key)) &&
          functions(users).includes("put")
        : null,
    doors: doorIds.length
      ? true
      : global
        ? flag(global.fields, "isSupportDoorCfg") === false
          ? false
          : null
        : null,
    "door.control":
      global && flag(global.fields, "isSupportRemoteControlDoor") === false
        ? false
        : doorIds.length && schema("door.control", /cmd\.@opt/)
          ? true
          : null,
  };
  return emptyCapabilities().map((capability) => {
    const probe =
      capability.feature === "users.delete" ||
      capability.feature === "fingerprint.capture" ||
      capability.feature === "doors"
        ? global
        : choose(capability.feature);
    if (!probe) return capability;
    const explicitUnsupported =
      [404, 405, 501].includes(probe.http) ||
      /notSupport|not supported/i.test(probe.reason);
    const successful = probe.http === 200 && probe.reason === "OK";
    const declaration = tests[capability.feature];
    const hasFunctions = capability.feature.startsWith("users.")
      ? functions(users).length > 0
      : capability.feature.startsWith("cards.")
        ? functions(cards).length > 0
        : true;
    const state: Support =
      explicitUnsupported ||
      (declaration === false && hasFunctions && successful)
        ? "unsupported"
        : successful && declaration === true
          ? "supported"
          : "unverified";
    const limits = Object.fromEntries(
      Object.entries(probe.fields)
        .filter(([key]) =>
          /@max|@min|maxRecordNum|numberPerPerson|supportFunction|@opt/.test(
            key,
          ),
        )
        .slice(0, 40),
    );
    return {
      ...capability,
      state,
      checkedAt: probe.checkedAt,
      http: probe.http,
      reason:
        state === "supported"
          ? "أُثبتت بالقراءة من الجهاز؛ تنفيذ التغيير يحتاج مسؤولاً وتأكيداً."
          : state === "unsupported"
            ? "الجهاز رفض المسار أو أعلن عدم دعم الوظيفة."
            : "الاستجابة لم تثبت دعم الوظيفة أو لم تُرجع حقولها المطلوبة.",
      limits,
    };
  });
}
export async function scanDevice(device: Device): Promise<Device> {
  const client = await isapi(device);
  const info = await client.request("/ISAPI/System/deviceInfo");
  const infoFields = checkResponse(info);
  const parsed = parseDevicePayload(info.text);
  if (!parsed.model && !parsed.name)
    throw new AccessError("NOT_HIKVISION", "الرد لا يثبت أنه جهاز Hikvision.");
  const probes: Probe[] = [];
  for (const endpoint of probePaths) {
    const response = await client.request(endpoint);
    // deviceInfo already authenticated this session; some firmwares (DS-K1T 192.168.1.111) answer 401 on an
    // optional capability path they do not expose. Record it as unsupported instead of failing the whole connect.
    const fields = flattened(response.text);
    const code = field(fields, "statusCode");
    const substantive = Object.keys(fields).some(
      (key) =>
        !/statusCode|statusString|subStatusCode|errorCode|errorMsg|requestURL|@version/i.test(
          key,
        ),
    );
    const sub = String(field(fields, "subStatusCode") || "");
    const reason =
      response.status === 200 &&
      substantive &&
      (code == null || ["0", "1"].includes(String(code))) &&
      (!sub || /^(ok|success)$/i.test(sub))
        ? "OK"
        : /^(ok|success)$/i.test(sub)
          ? "UNKNOWN"
          : sub || "UNKNOWN";
    probes.push({
      endpoint,
      http: response.status,
      checkedAt: new Date().toISOString(),
      fields,
      reason: /^(ok|success)$/i.test(reason) ? "OK" : reason.slice(0, 100),
    });
  }
  let physicalDoorIds: number[] = [];
  const global = probes[0].fields;
  if (
    flag(global, "isSupportAcsWorkStatus") === true ||
    probes.some(
      (probe) =>
        probe.endpoint === probePaths[7] &&
        probe.http === 200 &&
        probe.reason === "OK",
    )
  ) {
    const endpoint = "/ISAPI/AccessControl/AcsWorkStatus?format=json";
    const response = await client.request(endpoint);
    const fields = flattened(response.text);
    probes.push({
      endpoint,
      http: response.status,
      fields,
      checkedAt: new Date().toISOString(),
      reason: response.status === 200 ? "OK" : "UNKNOWN",
    });
    if (response.status === 200)
      physicalDoorIds = [
        ...new Set(
          Object.entries(fields)
            .flatMap(([key, value]) => {
              const arrayIndex = /\.doorStatus\.(\d+)$/i.exec(key);
              if (arrayIndex) return [Number(arrayIndex[1]) + 1];
              return /(?:DoorStatus|Door|doorStatusList).*\.(?:doorNo|doorID|id)$/i.test(
                key,
              )
                ? [Number(value)]
                : [];
            })
            .filter(
              (value) => Number.isInteger(value) && value > 0 && value <= 256,
            ),
        ),
      ];
  }
  const remote = probes.find((probe) => probe.endpoint === probePaths[5]);
  const doorCommands =
    remote && remote.http === 200
      ? Object.entries(remote.fields)
          .filter(([key]) => /cmd\.@opt(?:\.\d+)?$/.test(key))
          .flatMap(([, value]) => String(value).split(","))
          .filter((value) =>
            ["open", "close", "alwaysOpen", "alwaysClose"].includes(value),
          )
      : [];
  const time = probes.find((probe) => probe.endpoint === "/ISAPI/System/time");
  const original = time ? String(field(time.fields, "localTime") || "") : "";
  const offset = /([+-]\d{2}:\d{2}|Z)$/.exec(original)?.[1] || "";
  const drift =
    original && offset
      ? Math.round((Date.parse(original) - Date.now()) / 1000)
      : NaN;
  let userCount: number | null = null;
  if (
    capabilityMatrix(probes, physicalDoorIds).some(
      (row) => row.feature === "users.read" && row.state === "supported",
    )
  ) {
    try {
      const count = await client.request(
        "/ISAPI/AccessControl/UserInfo/Count?format=json",
      );
      const countFields = checkResponse(count);
      const number = Number(field(countFields, "userNumber"));
      if (Number.isInteger(number) && number >= 0) userCount = number;
    } catch {
      /* Optional read failure does not fabricate a count or defeat authenticated identity. */
    }
  }
  return {
    ...device,
    model: parsed.model,
    firmware: String(field(infoFields, "firmwareVersion") || ""),
    info: {
      manufacturer: String(field(infoFields, "manufacturer") || ""),
      reportedName: String(field(infoFields, "deviceName") || ""),
      deviceType: String(field(infoFields, "deviceType") || ""),
      firmwareBuildDate: String(
        field(infoFields, "firmwareReleasedDate") ||
          field(infoFields, "firmwareBuildDate") ||
          "",
      ),
      userCount,
    },
    verifiedFeatures: [
      ...new Set([
        ...(device.firmware ===
        String(field(infoFields, "firmwareVersion") || "")
          ? device.verifiedFeatures || []
          : []),
        ...(original ? ["time" as const] : []),
        ...(physicalDoorIds.length ? ["doors" as const] : []),
      ]),
    ],
    serial: String(field(infoFields, "serialNumber") || ""),
    status: "online",
    checkedAt: new Date().toISOString(),
    error: "",
    probes,
    physicalDoorIds,
    doorCommands,
    capabilities: capabilityMatrix(probes, physicalDoorIds),
    clock: original
      ? {
          original,
          offset,
          driftSeconds: Number.isFinite(drift) ? drift : null,
          mode: String(field(time!.fields, "timeMode") || ""),
          zone: String(field(time!.fields, "timeZone") || ""),
        }
      : null,
  };
}
export function requireCapability(device: Device, feature: Feature) {
  const capability = device.capabilities.find((row) => row.feature === feature);
  if (
    capability?.state !== "supported" ||
    !device.checkedAt ||
    Date.now() - Date.parse(device.checkedAt) > 24 * 3600000
  )
    throw new AccessError(
      "CAPABILITY",
      `الوظيفة غير متاحة قبل إثبات قدرة الجهاز حديثاً: ${capability?.label || feature}.`,
    );
}
export function personFromDevice(
  record: Obj,
  deviceId: string,
  previous?: Person,
): Person | null {
  const employeeNo = string(record.employeeNo ?? record.employeeNoString);
  if (!employeeNo) return null;
  const validity = obj(record.Valid);
  const rightPlan = Array.isArray(record.RightPlan)
    ? record.RightPlan.map(obj).map((plan) => ({
        doorNo: Number(plan.doorNo),
        planTemplateNo: string(plan.planTemplateNo),
      }))
    : [];
  return {
    id: `${deviceId}:${employeeNo}`,
    deviceId,
    employeeNo,
    name: repairDeviceText(string(record.name)) || employeeNo,
    arabicName:
      previous?.arabicName ||
      (hasArabic(repairDeviceText(string(record.name)))
        ? repairDeviceText(string(record.name))
        : undefined),
    userType: string(record.userType) || "normal",
    validity:
      typeof validity.enable === "boolean"
        ? {
            enable: validity.enable,
            beginTime: string(validity.beginTime),
            endTime: string(validity.endTime),
            timeType: string(validity.timeType) || "local",
          }
        : null,
    doorRight: string(record.doorRight),
    rightPlan,
    verifyMode: string(record.userVerifyMode),
    updatedAt: new Date().toISOString(),
    source: "device",
    localEnabled: previous?.localEnabled ?? true,
    shiftId: previous?.shiftId || "day",
    cardCount: Number.isFinite(Number(record.numOfCard))
      ? Number(record.numOfCard)
      : null,
    fingerprintCount: Number.isFinite(Number(record.numOfFP))
      ? Number(record.numOfFP)
      : null,
    faceCount: Number.isFinite(Number(record.numOfFace))
      ? Number(record.numOfFace)
      : null,
  };
}
export async function userPage(
  device: Device,
  position: number,
  searchID: string,
) {
  const client = await isapi(device);
  const response = await client.request(
    "/ISAPI/AccessControl/UserInfo/Search?format=json",
    "POST",
    JSON.stringify({
      UserInfoSearchCond: {
        searchID,
        searchResultPosition: position,
        maxResults: 30,
      },
    }),
  );
  checkResponse(response);
  return parseSearchPage(response.text, "users", position, searchID);
}
export async function eventPage(
  device: Device,
  start: string,
  end: string,
  position: number,
  searchID: string,
  context?: EventSearchContext,
) {
  const current = context || (await eventSearchContext(device));
  let page: ReturnType<typeof parseSearchPage> | undefined;
  let rejected: unknown;
  const profiles = current.selected
    ? [current.selected]
    : searchProfiles(device);
  const seen = new Set<string>();
  for (const [index, profile] of profiles.entries()) {
    const fingerprint = JSON.stringify({
      major: profile.major,
      size: profile.size,
      time: requestBounds(start, end, profile.time, current.offset || ""),
      picture: profile.picture,
    });
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const id = current.searchID || `${searchID.slice(0, 48)}${index}`;
    try {
      page = await requestEventSearch(
        current,
        profile,
        start,
        end,
        position,
        id,
        "period",
      );
      current.selected = profile;
      current.searchID = id;
      break;
    } catch (error) {
      rejected = error;
      // Negotiate only a first-page parameter rejection, never empty success, auth, transport or later pages.
      if (
        position !== 0 ||
        current.selected ||
        !(error instanceof AcsEventError) ||
        !["DEVICE_HTTP", "DEVICE_REJECTED"].includes(error.code) ||
        current.attempts.at(-1)?.http !== 400 ||
        index === profiles.length - 1
      )
        throw error;
    }
  }
  if (!page)
    throw rejected instanceof AccessError
      ? rejected
      : new AcsEventError(
          "DEVICE_PROTOCOL",
          "لم يقبل الجهاز أي صيغة بحث متوافقة.",
          current.attempts,
        );
  const events = page.records.map((record) =>
    normalizeEvent(record, device, new Date().toISOString()),
  );
  return {
    ...page,
    scope:
      current.selected?.major === 5 ? ("major5" as const) : ("all" as const),
    unfiltered: current.selected?.time === "none",
    attempts: current.attempts,
    events: events.filter((event) => event.date >= start && event.date <= end),
    outsidePeriod: events.filter(
      (event) => event.date < start || event.date > end,
    ).length,
  };
}
