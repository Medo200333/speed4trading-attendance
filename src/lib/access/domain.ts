import { methodLabel, splitStamp } from "../hikvision-parse";

/** accountant: reports and transactions only (view/export), no devices or settings. */
export type Role = "admin" | "operator" | "viewer" | "accountant" | "manager";
export type Support = "supported" | "unsupported" | "unverified";
export type Feature =
  | "users.read"
  | "users.add"
  | "users.edit"
  | "users.delete"
  | "cards.read"
  | "cards.add"
  | "cards.delete"
  | "fingerprints"
  | "fingerprint.capture"
  | "faces"
  | "pin"
  | "doors"
  | "door.control"
  | "schedules"
  | "holidays"
  | "permissions"
  | "events"
  | "time"
  | "ntp"
  | "dst";
export type Capability = {
  feature: Feature;
  label: string;
  state: Support;
  endpoint: string;
  reference: string;
  checkedAt: string | null;
  http: number | null;
  reason: string;
  limits: Record<string, string | number | boolean>;
};
export type Probe = {
  endpoint: string;
  http: number;
  checkedAt: string;
  fields: Record<string, string | number | boolean>;
  reason: string;
};
export type Device = {
  branchId?: string;
  id: string;
  name: string;
  location?: string;
  info?: {
    manufacturer: string;
    reportedName: string;
    deviceType: string;
    firmwareBuildDate: string;
    userCount: number | null;
  };
  verifiedFeatures?: Feature[];
  host: string;
  port: number;
  https: boolean;
  model: string;
  firmware: string;
  serial: string;
  status: "unknown" | "online" | "offline";
  checkedAt: string | null;
  lastSync: string | null;
  error: string;
  capabilities: Capability[];
  probes: Probe[];
  physicalDoorIds: number[];
  doorCommands: string[];
  clock: {
    original: string;
    offset: string;
    driftSeconds: number | null;
    mode: string;
    zone?: string;
  } | null;
  sync: {
    enabled: boolean;
    intervalSeconds: number;
    nextRun: string | null;
    running: boolean;
    failures: number;
    lastError: string;
    scanned: number;
    valid: number;
    duplicates: number;
    pages: number;
    lastUsersSync?: string;
    lastAttendanceSync?: string;
    period?: { start: string; end: string };
    uniqueVerifications?: number;
    storedInPeriod?: number;
    outsidePeriod?: number;
    lastErrorCode?: string;
    userWarning?: string;
    result?: "running" | "success" | "failed";
    diagnostic?: PullDiagnostic;
    diagnostics?: PullDiagnostic[];
    diagnosticFailure?: PullFailure;
    diagnosticStatus?: "running" | "success" | "failed";
  };
};
export type PullDiagnostic = {
  at: string;
  start: string;
  end: string;
  bounds: { startTime: string; endTime: string };
  raw: number;
  inPeriod: number;
  outsidePeriod: number;
  verifications: number;
  uniqueEvents: number;
  uniqueVerifications: number;
  duplicateEvents: number;
  categories: Record<string, number>;
  codes: Record<string, number>;
  offsets: string[];
  years: string[];
  earliest: string;
  latest: string;
  pages: {
    position: number;
    count: number;
    total: number;
    status: string;
    format: string;
  }[];
  attempts?: EventSearchAttempt[];
  scope?: "all" | "major5";
  warning?: string;
};
export type EventSearchAttempt = {
  purpose: "period" | "basic";
  profile: string;
  http: number;
  accepted: boolean;
  request: {
    AcsEventCond: {
      searchID: string;
      searchResultPosition: number;
      maxResults: number;
      major: number;
      minor: number;
      startTime?: string;
      endTime?: string;
      picEnable?: boolean;
    };
  };
  response: Record<string, string | number>;
  excerpt: string;
};
export type PullFailure = {
  at: string;
  start: string;
  end: string;
  code: string;
  message: string;
  attempts: EventSearchAttempt[];
};
export type Person = {
  id: string;
  deviceId: string;
  employeeNo: string;
  /** Name stored on the device: English (Latin) only. */
  name: string;
  /** Optional Arabic name, kept inside the app only and never sent to devices. */
  arabicName?: string;
  userType: string;
  validity: {
    enable: boolean;
    beginTime: string;
    endTime: string;
    timeType: string;
  } | null;
  doorRight: string;
  rightPlan: { doorNo: number; planTemplateNo: string }[];
  verifyMode: string;
  updatedAt: string;
  source: "device" | "local";
  localEnabled: boolean;
  shiftId: string;
  cardCount: number | null;
  fingerprintCount: number | null;
  faceCount: number | null;
  /** Optional preset photo (edition seed / Teams), data URL. */
  photo?: string;
};
export type LogicalDoor = {
  id: string;
  deviceId: string;
  channel: number;
  name: string;
  location: string;
  notes: string;
  state: string;
  checkedAt: string | null;
};
export type EventKind =
  "verification" | "denied" | "alarm" | "system" | "unknown";
export type RawEvent = {
  id: string;
  deviceId: string;
  deviceSerial: string;
  source: "local-isapi";
  originalTimestamp: string;
  originalOffset: string;
  serialNo: string;
  major: number;
  minor: number;
  employeeNo: string;
  name: string;
  doorNo: number | null;
  attendanceStatus: string;
  category: EventKind;
  method: string;
  date: string;
  time: string;
  validTime: boolean;
  importedAt: string;
};
export type Shift = {
  id: string;
  name: string;
  start: string;
  end: string;
  graceMinutes: number;
  earlyGraceMinutes: number;
  maxHours: number;
  breakMinutes?: number;
  overtimeEnabled?: boolean;
  overtimeGraceMinutes?: number;
  days: number[];
};
export type AttendanceRules = {
  shifts: Shift[];
  holidays: { date: string; name: string }[];
  leaves: { personId: string; start: string; end: string; note: string }[];
  duplicateSeconds: number;
};
export type AttendanceRow = {
  personId: string;
  employeeNo: string;
  name: string;
  date: string;
  shift: string;
  first: string;
  last: string;
  count: number;
  minutes: number | null;
  grossMinutes: number | null;
  breakMinutes: number;
  overtimeMinutes: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  status: string;
  exception: boolean;
};
export type LocalPlan = {
  id: string;
  name: string;
  deviceId: string;
  templateNo: number;
  week: { day: string; start: string; end: string }[];
  holidays: string[];
  appliedAt: string | null;
};
export type Audit = {
  id: string;
  at: string;
  actor: string;
  role: Role;
  action: string;
  target: string;
  result: "success" | "failed" | "pending" | "uncertain";
  detail: string;
};
export type Account = {
  username: string;
  name: string;
  role: Role;
  salt: string;
  hash: string;
  enabled: boolean;
};
export type AccessState = {
  companyId?: string;
  schemaVersion: 1;
  revision: number;
  devices: Device[];
  people: Person[];
  doors: LogicalDoor[];
  events: RawEvent[];
  plans: LocalPlan[];
  rules: AttendanceRules;
  audit: Audit[];
  accounts: Account[];
  reviews: { eventId: string; note: string; actor: string; at: string }[];
};

const refs = "Push SDK Access Control Protocol 20230927";
export const featureSpecs: {
  feature: Feature;
  label: string;
  endpoint: string;
  reference: string;
}[] = [
  {
    feature: "users.read",
    label: "قراءة المستخدمين",
    endpoint: "/ISAPI/AccessControl/UserInfo/capabilities?format=json",
    reference: `${refs} §3.2.2, §13.5.27`,
  },
  {
    feature: "users.add",
    label: "إضافة مستخدم للجهاز",
    endpoint: "/ISAPI/AccessControl/UserInfo/Record?format=json",
    reference: `${refs} §3.2.4, §13.5.25`,
  },
  {
    feature: "users.edit",
    label: "تعديل المستخدم وتفعيله",
    endpoint: "/ISAPI/AccessControl/UserInfo/Modify?format=json",
    reference: `${refs} §3.2.5, §13.5.26`,
  },
  {
    feature: "users.delete",
    label: "حذف المستخدم ووسائله",
    endpoint: "/ISAPI/AccessControl/UserInfoDetail/Delete?format=json",
    reference: `${refs} §3.2.6`,
  },
  {
    feature: "cards.read",
    label: "قراءة الكروت",
    endpoint: "/ISAPI/AccessControl/CardInfo/capabilities?format=json",
    reference: `${refs} §4.2.2`,
  },
  {
    feature: "cards.add",
    label: "إضافة كارت",
    endpoint: "/ISAPI/AccessControl/CardInfo/Record?format=json",
    reference: `${refs} §4.2.4, §13.5`,
  },
  {
    feature: "cards.delete",
    label: "إلغاء كارت",
    endpoint: "/ISAPI/AccessControl/CardInfo/Delete?format=json",
    reference: `${refs} §4.2.6`,
  },
  {
    feature: "fingerprints",
    label: "حصر بصمات الأصابع",
    endpoint: "/ISAPI/AccessControl/FingerPrintCfg/capabilities?format=json",
    reference: `${refs} §5.2.2`,
  },
  {
    feature: "fingerprint.capture",
    label: "جمع بصمة إصبع",
    endpoint: "/ISAPI/AccessControl/CaptureFingerPrint",
    reference: `${refs} §5.2.7`,
  },
  {
    feature: "faces",
    label: "إدارة صور الوجه",
    endpoint: "/ISAPI/Intelligent/FDLib/capabilities?format=json",
    reference: `${refs} §6.2.1–6.2.5`,
  },
  {
    feature: "pin",
    label: "تعيين رقم PIN",
    endpoint: "/ISAPI/AccessControl/UserInfo/Modify?format=json",
    reference: `${refs} §13.5.26 password`,
  },
  {
    feature: "doors",
    label: "الأبواب الفعلية",
    endpoint: "/ISAPI/AccessControl/capabilities",
    reference: `${refs} §13.2 doorNo`,
  },
  {
    feature: "door.control",
    label: "التحكم اليدوي بالباب",
    endpoint: "/ISAPI/AccessControl/RemoteControl/door/capabilities",
    reference: `${refs} §13.3.1–13.3.2`,
  },
  {
    feature: "schedules",
    label: "جداول صلاحيات الأبواب",
    endpoint:
      "/ISAPI/AccessControl/UserRightWeekPlanCfg/capabilities?format=json",
    reference: `${refs} §8`,
  },
  {
    feature: "holidays",
    label: "عطلات صلاحيات الدخول",
    endpoint:
      "/ISAPI/AccessControl/UserRightHolidayPlanCfg/capabilities?format=json",
    reference: `${refs} §8`,
  },
  {
    feature: "permissions",
    label: "ربط الموظف بصلاحية باب",
    endpoint: "/ISAPI/AccessControl/UserInfo/Modify?format=json",
    reference: `${refs} §13.5.26 RightPlan`,
  },
  {
    feature: "events",
    label: "قراءة جميع الأحداث",
    endpoint: "/ISAPI/AccessControl/AcsEvent/capabilities?format=json",
    reference: `${refs} §13.12.2 capabilities; §13.12 ISAPI AcsEvent search`,
  },
  {
    feature: "time",
    label: "فحص ساعة الجهاز",
    endpoint: "/ISAPI/System/time",
    reference: "ISAPI System time; previously verified endpoint",
  },
  {
    feature: "ntp",
    label: "عرض إعداد NTP",
    endpoint: "/ISAPI/System/time/ntpServers",
    reference: "ISAPI System time; GET probe only",
  },
  {
    feature: "dst",
    label: "التوقيت الصيفي للجهاز",
    endpoint: "/ISAPI/System/time/dst",
    reference: "ISAPI System time; prior device result notSupport",
  },
];

export function emptyCapabilities(): Capability[] {
  return featureSpecs.map((spec) => ({
    ...spec,
    state: "unverified",
    checkedAt: null,
    http: null,
    reason:
      "يلزم فحص الجهاز بحساب مخوّل؛ وجود الوظيفة في الدليل لا يثبت دعمها.",
    limits: {},
  }));
}
export function newDevice(
  id: string,
  name: string,
  host: string,
  port = 80,
  https = false,
): Device {
  return {
    id,
    name,
    host,
    port,
    https,
    model: "",
    firmware: "",
    serial: "",
    status: "unknown",
    checkedAt: null,
    lastSync: null,
    error: "",
    capabilities: emptyCapabilities(),
    probes: [],
    physicalDoorIds: [],
    doorCommands: [],
    clock: null,
    sync: {
      enabled: false,
      intervalSeconds: 300,
      nextRun: null,
      running: false,
      failures: 0,
      lastError: "",
      scanned: 0,
      valid: 0,
      duplicates: 0,
      pages: 0,
    },
  };
}
/** Packaged installs (EXE/APK server) start with no devices; the first-run wizard discovers them. */
export function emptyInstall() {
  return typeof process !== "undefined" && process.env?.SKYLINE_EMPTY_INSTALL === "1";
}
export function initialState(): AccessState {
  return {
    schemaVersion: 1,
    revision: 0,
    devices: emptyInstall()
      ? []
      : [newDevice("hikvision-main", "البصمة الرئيسية", "192.168.1.21")],
    people: [],
    doors: [],
    events: [],
    plans: [],
    rules: {
      shifts: [
        {
          id: "day",
          name: "الدوام اليومي",
          start: "08:00",
          end: "16:00",
          graceMinutes: 15,
          earlyGraceMinutes: 10,
          maxHours: 14,
          days: [0, 1, 2, 3, 4],
        },
      ],
      holidays: [],
      leaves: [],
      duplicateSeconds: 45,
    },
    audit: [],
    accounts: [],
    reviews: [],
  };
}
/** Device names are English only: Latin letters, digits, space and . - ' */
export const ENGLISH_NAME = /^[A-Za-z0-9 .'-]+$/;
export function isEnglishName(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return v.length > 0 && v.length <= 32 && ENGLISH_NAME.test(v) && /[A-Za-z]/.test(v);
}
export const hasArabic = (value: string | null | undefined) => /[\u0600-\u06ff]/.test(String(value ?? ""));
/** Name to print in reports: the English device name, or a clear placeholder. */
export function englishNameOf(person: { name: string; employeeNo: string }): string {
  return isEnglishName(person.name) ? person.name.trim() : `(English name missing) #${person.employeeNo}`;
}
let gbkReverse: Map<string, number[]> | null = null;
/**
 * Some Hikvision firmwares (device language English) return UTF-8 names as if
 * they were GBK bytes, e.g. "اختبار" comes back as "丕禺鬲亘丕乇". Reverse that
 * mapping when the result is valid UTF-8; otherwise return the text unchanged.
 */
export function repairDeviceText(value: string): string {
  if (!value || !/[\u3000-\u9fff\uff00-\uffef]/.test(value)) return value;
  try {
    if (!gbkReverse) {
      const gbk = new TextDecoder("gbk");
      gbkReverse = new Map();
      for (let a = 0x81; a <= 0xfe; a++)
        for (let b = 0x40; b <= 0xfe; b++) {
          if (b === 0x7f) continue;
          const c = gbk.decode(new Uint8Array([a, b]));
          if (c.length === 1 && c !== "\ufffd" && !gbkReverse.has(c)) gbkReverse.set(c, [a, b]);
        }
    }
    const bytes: number[] = [];
    for (const c of value) {
      const code = c.codePointAt(0) || 0;
      if (code < 0x80) bytes.push(code);
      else {
        const pair = gbkReverse.get(c);
        if (!pair) return value;
        bytes.push(...pair);
      }
    }
    const fixed = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    return /[\u0600-\u06ff]/.test(fixed) ? fixed : value;
  } catch {
    return value;
  }
}
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
const denyCodes = new Set([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 39, 41, 44, 47, 55, 58, 61, 64,
  67, 70, 73, 76, 78, 80, 102, 103, 104, 112, 113,
]);
// Same zone the app uses for "today" (Africa/Cairo) on Windows and Android alike.
const localClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
/**
 * Devices stamp events in their own time zone (DS-K1A340WX ships with CST+8).
 * When the stamp carries an offset, convert it to the app's local time so that
 * the attendance date matches the user's day instead of the device's day.
 */
export function localStamp(
  original: string,
  stamp: { date: string; time: string } | null,
) {
  if (!stamp || !/(?:[+-]\d{2}:?\d{2}|Z)$/.test(original.trim())) return stamp;
  const at = Date.parse(original.trim().replace(" ", "T"));
  if (!Number.isFinite(at)) return stamp;
  const parts = Object.fromEntries(
    localClock.formatToParts(new Date(at)).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}:${parts.second}`,
  };
}
/** Re-derive local date/time for events stored before local conversion existed. */
export function localEvent<T extends { originalTimestamp: string; date: string; time: string }>(event: T): T {
  const stamp = localStamp(event.originalTimestamp, splitStamp(event.originalTimestamp));
  return stamp && (stamp.date !== event.date || stamp.time !== event.time)
    ? { ...event, date: stamp.date, time: stamp.time }
    : event;
}
export function normalizeEvent(
  record: Record<string, unknown>,
  device: Pick<Device, "id" | "serial">,
  importedAt: string,
): RawEvent {
  const originalTimestamp = text(
    record.time ?? record.dateTime ?? record.eventTime,
  );
  const stamp = localStamp(originalTimestamp, splitStamp(originalTimestamp));
  const major = Number(record.major ?? record.majorEvent ?? -1);
  const minor = Number(record.minor ?? record.minorEvent ?? -1);
  const employeeNo = text(
    record.employeeNoString ?? record.employeeNo ?? record.employeeNoInt,
  );
  const name = repairDeviceText(text(record.name ?? record.employeeName));
  const method = major === 5 ? methodLabel(minor) : "";
  const category: EventKind =
    major === 1
      ? "alarm"
      : major === 5 && method
        ? "verification"
        : major === 5 && denyCodes.has(minor)
          ? "denied"
          : [2, 3].includes(major) || major === 5
            ? "system"
            : "unknown";
  const serialNo = text(record.serialNo ?? record.eventSerialNo);
  const doorNo = Number(record.doorNo ?? record.doorNumber);
  // Validate the device's own calendar date (before any timezone shift) so 30 Feb is rejected.
  const raw = splitStamp(originalTimestamp);
  const parsedTime = raw ? Date.parse(`${raw.date}T${raw.time}Z`) : NaN;
  const validTime = Boolean(
    stamp &&
    raw &&
    Number.isFinite(parsedTime) &&
    new Date(parsedTime).toISOString().slice(0, 10) === raw.date &&
    Number(raw.time.slice(0, 2)) < 24 &&
    Number(raw.time.slice(3, 5)) < 60 &&
    Number(raw.time.slice(6)) < 60,
  );
  const stable = serialNo
    ? `serial:${serialNo}|${originalTimestamp}`
    : `event:${major}|${minor}|${employeeNo || name}|${originalTimestamp}|${Number.isFinite(doorNo) ? doorNo : ""}`;
  return {
    id: `${device.id}|${device.serial}|${stable}`,
    deviceId: device.id,
    deviceSerial: device.serial,
    source: "local-isapi",
    originalTimestamp,
    originalOffset: /([+-]\d{2}:\d{2}|Z)$/.exec(originalTimestamp)?.[1] || "",
    serialNo,
    major,
    minor,
    employeeNo,
    name,
    doorNo: Number.isInteger(doorNo) && doorNo > 0 ? doorNo : null,
    attendanceStatus: text(record.attendanceStatus),
    category,
    method,
    date: stamp?.date || "",
    time: stamp?.time || "",
    validTime,
    importedAt,
  };
}
export function mergeEvents(previous: RawEvent[], incoming: RawEvent[]) {
  const map = new Map(previous.map((event) => [event.id, event]));
  let duplicates = 0;
  for (const event of incoming) {
    if (map.has(event.id)) duplicates += 1;
    else map.set(event.id, event);
  }
  return { events: [...map.values()], duplicates };
}
const minutes = (clock: string) =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
export function addDays(day: string, amount: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function attendanceReport(
  events: RawEvent[],
  people: Person[],
  rules: AttendanceRules,
  start: string,
  end: string,
): AttendanceRow[] {
  const length = Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000,
  );
  if (!Number.isFinite(length) || length < 0 || length > 92)
    throw new Error("التقرير يسمح بفترة حتى 93 يوماً.");
  const valid = events.map(localEvent).filter(
    (event) =>
      event.category === "verification" && event.validTime && event.employeeNo,
  );
  const rows: AttendanceRow[] = [];
  for (const person of people.filter((person) => person.localEnabled)) {
    const shift =
      rules.shifts.find((shift) => shift.id === person.shiftId) ||
      rules.shifts[0];
    if (!shift) continue;
    const source = valid.filter(
      (event) =>
        event.deviceId === person.deviceId &&
        event.employeeNo === person.employeeNo,
    );
    for (let dayIndex = 0; dayIndex <= length; dayIndex += 1) {
      const date = addDays(start, dayIndex);
      const base = Date.parse(`${date}T00:00:00Z`);
      const shiftStart = base + minutes(shift.start) * 60000;
      const overnight = minutes(shift.end) <= minutes(shift.start);
      const shiftEnd =
        base + (minutes(shift.end) + (overnight ? 1440 : 0)) * 60000;
      const inWindow = source
        .map((event) => ({
          event,
          at: Date.parse(`${event.date}T${event.time}Z`),
        }))
        .filter(({ at }) =>
          overnight
            ? at >= shiftStart - 4 * 3600000 && at < shiftEnd + 4 * 3600000
            : at >= base && at < base + 86400000,
        )
        .sort((a, b) => a.at - b.at);
      const kept: typeof inWindow = [];
      for (const item of inWindow)
        if (
          !kept.length ||
          item.at - kept.at(-1)!.at > rules.duplicateSeconds * 1000
        )
          kept.push(item);
      const holiday = rules.holidays.find((holiday) => holiday.date === date);
      const leave = rules.leaves.find(
        (leave) =>
          leave.personId === person.id &&
          date >= leave.start &&
          date <= leave.end,
      );
      const weeklyOff = !shift.days.includes(new Date(base).getUTCDay());
      const first = kept[0];
      const last = kept.length > 1 ? kept.at(-1) : undefined;
      const duration =
        first && last ? Math.round((last.at - first.at) / 60000) : null;
      const excessive = duration != null && duration > shift.maxHours * 60;
      const deductedBreak =
        duration != null && !excessive
          ? Math.min(duration, shift.breakMinutes || 0)
          : 0;
      const netMinutes =
        duration == null || excessive ? null : duration - deductedBreak;
      const plannedMinutes = Math.max(
        0,
        (shiftEnd - shiftStart) / 60000 - (shift.breakMinutes || 0),
      );
      const overtimeMinutes =
        netMinutes != null && first && last && shift.overtimeEnabled
          ? Math.max(
              0,
              Math.min(
                Math.floor((last.at - shiftEnd) / 60000),
                netMinutes - plannedMinutes,
              ) - (shift.overtimeGraceMinutes || 0),
            )
          : null;
      const lateMinutes = first
        ? Math.max(
            0,
            Math.ceil((first.at - shiftStart) / 60000) - shift.graceMinutes,
          )
        : 0;
      const earlyMinutes = last
        ? Math.max(
            0,
            Math.ceil((shiftEnd - last.at) / 60000) - shift.earlyGraceMinutes,
          )
        : 0;
      const labels = !first
        ? [
            leave
              ? "إجازة"
              : holiday
                ? `عطلة: ${holiday.name}`
                : weeklyOff
                  ? "عطلة أسبوعية"
                  : "غياب",
          ]
        : [
            excessive
              ? "مدة غير منطقية — مراجعة"
              : !last
                ? "انصراف مفقود"
                : "منتظم",
            ...(lateMinutes ? ["تأخير"] : []),
            ...(earlyMinutes ? ["انصراف مبكر"] : []),
            ...(holiday || weeklyOff ? ["عمل في عطلة"] : []),
            ...(leave ? ["تحقق أثناء إجازة"] : []),
          ];
      rows.push({
        personId: person.id,
        employeeNo: person.employeeNo,
        name: person.name,
        date,
        shift: shift.name,
        first: first?.event.time || "",
        last: last?.event.time || "",
        count: kept.length,
        minutes: netMinutes,
        grossMinutes: excessive ? null : duration,
        breakMinutes: deductedBreak,
        overtimeMinutes,
        lateMinutes,
        earlyMinutes,
        status: labels.join(" · "),
        exception:
          excessive ||
          Boolean(first && !last) ||
          lateMinutes > 0 ||
          earlyMinutes > 0 ||
          Boolean(!first && !leave && !holiday && !weeklyOff),
      });
    }
  }
  return rows.sort(
    (a, b) =>
      b.date.localeCompare(a.date) || a.name.localeCompare(b.name, "ar"),
  );
}

export function diagnosePermission(
  person: Person,
  door: LogicalDoor,
  now: string,
) {
  if (person.deviceId !== door.deviceId)
    return "الموظف والباب مربوطان بجهازين مختلفين.";
  if (person.userType.toLowerCase() === "blacklist")
    return "المستخدم مدرج في قائمة منع الجهاز.";
  if (
    person.validity?.enable &&
    (now.slice(0, 19) < person.validity.beginTime.slice(0, 19) ||
      now.slice(0, 19) > person.validity.endTime.slice(0, 19))
  )
    return "خارج فترة صلاحية المستخدم على الجهاز.";
  if (!person.doorRight.split(",").includes(String(door.channel)))
    return "رقم الباب غير موجود ضمن صلاحيات المستخدم المقروءة من الجهاز.";
  if (!person.rightPlan.some((plan) => plan.doorNo === door.channel))
    return "إذن الباب موجود، لكن لم تُقرأ خطة زمنية مرتبطة به؛ يلزم التحقق.";
  return "يوجد ربط مقروء من الجهاز؛ السماح النهائي يتوقف على الجدول والعطلات وطريقة التحقق وحالة الباب.";
}
