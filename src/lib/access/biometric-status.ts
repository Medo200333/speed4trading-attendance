import type { Device } from "./domain";
export type BioSupport = {
  state:
    "ready" | "needs-login" | "needs-device" | "unsupported" | "needs-check";
  reason: string;
};
export type BioInspection = {
  checkedAt: string;
  deviceId: string;
  employeeNo: string;
  libraries: { FDID: string; faceLibType: string }[];
  facePresent: boolean | null;
  faceCount: number | null;
  upload: BioSupport;
  capture: BioSupport;
  fingerprint: BioSupport;
};
export function noFingerprintHardware(model: string) {
  return /^DS-K1A340W?X(?:\s|$)/i.test(model.trim());
}
export function declaredBiometrics(device: Device) {
  const values = Object.assign(
    {},
    ...device.probes
      .filter((p) => p.http === 200 && p.reason === "OK")
      .map((p) => p.fields),
  );
  const find = (name: string) =>
    Object.entries(values).find(
      ([key]) => key === name || key.endsWith("." + name),
    )?.[1];
  const functions = String(
    find("supportFDFunction") || find("supportFunction") || "",
  ).split(/[,\s]+/);
  const fd = device.probes.find((p) =>
    p.endpoint.includes("/FDLib/capabilities"),
  );
  const fdFunctions = Object.entries(fd?.fields || {})
    .filter(([k]) => /^(?:.*\.)?(?:supportFDFunction|supportFunction)$/.test(k))
    .flatMap(([, v]) => String(v).split(/[,\s]+/));
  return {
    face: find("isSupportFDLib") === true || find("isSupportFDLib") === "true",
    read: fdFunctions.includes("get"),
    add: fdFunctions.includes("post"),
    setUp: fdFunctions.includes("setUp"),
    capture:
      find("isSupportCaptureFace") === true ||
      find("isSupportCaptureFace") === "true",
    infraredCapture:
      find("isSupportCaptureInfraredFace") === true ||
      find("isSupportCaptureInfraredFace") === "true",
    fingerprint:
      !noFingerprintHardware(device.model) &&
      (find("isSupportCaptureFingerPrint") === true ||
        find("isSupportCaptureFingerPrint") === "true"),
    functions,
  };
}
export function initialBioInspection(
  device: Device,
  employeeNo: string,
): BioInspection {
  const declared = declaredBiometrics(device);
  return {
    checkedAt: "",
    deviceId: device.id,
    employeeNo,
    libraries: [],
    facePresent: null,
    faceCount: null,
    upload: {
      state: "needs-check",
      reason:
        "افحص مكتبات الوجه وبيانات هذا الموظف بالقراءة أولاً. لا يعني وجود كاميرا قبول رفع الصور.",
    },
    capture: {
      state: declared.capture ? "needs-check" : "needs-device",
      reason: declared.capture
        ? "الجهاز أعلن دعم جمع الوجه. يلزم فحص مكتبة الحفظ وربط الموظف أولاً."
        : "لم يثبت بدء الالتقاط عن بعد. استخدم خطوات التسجيل على شاشة الجهاز.",
    },
    fingerprint: {
      state: noFingerprintHardware(device.model)
        ? "unsupported"
        : declared.fingerprint
          ? "needs-check"
          : "needs-device",
      reason: noFingerprintHardware(device.model)
        ? "DS-K1A340WX لا يحتوي مستشعر إصبع وفق دليل Hikvision؛ طرازات F هي المزودة به. لا يمكن إضافة المستشعر بالبرمجة."
        : "لم يثبت عقد التسجيل عن بعد لهذا العتاد. سجل من شاشة الجهاز إن كان يحتوي مستشعر إصبع.",
    },
  };
}
