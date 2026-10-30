import type { Device, Capability } from "./domain";
export function capabilityPresentation(cap: Capability, device: Device) {
  if ([401, 403].includes(cap.http || 0))
    return {
      kind: "requires",
      label: "تحتاج حساباً أو صلاحية إضافية",
      reason:
        "لم تنجح القراءة بهذا الحساب؛ راجع مصادقة الجهاز وصلاحياته قبل استنتاج عدم الدعم.",
    };
  if (cap.state === "unsupported")
    return {
      kind: "unsupported",
      label: "غير مدعومة في الفحص الحالي",
      reason: cap.reason,
    };
  if (
    (cap.feature === "pin" && !device.https) ||
    ["faces", "fingerprint.capture"].includes(cap.feature)
  )
    return {
      kind: "requires",
      label: "تحتاج تجهيزاً أو تحققاً إضافياً",
      reason:
        cap.feature === "pin"
          ? "تحتاج HTTPS موثوقاً أو تشفير ISAPI مثبتاً."
          : "تحتاج مكتبة/قارئ وعقد تسجيل ونقلاً آمناً مثبتين؛ التسجيل من المتصفح غير مفعل.",
    };
  if (
    cap.state === "supported" &&
    device.verifiedFeatures?.includes(cap.feature)
  )
    return {
      kind: "tested",
      label: "مدعومة ومختبرة بالقراءة أو التنفيذ",
      reason:
        "نجحت العملية على عنوان هذا الجهاز؛ راجع آخر قراءة وسجل التدقيق. لا يثبت قبول أمر الباب حركة القفل.",
    };
  return {
    kind: "documented",
    label: "موثقة؛ التنفيذ غير مختبر",
    reason:
      cap.state === "supported"
        ? "الجهاز أعلن القدرة، ولم يُسجل نجاح تنفيذ هذه الوظيفة بعد."
        : "لم يُنفّذ فحص مصادق عليه يثبت دعم هذا الجهاز. " + cap.reason,
  };
}
