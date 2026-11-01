/**
 * Device read-only mode. Writes to Hikvision devices (people, cards, permissions,
 * schedules, doors, faces, fingerprints) are OFF unless SPEED_DEVICE_WRITES=1.
 * Reading people, attendance and photo import are never affected.
 */
export function deviceWritesEnabled(env: Record<string, string | undefined> = process.env) {
  return ["1", "true", "yes"].includes(String(env.SPEED_DEVICE_WRITES || "").trim().toLowerCase());
}

export const READ_ONLY_MESSAGE =
  "البرنامج في وضع القراءة فقط: التعديل على أجهزة البصمة (إضافة/تعديل/حذف مستخدمين أو كروت، فتح الأبواب، الوجوه والبصمات) مقفول.";
