import { createHash, randomBytes } from "node:crypto";
import {
  eventPage,
  eventSearchContext,
  basicEventProbes,
  AcsEventError,
} from "./isapi.server";
import { eventTimeBounds, SearchPageError } from "./search-page";
import {
  mergeEvents,
  type Device,
  type RawEvent,
  type PullDiagnostic,
} from "./domain";
import { AccessError } from "./store.server";

export const validVerification = (e: RawEvent) =>
  e.category === "verification" && e.validTime && Boolean(e.employeeNo);
export async function readAttendance(
  device: Device,
  start: string,
  end: string,
  onPage?: (
    events: RawEvent[],
    count: number,
    outside: number,
  ) => Promise<void>,
  diagnose = false,
) {
  const searchID = `e${randomBytes(12).toString("hex")}`;
  const fingerprints = new Set<string>();
  const diagnostic: PullDiagnostic = {
    at: new Date().toISOString(),
    start,
    end,
    bounds: eventTimeBounds(start, end),
    raw: 0,
    inPeriod: 0,
    outsidePeriod: 0,
    verifications: 0,
    uniqueEvents: 0,
    uniqueVerifications: 0,
    duplicateEvents: 0,
    categories: {},
    codes: {},
    offsets: [],
    years: [],
    earliest: "",
    latest: "",
    pages: [],
  };
  let position = 0,
    events: RawEvent[] = [];
  let expectedTotal: number | undefined;
  const context = await eventSearchContext(device);
  try {
    if (diagnose) await basicEventProbes(device, context);
    for (let guard = 0; guard < 500; guard++) {
      const page = await eventPage(
        device,
        start,
        end,
        position,
        searchID,
        context,
      );
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(page.records))
        .digest("hex");
      if (page.meta.count && fingerprints.has(fingerprint))
        throw new SearchPageError();
      fingerprints.add(fingerprint);
      if (expectedTotal !== undefined && page.meta.total !== expectedTotal)
        throw new AccessError(
          "SEARCH_CHANGED",
          "تغير عدد نتائج البحث أثناء السحب؛ أعد السحب لإكمال النتائج بأمان.",
        );
      expectedTotal = page.meta.total;
      diagnostic.raw += page.meta.count;
      diagnostic.inPeriod += page.events.length;
      diagnostic.outsidePeriod += page.outsidePeriod;
      diagnostic.pages.push({
        position,
        count: page.meta.count,
        total: page.meta.total,
        status: page.meta.status,
        format: page.meta.format,
      });
      for (const event of page.events) {
        diagnostic.categories[event.category] =
          (diagnostic.categories[event.category] || 0) + 1;
        const code = `${event.major}/${event.minor}`;
        diagnostic.codes[code] = (diagnostic.codes[code] || 0) + 1;
        if (validVerification(event)) diagnostic.verifications++;
      }
      const merged = mergeEvents(events, page.events);
      events = merged.events;
      diagnostic.duplicateEvents += merged.duplicates;
      await onPage?.(page.events, page.meta.count, page.outsidePeriod);
      position = page.next;
      if (page.done) {
        diagnostic.attempts = context.attempts;
        diagnostic.scope = page.scope;
        if (page.scope === "major5")
          diagnostic.warning =
            "الجهاز قبل مسار التوافق major=5 فقط؛ عدادات هذه القراءة لا تشمل أحداث النظام والإنذار من الفئات الأخرى.";
        if (page.unfiltered)
          diagnostic.warning =
            (diagnostic.warning ? diagnostic.warning + " " : "") +
            "رفض الجهاز الفلاتر الزمنية وقبل البحث دونها؛ قُرئت صفحات البحث كاملة ثم صُفّيت بتاريخ الحدث الأصلي داخل الخادم.";
        diagnostic.uniqueEvents = events.length;
        diagnostic.uniqueVerifications =
          events.filter(validVerification).length;
        diagnostic.offsets = [
          ...new Set(events.map((e) => e.originalOffset)),
        ].sort();
        diagnostic.years = [
          ...new Set(events.map((e) => e.date.slice(0, 4))),
        ].sort();
        const stamps = events
          .filter((e) => e.validTime)
          .map((e) => e.originalTimestamp)
          .sort();
        diagnostic.earliest = stamps[0] || "";
        diagnostic.latest = stamps.at(-1) || "";
        return { events, diagnostic };
      }
    }
    throw new AccessError(
      "PAGE_LIMIT",
      "تجاوزت قراءة الأحداث الحد الآمن. النتائج جزئية.",
    );
  } catch (error) {
    if (error instanceof SearchPageError)
      throw new AcsEventError(error.code, error.message, context.attempts);
    throw error;
  }
}
