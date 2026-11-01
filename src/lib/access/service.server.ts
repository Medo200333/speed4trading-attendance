import { deviceWritesEnabled, READ_ONLY_MESSAGE } from "./device-writes";
import { randomBytes, randomUUID } from "node:crypto";
import {
  newDevice,
  mergeEvents,
  attendanceReport,
  addDays,
  localEvent,
  type AccessState,
  type Audit,
  type Device,
  type Person,
  type RawEvent,
  repairDeviceText,
  hasArabic,
} from "./domain";
import {
  type ActionInput,
  type QueryInput,
  type Operation,
  type Confirmation,
  operationSchema,
} from "./contracts";
import {
  AccessError,
  readState,
  updateState,
  credential,
  rememberCredential,
  runtime,
  requireRole,
  passwordHash,
  vaultPersistent,
  type Actor,
} from "./store.server";
import {
  scanDevice,
  requireCapability,
  userPage,
  personFromDevice,
  isapi,
  checkResponse,
  AcsEventError,
  field,
} from "./isapi.server";
import { readAttendance, validVerification } from "./pull.server";
import { SearchPageError } from "./search-page";
import { allowDeviceTarget, validateDeviceAddress } from "./target.server";
import {
  readSchedule,
  scheduleDigest,
  weekPayload,
  applyWeek as applyDeviceWeek,
} from "./schedules.server";

const now = () => new Date().toISOString();
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
type JobRuntime = {
  busy: Set<string>;
  timer?: ReturnType<typeof setInterval>;
  polling: boolean;
  confirmations: Map<
    string,
    {
      operation: Operation;
      sessionId: string;
      until: number;
      phrase: string;
      checkedAt: string;
      serial: string;
      scheduleHash?: string;
    }
  >;
};
const globals = globalThis as typeof globalThis & { __zubaydJobs?:WeakMap<object,JobRuntime> };
const jobs = ():JobRuntime => { globals.__zubaydJobs??=new WeakMap(); const owner=runtime(); let value=globals.__zubaydJobs.get(owner); if(!value){value={busy:new Set(),polling:false,confirmations:new Map()};globals.__zubaydJobs.set(owner,value);}return value; };
export async function withDeviceLock<T>(
  deviceId: string,
  run: () => Promise<T>,
): Promise<T> {
  if (jobs().busy.has(deviceId))
    throw new AccessError("BUSY", "انتظر انتهاء العملية الجارية على الجهاز.");
  jobs().busy.add(deviceId);
  try {
    return await run();
  } finally {
    jobs().busy.delete(deviceId);
  }
}
function getDevice(state: AccessState, id: string) {
  const device = state.devices.find((row) => row.id === id);
  if (!device)
    throw new AccessError("DEVICE", "الجهاز غير موجود داخل البرنامج.");
  allowDeviceTarget(device.host, device.port);
  return device;
}
function getPerson(state: AccessState, deviceId: string, employeeNo: string) {
  const person = state.people.find(
    (row) => row.deviceId === deviceId && row.employeeNo === employeeNo,
  );
  if (!person)
    throw new AccessError(
      "PERSON",
      "اسحب قائمة الموظفين أولاً أو اختر موظفاً موجوداً على الجهاز.",
    );
  return person;
}
function audit(
  state: AccessState,
  actor: Actor,
  action: string,
  target: string,
  result: Audit["result"],
  detail = "",
) {
  state.audit.push({
    id: randomUUID(),
    at: now(),
    actor: actor.username,
    role: actor.role,
    action,
    target,
    result,
    detail: detail.slice(0, 500),
  });
}
function validateDates(start: string, end: string, maxDays = 30) {
  const span =
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
    86400000;
  if (
    !Number.isInteger(span) ||
    span < 0 ||
    span > maxDays ||
    new Date(`${start}T00:00:00Z`).toISOString().slice(0, 10) !== start ||
    new Date(`${end}T00:00:00Z`).toISOString().slice(0, 10) !== end
  )
    throw new AccessError(
      "DATES",
      `الفترة غير صحيحة؛ اختر حتى ${maxDays + 1} يوماً.`,
    );
}
export type Snapshot = {
  company?:import("./company-domain").Company;
  companies?:import("./company-domain").Company[];
  companyId?:string;
  systemAdmin?:boolean;
  actor: { username: string; name: string; role: Actor["role"] };
  revision: number;
  devices: Device[];
  people: Person[];
  doors: AccessState["doors"];
  plans: AccessState["plans"];
  rules: AccessState["rules"];
  audit: Audit[];
  reviews: AccessState["reviews"];
  accounts: {
    username: string;
    name: string;
    role: Actor["role"];
    enabled: boolean;
  }[];
  statistics: {
    raw: number;
    valid: number;
    today: number;
    denied: number;
    historical: number;
    invalidTimes: number;
  };
  credentialMode: string;
  storage: string;
  deviceWrites: boolean;
};
export async function snapshot(actor: Actor): Promise<Snapshot> {
  const state = await readState();
  for (const device of state.devices)
    allowDeviceTarget(device.host, device.port);
  return {
    actor: { username: actor.username, name: actor.name, role: actor.role },
    revision: state.revision,
    devices: state.devices.map((device) => ({
      ...device,
      sync: { ...device.sync, running: jobs().busy.has(device.id) },
    })),
    people: state.people,
    doors: state.doors,
    deviceWrites: deviceWritesEnabled(),
    plans: state.plans,
    rules: state.rules,
    audit: state.audit.slice(-200).reverse(),
    reviews: state.reviews,
    accounts:
      actor.role === "admin"
        ? state.accounts.map(({ username, name, role, enabled }) => ({
            username,
            name,
            role,
            enabled,
          }))
        : [],
    statistics: {
      raw: state.events.length,
      valid: state.events.filter(validVerification).length,
      today: state.events.filter((event) => event.date === today()).length,
      denied: state.events.filter((event) => event.category === "denied")
        .length,
      historical: state.events.filter(
        (event) => event.date && event.date < "2020-01-01",
      ).length,
      invalidTimes: state.events.filter((event) => !event.validTime).length,
    },
    credentialMode: vaultPersistent() ? "encrypted" : "memory-8h",
    storage: "private-server-file-v1",
  };
}

// A capabilities URL can be absent while the documented read search is implemented.
// Actual validated search proves reading; this never grants a device write capability.
function requireEventRead(device: Device) {
  if (
    !device.checkedAt ||
    !device.model ||
    !Number.isFinite(Date.parse(device.checkedAt)) ||
    Date.now() - Date.parse(device.checkedAt) > 86400000
  )
    throw new AccessError(
      "CAPABILITY",
      "اختبر اتصال الجهاز وهويته أولاً ثم أعد سحب الأحداث.",
    );
}
export async function synchronize(
  actor: Actor,
  deviceId: string,
  start: string,
  end: string,
  usersOnly = false,
) {
  requireRole(actor, "operator");
  validateDates(start, end);
  const device = getDevice(await readState(), deviceId);
  if (usersOnly) requireCapability(device, "users.read");
  else requireEventRead(device);
  await credential(deviceId);
  if (jobs().busy.has(deviceId))
    throw new AccessError("BUSY", "توجد مزامنة أو عملية جارية لهذا الجهاز.");
  jobs().busy.add(deviceId);
  const searchId = randomBytes(12).toString("hex");
  try {
    await updateState((state) => {
      const row = getDevice(state, deviceId);
      row.sync.running = true;
      if (!usersOnly) {
        row.sync.scanned = 0;
        row.sync.valid = 0;
        row.sync.duplicates = 0;
        row.sync.pages = 0;
        row.sync.uniqueVerifications = 0;
        row.sync.outsidePeriod = 0;
        row.sync.storedInPeriod = 0;
        row.sync.period = { start, end };
        row.sync.result = "running";
        row.sync.diagnosticStatus = "running";
      }
      row.sync.lastError = "";
      row.sync.lastErrorCode = "";
      row.sync.userWarning = "";
    });
    let position = 0;
    let complete = false;
    try {
      requireCapability(device, "users.read");
      for (let guard = 0; guard < 500 && !complete; guard += 1) {
        const page = await userPage(device, position, `u${searchId}`);
        if (!page.done && page.next <= position)
          throw new AccessError("PAGE", "توقفت صفحات المستخدمين دون اكتمال.");
        await updateState((state) => {
          const people = new Map(
            state.people.map((person) => [person.id, person]),
          );
          for (const record of page.records) {
            const id = `${deviceId}:${String(record.employeeNo ?? record.employeeNoString)}`;
            const person = personFromDevice(record, deviceId, people.get(id));
            if (person) people.set(person.id, person);
          }
          state.people = [...people.values()];
        });
        position = page.next;
        complete = page.done;
      }
      if (!complete)
        throw new AccessError(
          "PAGE_LIMIT",
          "تجاوزت قراءة المستخدمين الحد الآمن. النتائج جزئية.",
        );
      await updateState((state) => {
        getDevice(state, deviceId).sync.lastUsersSync = now();
      });
    } catch (error) {
      if (
        usersOnly ||
        (error instanceof AccessError &&
          ["DEVICE_AUTH", "CREDENTIAL_REQUIRED"].includes(error.code))
      )
        throw error;
      await updateState((state) => {
        getDevice(state, deviceId).sync.userWarning =
          "لم تكتمل قراءة الموظفين. يستمر سحب الأحداث، وتبقى أرقام الموظفين الأصلية محفوظة.";
      });
    }
    if (!usersOnly) {
      const pulled = await readAttendance(
        device,
        start,
        end,
        async (events, count, outside) => {
          await updateState((state) => {
            const merged = mergeEvents(state.events, events);
            state.events = merged.events;
            const row = getDevice(state, deviceId);
            row.sync.scanned += count;
            row.sync.valid += events.filter(validVerification).length;
            row.sync.outsidePeriod = (row.sync.outsidePeriod || 0) + outside;
            row.sync.duplicates += merged.duplicates;
            row.sync.pages += 1;
          });
        },
      );
      await updateState((state) => {
        const row = getDevice(state, deviceId);
        row.sync.uniqueVerifications = pulled.diagnostic.uniqueVerifications;
        row.sync.storedInPeriod = state.events.map(localEvent).filter(
          (e) => e.deviceId === deviceId && e.date >= start && e.date <= end,
        ).length;
        row.sync.diagnostic = pulled.diagnostic;
        row.sync.diagnosticStatus = "success";
        row.sync.diagnosticFailure = undefined;
        row.sync.diagnostics = [
          ...(row.sync.diagnostics || []).filter(
            (d) => d.start !== start || d.end !== end,
          ),
          pulled.diagnostic,
        ].slice(-6);
        row.sync.lastAttendanceSync = now();
        row.lastSync = row.sync.lastAttendanceSync;
        row.sync.result = "success";
        const cap = row.capabilities.find((c) => c.feature === "events");
        if (cap) {
          cap.state = "supported";
          cap.reason = "نجحت قراءة بحث AcsEvent المصادق عليه فعلياً.";
        }
      });
    }
    await updateState((state) => {
      const row = getDevice(state, deviceId);
      row.verifiedFeatures = [
        ...new Set([
          ...(row.verifiedFeatures || []),
          ...(row.sync.lastUsersSync ? ["users.read" as const] : []),
          ...(!usersOnly ? ["events" as const] : []),
        ]),
      ];
      row.status = "online";
      row.error = "";
      row.sync.running = false;
      row.sync.failures = 0;
      row.sync.nextRun = row.sync.enabled
        ? new Date(Date.now() + row.sync.intervalSeconds * 1000).toISOString()
        : null;
      audit(
        state,
        actor,
        usersOnly ? "sync.users" : "sync.events",
        deviceId,
        "success",
        `${start} — ${end}`,
      );
    });
  } catch (error) {
    await updateState((state) => {
      const row = getDevice(state, deviceId);
      row.sync.running = false;
      row.sync.failures += 1;
      row.sync.lastError =
        error instanceof AccessError || error instanceof SearchPageError
          ? error.message
          : "تعذر إكمال القراءة؛ النتائج المحفوظة جزئية.";
      row.sync.lastErrorCode =
        error instanceof AccessError || error instanceof SearchPageError
          ? error.code
          : "DEVICE_NETWORK";
      if (!usersOnly) row.sync.result = "failed";
      if (!usersOnly) {
        row.sync.diagnosticStatus = "failed";
        row.sync.diagnosticFailure = {
          at: now(),
          start,
          end,
          code: row.sync.lastErrorCode,
          message: row.sync.lastError,
          attempts: error instanceof AcsEventError ? error.attempts : [],
        };
      }
      row.error = row.sync.lastError;
      if (row.sync.lastErrorCode === "DEVICE_NETWORK") row.status = "offline";
      const authFailed =
        error instanceof AccessError &&
        ["DEVICE_AUTH", "CREDENTIAL_REQUIRED"].includes(error.code);
      if (authFailed) row.sync.enabled = false;
      row.sync.nextRun = row.sync.enabled
        ? new Date(
            Date.now() +
              Math.min(900, 60 * 2 ** Math.min(row.sync.failures, 4)) * 1000,
          ).toISOString()
        : null;
      audit(state, actor, "sync", deviceId, "failed", row.sync.lastError);
    });
    throw error;
  } finally {
    jobs().busy.delete(deviceId);
  }
}
export function ensureScheduler() {
  if (jobs().timer || process.env.SKYLINE_DISABLE_SCHEDULER === "1") return;
  const timer = setInterval(async () => {
    if (jobs().polling) return;
    jobs().polling = true;
    try {
      for (const device of (await readState()).devices.filter(
        (device) =>
          device.sync.enabled &&
          !jobs().busy.has(device.id) &&
          (!device.sync.nextRun ||
            Date.parse(device.sync.nextRun) <= Date.now()),
      )) {
        const actor: Actor = {
          username: "server-sync",
          name: "المزامنة التلقائية",
          role: "operator",
          sessionId: "server",
        };
        const end = today();
        const last = device.sync.lastAttendanceSync?.slice(0, 10) || end;
        const start = addDays(
          last < addDays(end, -29) ? addDays(end, -29) : last,
          -1,
        );
        try {
          await synchronize(actor, device.id, start, end);
        } catch (error) {
          if (
            error instanceof AccessError &&
            ["CREDENTIAL_REQUIRED", "CAPABILITY"].includes(error.code)
          )
            await updateState((state) => {
              const row = getDevice(state, device.id);
              row.sync.enabled = false;
              row.sync.lastError = error.message;
              row.sync.nextRun = null;
            });
        }
      }
    } finally {
      jobs().polling = false;
    }
  }, 10000);
  timer.unref?.();
  jobs().timer = timer;
}
function requireDeviceWrites() {
  if (!deviceWritesEnabled()) throw new AccessError("READ_ONLY", READ_ONLY_MESSAGE);
}
export async function queryCenter(actor: Actor, input: QueryInput) {
  ensureScheduler();
  if (input.action === "snapshot") return { snapshot: await snapshot(actor) };
  const state = await readState();
  if (input.action === "attendance") {
    if (!input.start || !input.end)
      throw new AccessError("DATES", "اختر فترة التقرير.");
    return {
      report: attendanceReport(
        state.events,
        state.people.filter(
          (person) => !input.deviceId || person.deviceId === input.deviceId,
        ),
        state.rules,
        input.start,
        input.end,
      ),
    };
  }
  if (input.action === "events") {
    const events = state.events
      .map(localEvent)
      .filter(
        (event) =>
          (!input.deviceId || event.deviceId === input.deviceId) &&
          (!input.start || event.date >= input.start) &&
          (!input.end || event.date <= input.end) &&
          (!input.category ||
            input.category === "all" ||
            event.category === input.category) &&
          (!input.search ||
            `${event.employeeNo} ${event.name} ${event.originalTimestamp} ${event.serialNo}`.includes(
              input.search,
            )),
      )
      .reverse();
    const page = input.page || 0;
    return {
      eventsPage: {
        rows: events.slice(page * 100, page * 100 + 100),
        total: events.length,
        page,
        complete: (page + 1) * 100 >= events.length,
      },
    };
  }
  if (input.action === "schedule") {
    if (!input.deviceId || !input.templateNo)
      throw new AccessError("SCHEDULE", "اختر الجهاز ورقم القالب.");
    return {
      schedule: await readSchedule(
        getDevice(state, input.deviceId),
        input.templateNo,
      ),
    };
  }
  if (!input.deviceId || !input.employeeNo)
    throw new AccessError("PERSON", "اختر الجهاز والموظف.");
  const device = getDevice(state, input.deviceId);
  getPerson(state, device.id, input.employeeNo);
  if (input.action === "photo") {
    const { personPhoto } = await import("./biometrics.server");
    return { photo: await personPhoto(device, input.employeeNo, input.refresh) };
  }
  if (input.action === "fingerprint") {
    const { fingerprintStatus } = await import("./biometrics.server");
    return { fingerprint: await fingerprintStatus(device, input.employeeNo) };
  }
  const client = await isapi(device);
  if (input.action === "cards") {
    requireCapability(device, "cards.read");
    const response = await client.request(
      "/ISAPI/AccessControl/CardInfo/Search?format=json",
      "POST",
      JSON.stringify({
        CardInfoSearchCond: {
          searchID: randomBytes(12).toString("hex"),
          searchResultPosition: (input.page || 0) * 30,
          maxResults: 30,
          EmployeeNoList: [{ employeeNo: input.employeeNo }],
        },
      }),
    );
    checkResponse(response);
    const body = JSON.parse(response.text).CardInfoSearch;
    if (!body || (!Array.isArray(body.CardInfo) && body.numOfMatches !== 0))
      throw new AccessError("SHAPE", "شكل بيانات الكروت غير معروف.");
    return {
      cards: (body.CardInfo || [])
        .filter(
          (card: Record<string, unknown>) =>
            card.employeeNo === input.employeeNo,
        )
        .map((card: Record<string, unknown>) => ({
          employeeNo: String(card.employeeNo),
          cardNo: String(card.cardNo),
          cardType: String(card.cardType || "normalCard"),
        })),
      cardsMore: body.responseStatusStrg === "MORE",
    };
  }
  const counts: Record<string, number | null> = {
    cards: null,
    fingerprints: null,
    faces: null,
  };
  for (const [name, feature, endpoint, countName] of [
    [
      "cards",
      "cards.read",
      "/ISAPI/AccessControl/CardInfo/Count?format=json",
      "cardNumber",
    ],
    [
      "fingerprints",
      "fingerprints",
      "/ISAPI/AccessControl/FingerPrint/Count?format=json",
      "numberOfFP",
    ],
    [
      "faces",
      "faces",
      "/ISAPI/Intelligent/FDLib/Count?format=json",
      "recordDataNumber",
    ],
  ] as const) {
    if (
      device.capabilities.find((row) => row.feature === feature)?.state !==
      "supported"
    )
      continue;
    // FDLib Count is a library count, not a person count: never attribute it to the selected employee.
    if (name === "faces") continue;
    const response = await client.request(
      `${endpoint}&employeeNo=${encodeURIComponent(input.employeeNo)}`,
    );
    const fields = checkResponse(response);
    const value = Number(field(fields, countName));
    if (Number.isFinite(value)) counts[name] = value;
  }
  return { counts };
}

function checkPersonInput(
  device: Device,
  person: { employeeNo: string; name: string; begin: string; end: string },
) {
  validateDates(person.begin, person.end, 25000);
  if (person.end > "2037-12-31" || person.begin < "1970-01-01")
    throw new AccessError(
      "VALIDITY",
      "فترة الصلاحية خارج حدود ISAPI الموثقة (1970–2037).",
    );
  const fields =
    device.probes.find((probe) =>
      probe.endpoint.includes("UserInfo/capabilities"),
    )?.fields || {};
  const maxId = Number(field(fields, "employeeNo.@max") || 32);
  const maxName = Number(field(fields, "name.@max") || 32);
  if (
    Buffer.byteLength(person.employeeNo) > maxId ||
    Buffer.byteLength(person.name) > maxName
  )
    throw new AccessError(
      "LIMIT",
      "الرقم الوظيفي أو الاسم يتجاوز طول الجهاز بالبايت، بما يشمل الأحرف العربية.",
    );
  const characters = String(field(fields, "characterType") || "");
  if (/number|digit/i.test(characters) && !/^\d+$/.test(person.employeeNo))
    throw new AccessError(
      "EMPLOYEE_NUMBER",
      "الجهاز يقبل رقماً وظيفياً رقمياً فقط.",
    );
}
function userPayload(person: {
  employeeNo: string;
  name: string;
  begin: string;
  end: string;
  permanent: boolean;
  grantDoor?: boolean;
}) {
  return {
    employeeNo: person.employeeNo,
    name: person.name,
    userType: "normal",
    Valid: {
      enable: !person.permanent,
      beginTime: `${person.begin}T00:00:00`,
      endTime: `${person.end}T23:59:59`,
      timeType: "local",
    },
    // Operating guide: door 1 with plan template 1 (all-day) so the person can actually pass.
    ...(person.grantDoor
      ? { doorRight: "1", RightPlan: [{ doorNo: 1, planTemplateNo: "1" }] }
      : {}),
  };
}
const stampMs = (value: unknown) =>
  Date.parse(`${String(value || "").slice(0, 19)}Z`);
/**
 * Compare what the device stored with what was sent. Firmware such as
 * DS-K1A340WX V1.2.7 replaces a begin time that is already in the past with its
 * own current clock (which may be another time zone, e.g. CST+8), so the begin
 * time is accepted when it is not earlier than requested and within 2 days.
 * Returns a list of real mismatches (empty = verified).
 */
export function personMismatches(
  record: Record<string, unknown>,
  person: Parameters<typeof userPayload>[0],
) {
  const expected = userPayload(person);
  const problems: string[] = [];
  const clean = (v: unknown) => String(v ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  if (clean(repairDeviceText(String(record.name ?? ""))) !== clean(person.name))
    problems.push(`الاسم على الجهاز «${clean(record.name)}» بدل «${clean(person.name)}»`);
  const valid = record.Valid as Record<string, unknown> | undefined;
  if (!valid) problems.push("الجهاز لم يُرجع فترة الصلاحية");
  else {
    const enable = valid.enable === true || valid.enable === "true";
    if (enable !== expected.Valid.enable)
      problems.push(enable ? "الجهاز فعّل فترة صلاحية بدل الصلاحية الدائمة" : "الجهاز جعل الصلاحية دائمة");
    if (!person.permanent) {
      const begin = stampMs(valid.beginTime), wantBegin = stampMs(expected.Valid.beginTime);
      if (!Number.isFinite(begin) || begin < wantBegin || begin - wantBegin > 2 * 86400000)
        problems.push(`بداية الصلاحية على الجهاز ${String(valid.beginTime || "—")} بدل ${expected.Valid.beginTime}`);
      if (String(valid.endTime || "").slice(0, 19) !== expected.Valid.endTime)
        problems.push(`نهاية الصلاحية على الجهاز ${String(valid.endTime || "—")} بدل ${expected.Valid.endTime}`);
    }
  }
  if (person.grantDoor) {
    if (!String(record.doorRight || "").split(",").includes("1"))
      problems.push("إذن الباب 1 لم يظهر على الجهاز");
    const plans = Array.isArray(record.RightPlan) ? (record.RightPlan as Record<string, unknown>[]) : [];
    if (!plans.some((p) => String(p.planTemplateNo || "").split(",").includes("1")))
      problems.push("قالب الوقت 1 لم يظهر على الجهاز");
  }
  return problems;
}
function verifyPersonData(
  record: Record<string, unknown>,
  person: Parameters<typeof userPayload>[0],
) {
  const problems = personMismatches(record, person);
  if (problems.length)
    throw new AccessError(
      "READBACK",
      `حُفظ الموظف على الجهاز لكن القراءة لم تطابق: ${problems.join("؛ ")}. لم تتم إعادة الكتابة تلقائياً.`,
    );
}
async function exactPerson(device: Device, employeeNo: string) {
  const client = await isapi(device);
  const response = await client.request(
    "/ISAPI/AccessControl/UserInfo/Search?format=json",
    "POST",
    JSON.stringify({
      UserInfoSearchCond: {
        searchID: randomBytes(12).toString("hex"),
        searchResultPosition: 0,
        maxResults: 1,
        EmployeeNoList: [{ employeeNo }],
      },
    }),
  );
  checkResponse(response);
  const search = JSON.parse(response.text).UserInfoSearch;
  if (!search || (!Array.isArray(search.UserInfo) && search.numOfMatches !== 0))
    throw new AccessError("SHAPE", "تعذر التحقق من المستخدم على الجهاز.");
  return (search.UserInfo || []).find(
    (person: Record<string, unknown>) =>
      String(person.employeeNo) === employeeNo,
  ) as Record<string, unknown> | undefined;
}
async function exactCard(device: Device, cardNo: string) {
  requireCapability(device, "cards.read");
  const client = await isapi(device);
  const response = await client.request(
    "/ISAPI/AccessControl/CardInfo/Search?format=json",
    "POST",
    JSON.stringify({
      CardInfoSearchCond: {
        searchID: randomBytes(12).toString("hex"),
        searchResultPosition: 0,
        maxResults: 30,
        CardNoList: [{ cardNo }],
      },
    }),
  );
  checkResponse(response);
  const search = JSON.parse(response.text).CardInfoSearch;
  if (!search || (!Array.isArray(search.CardInfo) && search.numOfMatches !== 0))
    throw new AccessError("SHAPE", "تعذر التحقق من ملكية الكارت.");
  if (search.responseStatusStrg === "MORE")
    throw new AccessError(
      "CARD_FILTER",
      "لم يثبت الجهاز البحث الدقيق عن الكارت؛ لم يُسمح بحذف محتمل غير صحيح.",
    );
  return (search.CardInfo || []).find(
    (card: Record<string, unknown>) => String(card.cardNo) === cardNo,
  ) as Record<string, unknown> | undefined;
}
function validateOperation(state: AccessState, operation: Operation) {
  const device = getDevice(state, operation.deviceId);
  const features = {
    addPerson: "users.add",
    importPeople: "users.add",
    editPerson: "users.edit",
    disablePerson: "users.edit",
    deletePerson: "users.delete",
    addCard: "cards.add",
    deleteCard: "cards.delete",
    door: "door.control",
    permission: "permissions",
    pin: "pin",
    applyWeek: "schedules",
  } as const;
  requireCapability(device, features[operation.kind]);
  if (operation.kind === "addPerson" || operation.kind === "editPerson")
    checkPersonInput(device, operation.person);
  if (operation.kind === "importPeople") {
    const seen = new Set<string>();
    for (const person of operation.people) {
      checkPersonInput(device, person);
      if (seen.has(person.employeeNo))
        throw new AccessError(
          "DUPLICATE",
          "أرقام موظفين مكررة في ملف الاستيراد.",
        );
      seen.add(person.employeeNo);
    }
  }
  if ("employeeNo" in operation)
    getPerson(state, device.id, operation.employeeNo);
  if (operation.kind === "door") {
    if (
      !device.physicalDoorIds.includes(operation.doorNo) ||
      !device.doorCommands.includes(operation.command)
    )
      throw new AccessError(
        "DOOR",
        "رقم الباب أو الأمر غير مثبت على عتاد الجهاز.",
      );
  }
  if (
    operation.kind === "permission" &&
    operation.doorNos.some((number) => !device.physicalDoorIds.includes(number))
  )
    throw new AccessError("DOOR", "تتضمن الصلاحية باباً غير مثبت على الجهاز.");
  if (operation.kind === "pin" && !device.https)
    throw new AccessError(
      "SECURE_TRANSPORT",
      "تعيين PIN يحتاج HTTPS موثوقاً أو تشفير ISAPI لم يُثبت بعد. لن تُرسل القيمة عبر HTTP.",
    );
  if (operation.kind === "pin") {
    const fields =
      device.probes.find((probe) =>
        probe.endpoint.includes("UserInfo/capabilities"),
      )?.fields || {};
    const max = Number(field(fields, "password.@max"));
    const min = Number(field(fields, "password.@min") || 1);
    if (
      !Number.isInteger(max) ||
      operation.pin.length < min ||
      operation.pin.length > max
    )
      throw new AccessError(
        "PIN_LIMIT",
        "طول PIN خارج الحدود التي أعلنها الجهاز.",
      );
  }
  if (operation.kind === "applyWeek") {
    const plan = state.plans.find(
      (plan) => plan.id === operation.planId && plan.deviceId === device.id,
    );
    if (!plan) throw new AccessError("PLAN", "الخطة المحلية غير موجودة.");
    weekPayload(device, plan);
  }
  return device;
}
export async function prepareOperation(
  actor: Actor,
  raw: Operation,
): Promise<Confirmation> {
  requireRole(actor, "admin");
  requireDeviceWrites();
  const operation = operationSchema.parse(raw);
  const state = await readState();
  const device = validateOperation(state, operation);
  await credential(device.id);
  if (jobs().busy.has(device.id))
    throw new AccessError("BUSY", "انتظر انتهاء عملية الجهاز الحالية.");
  const employee =
    "employeeNo" in operation
      ? operation.employeeNo
      : "person" in operation
        ? operation.person.employeeNo
        : "";
  if (
    operation.kind === "addPerson" &&
    (await exactPerson(device, operation.person.employeeNo))
  )
    throw new AccessError(
      "DUPLICATE",
      "الرقم الوظيفي موجود فعلياً على الجهاز؛ لن تتم الكتابة فوقه.",
    );
  if (
    operation.kind === "editPerson" &&
    !(await exactPerson(device, operation.person.employeeNo))
  )
    throw new AccessError(
      "PERSON",
      "المستخدم لم يظهر في قراءة الجهاز الحالية.",
    );
  if (operation.kind === "addCard" || operation.kind === "deleteCard") {
    const card = await exactCard(device, operation.cardNo);
    if (operation.kind === "addCard" && card)
      throw new AccessError(
        "DUPLICATE",
        "رقم الكارت مستخدم فعلياً؛ لن يتم نقله إلى موظف آخر.",
      );
    if (
      operation.kind === "deleteCard" &&
      (!card || String(card.employeeNo) !== operation.employeeNo)
    )
      throw new AccessError(
        "CARD_OWNER",
        "الكارت غير موجود أو لا يخص الموظف المختار؛ لم يُسمح بالحذف.",
      );
  }
  if (operation.kind === "permission") {
    const schedule = await readSchedule(device, operation.templateNo);
    if (!schedule.template.enable || !schedule.week.enable)
      throw new AccessError(
        "SCHEDULE_DISABLED",
        "القالب أو الجدول الأسبوعي معطل على الجهاز؛ اختر قالباً فعالاً.",
      );
  }
  let scheduleHash: string | undefined;
  const plan =
    operation.kind === "applyWeek"
      ? state.plans.find((plan) => plan.id === operation.planId)!
      : undefined;
  const schedule = plan
    ? await readSchedule(device, plan.templateNo)
    : undefined;
  if (schedule) {
    if (!schedule.template.enable)
      throw new AccessError(
        "SCHEDULE_DISABLED",
        "القالب معطل؛ لا يتم تفعيله ضمن تعديل الجدول.",
      );
    scheduleHash = scheduleDigest(schedule);
  }
  const title = {
    addPerson: "إضافة مستخدم للجهاز",
    editPerson: "تعديل بيانات المستخدم",
    disablePerson: "إنهاء صلاحية المستخدم",
    deletePerson: "حذف المستخدم ووسائله",
    addCard: "ربط كارت بالمستخدم",
    deleteCard: "إلغاء كارت",
    door: "إرسال أمر للباب الفعلي",
    permission: "تغيير صلاحيات المستخدم",
    pin: "تعيين PIN",
    importPeople: "إضافة مجموعة مستخدمين للجهاز",
    applyWeek: "تطبيق جدول أسبوعي على الجهاز",
  }[operation.kind];
  const phrase = plan
    ? `تأكيد جدول القالب ${plan.templateNo}`
    : operation.kind === "door"
      ? `تأكيد الباب ${operation.doorNo}`
      : operation.kind === "importPeople"
        ? `تأكيد ${operation.people.length} مستخدم`
        : `تأكيد المستخدم ${employee}`;
  const warnings = [
    "هذا تغيير حقيقي على جهاز Hikvision. لا يتم إرساله قبل كتابة عبارة التأكيد والضغط على التنفيذ.",
  ];
  if (operation.kind === "door")
    warnings.push(
      `الأمر المطلوب: ${{ open: "فتح لحظي", close: "إغلاق", alwaysOpen: "إبقاء مفتوحاً", alwaysClose: "إبقاء مغلقاً" }[operation.command]} · القناة الفعلية ${operation.doorNo}.`,
    );
  if (operation.kind === "addCard" || operation.kind === "deleteCard")
    warnings.push(
      `رقم الكارت: ${operation.cardNo} · الموظف ${operation.employeeNo}.`,
    );
  if (operation.kind === "permission")
    warnings.push(
      `ستُستبدل أبواب الموظف الحالية (${getPerson(state, device.id, operation.employeeNo).doorRight || "لا توجد"}) بالأبواب: ${operation.doorNos.join(", ")}. قالب الصلاحية: ${operation.templateNo}.`,
    );
  if (operation.kind === "addPerson" || operation.kind === "editPerson")
    warnings.push(
      `المستخدم: ${operation.person.name} · ${operation.person.permanent ? "صلاحية دائمة" : `الصلاحية: ${operation.person.begin} — ${operation.person.end}`}.`,
    );
  if (operation.kind === "deletePerson")
    warnings.push(
      "الحذف يزيل الكروت والبصمات وصور الوجه المرتبطة بالمستخدم؛ السجلات التاريخية في البرنامج ستظل محفوظة.",
    );
  if (
    operation.kind === "door" &&
    ["alwaysOpen", "alwaysClose"].includes(operation.command)
  )
    warnings.push(
      "الأمر يغيّر حالة الباب بشكل مستمر، وقد يغيّر أمان الموقع أو يمنع المرور.",
    );
  if (operation.kind === "disablePerson")
    warnings.push(
      "سيتم جعل فترة الصلاحية منتهية. Valid.enable=false تعني صلاحية دائمة ولا تُستخدم للتعطيل.",
    );
  if (operation.kind === "importPeople")
    warnings.push(
      "قد تنجح بعض الصفوف وتفشل أخرى؛ لا تُعاد محاولات الكتابة تلقائياً، ولن يُستبدل رقم موجود.",
    );
  if (plan && schedule)
    warnings.push(
      `سيُستبدل الجدول الأسبوعي رقم ${schedule.template.weekPlanNo} المرتبط بالقالب ${plan.templateNo}. قد يؤثر على جميع المستخدمين والقوالب التي تشارك هذا الجدول، بما فيها سجلات لم تُسحب. مجموعات العطلات الحالية تظل مرتبطة: ${schedule.template.holidayGroupNo || "لا توجد"}.`,
      ...plan.week.map((row) => `${row.day}: ${row.start} — ${row.end}`),
      "الأيام والفترات غير المحددة تصبح مغلقة. تُحفظ نسخة خاصة قبل الكتابة؛ الاستعادة تحتاج تأكيداً جديداً.",
    );
  const token = randomBytes(32).toString("hex");
  for (const [key, value] of jobs().confirmations)
    if (value.until < Date.now()) jobs().confirmations.delete(key);
  const until = Date.now() + 120000;
  jobs().confirmations.set(token, {
    operation,
    sessionId: actor.sessionId,
    until,
    phrase,
    checkedAt: device.checkedAt!,
    serial: device.serial,
    scheduleHash,
  });
  return {
    token,
    phrase,
    title,
    description: `${device.name} · ${device.host}${employee ? ` · رقم ${employee}` : ""}`,
    warnings,
    expiresAt: new Date(until).toISOString(),
    affected: operation.kind === "importPeople" ? operation.people.length : 1,
  };
}
async function executeOperation(
  actor: Actor,
  operation: Operation,
  device: Device,
  scheduleHash?: string,
) {
  const client = await isapi(device);
  const send = async (
    path: string,
    method: string,
    body: unknown,
    xml = false,
  ) => {
    const response = await client.request(
      path,
      method,
      xml ? String(body) : JSON.stringify(body),
      xml ? "application/xml" : undefined,
    );
    checkResponse(response);
  };
  const upsert = async (employeeNo: string) => {
    const record = await exactPerson(device, employeeNo);
    if (!record)
      throw new AccessError(
        "READBACK",
        "الجهاز قبل الطلب لكن لم تتأكد نتيجة إعادة القراءة. راجع الأحداث قبل المحاولة مجدداً.",
      );
    await updateState((state) => {
      const previous = state.people.find(
        (person) =>
          person.deviceId === device.id && person.employeeNo === employeeNo,
      );
      const person = personFromDevice(record, device.id, previous)!;
      state.people = [
        ...state.people.filter((row) => row.id !== person.id),
        person,
      ];
    });
    return record;
  };
  if (operation.kind === "addPerson" || operation.kind === "editPerson") {
    if (
      operation.kind === "addPerson" &&
      (await exactPerson(device, operation.person.employeeNo))
    )
      throw new AccessError(
        "DUPLICATE",
        "ظهر الرقم على الجهاز بعد المعاينة؛ لم تتم الكتابة فوقه.",
      );
    const path =
      operation.kind === "addPerson"
        ? "/ISAPI/AccessControl/UserInfo/Record?format=json"
        : "/ISAPI/AccessControl/UserInfo/Modify?format=json";
    const payload: Record<string, unknown> = userPayload(operation.person);
    if (operation.kind === "editPerson") delete payload.userType;
    await send(path, operation.kind === "addPerson" ? "POST" : "PUT", {
      UserInfo: payload,
    });
    const record = await upsert(operation.person.employeeNo);
    // Arabic name is app-only; keep it locally next to the English device name.
    const arabicName = operation.person.arabicName?.trim();
    await updateState((state) => {
      const row = state.people.find(
        (p) => p.deviceId === device.id && p.employeeNo === operation.person.employeeNo,
      );
      if (row) row.arabicName = arabicName || (hasArabic(row.arabicName) ? row.arabicName : undefined);
    });
    verifyPersonData(record, operation.person);
  } else if (operation.kind === "importPeople") {
    for (const person of operation.people) {
      if (await exactPerson(device, person.employeeNo))
        throw new AccessError(
          "DUPLICATE",
          `توقف الاستيراد: الرقم ${person.employeeNo} موجود على الجهاز. راجع الصفوف الناجحة في سجل التدقيق.`,
        );
      await send("/ISAPI/AccessControl/UserInfo/Record?format=json", "POST", {
        UserInfo: userPayload(person),
      });
      verifyPersonData(await upsert(person.employeeNo), person);
      await updateState((state) =>
        audit(
          state,
          actor,
          "import.person",
          `${device.id}:${person.employeeNo}`,
          "success",
        ),
      );
    }
  } else if (operation.kind === "disablePerson") {
    await send("/ISAPI/AccessControl/UserInfo/Modify?format=json", "PUT", {
      UserInfo: {
        employeeNo: operation.employeeNo,
        Valid: {
          enable: true,
          beginTime: "2000-01-01T00:00:00",
          endTime: "2000-01-02T00:00:00",
          timeType: "local",
        },
      },
    });
    const record = await upsert(operation.employeeNo);
    if (!(
      record.Valid &&
      typeof record.Valid === "object" &&
      "enable" in record.Valid &&
      record.Valid.enable === true &&
      "endTime" in record.Valid &&
      String(record.Valid.endTime).startsWith("2000-01-02")
    ))
      throw new AccessError(
        "READBACK",
        "لم تتأكد فترة الصلاحية المنتهية بعد الكتابة.",
      );
  } else if (operation.kind === "deletePerson") {
    await send(
      "/ISAPI/AccessControl/UserInfoDetail/Delete?format=json",
      "PUT",
      {
        UserInfoDetail: {
          mode: "byEmployeeNo",
          EmployeeNoList: [{ employeeNo: operation.employeeNo }],
        },
      },
    );
    let remains = true;
    for (let attempt = 0; attempt < 8 && remains; attempt += 1) {
      checkResponse(
        await client.request(
          "/ISAPI/AccessControl/UserInfoDetail/DeleteProcess",
        ),
      );
      remains = Boolean(await exactPerson(device, operation.employeeNo));
      if (remains) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (remains)
      throw new AccessError(
        "READBACK",
        "بدأ الجهاز الحذف ولم يتأكد اكتماله. لا تُعد الطلب تلقائياً.",
      );
    await updateState((state) => {
      state.people = state.people.filter(
        (person) =>
          !(
            person.deviceId === device.id &&
            person.employeeNo === operation.employeeNo
          ),
      );
    });
  } else if (operation.kind === "permission") {
    await send("/ISAPI/AccessControl/UserInfo/Modify?format=json", "PUT", {
      UserInfo: {
        employeeNo: operation.employeeNo,
        doorRight: [...new Set(operation.doorNos)].join(","),
        RightPlan: [...new Set(operation.doorNos)].map((doorNo) => ({
          doorNo,
          planTemplateNo: String(operation.templateNo),
        })),
      },
    });
    const record = await upsert(operation.employeeNo);
    if (String(record.doorRight) !== [...new Set(operation.doorNos)].join(","))
      throw new AccessError(
        "READBACK",
        "لم تتطابق صلاحيات الباب بعد إعادة القراءة.",
      );
    if (
      !Array.isArray(record.RightPlan) ||
      operation.doorNos.some(
        (doorNo) =>
          !(
            record.RightPlan as { doorNo: number; planTemplateNo: string }[]
          ).some(
            (plan) =>
              Number(plan.doorNo) === doorNo &&
              String(plan.planTemplateNo) === String(operation.templateNo),
          ),
      )
    )
      throw new AccessError(
        "READBACK",
        "لم تتأكد أرقام قوالب الصلاحيات بعد إعادة القراءة.",
      );
  } else if (operation.kind === "pin") {
    await send("/ISAPI/AccessControl/UserInfo/Modify?format=json", "PUT", {
      UserInfo: { employeeNo: operation.employeeNo, password: operation.pin },
    });
    // PIN is write-only; intentionally never read, returned or audited.
  } else if (operation.kind === "addCard" || operation.kind === "deleteCard") {
    const before = await exactCard(device, operation.cardNo);
    if (
      (operation.kind === "addCard" && before) ||
      (operation.kind === "deleteCard" &&
        (!before || String(before.employeeNo) !== operation.employeeNo))
    )
      throw new AccessError(
        "CARD_OWNER",
        "تغيرت ملكية الكارت بعد المعاينة؛ لم يُرسل التغيير.",
      );
    if (operation.kind === "addCard")
      await send("/ISAPI/AccessControl/CardInfo/Record?format=json", "POST", {
        CardInfo: {
          employeeNo: operation.employeeNo,
          cardNo: operation.cardNo,
          cardType: "normalCard",
          checkCardNo: true,
          checkEmployeeNo: true,
        },
      });
    else
      await send("/ISAPI/AccessControl/CardInfo/Delete?format=json", "PUT", {
        CardInfoDelCond: { CardNoList: [{ cardNo: operation.cardNo }] },
      });
    const card = await exactCard(device, operation.cardNo);
    const exists = Boolean(
      card && String(card.employeeNo) === operation.employeeNo,
    );
    if (
      (operation.kind === "addCard" && !exists) ||
      (operation.kind === "deleteCard" && exists)
    )
      throw new AccessError(
        "READBACK",
        "الجهاز قبل الطلب ولم تتأكد نتيجة الكارت بعد إعادة القراءة.",
      );
  } else if (operation.kind === "door") {
    await send(
      `/ISAPI/AccessControl/RemoteControl/door/${operation.doorNo}`,
      "PUT",
      `<RemoteControlDoor version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><cmd>${operation.command}</cmd></RemoteControlDoor>`,
      true,
    );
  } else if (operation.kind === "applyWeek") {
    const plan = (await readState()).plans.find(
      (row) => row.id === operation.planId && row.deviceId === device.id,
    );
    if (!plan || !scheduleHash)
      throw new AccessError("PLAN", "معاينة الجدول غير مكتملة.");
    await applyDeviceWeek(device, plan, scheduleHash);
    await updateState((state) => {
      const row = state.plans.find((item) => item.id === plan.id)!;
      row.appliedAt = now();
    });
  }
}
export async function commitOperation(
  actor: Actor,
  token: string,
  phrase: string,
) {
  requireRole(actor, "admin");
  requireDeviceWrites();
  const prepared = jobs().confirmations.get(token);
  if (
    !prepared ||
    prepared.sessionId !== actor.sessionId ||
    prepared.until < Date.now()
  )
    throw new AccessError(
      "CONFIRMATION",
      "انتهى التأكيد أو لا يخص جلسة الدخول الحالية. راجع العملية من جديد.",
    );
  if (prepared.phrase !== phrase.trim())
    throw new AccessError(
      "CONFIRMATION",
      "عبارة التأكيد غير مطابقة؛ لم يُرسل شيء إلى الجهاز.",
    );
  const device = validateOperation(await readState(), prepared.operation);
  if (
    device.checkedAt !== prepared.checkedAt ||
    device.serial !== prepared.serial
  )
    throw new AccessError(
      "STALE",
      "تغير فحص الجهاز منذ المعاينة. أنشئ تأكيداً جديداً.",
    );
  if (jobs().busy.has(device.id))
    throw new AccessError("BUSY", "توجد عملية جارية لهذا الجهاز.");
  jobs().confirmations.delete(token);
  jobs().busy.add(device.id);
  const operation = prepared.operation;
  const target = `${device.id}:${operation.kind === "door" ? `door:${operation.doorNo}:${operation.command}` : operation.kind === "applyWeek" ? `plan:${operation.planId}` : operation.kind === "importPeople" ? `batch:${operation.people.length}` : `employee:${"employeeNo" in operation ? operation.employeeNo : operation.person.employeeNo}${"cardNo" in operation ? `:card:${operation.cardNo}` : ""}`}`;
  try {
    await updateState((state) =>
      audit(
        state,
        actor,
        prepared.operation.kind,
        target,
        "pending",
        "بدأ تنفيذ عملية مؤكدة من المستخدم؛ لا إعادة تلقائية للكتابة.",
      ),
    );
    const client = await isapi(device);
    const identity = checkResponse(
      await client.request("/ISAPI/System/deviceInfo"),
    );
    if (
      !device.serial ||
      String(field(identity, "serialNumber") || "") !== device.serial
    )
      throw new AccessError(
        "IDENTITY",
        "لم تتطابق هوية الجهاز مع المعاينة؛ أوقفت العملية.",
      );
    await executeOperation(
      actor,
      prepared.operation,
      device,
      prepared.scheduleHash,
    );
    const proofFeature = (
      {
        addPerson: "users.add",
        editPerson: "users.edit",
        disablePerson: "users.edit",
        deletePerson: "users.delete",
        addCard: "cards.add",
        deleteCard: "cards.delete",
        permission: "permissions",
        pin: "pin",
        door: "door.control",
        importPeople: "users.add",
        applyWeek: "schedules",
      } as const
    )[prepared.operation.kind];
    await updateState((state) => {
      const row = getDevice(state, device.id);
      row.verifiedFeatures = [
        ...new Set([...(row.verifiedFeatures || []), proofFeature]),
      ];
    });
    await updateState((state) =>
      audit(
        state,
        actor,
        prepared.operation.kind,
        target,
        "success",
        prepared.operation.kind === "door"
          ? "قبل الجهاز الأمر؛ لا يُعد هذا إثباتاً لحركة الباب الميكانيكية."
          : prepared.operation.kind === "pin"
            ? "قبل الجهاز الرقم؛ القيمة سرية ولا يمكن التحقق منها بالقراءة."
            : "قُبل الطلب وأجريت إعادة القراءة المطلوبة.",
      ),
    );
    return {
      notice:
        prepared.operation.kind === "door"
          ? "قبل الجهاز أمر الباب. راجع الحالة الفعلية في الموقع."
          : ["addPerson", "importPeople"].includes(prepared.operation.kind)
            ? "تمت إضافة الموظف وقراءة النتيجة. الخطوة التالية: افتح وسائل التحقق ثم اربطه بباب من الصلاحيات عند الحاجة."
            : "تم تنفيذ العملية المؤكدة وتسجيل نتيجتها. يمكنك مراجعة الحالة وسجل التدقيق.",
    };
  } catch (error) {
    await updateState((state) =>
      audit(
        state,
        actor,
        prepared.operation.kind,
        target,
        "uncertain",
        error instanceof AccessError
          ? error.message
          : "تعذر تأكيد النتيجة. راجع الجهاز قبل أي إعادة للمحاولة.",
      ),
    );
    throw error;
  } finally {
    jobs().busy.delete(device.id);
  }
}
export async function actionCenter(
  actor: Actor,
  input: ActionInput,
): Promise<{
  notice?: string;
  confirmation?: Confirmation;
  deviceId?: string;
}> {
  ensureScheduler();
  if (input.action === "prepare")
    return { confirmation: await prepareOperation(actor, input.operation) };
  if (input.action === "commit")
    return commitOperation(actor, input.token, input.phrase);
  requireRole(
    actor,
    [
      "device.save",
      "connect",
      "sync.schedule",
      "sync.diagnose",
      "account.save",
    ].includes(input.action)
      ? "admin"
      : "operator",
  );
  if (input.action === "fingerprint.enroll") {
    requireRole(actor, "admin");
    const device = getDevice(await readState(), input.deviceId);
    const { enrollFingerprint } = await import("./biometrics.server");
    const result = await withDeviceLock(device.id, () =>
      enrollFingerprint(device, input.employeeNo, input.fingerNo),
    );
    await updateState((state) => {
      const person = state.people.find(
        (p) => p.deviceId === device.id && p.employeeNo === input.employeeNo,
      );
      if (person) person.fingerprintCount = result.count ?? person.fingerprintCount;
      audit(state, actor, "fingerprint.enroll", `${device.id}:${input.employeeNo}`, "success", `بصمات مقروءة: ${result.count}`);
    });
    return { notice: `سُجلت البصمة وأعيدت قراءتها: ${result.count} بصمة للموظف.` };
  }
  if (input.action === "connect" || input.action === "probe") {
    const device = getDevice(await readState(), input.deviceId);
    if (jobs().busy.has(device.id))
      throw new AccessError(
        "BUSY",
        "انتظر انتهاء عملية الجهاز قبل تغيير الاتصال أو إعادة فحصه.",
      );
    jobs().busy.add(device.id);
    const previousSecret = runtime().secrets.get(device.id);
    try {
      if (input.action === "connect")
        runtime().secrets.set(device.id, {
          username: input.username,
          password: input.password,
          until: Date.now() + 8 * 3600000,
        });
      const scanned = await scanDevice(device);
      if (device.serial && scanned.serial !== device.serial)
        throw new AccessError(
          "IDENTITY",
          "تغير الرقم التسلسلي للجهاز في هذا العنوان؛ أُوقف الربط لحماية تاريخ الموظفين والأحداث. يلزم تعريف مستقل ومراجعة المسؤول.",
        );
      if (input.action === "connect")
        await rememberCredential(device.id, input.username, input.password);
      await updateState((state) => {
        state.devices = state.devices.map((row) =>
          row.id === device.id ? scanned : row,
        );
        audit(
          state,
          actor,
          "device.probe",
          device.id,
          "success",
          "قراءة القدرات والساعة فقط؛ لم تتغير إعدادات الجهاز.",
        );
      });
      return { notice: "نجح الاتصال وفحص إمكانيات الجهاز بالقراءة فقط." };
    } catch (error) {
      if (input.action === "connect") {
        if (previousSecret) runtime().secrets.set(device.id, previousSecret);
        else runtime().secrets.delete(device.id);
      }
      await updateState((state) => {
        const row = getDevice(state, device.id);
        row.status = "offline";
        row.error =
          error instanceof AccessError
            ? error.message
            : "تعذر الاتصال بالجهاز. راجع الشبكة وبيانات الدخول.";
        audit(state, actor, "device.probe", device.id, "failed", row.error);
      });
      throw error;
    } finally {
      jobs().busy.delete(device.id);
    }
  }
  if (input.action === "sync.diagnose") {
    validateDates(input.start, input.end);
    const device = getDevice(await readState(), input.deviceId);
    requireEventRead(device);
    await credential(device.id);
    if (jobs().busy.has(device.id))
      throw new AccessError("BUSY", "انتظر انتهاء سحب الجهاز قبل التشخيص.");
    jobs().busy.add(device.id);
    try {
      await updateState((state) => {
        getDevice(state, device.id).sync.diagnosticStatus = "running";
      });
      const { diagnostic } = await readAttendance(
        device,
        input.start,
        input.end,
        undefined,
        true,
      );
      await updateState((state) => {
        const row = getDevice(state, device.id);
        row.sync.diagnostic = diagnostic;
        row.sync.diagnosticStatus = "success";
        row.sync.diagnosticFailure = undefined;
        row.sync.diagnostics = [
          ...(row.sync.diagnostics || []).filter(
            (d) => d.start !== input.start || d.end !== input.end,
          ),
          diagnostic,
        ].slice(-6);
        audit(
          state,
          actor,
          "sync.diagnose",
          device.id,
          "success",
          `${input.start} — ${input.end}; raw=${diagnostic.raw}; verification=${diagnostic.uniqueVerifications}`,
        );
      });
      return {
        notice: diagnostic.uniqueVerifications
          ? "اكتمل تشخيص السحب بالقراءة فقط. راجع الملخص الفني."
          : "اكتمل التشخيص: لا توجد حركات تحقق في الفترة المحددة.",
      };
    } catch (error) {
      await updateState((state) => {
        const row = getDevice(state, device.id);
        row.sync.diagnosticStatus = "failed";
        row.sync.diagnosticFailure = {
          at: now(),
          start: input.start,
          end: input.end,
          code: error instanceof AccessError ? error.code : "SERVER",
          message:
            error instanceof AccessError
              ? error.message
              : "تعذر إكمال التشخيص.",
          attempts: error instanceof AcsEventError ? error.attempts : [],
        };
      });
      await updateState((state) =>
        audit(
          state,
          actor,
          "sync.diagnose",
          device.id,
          "failed",
          error instanceof AccessError
            ? error.message
            : "تعذر إكمال تشخيص القراءة.",
        ),
      );
      throw error;
    } finally {
      jobs().busy.delete(device.id);
    }
  }
  if (input.action === "sync") {
    validateDates(input.start, input.end);
    const device = getDevice(await readState(), input.deviceId);
    if (input.usersOnly) requireCapability(device, "users.read");
    else requireEventRead(device);
    await credential(device.id);
    if (jobs().busy.has(device.id))
      throw new AccessError("BUSY", "المزامنة جارية بالفعل.");
    void synchronize(
      actor,
      device.id,
      input.start,
      input.end,
      input.usersOnly,
    ).catch(() => undefined);
    return {
      notice: "بدأ السحب على الخادم. يمكن متابعة التقدم في لوحة الأجهزة.",
    };
  }
  if (input.action === "sync.schedule" && input.enabled)
    await credential(input.deviceId);
  let savedDeviceId = "";
  await updateState((state) => {
    if (input.action === "device.save") {
      validateDeviceAddress(input.host, input.port);
      if (
        state.devices.some(
          (device) =>
            device.host === input.host &&
            device.port === input.port &&
            device.id !== input.id,
        )
      )
        throw new AccessError("DUPLICATE", "هذا الجهاز مضاف بالفعل.");
      if (input.id) {
        const existing = getDevice(state, input.id);
        if (
          existing.host !== input.host ||
          existing.port !== input.port ||
          existing.https !== input.https
        )
          throw new AccessError(
            "ADDRESS",
            "أضف عنواناً جديداً كجهاز مستقل حتى لا تختلط السجلات التاريخية.",
          );
        existing.name = input.name;
        if (input.location !== undefined) existing.location = input.location;
        savedDeviceId = existing.id;
      } else {
        if (state.devices.length >= 32)
          throw new AccessError("LIMIT", "وصل البرنامج إلى حد 32 جهازاً.");
        savedDeviceId = randomUUID();
        state.devices.push(
          newDevice(
            savedDeviceId,
            input.name,
            input.host,
            input.port,
            input.https,
          ),
        );
        state.devices[state.devices.length - 1].location = input.location || "";
      }
      allowDeviceTarget(input.host, input.port);
    } else if (input.action === "door.save") {
      const device = getDevice(state, input.deviceId);
      requireCapability(device, "doors");
      if (!device.physicalDoorIds.includes(input.channel))
        throw new AccessError(
          "DOOR",
          "لا يمكن تعريف باب لقناة غير مثبتة على الجهاز.",
        );
      if (
        state.doors.some(
          (door) =>
            door.deviceId === input.deviceId &&
            door.channel === input.channel &&
            door.id !== input.id,
        )
      )
        throw new AccessError(
          "DUPLICATE",
          "هذه القناة مرتبطة بباب مسمّى بالفعل.",
        );
      const row = {
        id: input.id || randomUUID(),
        deviceId: input.deviceId,
        channel: input.channel,
        name: input.name,
        location: input.location,
        notes: input.notes,
        state: "غير مقروءة",
        checkedAt: null,
      };
      state.doors = [...state.doors.filter((door) => door.id !== row.id), row];
    } else if (input.action === "person.metadata") {
      const person = state.people.find(
        (person) => person.id === input.personId,
      );
      if (
        !person ||
        !state.rules.shifts.some((shift) => shift.id === input.shiftId)
      )
        throw new AccessError("PERSON", "الموظف أو الوردية غير موجود.");
      person.localEnabled = input.localEnabled;
      person.shiftId = input.shiftId;
    } else if (input.action === "shift.save") {
      state.rules.shifts = [
        ...state.rules.shifts.filter((shift) => shift.id !== input.shift.id),
        input.shift,
      ];
    } else if (input.action === "holiday.save") {
      validateDates(input.date, input.date);
      state.rules.holidays = [
        ...state.rules.holidays.filter(
          (holiday) => holiday.date !== input.date,
        ),
        { date: input.date, name: input.name },
      ];
    } else if (input.action === "leave.save") {
      validateDates(input.start, input.end, 366);
      if (!state.people.some((person) => person.id === input.personId))
        throw new AccessError("PERSON", "الموظف غير موجود.");
      state.rules.leaves.push({
        personId: input.personId,
        start: input.start,
        end: input.end,
        note: input.note,
      });
    } else if (input.action === "plan.save") {
      getDevice(state, input.deviceId);
      if (
        state.plans.some(
          (plan) =>
            plan.deviceId === input.deviceId &&
            plan.templateNo === input.templateNo,
        )
      )
        throw new AccessError("DUPLICATE", "رقم الخطة موجود محلياً.");
      state.plans.push({
        id: randomUUID(),
        name: input.name,
        deviceId: input.deviceId,
        templateNo: input.templateNo,
        week: input.week,
        holidays: input.holidays,
        appliedAt: null,
      });
    } else if (input.action === "review") {
      if (!state.events.some((event) => event.id === input.eventId))
        throw new AccessError("EVENT", "الحدث غير موجود.");
      state.reviews = [
        ...state.reviews.filter((review) => review.eventId !== input.eventId),
        {
          eventId: input.eventId,
          note: input.note,
          actor: actor.username,
          at: now(),
        },
      ];
    } else if (input.action === "sync.schedule") {
      const device = getDevice(state, input.deviceId);
      if (input.enabled) {
        requireEventRead(device);
      }
      device.sync.enabled = input.enabled;
      device.sync.intervalSeconds = input.intervalSeconds;
      device.sync.nextRun = input.enabled
        ? new Date(Date.now() + input.intervalSeconds * 1000).toISOString()
        : null;
    } else if (input.action === "account.save") {
      if (
        actor.username === input.username &&
        (!input.enabled || input.role !== "admin")
      )
        throw new AccessError(
          "ACCOUNT",
          "لا يمكنك تعطيل نفسك أو خفض صلاحيتك من هذه الجلسة.",
        );
      state.accounts = [
        ...state.accounts.filter((row) => row.username !== input.username),
        {
          username: input.username,
          name: input.name,
          role: input.role,
          enabled: input.enabled,
          ...passwordHash(input.password),
        },
      ];
      for (const [token, session] of runtime().sessions)
        if (session.username === input.username)
          runtime().sessions.delete(token);
    }
    audit(
      state,
      actor,
      input.action,
      "deviceId" in input ? input.deviceId : "application",
      "success",
      "إعداد داخل البرنامج؛ لا كتابة على جهاز Hikvision.",
    );
  });
  return {
    notice: "تم الحفظ داخل Speed for Training. لم تُغيّر بيانات الجهاز أو أبوابه.",
    deviceId: savedDeviceId || undefined,
  };
}
