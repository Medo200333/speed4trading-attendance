/** Human, actionable Arabic messages for Hikvision device failures (network + ISAPI status codes). */
const SUB_STATUS: Record<string, string> = {
  notSupport: "الجهاز لا يدعم هذه العملية (الموديل أو الـ Firmware).",
  invalidOperation: "العملية غير مسموحة في حالة الجهاز الحالية.",
  deviceBusy: "الجهاز مشغول بعملية أخرى. انتظر دقيقة ثم أعد المحاولة.",
  badParameters: "قيم الطلب غير مقبولة من الجهاز (راجع رقم الموظف والاسم والتواريخ).",
  badXmlContent: "صيغة الطلب غير مقبولة من الجهاز.",
  badJsonContent: "صيغة الطلب غير مقبولة من الجهاز.",
  invalidContent: "محتوى الطلب غير صالح لهذا الجهاز.",
  employeeNoAlreadyExist: "رقم الموظف موجود بالفعل على الجهاز.",
  employeeNoNotExist: "رقم الموظف غير موجود على الجهاز.",
  cardNoAlreadyExist: "رقم الكارت مستخدم لموظف آخر على الجهاز.",
  cardAlreadyExist: "رقم الكارت مستخدم لموظف آخر على الجهاز.",
  cardNoNotExist: "رقم الكارت غير موجود على الجهاز.",
  userNumberReachedLimit: "وصل الجهاز للحد الأقصى لعدد المستخدمين.",
  cardNumberReachedLimit: "وصل الجهاز للحد الأقصى لعدد الكروت.",
  faceLibraryFull: "مكتبة الوجوه على الجهاز ممتلئة.",
  faceDataModeling: "الجهاز لم يتعرّف على وجه واضح في الصورة. استخدم صورة أمامية واضحة بإضاءة جيدة.",
  modelingFailed: "الجهاز لم يتعرّف على وجه واضح في الصورة. استخدم صورة أمامية واضحة بإضاءة جيدة.",
  pictureSizeTooLarge: "حجم صورة الوجه كبير؛ يجب أن تكون أقل من 200KB.",
  fingerPrintAlreadyExist: "هذه البصمة مسجلة بالفعل.",
  noMemory: "ذاكرة الجهاز ممتلئة.",
  lowPrivilege: "حساب الجهاز لا يملك صلاحية هذه العملية. استخدم حساب admin.",
  needReboot: "الجهاز يحتاج إعادة تشغيل لتطبيق التغيير.",
};
const STATUS: Record<string, string> = {
  "2": "الجهاز مشغول. انتظر ثم أعد المحاولة.",
  "3": "الجهاز غير جاهز حالياً.",
  "4": "الجهاز لا يدعم هذه العملية.",
  "5": "الجهاز يرفض الطلب: صيغة غير صحيحة.",
  "6": "الجهاز يرفض الطلب: قيم غير صالحة.",
  "7": "الجهاز يحتاج إعادة تشغيل.",
};

export function describeIsapiStatus(statusCode: unknown, subStatusCode?: unknown, errorMsg?: unknown) {
  const sub = String(subStatusCode ?? "").trim();
  const base = SUB_STATUS[sub] || STATUS[String(statusCode ?? "").trim()] || "رفض الجهاز الطلب. لم يُسجّل نجاح للعملية.";
  const detail = [sub && `subStatusCode=${sub}`, errorMsg && `errorMsg=${String(errorMsg).slice(0, 80)}`].filter(Boolean).join(" · ");
  return detail ? `${base} (${detail})` : base;
}

export function describeHttpStatus(status: number) {
  if (status === 401) return "اسم المستخدم أو كلمة سر الجهاز غير صحيحة. افتح «إعداد الاتصال» وراجع حساب الجهاز. تكرار المحاولة الخاطئة قد يقفل الحساب مؤقتاً.";
  if (status === 403) return "حساب الجهاز لا يملك صلاحية هذه العملية. استخدم حساب admin على الجهاز.";
  if (status === 404) return "الجهاز لا يدعم هذه الخاصية (المسار غير موجود في الـ Firmware).";
  if (status === 503) return "الجهاز مشغول أو يعيد التشغيل. انتظر دقيقة ثم أعد المحاولة.";
  return `لم يقبل الجهاز الطلب (HTTP ${status}).`;
}

export function describeNetworkError(error: unknown) {
  const text = `${(error as { code?: string })?.code || ""} ${(error as { cause?: { code?: string } })?.cause?.code || ""} ${error instanceof Error ? error.message : String(error)}`;
  if (/ETIMEDOUT|timeout|timed out|AbortError|aborted/i.test(text))
    return { code: "DEVICE_TIMEOUT", message: "انتهت مهلة الاتصال بالجهاز. الجهاز بطيء أو الشبكة/Tailscale ضعيفة. تأكد أن الجهاز يعمل ثم أعد المحاولة." };
  if (/ECONNREFUSED/i.test(text))
    return { code: "DEVICE_OFFLINE", message: "الجهاز رفض الاتصال: البورت غلط أو خدمة ISAPI/HTTP مقفولة على الجهاز." };
  if (/EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN/i.test(text))
    return { code: "DEVICE_OFFLINE", message: "الجهاز غير متصل أو العنوان غير صحيح. تأكد من الكهرباء والشبكة ومسار Tailscale للفرع." };
  if (/ECONNRESET|socket hang up|EPIPE/i.test(text))
    return { code: "DEVICE_NETWORK", message: "انقطع الاتصال بالجهاز أثناء العملية. راجع النتيجة قبل إعادة المحاولة." };
  if (/certificate|SSL|TLS/i.test(text))
    return { code: "DEVICE_TLS", message: "مشكلة في شهادة HTTPS للجهاز. جرّب HTTP أو راجع إعداد HTTPS على الجهاز." };
  return { code: "DEVICE_NETWORK", message: "تعذر الوصول إلى الجهاز أو انتهت مهلة القراءة. تحقق من الشبكة ثم أعد المحاولة." };
}
