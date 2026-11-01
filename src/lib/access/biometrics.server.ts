import { deviceWritesEnabled, READ_ONLY_MESSAGE } from "./device-writes";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  readState,
  updateState,
  runtime,
  requireRole,
  AccessError,
  type Actor,
} from "./store.server";
import { withDeviceLock } from "./service.server";
import {
  isapi,
  checkResponse,
  field,
  flattened,
  capabilityMatrix,
} from "./isapi.server";
import {
  declaredBiometrics,
  initialBioInspection,
  type BioInspection,
} from "./biometric-status";
import { validateFaceJpeg } from "./face-image";
import type { Device } from "./domain";
type Client = Awaited<ReturnType<typeof isapi>>;
type FaceRecord = { exists: boolean; proof: string; modeled: boolean };
type Inspection = BioInspection & { mode: string };
type Pending = {
  actor: string;
  until: number;
  deviceId: string;
  employeeNo: string;
  serial: string;
  source: "phone" | "terminal";
  photo?: Uint8Array;
  library: { FDID: string; faceLibType: string };
  before: FaceRecord;
  replace: boolean;
  infrared: boolean;
  phrase: string;
};
type Job = {
  settled?: boolean;
  actor: string;
  deviceId: string;
  employeeNo: string;
  phase: "running" | "verified" | "failed" | "uncertain" | "stopped";
  message: string;
  progress: number;
  stop: boolean;
};
type BioRuntime = { pending: Map<string, Pending>; jobs: Map<string, Job> };
const globals = globalThis as typeof globalThis & {
  __skylineBio?: WeakMap<object, BioRuntime>;
};
function memory() {
  globals.__skylineBio ??= new WeakMap();
  const owner = runtime();
  let m = globals.__skylineBio.get(owner);
  if (!m) {
    m = { pending: new Map(), jobs: new Map() };
    globals.__skylineBio.set(owner, m);
  }
  return m;
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
function json(text: string) {
  try {
    return object(JSON.parse(text));
  } catch {
    throw new AccessError(
      "BIO_PROTOCOL",
      "رد الجهاز لا يطابق عقد ISAPI للوجه. لم يُعتبر نجاحاً أو قائمة فارغة.",
    );
  }
}
async function deviceFor(id: string) {
  const device = (await readState()).devices.find((d) => d.id === id);
  if (!device) throw new AccessError("DEVICE", "اختر جهازاً مسجلاً.");
  return device;
}
async function log(
  actor: Actor,
  action: string,
  deviceId: string,
  employeeNo: string,
  result: "pending" | "success" | "failed" | "uncertain",
  detail: string,
) {
  await updateState((s) =>
    s.audit.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      actor: actor.username,
      role: actor.role,
      action,
      target: `${deviceId}:${employeeNo}`,
      result,
      detail,
    }),
  );
}
async function identity(client: Client, device: Device) {
  const fields = checkResponse(
    await client.request("/ISAPI/System/deviceInfo"),
  );
  if (!device.serial || String(field(fields, "serialNumber")) !== device.serial)
    throw new AccessError("IDENTITY", "تغيرت هوية الجهاز؛ أُوقفت عملية الوجه.");
}
async function person(client: Client, employeeNo: string) {
  const response = await client.request(
    "/ISAPI/AccessControl/UserInfo/Search?format=json",
    "POST",
    JSON.stringify({
      UserInfoSearchCond: {
        searchID: randomBytes(8).toString("hex"),
        searchResultPosition: 0,
        maxResults: 1,
        EmployeeNoList: [{ employeeNo }],
      },
    }),
  );
  checkResponse(response);
  const body = object(json(response.text).UserInfoSearch);
  const rows = Array.isArray(body.UserInfo) ? body.UserInfo : [];
  const record = rows
    .map(object)
    .find((r) => String(r.employeeNo) === employeeNo);
  if (!record)
    throw new AccessError(
      "PERSON",
      "لم يظهر الموظف برقم مطابق على الجهاز. اقرأ الموظفين أولاً.",
    );
  return record;
}
async function faceRecord(
  client: Client,
  library: { FDID: string; faceLibType: string },
  employeeNo: string,
): Promise<FaceRecord> {
  const response = await client.request(
    "/ISAPI/Intelligent/FDLib/FDSearch?format=json",
    "POST",
    JSON.stringify({
      searchResultPosition: 0,
      maxResults: 1,
      ...library,
      FPID: employeeNo,
    }),
  );
  checkResponse(response);
  const root = json(response.text),
    body = Object.keys(object(root.FDSearch)).length
      ? object(root.FDSearch)
      : root;
  const count = Number(body.numOfMatches),
    total = Number(body.totalMatches);
  if (
    !Number.isInteger(count) ||
    !Number.isInteger(total) ||
    count < 0 ||
    total < 0 ||
    count > 1 ||
    total > 1 ||
    count !== total
  )
    throw new AccessError(
      "BIO_PROTOCOL",
      "لم يثبت بحث الوجه أنه يخص رقماً واحداً؛ أوقفت العملية لحماية الموظفين.",
    );
  if (
    count === 0 &&
    (!body.MatchList ||
      (Array.isArray(body.MatchList) && body.MatchList.length === 0))
  )
    return { exists: false, proof: "", modeled: false };
  if (!Array.isArray(body.MatchList) || body.MatchList.length !== count)
    throw new AccessError("BIO_PROTOCOL", "قائمة صور الوجه غير معروفة.");
  const row = object(body.MatchList[0]);
  if (
    String(row.FPID) !== employeeNo ||
    (row.FDID !== undefined && String(row.FDID) !== library.FDID)
  )
    throw new AccessError(
      "BIO_BINDING",
      "أعاد الجهاز وجهاً لا يخص الموظف أو المكتبة المحددين. لم تتم الكتابة.",
    );
  // Proof is memory-only; no URL, model/template or image is returned or logged.
  const proof = createHash("sha256")
    .update(
      // faceURL carries a per-request "@WEB<counter>" suffix on some firmware; strip it so
      // two reads of the same face give the same proof (otherwise every replace is STALE).
      JSON.stringify([
        row.rowKey,
        row.modelData,
        typeof row.faceURL === "string" ? row.faceURL.replace(/@.*$/, "") : row.faceURL,
        row.isInLibrary,
      ]),
    )
    .digest("hex");
  // Some firmware (e.g. DS-K1A340WX V1.2.7) omits isInLibrary; a non-empty modelData then proves modeling.
  const modeled =
    row.isInLibrary === undefined
      ? typeof row.modelData === "string" && row.modelData.length > 0
      : row.isInLibrary === "yes";
  return { exists: true, proof, modeled };
}
async function inspect(
  client: Client,
  device: Device,
  employeeNo: string,
): Promise<Inspection> {
  await identity(client, device);
  await person(client, employeeNo);
  const fresh = structuredClone(device);
  for (const endpoint of [
    "/ISAPI/AccessControl/capabilities",
    "/ISAPI/Intelligent/FDLib/capabilities?format=json",
  ]) {
    const response = await client.request(endpoint);
    checkResponse(response);
    fresh.probes = [
      ...fresh.probes.filter((p) => p.endpoint !== endpoint),
      {
        endpoint,
        http: response.status,
        reason: "OK",
        checkedAt: new Date().toISOString(),
        fields: flattened(response.text),
      },
    ];
  }
  const result: Inspection = {
    ...initialBioInspection(fresh, employeeNo),
    mode: "unknown",
  };
  await updateState((state) => {
    const target = state.devices.find((d) => d.id === device.id);
    if (target) {
      target.probes = fresh.probes;
      target.capabilities = capabilityMatrix(
        fresh.probes,
        target.physicalDoorIds,
      );
    }
  });
  result.checkedAt = new Date().toISOString();
  const support = declaredBiometrics(fresh);
  if (!support.face || !support.read) {
    result.upload = {
      state: "unsupported",
      reason:
        "الجهاز لم يعلن دعم إدارة وبحث صور الوجه. التسجيل اليدوي على شاشة الجهاز يبقى الخيار المتاح.",
    };
    result.capture = {
      state: "needs-device",
      reason: "لا يمكن تأكيد حفظ الوجه من البرنامج دون دعم قراءة مكتبة الوجه.",
    };
    return result;
  }
  const libraries = await client.request(
    "/ISAPI/Intelligent/FDLib?format=json",
  );
  checkResponse(libraries);
  const root = json(libraries.text);
  const list = Array.isArray(root.FDLib)
    ? root.FDLib
    : Array.isArray(object(root.FDLibList).FDLib)
      ? object(root.FDLibList).FDLib
      : [];
  result.libraries = (list as unknown[])
    .map(object)
    .filter(
      (r) =>
        /^[A-Za-z0-9_-]{1,63}$/.test(String(r.FDID)) &&
        ["blackFD", "infraredFD"].includes(String(r.faceLibType)),
    )
    .map((r) => ({ FDID: String(r.FDID), faceLibType: String(r.faceLibType) }));
  const visible = result.libraries.find((l) => l.faceLibType === "blackFD");
  if (!visible) {
    result.upload = {
      state: "needs-device",
      reason:
        "لا توجد مكتبة وجه مرئية مثبتة. أنشئ المستخدم/المكتبة من أداة الجهاز المعتمدة؛ البرنامج لا ينشئ مكتبة تلقائياً.",
    };
    return result;
  }
  const record = await faceRecord(client, visible, employeeNo);
  result.facePresent = record.exists;
  result.faceCount = record.exists ? 1 : 0;
  const mode = await client.request(
    "/ISAPI/AccessControl/FaceRecognizeMode?format=json",
  );
  if (mode.status === 200)
    result.mode = String(field(checkResponse(mode), "mode") || "unknown");
  const canUpload = record.exists ? support.setUp : support.add;
  result.upload = canUpload
    ? {
        state: "ready",
        reason: record.exists
          ? "وجه مسجل بالفعل. الاستبدال يحتاج تأكيداً مستقلاً وإعادة تحقق."
          : "جاهز لرفع JPEG بعد المعاينة وتأكيد المسؤول.",
      }
    : {
        state: "unsupported",
        reason: "لم يعلن الجهاز عملية إضافة/تحديث الصورة المطلوبة.",
      };
  if (result.mode === "deepMode")
    result.upload = {
      state: "needs-device",
      reason:
        "وضع التعرف العميق يحتاج وجهاً بالأشعة تحت الحمراء من الجهاز؛ صورة الهاتف المرئية وحدها لا تكفي للتعرف.",
    };
  if (
    result.mode === "unknown" &&
    result.libraries.some((l) => l.faceLibType === "infraredFD")
  )
    result.upload = {
      state: "needs-device",
      reason:
        "لم تثبت وضعية التعرف المرئي/الأشعة تحت الحمراء. راجعها على الجهاز قبل رفع صورة هاتف.",
    };
  result.capture =
    support.capture && canUpload
      ? {
          state: "ready",
          reason:
            "أعلن الجهاز دعم جمع الوجه. سيلتقط الصورة أولاً ثم يسجلها لنفس رقم الموظف بعد تأكيدك.",
        }
      : {
          state: "needs-device",
          reason:
            "لم يثبت بدء جمع الوجه وحفظه عن بعد. استخدم خطوات شاشة الجهاز.",
        };
  if (
    result.mode === "deepMode" &&
    !result.libraries.some((l) => l.faceLibType === "infraredFD")
  )
    result.capture = {
      state: "needs-device",
      reason: "وضع الأشعة تحت الحمراء يحتاج مكتبة مثبتة لم تُقرأ من الجهاز.",
    };
  if (result.mode === "deepMode" && !support.infraredCapture)
    result.capture = {
      state: "needs-device",
      reason:
        "لم يعلن الجهاز دعم التقاط الأشعة تحت الحمراء اللازمة للوضع العميق.",
    };
  if (result.mode === "deepMode") {
    const ir = result.libraries.find((l) => l.faceLibType === "infraredFD");
    if (ir) {
      const found = await faceRecord(client, ir, employeeNo);
      result.facePresent = record.exists || found.exists;
      result.faceCount = result.facePresent ? 1 : 0;
    }
  }
  if (
    result.mode === "unknown" &&
    result.libraries.some((l) => l.faceLibType === "infraredFD")
  )
    result.capture = {
      state: "needs-device",
      reason:
        "لم تثبت وضعية التعرف اللازمة لاختيار مكتبة حفظ الالتقاط. راجع شاشة الجهاز.",
    };
  return result;
}
export async function inspectBiometrics(
  actor: Actor,
  deviceId: string,
  employeeNo: string,
) {
  requireRole(actor, "operator");
  return withDeviceLock(deviceId, async () => {
    try {
      const d = await deviceFor(deviceId);
      const result = await inspect(await isapi(d), d, employeeNo);
      await log(
        actor,
        "biometric.inspect",
        deviceId,
        employeeNo,
        "success",
        "قراءة قدرات ومكتبات ووجود الوجه فقط؛ لا حفظ لصور أو قوالب.",
      );
      return result;
    } catch (error) {
      await log(
        actor,
        "biometric.inspect",
        deviceId,
        employeeNo,
        "failed",
        error instanceof AccessError ? error.message : "تعذرت القراءة.",
      );
      throw error;
    }
  });
}
function dispose(token: string) {
  const entry = memory().pending.get(token);
  entry?.photo?.fill(0);
  memory().pending.delete(token);
}
export async function prepareBiometric(
  actor: Actor,
  input: {
    deviceId: string;
    employeeNo: string;
    source: "phone" | "terminal";
    photo?: string;
    replaceExisting: boolean;
  },
) {
  if (!deviceWritesEnabled()) throw new AccessError("READ_ONLY", READ_ONLY_MESSAGE);
  requireRole(actor, "admin");
  return withDeviceLock(input.deviceId, async () => {
    for (const [token, p] of memory().pending)
      if (p.until < Date.now() || p.actor === actor.sessionId) dispose(token);
    const device = await deviceFor(input.deviceId),
      client = await isapi(device),
      status = await inspect(client, device, input.employeeNo);
    const permission =
      input.source === "phone" ? status.upload : status.capture;
    if (permission.state !== "ready")
      throw new AccessError("BIO_CAPABILITY", permission.reason);
    const infrared = input.source === "terminal" && status.mode === "deepMode";
    const library = status.libraries.find(
      (l) => l.faceLibType === (infrared ? "infraredFD" : "blackFD"),
    );
    if (!library)
      throw new AccessError("BIO_LIBRARY", "لم تثبت مكتبة الصورة المطلوبة.");
    const before = await faceRecord(client, library, input.employeeNo);
    if (before.exists && !input.replaceExisting)
      throw new AccessError(
        "FACE_EXISTS",
        "يوجد وجه مسجل. وافق صراحة على استبداله قبل المتابعة.",
      );
    let photo: Uint8Array | undefined;
    if (input.source === "phone") {
      if (
        !input.photo ||
        input.photo.length > 280000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(input.photo)
      )
        throw new AccessError("PHOTO", "بيانات الصورة غير صالحة.");
      photo = Buffer.from(input.photo, "base64");
      if (Buffer.from(photo).toString("base64") !== input.photo)
        throw new AccessError("PHOTO", "ترميز الصورة غير صالح.");
      try {
        validateFaceJpeg(photo);
      } catch (error) {
        throw new AccessError(
          "PHOTO",
          error instanceof Error ? error.message : "صورة غير صالحة.",
        );
      }
    }
    if (memory().pending.size >= 16)
      throw new AccessError(
        "BUSY",
        "عدد معاينات التسجيل كبير. انتظر انتهاء المعاينات الحالية.",
      );
    const token = randomBytes(32).toString("hex"),
      phrase = `تسجيل الوجه ${input.employeeNo}`;
    memory().pending.set(token, {
      actor: actor.sessionId,
      until: Date.now() + 120000,
      deviceId: device.id,
      employeeNo: input.employeeNo,
      serial: device.serial,
      source: input.source,
      photo,
      library,
      before,
      replace: input.replaceExisting,
      infrared,
      phrase,
    });
    setTimeout(() => dispose(token), 120000).unref?.();
    await log(
      actor,
      "face.prepare",
      device.id,
      input.employeeNo,
      "success",
      "معاينة خاصة مؤقتة في الذاكرة؛ لم يُرسل وجه أو أمر التقاط للجهاز.",
    );
    return {
      token,
      phrase,
      employeeNo: input.employeeNo,
      deviceName: device.name,
      source: input.source,
      replacing: before.exists,
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    };
  });
}
export async function cancelBiometric(actor: Actor, token: string) {
  requireRole(actor, "admin");
  const pending = memory().pending.get(token);
  if (pending?.actor === actor.sessionId) {
    dispose(token);
    await log(
      actor,
      "face.cancel-preview",
      pending.deviceId,
      pending.employeeNo,
      "success",
      "أُلغي التأكيد وحُذفت الصورة المؤقتة من الذاكرة؛ لم يُرسل أمر للجهاز.",
    );
  }
  return { cancelled: true };
}
function extractPhoto(response: { bytes: Uint8Array; contentType: string }) {
  const bytes = Buffer.from(response.bytes);
  if (/image\/jpeg/i.test(response.contentType)) return new Uint8Array(bytes);
  if (/multipart\//i.test(response.contentType)) {
    const boundary = /boundary\s*=\s*"?([^";\s]+)/i.exec(
      response.contentType,
    )?.[1];
    if (!boundary)
      throw new AccessError(
        "CAPTURE_FORMAT",
        "رد الالتقاط متعدد الأجزاء بلا حدود صالحة.",
      );
    const marker = Buffer.from("--" + boundary);
    let pos = bytes.indexOf(marker);
    while (pos >= 0) {
      const head = bytes.indexOf(Buffer.from("\r\n\r\n"), pos),
        next = bytes.indexOf(marker, pos + marker.length);
      if (head < 0 || next < 0) break;
      if (
        head - pos < 16384 &&
        /content-type:\s*image\/jpeg/i.test(
          bytes.subarray(pos, head).toString("ascii"),
        )
      )
        return new Uint8Array(bytes.subarray(head + 4, next - 2));
      pos = next;
    }
  }
  return null;
}
async function capture(client: Client, infrared: boolean, job: Job) {
  let response = await client.request(
    "/ISAPI/AccessControl/CaptureFaceData",
    "POST",
    `<CaptureFaceDataCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><captureInfrared>${infrared}</captureInfrared><dataType>binary</dataType></CaptureFaceDataCond>`,
    "application/xml",
    true,
  );
  for (let count = 0; count < 60; count++) {
    if (job.stop)
      throw new AccessError(
        "CAPTURE_STOPPED",
        "توقفت المتابعة في البرنامج فقط؛ لا يوجد أمر إلغاء مثبت للجهاز. راجع شاشته قبل المحاولة من جديد.",
      );
    checkResponse(response);
    const photo = extractPhoto(response);
    if (photo) return photo;
    const fields = flattened(Buffer.from(response.bytes).toString("utf8"));
    job.progress = Math.max(
      0,
      Math.min(99, Number(field(fields, "captureProgress")) || 0),
    );
    const over = field(fields, "isCurRequestOver");
    if ((over === true || over === "true") && job.progress < 100)
      throw new AccessError(
        "CAPTURE_FAILED",
        "أنهى الجهاز الالتقاط دون صورة صالحة. أعد الوقوف أمام الكاميرا ثم حاول بتأكيد جديد.",
      );
    if (job.progress >= 99)
      throw new AccessError(
        "CAPTURE_FORMAT",
        "اكتمل الجمع لكن الجهاز لم يُرجع JPEG يمكن التحقق منه. لم يُسجل وجه.",
      );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    response = await client.request(
      "/ISAPI/AccessControl/CaptureFaceData/Progress",
      "GET",
      undefined,
      undefined,
      true,
    );
  }
  throw new AccessError(
    "CAPTURE_TIMEOUT",
    "انتهت مهلة متابعة الالتقاط؛ لم يُؤكد تسجيل وجه. راجع شاشة الجهاز.",
  );
}
function faceForm(pending: Pending, photo: Uint8Array) {
  const form = new FormData();
  form.append(
    "FaceDataRecord",
    new Blob(
      [JSON.stringify({ ...pending.library, FPID: pending.employeeNo })],
      { type: "application/json" },
    ),
    "metadata.json",
  );
  form.append(
    "FaceImage",
    new Blob([new Uint8Array(photo)], { type: "image/jpeg" }),
    "face.jpg",
  );
  return form;
}
function deviceFaceError(response: { status: number; text: string }) {
  if (response.status === 401 || response.status === 403) return null;
  const fields = flattened(response.text);
  const code = field(fields, "statusCode");
  const failed =
    response.status < 200 ||
    response.status >= 300 ||
    (code != null && !["0", "1"].includes(String(code)));
  if (!failed) return null;
  const sub = String(field(fields, "subStatusCode") || "");
  const detail = `${sub} ${String(field(fields, "errorMsg") || "")} ${String(field(fields, "statusString") || "")}`;
  if (/AlreadyExist|alreadyExist|faceExist|FPIDExist/i.test(detail))
    return { code: "FACE_EXISTS", sub };
  if (
    /SubpicAnalysisModelingError|faceQuality|faceDetection|faceNum|modelingFailed|modelFail|noFace|pic|picture|image|resolution/i.test(
      detail,
    )
  )
    return { code: "FACE_QUALITY", sub };
  if (/employeeNo|userNotExist|personNotExist|noUser/i.test(detail))
    return { code: "PERSON", sub };
  if (/FDID|faceLib|libNotExist/i.test(detail))
    return { code: "BIO_LIBRARY", sub };
  if (/full|maxNum|exceed|capacity/i.test(detail))
    return { code: "FACE_FULL", sub };
  return { code: "DEVICE_REJECTED", sub };
}
const faceErrorText: Record<string, string> = {
  FACE_QUALITY:
    "جودة صورة الوجه مش مقبولة عند الجهاز (مفيش وش واضح أو المقاس غلط). صوّر تاني بإضاءة كويسة والوش في نص الصورة وقريب.",
  PERSON: "الجهاز مش لاقي الشخص ده. احفظ بيانات الشخص على الجهاز الأول وبعدين ضيف الوش.",
  BIO_LIBRARY: "مكتبة الوجوه على الجهاز مش موجودة أو اتغيرت. اعمل فحص للجهاز تاني.",
  FACE_FULL: "ذاكرة الوجوه على الجهاز مليانة. امسح وجوه مش مستخدمة الأول.",
  FACE_EXISTS: "الشخص ده عنده وش متسجل بالفعل على الجهاز. اختار استبدال الوش.",
};
function throwFaceError(error: { code: string; sub: string }) {
  throw new AccessError(
    error.code,
    faceErrorText[error.code] ||
      `رفض الجهاز حفظ الوش${error.sub ? ` (${error.sub})` : ""}. جرّب تاني أو راجع إعدادات الجهاز.`,
  );
}
async function saveFace(client: Client, pending: Pending, photo: Uint8Array) {
  validateFaceJpeg(photo);
  // Fresh authenticated round-trip so the multipart body is sent with a valid digest nonce.
  await client.request("/ISAPI/System/deviceInfo");
  const upload = (setUp: boolean) =>
    client.request(
      setUp
        ? "/ISAPI/Intelligent/FDLib/FDSetUp?format=json"
        : "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
      setUp ? "PUT" : "POST",
      faceForm(pending, photo),
    );
  let response = await upload(pending.before.exists);
  let problem = deviceFaceError(response);
  if (problem?.code === "FACE_EXISTS" && !pending.before.exists) {
    // Device already holds a face for this FPID: replace it instead of failing.
    response = await upload(true);
    problem = deviceFaceError(response);
  }
  if (problem) throwFaceError(problem);
  checkResponse(response);
  const body = json(response.text),
    returned = body.FPID;
  if (returned !== undefined && String(returned) !== pending.employeeNo)
    throw new AccessError(
      "BIO_BINDING",
      "قبل الجهاز الرد برقم وجه لا يطابق الموظف. راجع الجهاز؛ لم يُؤكد النجاح.",
    );
  let after = await faceRecord(client, pending.library, pending.employeeNo);
  let reReadPerson = await person(client, pending.employeeNo);
  for (let retry = 0; retry < 8; retry++) {
    const count = reReadPerson.numOfFace;
    const countOk = count === undefined ||
      (Number.isFinite(Number(count)) && Number(count) >= 1);
    if (after.exists && after.modeled && countOk) break;
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    after = await faceRecord(client, pending.library, pending.employeeNo);
    reReadPerson = await person(client, pending.employeeNo);
  }
  if (
    reReadPerson.numOfFace !== undefined &&
    (!Number.isFinite(Number(reReadPerson.numOfFace)) ||
      Number(reReadPerson.numOfFace) < 1)
  )
    throw new AccessError(
      "BIO_READBACK",
      "ظهر سجل في المكتبة لكن قراءة المستخدم لم تثبت وجود وجه مرتبط به. النتيجة غير مؤكدة.",
    );
  if (!after.exists || !after.modeled)
    throw new AccessError(
      "BIO_READBACK",
      "قُبل الإرسال لكن إعادة القراءة لم تثبت حفظ وجه صالح للموظف. لا تُعد العملية مكتملة.",
    );
  if (pending.before.exists && after.proof === pending.before.proof)
    throw new AccessError(
      "BIO_UNCHANGED",
      "أعاد الجهاز سجل الوجه السابق دون دليل تغير مقروء. نتيجة الاستبدال غير مؤكدة؛ راجع شاشة الجهاز قبل أي إعادة إرسال.",
    );
}
export async function commitBiometric(
  actor: Actor,
  token: string,
  phrase: string,
) {
  if (!deviceWritesEnabled()) throw new AccessError("READ_ONLY", READ_ONLY_MESSAGE);
  requireRole(actor, "admin");
  const p = memory().pending.get(token);
  if (
    !p ||
    p.actor !== actor.sessionId ||
    p.until < Date.now() ||
    phrase.trim() !== p.phrase
  )
    throw new AccessError(
      "CONFIRMATION",
      "التأكيد انتهى (أكتر من دقيقتين) أو مش مطابق أو اتعمل من جلسة تانية. ما اتبعتش حاجة للجهاز. دوس \"معاينة\" تاني وأكد على طول.",
    );
  const device = await deviceFor(p.deviceId);
  if (device.serial !== p.serial)
    throw new AccessError("IDENTITY", "تغيرت هوية الجهاز منذ المعاينة.");
  const jobId = randomBytes(24).toString("hex");
  const job: Job = {
    actor: actor.sessionId,
    deviceId: p.deviceId,
    employeeNo: p.employeeNo,
    phase: "running",
    message:
      p.source === "terminal"
        ? "قف أمام كاميرا الجهاز وانظر مباشرة إليها واتبع تعليمات الشاشة."
        : "جارٍ إرسال الصورة ثم إعادة قراءة سجل الوجه.",
    progress: 0,
    stop: false,
  };
  // Acquire the shared device lock before consuming the confirmation.
  const work = withDeviceLock(device.id, async () => {
    if(memory().pending.get(token)!==p||p.until<Date.now())throw new AccessError('CONFIRMATION','التأكيد انتهى أو اتستخدم قبل كده. ما اتبعتش حاجة للجهاز. دوس "معاينة" تاني.');
    memory().pending.delete(token);
    let wrote = false;
    try {
      const client = await isapi(device);
      await identity(client, device);
      await person(client, p.employeeNo);
      const current = await faceRecord(client, p.library, p.employeeNo);
      if (
        current.exists !== p.before.exists ||
        current.proof !== p.before.proof
      )
        throw new AccessError(
          "STALE",
          "تغير سجل الوجه بعد المعاينة. أنشئ تأكيداً جديداً.",
        );
      await log(
        actor,
        "face.enroll",
        device.id,
        p.employeeNo,
        "pending",
        p.source === "terminal"
          ? "تأكيد بدء الالتقاط وحفظ الوجه من كاميرا الجهاز."
          : "تأكيد تسجيل صورة الهاتف للموظف المحدد.",
      );
      memory().jobs.set(jobId, job);
      if (job.stop)
        throw new AccessError(
          "CAPTURE_STOPPED",
          "توقفت المتابعة قبل بدء الالتقاط.",
        );
      const photo = p.photo || (await capture(client, p.infrared, job));
      try {
        if (job.stop)
          throw new AccessError(
            "CAPTURE_STOPPED",
            "توقفت المتابعة قبل إرسال الصورة.",
          );
        try {
          validateFaceJpeg(photo);
        } catch (error) {
          throw new AccessError(
            "PHOTO",
            error instanceof Error ? error.message : "الصورة غير صالحة.",
          );
        }
        job.message = "التُقطت الصورة. جارٍ حفظها والتحقق من ربطها بالموظف.";
        wrote = true;
        await saveFace(client, p, photo);
      } finally {
        photo.fill(0);
      }
      job.phase = "verified";
      job.progress = 100;
      job.message =
        "اكتمل وتحققنا منه: أعاد الجهاز وجه الموظف بالرقم الصحيح وحالة معالجة ناجحة.";
      await updateState((s) => {
        const target = s.people.find(
          (r) => r.deviceId === p.deviceId && r.employeeNo === p.employeeNo,
        );
        if (target) {
          target.faceCount = 1;
          target.updatedAt = new Date().toISOString();
        }
      });
      // Refresh the cached avatar from the device (best effort, never fails the enrollment).
      await personPhoto(device, p.employeeNo, true).catch(() => null);
      await log(
        actor,
        "face.enroll",
        device.id,
        p.employeeNo,
        "success",
        "قبل الجهاز العملية وأُعيد بحث FPID المطابق بحالة isInLibrary=yes؛ تُحفظ صورة مصغّرة للعرض فقط في مجلد بيانات الشركة.",
      );
    } catch (error) {
      const uncertain =
        wrote &&
        !(
          error instanceof AccessError &&
          ["FACE_QUALITY", "FACE_EXISTS", "FACE_FULL", "PERSON", "BIO_LIBRARY", "DEVICE_REJECTED", "DEVICE_AUTH", "DEVICE_FORBIDDEN"].includes(
            error.code,
          )
        );
      job.phase = uncertain ? "uncertain" : "failed";
      job.message =
        error instanceof AccessError
          ? error.message
          : "فشلت معالجة الصورة أو قراءة النتيجة؛ لا تعاود الإرسال قبل مراجعة الجهاز.";
      memory().jobs.set(jobId, job);
      await log(
        actor,
        "face.enroll",
        device.id,
        p.employeeNo,
        uncertain ? "uncertain" : "failed",
        job.message,
      );
    } finally {
      p.photo?.fill(0);
    }
  });
  // The task records failures safely; no error response or binary data is logged.
  void work
    .catch((error) => {
      job.phase = "failed";
      job.message =
        error instanceof AccessError ? error.message : "تعذرت العملية.";
      memory().jobs.set(jobId, job);
    })
    .finally(() => {
      job.settled = true;
    });
  if (!memory().jobs.has(jobId)) memory().jobs.set(jobId, job);
  setTimeout(() => memory().jobs.delete(jobId), 600000).unref?.();
  return { jobId };
}
export function biometricJob(actor: Actor, jobId: string, stop = false) {
  requireRole(actor, "admin");
  const job = memory().jobs.get(jobId);
  if (!job || job.actor !== actor.sessionId)
    throw new AccessError("BIO_JOB", "جلسة التسجيل غير موجودة أو لا تخصك.");
  if (stop && job.phase === "running") job.stop = true;
  if (!job.settled && job.phase !== "running")
    return {
      phase: "running" as const,
      message: "جارٍ إنهاء التحقق وحفظ التدقيق قبل إتاحة عملية أخرى.",
      progress: 99,
    };
  return { phase: job.phase, message: job.message, progress: job.progress };
}
export async function stopBiometric(actor: Actor, jobId: string) {
  const result = biometricJob(actor, jobId, true),
    job = memory().jobs.get(jobId)!;
  await log(
    actor,
    "face.stop-monitoring",
    job.deviceId,
    job.employeeNo,
    "success",
    "إيقاف المتابعة محلياً فقط؛ لا يوجد أمر إلغاء مثبت أُرسل للجهاز.",
  );
  return result;
}

/**
 * Employee avatar: read faceURL from the device face library (FDSearch by FPID),
 * fetch the picture from the saved device host and cache it in the company data
 * folder (photos/). Returns a data URL or null when the employee has no face.
 */
export async function personPhoto(
  device: Device,
  employeeNo: string,
  refresh = false,
): Promise<string | null> {
  const { mkdir, readFile, writeFile, stat, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { companyDirectory } = await import("./tenant-context.server");
  const folder = join(companyDirectory(), "photos");
  const key = createHash("sha256").update(`${device.id}|${employeeNo}`).digest("hex").slice(0, 32);
  const file = join(folder, `${key}.jpg`), none = join(folder, `${key}.none`);
  const day = 86400000;
  if (!refresh) {
    const hit = await stat(file).catch(() => null);
    const imported = await stat(join(folder, `${key}.orig.jpg`)).catch(() => null);
    if (hit && (imported || Date.now() - hit.mtimeMs < 7 * day))
      return `data:image/jpeg;base64,${(await readFile(file)).toString("base64")}`;
    const miss = await stat(none).catch(() => null);
    if (miss && Date.now() - miss.mtimeMs < 3600000) return null;
  }
  const client = await isapi(device);
  const libraries = await client.request("/ISAPI/Intelligent/FDLib?format=json");
  checkResponse(libraries);
  const root = json(libraries.text);
  const list = (Array.isArray(root.FDLib) ? root.FDLib : Array.isArray(object(root.FDLibList).FDLib) ? object(root.FDLibList).FDLib : []) as unknown[];
  const library = list.map(object).find((r) => String(r.faceLibType) === "blackFD");
  await mkdir(folder, { recursive: true });
  const miss = async () => { await rm(file, { force: true }); await writeFile(none, ""); return null; };
  if (!library) return miss();
  const response = await client.request(
    "/ISAPI/Intelligent/FDLib/FDSearch?format=json",
    "POST",
    JSON.stringify({ searchResultPosition: 0, maxResults: 1, FDID: String(library.FDID), faceLibType: "blackFD", FPID: employeeNo }),
  );
  checkResponse(response);
  const body = json(response.text), search = Object.keys(object(body.FDSearch)).length ? object(body.FDSearch) : body;
  const row = Array.isArray(search.MatchList) ? object(search.MatchList[0]) : {};
  if (String(row.FPID ?? "") !== employeeNo || typeof row.faceURL !== "string" || !row.faceURL) return miss();
  const picture = await client.picture(row.faceURL);
  const bytes = Buffer.from(picture.bytes);
  if (picture.status !== 200 || bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return miss();
  await writeFile(file, bytes);
  await rm(none, { force: true });
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

/** Fingerprint support/count for one employee, from the device (read only). */
export async function fingerprintStatus(device: Device, employeeNo: string) {
  const client = await isapi(device);
  const caps = await client.request("/ISAPI/AccessControl/FingerPrintCfg/capabilities?format=json");
  const supported = caps.status === 200 && !/notSupport/i.test(caps.text);
  const users = await client.request("/ISAPI/AccessControl/UserInfo/Search?format=json", "POST",
    JSON.stringify({ UserInfoSearchCond: { searchID: randomBytes(12).toString("hex"), searchResultPosition: 0, maxResults: 1, EmployeeNoList: [{ employeeNo }] } }));
  checkResponse(users);
  const record = ((object(json(users.text).UserInfoSearch).UserInfo as unknown[]) || []).map(object).find((r) => String(r.employeeNo) === employeeNo);
  if (!record) throw new AccessError("PERSON", "لم يظهر الموظف برقم مطابق على الجهاز. اقرأ الموظفين أولاً.");
  let count: number | null = Number.isFinite(Number(record.numOfFP)) ? Number(record.numOfFP) : null;
  if (supported && count == null) {
    const list = await client.request("/ISAPI/AccessControl/FingerPrintUpload?format=json", "POST",
      JSON.stringify({ FingerPrintCond: { searchID: randomBytes(12).toString("hex"), employeeNo, cardReaderNo: 1 } }));
    if (list.status === 200) {
      const info = object(json(list.text).FingerPrintInfo);
      count = Array.isArray(info.FingerPrintList) ? info.FingerPrintList.length : /NoFP/i.test(String(info.status)) ? 0 : null;
    }
  }
  const model = device.model || "الجهاز";
  return {
    supported,
    count,
    reason: supported
      ? "الجهاز يدعم تسجيل البصمة عن بُعد: اضغط التقاط، ثم ضع إصبع الموظف على حساس الجهاز."
      : `${model} لا يدعم البصمة (FingerPrintCfg غير مدعوم؛ طرازات WX وجه/كلمة مرور فقط). استخدم الوجه، أو سجّل الإصبع من شاشة جهاز يدعمه: القائمة ← المستخدمون ← رقم الموظف ${employeeNo} ← إصبع، ثم اضغط إعادة القراءة هنا.`,
  };
}

/** Remote capture + download of one finger (Hikvision CaptureFingerPrint → FingerPrintDownload → FingerPrintProgress). */
export async function enrollFingerprint(device: Device, employeeNo: string, fingerNo: number) {
  if (!deviceWritesEnabled()) throw new AccessError("READ_ONLY", READ_ONLY_MESSAGE);
  const status = await fingerprintStatus(device, employeeNo);
  if (!status.supported) throw new AccessError("CAPABILITY", status.reason);
  const client = await isapi(device);
  const capture = await client.request("/ISAPI/AccessControl/CaptureFingerPrint", "POST",
    `<?xml version="1.0" encoding="UTF-8"?><CaptureFingerPrintCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><fingerNo>${fingerNo}</fingerNo></CaptureFingerPrintCond>`,
    "application/xml");
  if (/captureTimeout/i.test(capture.text))
    throw new AccessError("FP_CAPTURE_TIMEOUT", "انتهت مهلة التقاط البصمة: لم يُوضع إصبع على حساس الجهاز. اضغط إضافة بصمة مرة أخرى وضع الإصبع فوراً.");
  checkResponse(capture);
  const fingerData = /<fingerData>([^<]+)<\/fingerData>/.exec(capture.text)?.[1];
  if (!fingerData) throw new AccessError("FP_CAPTURE", "لم يلتقط الجهاز البصمة. ضع الإصبع على الحساس عند ظهور الطلب وأعد المحاولة.");
  const download = await client.request("/ISAPI/AccessControl/FingerPrintDownload?format=json", "POST",
    JSON.stringify({ FingerPrintCfg: { employeeNo, enableCardReader: [1], fingerPrintID: fingerNo, fingerType: "normalFP", fingerData } }));
  checkResponse(download);
  for (let i = 0; i < 15; i += 1) {
    const progress = await client.request("/ISAPI/AccessControl/FingerPrintProgress?format=json");
    if (progress.status === 200) {
      const st = object(json(progress.text).FingerPrintStatus);
      if (Number(st.totalStatus) === 1) {
        const row = Array.isArray(st.StatusList) ? object(st.StatusList[0]) : {};
        if (row.cardReaderRecvStatus !== undefined && Number(row.cardReaderRecvStatus) !== 1)
          throw new AccessError("FP_REJECTED", `رفض الجهاز البصمة (الحالة ${String(row.cardReaderRecvStatus)}${row.errorMsg ? `: ${String(row.errorMsg)}` : ""}).`);
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const after = await fingerprintStatus(device, employeeNo);
  if (!after.count) throw new AccessError("BIO_READBACK", "أرسل الجهاز البصمة لكن إعادة القراءة لم تُظهر بصمة للموظف.");
  return after;
}

/** Delete one finger (or all) of one employee: PUT FingerPrint/Delete → poll DeleteProcess → read back. */
export async function deleteFingerprints(device: Device, employeeNo: string, fingerNo?: number) {
  if (!deviceWritesEnabled()) throw new AccessError("READ_ONLY", READ_ONLY_MESSAGE);
  const status = await fingerprintStatus(device, employeeNo);
  if (!status.supported) throw new AccessError("CAPABILITY", status.reason);
  const client = await isapi(device);
  const detail: Record<string, unknown> = { employeeNo };
  if (fingerNo) detail.fingerPrintID = [fingerNo];
  const response = await client.request("/ISAPI/AccessControl/FingerPrint/Delete?format=json", "PUT",
    JSON.stringify({ FingerPrintDelete: { mode: "byEmployeeNo", EmployeeNoDetail: detail } }));
  if (response.status === 401 || response.status === 404)
    throw new AccessError("CAPABILITY", "الجهاز لا يدعم حذف البصمات عن بُعد (FingerPrint/Delete). احذفها من شاشة الجهاز.");
  checkResponse(response);
  for (let i = 0; i < 15; i += 1) {
    const progress = await client.request("/ISAPI/AccessControl/FingerPrint/DeleteProcess?format=json");
    if (progress.status !== 200) break;
    const st = String(object(json(progress.text).FingerPrintDeleteProcess).status ?? "");
    if (/success/i.test(st)) break;
    if (/fail/i.test(st)) throw new AccessError("FP_DELETE", "رفض الجهاز حذف البصمة.");
    await new Promise((r) => setTimeout(r, 1000));
  }
  const after = await fingerprintStatus(device, employeeNo);
  if (!fingerNo && after.count) throw new AccessError("BIO_READBACK", `ما زالت ${after.count} بصمة مسجلة بعد الحذف.`);
  return after;
}

const photoKey = (deviceId: string, employeeNo: string) =>
  createHash("sha256").update(`${deviceId}|${employeeNo}`).digest("hex").slice(0, 32);
async function photoFolder() {
  const { join } = await import("node:path");
  const { companyDirectory } = await import("./tenant-context.server");
  return join(companyDirectory(), "photos");
}
const isJpeg = (b: Buffer) => b.length > 100 && b[0] === 0xff && b[1] === 0xd8;
const matchRows = (text: string) => {
  const body = json(text), search = Object.keys(object(body.FDSearch)).length ? object(body.FDSearch) : body;
  return {
    rows: (Array.isArray(search.MatchList) ? search.MatchList : []).map(object),
    more: String(search.responseStatusStrg ?? "").toUpperCase() === "MORE",
    total: Number(search.totalMatches ?? search.numOfMatches ?? 0),
  };
};

/**
 * "استيراد صور الموظفين من الجهاز": READ-ONLY on the device. Lists the face libraries
 * (GET FDLib), pages FDSearch over each blackFD library to map FPID -> faceURL,
 * falls back to FDSearch by FPID=employeeNo, then downloads each picture from the
 * saved device host (digest auth, @WEB counter kept, retried without it). Saves the
 * original as photos/<key>.orig.jpg and returns it so the browser can save a thumbnail.
 */
export async function importDevicePhotos(actor: Actor, deviceId: string, employeeNos: string[]) {
  requireRole(actor, "operator");
  const device = await deviceFor(deviceId);
  const wanted = [...new Set(employeeNos)].filter((n) => /^[\w-]{1,32}$/.test(n)).slice(0, 20);
  return withDeviceLock(deviceId, async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const folder = await photoFolder();
    await mkdir(folder, { recursive: true });
    const client = await isapi(device);
    const libs = await client.request("/ISAPI/Intelligent/FDLib?format=json");
    checkResponse(libs);
    const root = json(libs.text);
    const list = (Array.isArray(root.FDLib) ? root.FDLib : Array.isArray(object(root.FDLibList).FDLib) ? object(root.FDLibList).FDLib : []) as unknown[];
    let libraries = list.map(object).filter((r) => String(r.faceLibType ?? "blackFD") === "blackFD" && r.FDID != null).map((r) => String(r.FDID));
    if (!libraries.length) libraries = ["1"];
    const search = (body: Record<string, unknown>) =>
      client.request("/ISAPI/Intelligent/FDLib/FDSearch?format=json", "POST", JSON.stringify(body));
    // The faceURL "@WEB<counter>" points at a temporary slot that the next FDSearch overwrites,
    // so search one employee (FPID) and download its picture immediately, before the next search.
    const faceUrl = async (employeeNo: string) => {
      for (const FDID of libraries) {
        const res = await search({ searchResultPosition: 0, maxResults: 1, faceLibType: "blackFD", FDID, FPID: employeeNo });
        if (res.status >= 400) continue;
        const row = matchRows(res.text).rows[0];
        if (row && String(row.FPID ?? "") === employeeNo && typeof row.faceURL === "string" && row.faceURL) return row.faceURL;
      }
      return "";
    };
    // Faces enrolled directly ON the terminal keep only the face template: FDSearch returns a
    // faceURL but the file is 404. Fallback (read-only): the newest access-event capture
    // (AcsEvent pictureURL) of that employee, labeled source "event".
    const eventPicture = async (employeeNo: string): Promise<Buffer | null> => {
      const res = await client.request("/ISAPI/AccessControl/AcsEvent?format=json", "POST", JSON.stringify({
        AcsEventCond: { searchID: `p${Date.now()}`, searchResultPosition: 0, maxResults: 30, major: 0, minor: 0, employeeNoString: employeeNo, timeReverseOrder: true },
      }));
      if (res.status >= 400) return null;
      const info = object(json(res.text).AcsEvent).InfoList;
      const rows = (Array.isArray(info) ? info : []).map(object)
        .filter((r) => String(r.employeeNoString ?? r.employeeNo ?? "") === employeeNo && typeof r.pictureURL === "string" && r.pictureURL)
        .sort((a, b) => String(b.time ?? "").localeCompare(String(a.time ?? "")));
      for (const r of rows.slice(0, 5)) {
        const pic = await client.picture(String(r.pictureURL));
        const b = Buffer.from(pic.bytes);
        if (pic.status === 200 && isJpeg(b) && b.length <= 2_000_000) return b;
      }
      return null;
    };
    const results: { employeeNo: string; status: "imported" | "missing" | "failed"; photo?: string; source?: "face" | "event" }[] = [];
    for (const employeeNo of wanted) {
      try {
        let bytes: Buffer | null = null, found = false;
        for (let attempt = 0; attempt < 2 && !bytes; attempt++) {
          const url = await faceUrl(employeeNo);
          if (!url) break;
          found = true;
          const pic = await client.picture(url);
          const b = Buffer.from(pic.bytes);
          if (pic.status === 200 && isJpeg(b) && b.length <= 2_000_000) bytes = b;
        }
        let source: "face" | "event" = "face";
        if (!bytes) { bytes = await eventPicture(employeeNo).catch(() => null); source = "event"; }
        if (!bytes) { results.push({ employeeNo, status: found ? "failed" : "missing" }); continue; }
        await writeFile(join(folder, `${photoKey(device.id, employeeNo)}.orig.jpg`), bytes);
        results.push({ employeeNo, status: "imported", source, photo: `data:image/jpeg;base64,${bytes.toString("base64")}` });
      } catch {
        results.push({ employeeNo, status: "failed" });
      }
    }
    return { results, libraries: libraries.length };
  });
}

/** Save the browser-made thumbnail for an imported photo (local data only, nothing sent to the device). */
export async function savePhotoThumb(actor: Actor, deviceId: string, employeeNo: string, thumb: string) {
  requireRole(actor, "operator");
  const device = await deviceFor(deviceId);
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(thumb);
  const bytes = m ? Buffer.from(m[1], "base64") : Buffer.alloc(0);
  if (!isJpeg(bytes) || bytes.length > 200_000) throw new AccessError("PHOTO", "صورة مصغرة غير صالحة.");
  const { writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const folder = await photoFolder(), key = photoKey(device.id, employeeNo);
  await writeFile(join(folder, `${key}.jpg`), bytes);
  await rm(join(folder, `${key}.none`), { force: true });
  return { saved: true };
}
