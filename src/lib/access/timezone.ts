// Device clock helpers shared by the server (reading/setting /ISAPI/System/time) and the UI warning.

/** Africa/Cairo offset from UTC in minutes at `at` (DST aware, e.g. 120 in winter, 180 in summer). */
export function cairoOffsetMinutes(at: Date = new Date()): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at).map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute));
  return Math.round((local - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/**
 * Hikvision stores POSIX-style zones where the sign is inverted: "CST-2:00:00" means UTC+2.
 * Returns the UTC offset in minutes, or null when the text is not understood.
 */
export function hikZoneOffsetMinutes(zone: string | undefined | null): number | null {
  const m = /^[A-Za-z]{3,}([+-])(\d{1,2})(?::(\d{2}))?(?::\d{2})?/.exec(String(zone || "").trim());
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3] || 0);
  return m[1] === "-" ? minutes : -minutes;
}

/** Hikvision zone text for an offset in minutes, e.g. 120 → "CST-2:00:00". */
export function hikZoneFor(offsetMinutes: number): string {
  const abs = Math.abs(offsetMinutes);
  return `CST${offsetMinutes >= 0 ? "-" : "+"}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}:00`;
}

/** Warning text when the device zone differs from Egypt's current offset; "" when fine or unknown. */
export function zoneMismatch(zone: string | undefined | null, at: Date = new Date()): string {
  const device = hikZoneOffsetMinutes(zone);
  if (device == null) return "";
  const cairo = cairoOffsetMinutes(at);
  if (device === cairo) return "";
  const fmt = (n: number) => `UTC${n >= 0 ? "+" : "-"}${Math.floor(Math.abs(n) / 60)}${Math.abs(n) % 60 ? `:${String(Math.abs(n) % 60).padStart(2, "0")}` : ""}`;
  return `المنطقة الزمنية للجهاز ${fmt(device)} (${zone}) بينما توقيت مصر الآن ${fmt(cairo)}. ساعات الجهاز وHik-Connect Team هتطلع مزاحة ${Math.abs(device - cairo) / 60} ساعة.`;
}

/** Replace only <timeZone> in a /ISAPI/System/time document (keeps timeMode, drops a stale IANA hint). */
export function withZone(xml: string, zone: string): string {
  if (!/<timeZone>[^<]*<\/timeZone>/.test(xml)) throw new Error("timeZone element missing");
  return xml
    .replace(/<timeZone>[^<]*<\/timeZone>/, `<timeZone>${zone}</timeZone>`)
    .replace(/\s*<IANA>[^<]*<\/IANA>/, "")
    .replace(/\s*<localTime>[^<]*<\/localTime>/, "");
}
