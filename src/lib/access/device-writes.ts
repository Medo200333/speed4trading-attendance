/**
 * Device management (writes to Hikvision devices: people, cards, faces,
 * fingerprints, schedules, doors) is ENABLED by default for admin accounts.
 * Every write still needs a confirmation phrase and is written to the audit log.
 * Set SPEED_DEVICE_WRITES=0 (or false/no/off) to lock the program to read-only.
 * Accountant accounts are always read-only regardless of this switch.
 */
export function deviceWritesEnabled(env: Record<string, string | undefined> = process.env) {
  return !["0", "false", "no", "off"].includes(String(env.SPEED_DEVICE_WRITES ?? "").trim().toLowerCase());
}

export const READ_ONLY_MESSAGE =
  "البرنامج مقفول على وضع القراءة فقط (SPEED_DEVICE_WRITES=0): التعديل على أجهزة البصمة مقفول.";
