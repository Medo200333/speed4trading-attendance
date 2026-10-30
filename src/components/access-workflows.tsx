import {AttendancePull} from "./attendance-pull";
import {BRAND} from "@/lib/brand";
import { useEffect, useState } from "react";
import { DeviceSchedulePanel } from "./access-schedule";
import { InlineDeviceConnection } from "./inline-device-connection";
import { useInlineOperation } from "./inline-operation";
import { EmployeeBiometrics } from "./employee-biometrics";
import { buildXlsx } from "@/lib/xlsx-io";
import { DailyReportCard } from "./daily-report-card";
import { profileFrom, reportFileName, reportSheetHeader } from "@/lib/company-profile";
import { safeCsv } from "@/lib/access/import";
import {
  addDays,
  diagnosePermission,
  type AttendanceRow,
  type RawEvent,
} from "@/lib/access/domain";
import {
  useCenter,
  Button,
  Badge,
  Card,
  TableScroll,
  Field,
  Empty,
  DevicePicker,
  PersonPicker,
  supported,
  unavailable,
  canOperate,
  dateToday,
  downloadFile,
  When,
  PersonAvatar,
} from "./access-ui";

export function AttendancePanel() {
  const { data, device, selected, read, modal } = useCenter();
  const [start, setStart] = useState(device?.sync.period?.start || dateToday()),
    [end, setEnd] = useState(device?.sync.period?.end || dateToday()),
    [rows, setRows] = useState<AttendanceRow[]>([]),
    [reportLoading,setReportLoading]=useState(false),
    [reportError,setReportError]=useState(""),
    [reportRetry,setReportRetry]=useState(0),
    [onlyExceptions, setOnlyExceptions] = useState(false);
  useEffect(() => {
    let current = true;
    setRows([]);setReportError("");
    if (!selected) { setReportLoading(false); return; }
    setReportLoading(true);
    void read({
      action: "attendance",
      deviceId: selected,
      start,
      end,
    }).then(result=>{if(!current)return;if(result?.report)setRows(result.report);else setReportError("تعذر قراءة التقرير من الخادم. راجع الفترة واتصال البرنامج ثم أعد المحاولة؛ لم نعرض بيانات فترة سابقة.");setReportLoading(false);});
    return ()=>{current=false;};
  }, [start, end, selected, data.revision, reportRetry]);
  const shown = rows.filter((row) => !onlyExceptions || row.exception);
  useEffect(() => {
    setStart(device?.sync.period?.start || dateToday());
    setEnd(device?.sync.period?.end || dateToday());
  }, [selected, device?.sync.lastAttendanceSync]);
  const exportRows = [
    [
      "الموظف",
      "الرقم",
      "تاريخ الوردية",
      "الوردية",
      "أول تحقق",
      "آخر تحقق",
      "عدد التحققات",
      "صافي الدقائق",
      "المدة قبل الاستراحة",
      "استراحة ثابتة بالدقائق",
      "الإضافي بالدقائق (إن فُعل)",
      "تأخير",
      "انصراف مبكر",
      "الحالة",
    ],
    ...shown.map((row) => [
      row.name,
      row.employeeNo,
      row.date,
      row.shift,
      row.first,
      row.last,
      row.count,
      row.minutes ?? "",
      row.grossMinutes ?? "",
      row.breakMinutes,
      row.overtimeMinutes ?? "",
      row.lateMinutes,
      row.earlyMinutes,
      row.status,
    ]),
  ];
  return (
    <div className="ac-stack">
      <div className="ac-toolbar">
        <DevicePicker />
        <div className="ac-actions">
          <Button
            onClick={() => {
              setStart(addDays(dateToday(), -6));
              setEnd(dateToday());
            }}
          >
            آخر أسبوع
          </Button>
          <Button
            onClick={() => {
              setStart(`${dateToday().slice(0, 7)}-01`);
              setEnd(dateToday());
            }}
          >
            الشهر الحالي
          </Button>
        </div>
      </div>
      <AttendancePull start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {selected ? <DailyReportCard rows={rows} start={start} end={end} /> : null}
      <Card title="قواعد التقرير وفترته">
        <div className="ac-fields">
          <Field
            label="من تاريخ"
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
          <Field
            label="إلى تاريخ"
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
        <p className="ac-muted">
          الحضور يُستنتج من التحقق الناجح، وليس من فتح الباب أو حدث النظام.
          الوقت محفوظ كما كتبه الجهاز. الوردية الليلية ترتبط بيوم بدايتها. يتوقف
          احتساب الساعات إذا تجاوزت الحد المنطقي للوردية.
        </p>
        <div className="ac-actions ac-no-print">
          <Button
            disabled={!canOperate(data.actor.role)}
            onClick={() => modal({ kind: "shift" })}
          >
            إضافة وردية
          </Button>
          <Button
            disabled={!canOperate(data.actor.role)}
            onClick={() => modal({ kind: "holiday" })}
          >
            عطلة رسمية
          </Button>
          <Button
            disabled={!canOperate(data.actor.role) || !data.people.length}
            onClick={() => modal({ kind: "leave" })}
          >
            تسجيل إجازة
          </Button>
        </div>
        <details className="ac-details ac-no-print">
          <summary>القواعد المعلنة والورديات</summary>
          {data.rules.shifts.map((shift) => (
            <p key={shift.id}>
              {shift.name} ·{" "}
              <bdi>
                {shift.start} — {shift.end}
              </bdi>{" "}
              · سماح التأخير {shift.graceMinutes}د · الحد الأقصى{" "}
              {shift.maxHours}س
            </p>
          ))}
          <p>
            دمج التحقق المتكرر خلال {data.rules.duplicateSeconds} ثانية. الدوام
            المحسوب هو الفرق بين أول وآخر تحقق، ولا يخصم استراحات غير مسجلة.
          </p>
          <p>
            العطلات المحلية: {data.rules.holidays.length} · الإجازات:{" "}
            {data.rules.leaves.length}. هذه القواعد لا تغير صلاحيات الأبواب.
          </p>
        </details>
      </Card>
      <Card title={`تقرير ${device?.name || "الحضور"}`}>
        <p className="ac-muted">شركة العميل: {data.company?.nameAr}. التقرير من السجلات المحفوظة؛ راجع حالة السحب أعلاه لمعرفة هل قرأ الجهاز الفترة المطلوبة بنجاح.</p>
        {reportLoading&&<p role="status">جارٍ قراءة التقرير للفترة المحددة…</p>}
        {reportError&&<p role="alert" className="ac-message error">{reportError}<Button onClick={()=>setReportRetry(value=>value+1)}>إعادة المحاولة</Button></p>}
        {device?.sync.result === "success" &&
          device.sync.period?.start === start &&
          device.sync.period.end === end &&
          device.sync.uniqueVerifications === 0 && (
            <p role="status" className="ac-message">
              لا توجد حركات تحقق في الفترة المحددة. صفوف الغياب، إن ظهرت، ناتجة
              عن سياسة الدوام وليست بصمات مقروءة.
            </p>
          )}
        <div className="ac-toolbar ac-no-print">
          <label className="ac-check">
            <input
              type="checkbox"
              checked={onlyExceptions}
              onChange={(event) => setOnlyExceptions(event.target.checked)}
            />
            الاستثناءات فقط
          </label>
          <div className="ac-actions">
            <Button
              disabled={!shown.length}
              onClick={() =>
                downloadFile(
                  reportFileName(profileFrom(data.company), "attendance", "csv"),
                  safeCsv(exportRows),
                  "text/csv;charset=utf-8",
                )
              }
            >
              CSV
            </Button>
            <Button
              disabled={!shown.length}
              onClick={() =>
                downloadFile(
                  reportFileName(profileFrom(data.company), "attendance", "xlsx"),
                  buildXlsx([
                    {
                      name: "الحضور",
                      logo: profileFrom(data.company).logo,
                      rows: [...reportSheetHeader(profileFrom(data.company), "تقرير الحضور والانصراف", `${start} — ${end}`), ...exportRows],
                      widths: [
                        26, 15, 18, 20, 16, 16, 16, 14, 18, 18, 18, 14, 14, 42,
                      ],
                    },
                    {
                      name: "معلومات التقرير",
                      rows: [
                        ...reportSheetHeader(profileFrom(data.company), "تقرير الحضور والانصراف", `${start} — ${end}`),
                        ["الجهاز", device?.name || ""],
                        ["الموديل", device?.model || "لم يُقرأ"],
                      ],
                      widths: [28, 45],
                    },
                  ]),
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
              }
            >
              Excel
            </Button>
            <Button
              disabled={!shown.length}
              onClick={async () => {
                const { saveAttendancePdf } = await import("@/lib/sheet-pdf");
                saveAttendancePdf(
                  start,
                  end,
                  shown.map((row) => ({
                    employeeNo: row.employeeNo,
                    name: row.name,
                    date: row.date,
                    weekday: "",
                    first: row.first.slice(0, 5),
                    last: row.last.slice(0, 5),
                    count: row.count,
                    minutes: row.minutes,
                    hours:
                      row.minutes == null
                        ? null
                        : Math.round((row.minutes / 60) * 100) / 100,
                    late: row.lateMinutes > 0,
                    missingOut: row.count === 1,
                    status: `${row.status} · استراحة ${row.breakMinutes}د · إضافي ${row.overtimeMinutes ?? "غير محسوب"}`,
                  })),
                  [],
                  profileFrom(data.company).name,
                  profileFrom(data.company).logo,
                );
              }}
            >
              PDF
            </Button>
          </div>
        </div>
        {shown.length ? (
          <TableScroll label="نتائج الحضور والانصراف — جدول قابل للتمرير">
            <table className="ac-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>التاريخ والوردية</th>
                  <th>أول / آخر تحقق</th>
                  <th>المدة</th>
                  <th>الاستراحة / الإضافي</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={`${row.personId}-${row.date}`}>
                    <td>
                      <span className="ac-person">
                        {(() => {
                          const who = data.people.find((p) => p.id === row.personId);
                          return who ? <PersonAvatar person={who} size={32} /> : null;
                        })()}
                        <span>
                          {row.name}
                          <br />
                          <bdi>{row.employeeNo}</bdi>
                        </span>
                      </span>
                    </td>
                    <td>
                      <bdi>{row.date}</bdi>
                      <br />
                      {row.shift}
                    </td>
                    <td>
                      <bdi>
                        {row.first || "—"} / {row.last || "—"}
                      </bdi>
                      <br />
                      {row.count} تحقق
                    </td>
                    <td>
                      {row.minutes == null
                        ? "—"
                        : `${Math.floor(row.minutes / 60)}س ${row.minutes % 60}د`}
                    </td>
                    <td>
                      {row.breakMinutes}د استراحة
                      <br />
                      {row.overtimeMinutes == null
                        ? "إضافي غير محسوب"
                        : `${row.overtimeMinutes}د إضافي`}
                    </td>
                    <td>
                      {row.status}
                      {row.lateMinutes ? (
                        <small> · تأخير {row.lateMinutes}د</small>
                      ) : null}
                      {row.earlyMinutes ? (
                        <small> · مبكر {row.earlyMinutes}د</small>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : reportLoading || reportError ? null : (
          <Empty>
            لا توجد نتائج في الفترة المحددة. اسحب قائمة الموظفين وأحداث الجهاز،
            أو راجع مرشح الاستثناءات.
          </Empty>
        )}
      </Card>
    </div>
  );
}

const eventLabels: Record<string, string> = {
  all: "جميع الأحداث",
  verification: "تحقق ناجح",
  denied: "تحقق مرفوض",
  alarm: "إنذار",
  system: "نظام وتشغيل",
  unknown: "غير مصنف",
};
export function EventsPanel() {
  const { data, device, selected, read, act, busy } = useCenter();
  const [start, setStart] = useState(device?.sync.period?.start || ""),
    [end, setEnd] = useState(device?.sync.period?.end || ""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [page, setPage] = useState(0),
    [events, setEvents] = useState<RawEvent[]>([]),
    [total, setTotal] = useState(0),
    [exporting, setExporting] = useState(false),
    [reviewing, setReviewing] = useState("");
  useEffect(() => {
    setStart(device?.sync.period?.start || "");
    setEnd(device?.sync.period?.end || "");
  }, [selected, device?.sync.lastAttendanceSync]);
  const params = {
    action: "events" as const,
    deviceId: selected,
    start: start || undefined,
    end: end || undefined,
    search,
    category: category as "all",
    page,
  };
  useEffect(() => {
    setPage(0);
  }, [start, end, search, category, selected]);
  useEffect(() => {
    let current = true;
    void read(params).then((result) => {
      if (current && result?.eventsPage) {
        setEvents(result.eventsPage.rows);
        setTotal(result.eventsPage.total);
      }
    });
    return () => {
      current = false;
    };
  }, [start, end, search, category, selected, page, data.revision]);
  async function exportEvents() {
    setExporting(true);
    try {
      const all: RawEvent[] = [];
      for (let cursor = 0; cursor < 1000; cursor += 1) {
        const result = await read({ ...params, page: cursor });
        if (!result?.eventsPage) return;
        all.push(...result.eventsPage.rows);
        if (result.eventsPage.complete) break;
      }
      const rows = [
        [
          "deviceId",
          "timestamp_original",
          "offset_original",
          "serialNo",
          "major",
          "minor",
          "employeeNo",
          "name",
          "category",
          "method",
          "doorNo",
          "source",
        ],
        ...all.map((event) => [
          event.deviceId,
          event.originalTimestamp,
          event.originalOffset,
          event.serialNo,
          event.major,
          event.minor,
          event.employeeNo,
          event.name,
          event.category,
          event.method,
          event.doorNo,
          event.source,
        ]),
      ];
      downloadFile(
        "SpeedForTraining-raw-events.csv",
        safeCsv(rows),
        "text/csv;charset=utf-8",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="ac-stack">
      <div className="ac-toolbar">
        <DevicePicker />
        <Button
          disabled={!total || exporting}
          onClick={() => void exportEvents()}
        >
          {exporting ? "جارٍ تجميع الملف…" : "تصدير الأحداث المفلترة"}
        </Button>
      </div>
      <Card title="فلترة سجل الأحداث">
        <div className="ac-fields">
          <Field
            label="بحث باسم أو رقم أو serialNo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Field label="نوع الحدث">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {Object.entries(eventLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="من تاريخ (اختياري)"
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
          <Field
            label="إلى تاريخ (اختياري)"
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
        <p className="ac-muted">
          النتائج حسب الوقت الأصلي للجهاز، بما فيها 2015 و+08:00. لا تُسحب الصور
          أو قوالب البيانات البيومترية ضمن سجل الأحداث.
        </p>
      </Card>
      <Card title={`${total} حدثاً مطابقاً`}>
        {events.length ? (
          <div className="ac-list">
            {events.map((event) => (
              <article className="ac-item" key={event.id}>
                <div className="ac-item-header">
                  <strong>
                    {event.name || event.employeeNo || "حدث دون موظف"}
                  </strong>
                  <Badge value={eventLabels[event.category]} />
                </div>
                <p>
                  <bdi dir="ltr">
                    {event.originalTimestamp || "توقيت غير صالح"}
                  </bdi>
                </p>
                <p className="ac-muted">
                  الرقم: <bdi>{event.employeeNo || "—"}</bdi> · النوع:{" "}
                  <bdi>
                    {event.major}/{event.minor}
                  </bdi>{" "}
                  · التسلسل: <bdi>{event.serialNo || "غير متاح"}</bdi> ·{" "}
                  {event.method || "ليس تحقق حضور"}
                  <br />
                  المصدر: {event.source} · الجهاز:{" "}
                  {
                    data.devices.find((device) => device.id === event.deviceId)
                      ?.name
                  }
                </p>
                {!event.validTime || event.date < "2020-01-01" ? (
                  <p className="ac-message warning">
                    {!event.validTime
                      ? "التوقيت غير صالح للاحتساب."
                      : "تاريخ قديم؛ راجع ساعة الجهاز وقت التسجيل. لم يُغيّر التاريخ."}
                  </p>
                ) : null}
                {data.reviews.find((review) => review.eventId === event.id) ? (
                  <p>
                    مراجعة محفوظة:{" "}
                    {
                      data.reviews.find((review) => review.eventId === event.id)
                        ?.note
                    }
                  </p>
                ) : null}
                <Button
                  disabled={busy || !canOperate(data.actor.role)}
                  onClick={() =>
                    setReviewing(reviewing === event.id ? "" : event.id)
                  }
                >
                  مراجعة الحدث
                </Button>
                {reviewing === event.id ? (
                  <form
                    className="ac-stack"
                    style={{ marginTop: 12 }}
                    onSubmit={async (submit) => {
                      submit.preventDefault();
                      const form = new FormData(submit.currentTarget);
                      if (
                        await act({
                          action: "review",
                          eventId: event.id,
                          note: String(form.get("note")),
                        })
                      )
                        setReviewing("");
                    }}
                  >
                    <Field
                      label="ملاحظة المراجعة (لا تعدل التاريخ الأصلي)"
                      name="note"
                      required
                      maxLength={500}
                    />
                    <Button type="submit" primary disabled={busy}>
                      حفظ المراجعة
                    </Button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <Empty>
            لا توجد أحداث مطابقة. اسحب سجلات الجهاز أو وسّع فترة البحث.
          </Empty>
        )}
        <div className="ac-actions" style={{ marginTop: 18 }}>
          <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
            السابق
          </Button>
          <span>صفحة {page + 1}</span>
          <Button
            disabled={(page + 1) * 100 >= total}
            onClick={() => setPage(page + 1)}
          >
            التالي
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function CredentialsPanel({
  initialPersonId,
  embedded = false,
}: { initialPersonId?: string; embedded?: boolean } = {}) {
  const {
    data,
    device,
    selected,
    employeeId,
    busy,
    workActive,
    read,
    run,
    tell,
    navigate,
  } = useCenter();
  const [connection, setConnection] = useState(false);
  const [section, setSection] = useState("face");
  const [personId, setPersonId] = useState(initialPersonId || employeeId),
    [cards, setCards] = useState<{ cardNo: string; cardType: string }[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false);
  const person = data.people.find(
    (person) => person.id === personId && person.deviceId === selected,
  );
  useEffect(() => {
    setPersonId(
      data.people.some(
        (p) =>
          p.id === (initialPersonId || employeeId) && p.deviceId === selected,
      )
        ? initialPersonId || employeeId
        : "",
    );
    setCards([]);
    setPage(0);
  }, [selected, initialPersonId]);
  const cardOperation = useInlineOperation("credential-operation", () =>
    loadCards(),
  );
  const act = async (input: import("@/lib/access/contracts").ActionInput) =>
    input.action === "prepare"
      ? cardOperation.prepare(input.operation)
      : run(input);
  const admin = data.actor.role === "admin";
  async function loadCards(next = 0) {
    if (!person || !device) return;
    const result = await read({
      action: "cards",
      deviceId: device.id,
      employeeNo: person.employeeNo,
      page: next,
    });
    if (result?.cards) {
      setCards(result.cards);
      setMore(Boolean(result.cardsMore));
      setPage(next);
    }
  }
  return (
    <div className="ac-stack">
      {cardOperation.message}
      {cardOperation.dialog}
      {device && admin && (
        <Button onClick={() => setConnection(true)}>
          إعادة الاتصال بالجهاز دون مغادرة الموظف
        </Button>
      )}
      {connection && device && (
        <InlineDeviceConnection
          device={device}
          onClose={() => setConnection(false)}
        />
      )}
      <div className="ac-tabs" role="group" aria-label="أقسام وسائل التحقق">
        {[
          ["face", "تسجيل الوجه"],
          ["cards", "الكروت"],
          ["permissions", "صلاحيات الأبواب"],
          ["advanced", "الرقم السري"],
        ].map(([id, label]) => (
          <Button
            key={id}
            disabled={busy || workActive}
            aria-pressed={section === id}
            onClick={() => setSection(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      {!embedded && (section !== "face" || !person) && (
        <div className="ac-grid">
          <DevicePicker />
          <PersonPicker
            value={personId}
            onChange={(id) => {
              setPersonId(id);
              setCards([]);
              setPage(0);
            }}
            deviceId={selected}
          />
        </div>
      )}
      {!person ? (
        <Empty>
          اختر موظفاً مسحوباً من الجهاز لعرض وسائله وإدارة ما أثبت الجهاز دعمه.
        </Empty>
      ) : (
        <>
          {device && section === "face" && (
            <EmployeeBiometrics
              key={`${selected}:${person.id}`}
              person={person}
              device={device}
              selection={
                !embedded && (
                  <div className="ac-grid">
                    <DevicePicker />
                    <PersonPicker
                      value={personId}
                      onChange={(id) => {
                        setPersonId(id);
                        setCards([]);
                        setPage(0);
                      }}
                      deviceId={selected}
                    />
                  </div>
                )
              }
            />
          )}
          {section === "cards" && (
            <Card title={`كروت ${person.name}`}>
              <div className="ac-actions">
                <Badge
                  value={
                    device?.capabilities.find(
                      (row) => row.feature === "cards.read",
                    )?.state || "unverified"
                  }
                />
                <Button
                  disabled={busy || !supported(device, "cards.read")}
                  onClick={() => void loadCards()}
                >
                  قراءة الكروت
                </Button>
              </div>
              {!supported(device, "cards.read") ? (
                <p className="ac-muted">{unavailable(device, "cards.read")}</p>
              ) : null}
              <div className="ac-list" style={{ marginTop: 12 }}>
                {cards.map((card) => (
                  <div className="ac-item ac-item-header" key={card.cardNo}>
                    <span>
                      <bdi>••••{card.cardNo.slice(-4)}</bdi> · {card.cardType}
                    </span>
                    <Button
                      danger
                      disabled={
                        busy || !admin || !supported(device, "cards.delete")
                      }
                      onClick={() =>
                        device &&
                        act({
                          action: "prepare",
                          operation: {
                            kind: "deleteCard",
                            deviceId: device.id,
                            employeeNo: person.employeeNo,
                            cardNo: card.cardNo,
                          },
                        })
                      }
                    >
                      إلغاء الكارت
                    </Button>
                  </div>
                ))}
              </div>
              {cards.length ? (
                <div className="ac-actions" style={{ marginTop: 12 }}>
                  <Button
                    disabled={page === 0}
                    onClick={() => void loadCards(page - 1)}
                  >
                    السابق
                  </Button>
                  <Button
                    disabled={!more}
                    onClick={() => void loadCards(page + 1)}
                  >
                    التالي
                  </Button>
                </div>
              ) : null}
              <form
                className="ac-fields"
                style={{ marginTop: 16 }}
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!device) return;
                  const form = event.currentTarget;
                  const cardNo = String(new FormData(form).get("cardNo"));
                  await act({
                    action: "prepare",
                    operation: {
                      kind: "addCard",
                      deviceId: device.id,
                      employeeNo: person.employeeNo,
                      cardNo,
                    },
                  });
                }}
              >
                <Field
                  label="رقم الكارت الجديد"
                  name="cardNo"
                  required
                  pattern="[A-Za-z0-9]{1,32}"
                  maxLength={32}
                  autoComplete="off"
                  dir="ltr"
                />
                <Button
                  primary
                  type="submit"
                  disabled={busy || !admin || !supported(device, "cards.add")}
                >
                  إضافة كارت — معاينة
                </Button>
              </form>
            </Card>
          )}
          {section === "permissions" && (
            <Card title="صلاحيات الأبواب">
              <p>
                الأبواب المسموحة المقروءة:{" "}
                <bdi>{person.doorRight || "لم تُقرأ صلاحيات أبواب"}</bdi>
              </p>
              <p>إدارة الصلاحيات متاحة فقط لقنوات وعمليات أثبت الجهاز دعمها.</p>
              <PermissionsPanel initialPersonId={person.id} embedded />
            </Card>
          )}
          {section === "advanced" && (
            <div className="ac-grid">
              <Card title="الرقم السري PIN">
                <Badge
                  value={
                    device?.capabilities.find((row) => row.feature === "pin")
                      ?.state || "unverified"
                  }
                />
                <p className="ac-muted">
                  قيمة سرية للكتابة فقط. تتطلب HTTPS موثوقاً أو تشفير ISAPI
                  مثبتاً؛ لن تُرسل عبر HTTP.
                </p>
                <form
                  className="ac-stack"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!device) return;
                    const form = event.currentTarget;
                    const pin = String(new FormData(form).get("pin"));
                    form.reset();
                    await act({
                      action: "prepare",
                      operation: {
                        kind: "pin",
                        deviceId: device.id,
                        employeeNo: person.employeeNo,
                        pin,
                      },
                    });
                  }}
                >
                  <Field
                    label="PIN جديد"
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4,12}"
                    minLength={4}
                    maxLength={12}
                    required
                    autoComplete="new-password"
                  />
                  <Button
                    primary
                    type="submit"
                    disabled={
                      busy ||
                      !admin ||
                      !device?.https ||
                      !supported(device, "pin")
                    }
                  >
                    تعيين PIN — معاينة
                  </Button>
                </form>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function PermissionsPanel({
  initialPersonId,
  embedded = false,
}: { initialPersonId?: string; embedded?: boolean } = {}) {
  const { data, device, selected, employeeId, busy, run, modal } = useCenter();
  const operation = useInlineOperation("permission-operation");
  const act = async (input: import("@/lib/access/contracts").ActionInput) =>
    input.action === "prepare"
      ? operation.prepare(input.operation)
      : run(input);
  const [personId, setPersonId] = useState(initialPersonId || employeeId),
    [doorId, setDoorId] = useState("");
  const person = data.people.find((person) => person.id === personId),
    door = data.doors.find((door) => door.id === doorId);
  useEffect(() => {
    setPersonId(
      data.people.some(
        (p) =>
          p.id === (initialPersonId || employeeId) && p.deviceId === selected,
      )
        ? initialPersonId || employeeId
        : "",
    );
    setDoorId("");
  }, [selected, initialPersonId]);
  return (
    <div className="ac-stack">
      {operation.message}
      {operation.dialog}
      {!embedded && <DevicePicker />}
      <Card title="لماذا هذا الموظف ممنوع من الدخول؟">
        <div className="ac-fields">
          <PersonPicker
            value={personId}
            onChange={setPersonId}
            deviceId={selected}
          />
          <Field label="الباب">
            <select
              value={doorId}
              onChange={(event) => setDoorId(event.target.value)}
            >
              <option value="">اختر باباً مثبتاً</option>
              {data.doors
                .filter((door) => door.deviceId === selected)
                .map((door) => (
                  <option key={door.id} value={door.id}>
                    {door.name} · {door.channel}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        {person && door ? (
          <p className="ac-message" style={{ marginTop: 16 }}>
            {diagnosePermission(
              person,
              door,
              `${dateToday()}T${new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())}`,
            )}
          </p>
        ) : (
          <p className="ac-muted">
            التشخيص يستخدم الصلاحيات التي قُرئت من الجهاز؛ لا يعتبر الخطة
            المحلية إذناً فعلياً.
          </p>
        )}
      </Card>
      <DeviceSchedulePanel key={selected} />
      <Card title="تغيير إذن الباب على الجهاز">
        <p className="ac-muted">
          يتحقق الخادم من وجود قالب الصلاحية فعلياً قبل قبول المعاينة. كتابة رقم
          قالب محلي غير مطبق لا تمنح صلاحية.
        </p>
        <form
          className="ac-fields"
          onSubmit={(event) => {
            event.preventDefault();
            if (!person || !device || !door) return;
            const form = new FormData(event.currentTarget);
            void act({
              action: "prepare",
              operation: {
                kind: "permission",
                deviceId: device.id,
                employeeNo: person.employeeNo,
                doorNos: [door.channel],
                templateNo: Number(form.get("templateNo")),
              },
            });
          }}
        >
          <Field
            label="رقم قالب موجود فعلياً بالجهاز"
            helpTopic="permissions"
            name="templateNo"
            type="number"
            min={1}
            max={65535}
            required
          />
          <Button
            primary
            type="submit"
            disabled={
              busy ||
              data.actor.role !== "admin" ||
              !person ||
              !door ||
              !supported(device, "permissions")
            }
          >
            معاينة صلاحية المستخدم
          </Button>
        </form>
        <p className="ac-muted">
          التغيير يستبدل قائمة أبواب هذا المستخدم بالباب المختار؛ راجع المعاينة
          قبل التأكيد.
        </p>
      </Card>
      <Card title="الخطط الأسبوعية والعطلات">
        <div className="ac-toolbar">
          <p className="ac-muted">
            المسودات محفوظة على الخادم. الحالة تميّز الخطة المحلية من القالب
            المطبق.
          </p>
          <Button
            disabled={busy || !canOperate(data.actor.role)}
            onClick={() => modal({ kind: "plan" })}
          >
            إعداد خطة أسبوعية
          </Button>
        </div>
        {data.plans.filter((plan) => plan.deviceId === selected).length ? (
          <div className="ac-list">
            {data.plans
              .filter((plan) => plan.deviceId === selected)
              .map((plan) => (
                <div key={plan.id} className="ac-item">
                  <div className="ac-item-header">
                    <strong>
                      {plan.name} · قالب {plan.templateNo}
                    </strong>
                    <Badge
                      value={
                        plan.appliedAt ? "مطبق مع تحقق" : "خطة محلية غير مطبقة"
                      }
                    />
                  </div>
                  {plan.week.map((day, index) => (
                    <p className="ac-muted" key={index}>
                      <bdi>
                        {day.day} · {day.start} — {day.end}
                      </bdi>
                    </p>
                  ))}
                  <Button
                    disabled={
                      busy ||
                      data.actor.role !== "admin" ||
                      !supported(device, "schedules")
                    }
                    onClick={() =>
                      act({
                        action: "prepare",
                        operation: {
                          kind: "applyWeek",
                          deviceId: selected,
                          planId: plan.id,
                        },
                      })
                    }
                  >
                    معاينة تطبيق الجدول على قالب موجود
                  </Button>
                </div>
              ))}
          </div>
        ) : (
          <Empty>لم تُنشأ خطط محلية بعد.</Empty>
        )}
        <p className="ac-muted">
          قدرة الجداول:{" "}
          <Badge
            value={
              device?.capabilities.find((row) => row.feature === "schedules")
                ?.state || "unverified"
            }
          />{" "}
          · قدرة عطلات الجهاز:{" "}
          <Badge
            value={
              device?.capabilities.find((row) => row.feature === "holidays")
                ?.state || "unverified"
            }
          />
        </p>
        <p className="ac-message warning">
          تطبيق الجدول يقرأ القالب والجدول الحالي وحدوده ويحفظ نسخة سابقة، ثم
          يحتاج تأكيداً مكتوباً. قد يشترك فيه أكثر من مستخدم أو قالب. عطلات
          صلاحيات الجهاز لا تتغير ضمن هذه العملية.
        </p>
      </Card>
    </div>
  );
}

export function SettingsPanel() {
  const { data, modal, busy } = useCenter();
  return (
    <div className="ac-stack">
      <Card title="التخزين والمصادقة">
        <p>
          تخزين خاص على الخادم بإصدار مخطط واضح، وكتابة ذرية مع نسخة سابقة
          للاسترجاع. لم تُنفذ ترحيلات لقاعدة بيانات الإنتاج.
        </p>
        <p>
          جلسة الدخول: HttpOnly وSameSite=Strict، ومدة 8 ساعات. حسابات البرنامج
          محفوظة بتجزئة PBKDF2؛ أدوار المستخدمين تُفحص على الخادم.
        </p>
        <p className="ac-message warning">
          {data.credentialMode === "encrypted"
            ? "حفظ بيانات الجهاز مشفر على الخادم بمفتاح بيئة منفصل."
            : "بيانات الجهاز تبقى في ذاكرة الخادم لمدة 8 ساعات. الحفظ الدائم معطل إلى أن يضبط المسؤول SKYLINE_VAULT_KEY خارج المستودع. بعد إعادة تشغيل الخادم أعد الاتصال."}
        </p>
        <p className="ac-muted">
          حماية SSRF: عنوان IPv4 لشبكة خاصة أو Tailscale، وقائمة أجهزة مسجلة،
          ومسارات ISAPI محددة، ومنع redirects. لا يوجد تعطيل عام للتحقق من
          شهادات HTTPS.
        </p>
      </Card>
      <Card title="حسابات البرنامج والأدوار">
        <p className="ac-muted">
          المشاهد يقرأ فقط. المشغّل يسحب البيانات ويعد قواعد التقرير. المسؤول
          يجهّز ويؤكد تغييرات الجهاز. دور التطبيق مستقل عن صلاحية حساب admin
          داخل Hikvision.
        </p>
        <Button
          primary
          disabled={busy || data.actor.role !== "admin"}
          onClick={() => modal({ kind: "account" })}
        >
          إضافة أو تحديث حساب
        </Button>
        <div className="ac-list" style={{ marginTop: 18 }}>
          {data.accounts.map((account) => (
            <div key={account.username} className="ac-item ac-item-header">
              <span>
                {account.name} · <bdi>{account.username}</bdi>
              </span>
              <div className="ac-actions">
                <Badge value={account.role} />
                <Badge value={account.enabled ? "مفعّل" : "معطّل"} />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="قواعد الحضور الحالية">
        <div className="ac-actions">
          <Button
            disabled={busy || !canOperate(data.actor.role)}
            onClick={() => modal({ kind: "shift" })}
          >
            إضافة وردية
          </Button>
          <Button
            disabled={busy || !canOperate(data.actor.role)}
            onClick={() => modal({ kind: "holiday" })}
          >
            إضافة أو تحديث عطلة
          </Button>
          <Button
            disabled={
              busy || !canOperate(data.actor.role) || !data.people.length
            }
            onClick={() => modal({ kind: "leave" })}
          >
            تسجيل إجازة
          </Button>
        </div>
        {data.rules.shifts.map((shift) => (
          <p key={shift.id}>
            {shift.name} ·{" "}
            <bdi>
              {shift.start} — {shift.end}
            </bdi>{" "}
            · الحد الأقصى {shift.maxHours}س
          </p>
        ))}
        {data.rules.holidays.map((holiday) => (
          <p key={holiday.date}>
            <bdi>{holiday.date}</bdi> · {holiday.name}
          </p>
        ))}
      </Card>
      <Card title="الوسائط الأخرى">
        <p>
          Hik-Connect الحالي محفوظ في قسم مستقل. OpenAPI الرسمي يحتاج AK/SK
          منفصلين؛ حساب موقع Teams لا يثبت توفرهما.
        </p>
        <p>
          Push SDK لم يُفعّل ولم يتغير عنوان منصة الجهاز. SDK Android الخاص
          بالفيديو ليس بديلاً عن محوّل ISAPI في الخادم.
        </p>
      </Card>
    </div>
  );
}
export function AuditPanel() {
  const { data } = useCenter();
  const labels = {
    success: "نجح",
    failed: "فشل",
    pending: "بدأ التنفيذ",
    uncertain: "نتيجة تحتاج تحققاً",
  };
  return (
    <Card title="آخر 200 عملية تدقيق">
      <div className="ac-toolbar">
        <p className="ac-muted">
          من / متى / ماذا / الهدف / النتيجة. لا يحوي PIN أو كلمات مرور أو قوالب
          بيومترية.
        </p>
        <Button
          disabled={!data.audit.length}
          onClick={() =>
            downloadFile(
              "SpeedForTraining-audit-latest-200.csv",
              safeCsv([
                [
                  "time",
                  "actor",
                  "role",
                  "action",
                  "target",
                  "result",
                  "detail",
                ],
                ...data.audit.map((row) => [
                  row.at,
                  row.actor,
                  row.role,
                  row.action,
                  row.target,
                  row.result,
                  row.detail,
                ]),
              ]),
              "text/csv;charset=utf-8",
            )
          }
        >
          تصدير المعروض
        </Button>
      </div>
      {data.audit.length ? (
        <div className="ac-list">
          {data.audit.map((row) => (
            <article className="ac-item" key={row.id}>
              <div className="ac-item-header">
                <strong>{row.action}</strong>
                <Badge value={labels[row.result]} />
              </div>
              <p className="ac-muted">
                {row.actor} · <When value={row.at} /> · {row.target}
              </p>
              <p>{row.detail}</p>
            </article>
          ))}
        </div>
      ) : (
        <Empty>لا توجد عمليات مسجلة بعد.</Empty>
      )}
    </Card>
  );
}
