import { PictureGuide } from "./picture-guide";
import { isEnglishName } from "@/lib/access/domain";
import {AttendancePull} from "./attendance-pull";
import { PhotoImportButton } from "./photo-import";
import {BrandAbout} from "./brand-about";
import { CompanyIdentityCard } from "./company-identity-card";
import { HcTeamCard } from "./hcteam-settings";
import { useEffect, useState } from "react";
import {
  Plus,
  Server,
  Users,
  ArrowUpLeft,
  BookOpen,
  RefreshCw,
  CheckCircle2,
  MapPin,
} from "lucide-react";
import { capabilityPresentation } from "@/lib/access/capability-view";
import { safeCsv } from "@/lib/access/import";
import { buildXlsx } from "@/lib/xlsx-io";
import { profileFrom, reportFileName, reportSheetHeader } from "@/lib/company-profile";
import {
  AttendancePanel,
  EventsPanel,
  SettingsPanel,
} from "./access-workflows";
import { DeviceInfo } from "./access-device-info";
import { DeviceDashboard } from "./device-dashboard";
import {
  Button,
  Badge,
  Card,
  Empty,
  Field,
  DevicePicker,
  When,
  useCenter,
  supported,
  canOperate,
  dateToday,
  downloadFile,
  PersonAvatar,
} from "./access-ui";

export function HomePage() {
  const { data, device, setup, navigate, modal, help, busy } = useCenter();
  const connected = data.devices.filter(
    (row) => row.status === "online",
  ).length;
  const next = !device?.checkedAt
    ? {
        title: "لنبدأ بتوصيل جهاز البصمة",
        text: "أدخل عنوان الجهاز وحسابه. سنقرأ الموديل وFirmware والقدرات دون تغيير بياناته.",
        label: "إعداد جهاز البصمة",
        action: () => setup(device),
      }
    : !data.people.some((person) => person.deviceId === device.id)
      ? {
          title: "الجهاز جاهز؛ اقرأ الموظفين أولاً",
          text: "اقرأ الأشخاص الموجودين لتجنب استخدام رقم موظف مكرر، ثم أضف موظفك الأول.",
          label: "افتح الموظفين",
          action: () => navigate("people"),
        }
      : {
          title: "جاهز لمتابعة الحضور",
          text: "اختر الفترة واسحب الأحداث، ثم راجع تقرير الوردية والاستثناءات.",
          label: "افتح الحضور والانصراف",
          action: () => navigate("attendance"),
        };
  return (
    <div className="ac-stack">
      <PictureGuide />
      <section className="ac-welcome">
        <div>
          <span className="ac-eyebrow">مساحة العمل</span>
          <h2>{next.title}</h2>
          <p>{next.text}</p>
          <div className="ac-actions">
            <Button
              primary
              disabled={
                busy || (!device?.checkedAt && data.actor.role !== "admin")
              }
              onClick={next.action}
            >
              {next.label}
              <ArrowUpLeft size={17} />
            </Button>
            <Button onClick={() => help("start")}>
              <BookOpen size={17} />
              ابدأ معي خطوة بخطوة
            </Button>
          </div>
        </div>
        <div className="ac-welcome-mark" aria-hidden="true">
          <Server size={44} />
          <span>speed4trading</span>
          <small>البصمة · الأبواب · الحضور</small>
        </div>
      </section>
      <div className="ac-stats">
        {[
          {
            label: "الموظفون في البرنامج",
            value: data.people.length,
            note: "سجلات فعلية مفهرسة لكل جهاز",
            icon: Users,
          },
          {
            label: "أجهزة نجح آخر فحص لها",
            value: `${connected} / ${data.devices.length}`,
            note: "الحالة حسب آخر قراءة محفوظة",
            icon: Server,
          },
          {
            label: "أحداث اليوم المسحوبة",
            value: data.statistics.today,
            note: "تشمل أصناف الأحداث؛ ليست عدد الحاضرين",
            icon: CheckCircle2,
          },
        ].map((item) => (
          <article className="ac-stat" key={item.label}>
            <div>
              <span>{item.label}</span>
              <item.icon size={20} />
            </div>
            <strong dir="ltr">{item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </div>
      <div className="ac-grid">
        <Card title="لوحة الأجهزة">
          <DeviceDashboard />
          <Button onClick={() => navigate("devices")}>
            إدارة الأجهزة
            <ArrowUpLeft size={16} />
          </Button>
        </Card>
        <Card title="اختصارات العمل">
          <div className="ac-shortcuts">
            <Button
              disabled={
                data.actor.role !== "admin" || !supported(device, "users.add")
              }
              onClick={() => modal({ kind: "person" })}
            >
              <Plus size={18} />
              إضافة موظف
            </Button>
            <Button onClick={() => navigate("doors")}>إدارة الأبواب</Button>
            <Button onClick={() => navigate("reports")}>مراجعة التقارير</Button>
            <Button onClick={() => help("errors")}>مساعدة في الاتصال</Button>
          </div>
          <p className="ac-muted">
            تغيير المستخدمين والصلاحيات والأبواب يحتاج معاينة وتأكيداً مكتوباً.
          </p>
          {data.statistics.historical > 0 && (
            <p className="ac-history-note">
              يوجد {data.statistics.historical} حدثاً قبل 2020. تظل بتواريخها
              الأصلية، ولا تُحتسب حضوراً اليوم.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

export function DevicesPage() {
  const { data, selected, device, select, setup, busy, act, navigate, help } =
    useCenter();
  const [start, setStart] = useState(dateToday()),
    [end, setEnd] = useState(dateToday());
  useEffect(() => {
    setStart(device?.sync.period?.start || dateToday());
    setEnd(device?.sync.period?.end || dateToday());
  }, [selected]);
  return (
    <div className="ac-stack">
      <div className="ac-page-intro">
        <p>أضف جهازاً، تحقق من هويته، ثم اقرأ الموظفين والأحداث.</p>
        <Button
          primary
          disabled={busy || data.actor.role !== "admin"}
          onClick={() => setup()}
        >
          <Plus size={18} />
          إضافة جهاز بصمة جديد
        </Button>
      </div>
      <div className="ac-device-tabs" aria-label="الأجهزة المسجلة">
        {data.devices.map((row) => (
          <button
            key={row.id}
            aria-pressed={row.id === selected}
            onClick={() => select(row.id)}
          >
            <Server size={19} />
            <span>
              {row.name}
              <small>
                <bdi>
                  {row.host}:{row.port}
                </bdi>
              </small>
            </span>
            <Badge value={row.status} />
          </button>
        ))}
      </div>
      {device ? (
        <>
          <Card title={device.name}>
            <div className="ac-toolbar">
              <span className="ac-muted">
                <MapPin size={14} />{" "}
                {device.location || "لم يُحدد مكان التركيب"}
              </span>
              <div className="ac-actions">
                <Button
                  disabled={busy || data.actor.role !== "admin"}
                  onClick={() => setup(device)}
                >
                  إعداد الاتصال ومراجعة الاسم
                </Button>
                <Button
                  disabled={busy || !canOperate(data.actor.role)}
                  onClick={() => act({ action: "probe", deviceId: selected })}
                >
                  <RefreshCw size={16} />
                  إعادة فحص بالقراءة فقط
                </Button>
              </div>
            </div>
            {device.error && (
              <p role="alert" className="ac-message error">
                {device.error}
              </p>
            )}
            {device.checkedAt ? (
              <DeviceInfo device={device} />
            ) : (
              <Empty>
                لم تُقرأ هوية الجهاز بعد. ابدأ إعداد الاتصال وأدخل حساب البصمة
                لقراءة الموديل وFirmware.
              </Empty>
            )}
            <div className="ac-actions">
              <Button onClick={() => help("connect")}>
                كيف أختبر الاتصال؟
              </Button>
              <Button onClick={() => navigate("advanced")}>
                عرض جدول دعم الوظائف
              </Button>
            </div>
          </Card>
          <AttendancePull start={start} end={end} setStart={setStart} setEnd={setEnd} />     </>
      ) : (
        <Empty>أضف أول جهاز لبدء العمل.</Empty>
      )}
      <Card title="تستخدم Hik-Connect؟">
        <p>
          حساب السحابة والتحقق الإضافي محفوظان في مسار مستقل. لا تخلطهما بحساب
          admin للبصمة.
        </p>
        <Button onClick={() => navigate("legacy")}>
          فتح Hik-Connect والاستيراد اليدوي
        </Button>
      </Card>
    </div>
  );
}

export function EmployeesPage() {
  const {
    data,
    selected,
    device,
    busy,
    modal,
    navigate,
    openEmployee,
    act,
    help,
  } = useCenter();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  useEffect(() => setPicked(new Set()), [selected]);
  const people = data.people.filter(
    (person) =>
      person.deviceId === selected &&
      `${person.name} ${person.employeeNo}`.includes(search.trim()),
  );
  const admin = data.actor.role === "admin";
  const chosen = people.filter((person) => picked.has(person.id));
  const toggle = (id: string) =>
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const otherDevices = data.devices.filter((row) => row.id !== selected);
  const sendSelected = () => {
    const ready = chosen.filter((person) => isEnglishName(person.name)).slice(0, 50);
    if (!target || !ready.length) return;
    const day = (value?: string) => (value || "").slice(0, 10);
    act({
      action: "prepare",
      operation: {
        kind: "importPeople",
        deviceId: target,
        people: ready.map((person) => ({
          employeeNo: person.employeeNo,
          name: person.name,
          arabicName: person.arabicName,
          permanent: !person.validity?.enable,
          begin: day(person.validity?.beginTime) || dateToday(),
          end: day(person.validity?.endTime) || "2037-12-31",
        })),
      },
    });
  };
  const deleteSelected = () =>
    act({
      action: "prepare",
      operation: {
        kind: "deletePeople",
        deviceId: selected,
        employeeNos: chosen.slice(0, 50).map((person) => person.employeeNo),
      },
    });
  const rows = [
    ["employeeNo", "name", "device", "validFrom", "validTo"],
    ...people.map((person) => [
      person.employeeNo,
      person.name,
      device?.name || "",
      person.validity?.beginTime || "",
      person.validity?.endTime || "",
    ]),
  ];
  return (
    <div className="ac-stack">
      <div className="ac-page-intro">
        <p>اقرأ القائمة الموجودة أولاً، ثم أضف أو عدّل الموظف بأمان.</p>
        <Button
          primary
          disabled={busy || !admin || !supported(device, "users.add")}
          onClick={() => modal({ kind: "person" })}
        >
          <Plus size={18} />
          إضافة موظف
        </Button>
      </div>
      <div className="ac-toolbar">
        <DevicePicker />
        <div className="ac-actions">
          <Button
            disabled={
              busy ||
              !canOperate(data.actor.role) ||
              !supported(device, "users.read")
            }
            onClick={() =>
              act({
                action: "sync",
                deviceId: selected,
                start: dateToday(),
                end: dateToday(),
                usersOnly: true,
              })
            }
          >
            قراءة الموظفين من الجهاز
          </Button>
          {canOperate(data.actor.role) ? <PhotoImportButton deviceId={selected} people={data.people.filter((p) => p.deviceId === selected)} /> : null}
          <Button onClick={() => help("employee")}>شرح إضافة أول موظف</Button>
        </div>
      </div>
      <Card>
        <div className="ac-toolbar">
          <Field
            label="البحث عن موظف"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="الاسم أو رقم الموظف"
          />
          <span className="ac-muted">
            {people.length} موظفاً · آخر سحب:{" "}
            <When value={device?.lastSync || null} />
          </span>
        </div>
        {people.some((p) => !isEnglishName(p.name)) ? (
          <p role="status" className="ac-message">
            {people.filter((p) => !isEnglishName(p.name)).length} موظف بلا اسم إنجليزي. الجهاز يقبل الأسماء الإنجليزية فقط،
            والتقارير تعرض الاسم الإنجليزي. افتح «تعديل الموظف» لكل واحد واحفظه بنفسك؛ لا يُكتب شيء تلقائياً.
          </p>
        ) : null}
        {admin && people.length ? (
          <div className="ac-bulk-bar" role="toolbar" aria-label="إجراءات جماعية">
            <label className="ac-check">
              <input
                type="checkbox"
                checked={chosen.length === people.length && people.length > 0}
                onChange={(event) =>
                  setPicked(event.target.checked ? new Set(people.map((p) => p.id)) : new Set())
                }
              />
              تحديد الكل
            </label>
            <span className="ac-muted">
              <bdi>{chosen.length}</bdi> محدد
            </span>
            <select
              aria-label="الجهاز الهدف"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              disabled={!otherDevices.length}
            >
              <option value="">— الجهاز الهدف —</option>
              {otherDevices.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <Button
              disabled={busy || !chosen.length || !target || !supported(data.devices.find((row) => row.id === target), "users.add")}
              onClick={sendSelected}
            >
              إرسال المحدد إلى جهاز آخر
            </Button>
            <Button
              danger
              disabled={busy || !chosen.length || !supported(device, "users.delete")}
              onClick={deleteSelected}
            >
              حذف المحدد — معاينة
            </Button>
            {chosen.length ? (
              <Button onClick={() => setPicked(new Set())}>إلغاء التحديد</Button>
            ) : null}
            {chosen.length > 50 ? (
              <p role="status" className="ac-message warning">الدفعة الواحدة حتى 50 موظف؛ هيتنفذ أول 50 وبعدها كرر للباقي.</p>
            ) : null}
            {chosen.some((p) => !isEnglishName(p.name)) && target ? (
              <p role="status" className="ac-message warning">الموظفين بدون اسم إنجليزي مش هيتبعتوا للجهاز التاني.</p>
            ) : null}
          </div>
        ) : null}
        {people.length ? (
          <div className="ac-employee-list">
            {people.map((person) => (
              <article key={person.id} className={`ac-employee${picked.has(person.id) ? " picked" : ""}`}>
                <header>
                  {admin ? (
                    <input
                      type="checkbox"
                      className="ac-pick"
                      aria-label={`تحديد ${person.name}`}
                      checked={picked.has(person.id)}
                      onChange={() => toggle(person.id)}
                    />
                  ) : null}
                  <PersonAvatar person={person} size={44} />
                  <div>
                    <h3 dir="auto">{person.name}</h3>
                    {person.arabicName && person.arabicName !== person.name ? (
                      <small dir="rtl">{person.arabicName}</small>
                    ) : null}
                    {!isEnglishName(person.name) ? (
                      <small className="ac-message error" role="status">
                        بلا اسم إنجليزي — اضغط «تعديل الموظف» واكتب الاسم الإنجليزي ثم احفظ.
                      </small>
                    ) : null}
                    <small>
                      رقم <bdi>{person.employeeNo}</bdi> · آخر قراءة{" "}
                      <When value={person.updatedAt} />
                    </small>
                  </div>
                  <Badge
                    value={
                      person.validity?.enable &&
                      person.validity.endTime.slice(0, 10) < dateToday()
                        ? "صلاحية منتهية"
                        : "مقروء من الجهاز"
                    }
                  />
                </header>
                <div className="ac-actions">
                  <Button
                    disabled={
                      busy || !admin || !supported(device, "users.edit")
                    }
                    onClick={() => modal({ kind: "person", person })}
                  >
                    تعديل الموظف
                  </Button>
                  <Button onClick={() => openEmployee(person.id)}>
                    الكروت والوجه والأصابع
                  </Button>
                  <Button onClick={() => navigate("permissions")}>
                    صلاحيات الأبواب
                  </Button>
                </div>
                <details className="ac-details">
                  <summary>الوردية والحالة وإجراءات إضافية</summary>
                  <Field label={`وردية ${person.name}`}>
                    <select
                      value={person.shiftId}
                      disabled={busy || !canOperate(data.actor.role)}
                      onChange={(event) =>
                        act({
                          action: "person.metadata",
                          personId: person.id,
                          shiftId: event.target.value,
                          localEnabled: person.localEnabled,
                        })
                      }
                    >
                      {data.rules.shifts.map((shift) => (
                        <option key={shift.id} value={shift.id}>
                          {shift.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="ac-check">
                    <input
                      type="checkbox"
                      checked={person.localEnabled}
                      disabled={busy || !canOperate(data.actor.role)}
                      onChange={(event) =>
                        act({
                          action: "person.metadata",
                          personId: person.id,
                          shiftId: person.shiftId,
                          localEnabled: event.target.checked,
                        })
                      }
                    />
                    إدراجه في تقرير الحضور المحلي
                  </label>
                  <div className="ac-actions">
                    <Button
                      disabled={
                        busy || !admin || !supported(device, "users.edit")
                      }
                      onClick={() =>
                        act({
                          action: "prepare",
                          operation: {
                            kind: "disablePerson",
                            deviceId: selected,
                            employeeNo: person.employeeNo,
                          },
                        })
                      }
                    >
                      تعطيل على الجهاز — معاينة
                    </Button>
                    <Button
                      disabled={
                        busy || !admin || !supported(device, "users.edit")
                      }
                      onClick={() => modal({ kind: "person", person })}
                    >
                      تفعيل / تعديل فترة الصلاحية
                    </Button>
                    <Button
                      disabled={busy || !admin || !supported(device, "fingerprint.capture")}
                      title="يطلب الجهاز وضع الإصبع على الحساس خلال ثوانٍ"
                      onClick={() =>
                        act({
                          action: "fingerprint.enroll",
                          deviceId: selected,
                          employeeNo: person.employeeNo,
                          fingerNo: Math.min(10, (person.fingerprintCount || 0) + 1),
                        })
                      }
                    >
                      إضافة بصمة
                    </Button>
                    <Button
                      danger
                      disabled={busy || !admin || !supported(device, "fingerprints")}
                      onClick={() => {
                        if (window.confirm(`حذف كل بصمات الموظف ${person.employeeNo} من الجهاز؟`))
                          act({ action: "fingerprint.delete", deviceId: selected, employeeNo: person.employeeNo });
                      }}
                    >
                      مسح البصمات
                    </Button>
                    <Button
                      danger
                      disabled={
                        busy || !admin || !supported(device, "users.delete")
                      }
                      onClick={() =>
                        act({
                          action: "prepare",
                          operation: {
                            kind: "deletePerson",
                            deviceId: selected,
                            employeeNo: person.employeeNo,
                          },
                        })
                      }
                    >
                      حذف — معاينة الأثر
                    </Button>
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <Empty>
            {search
              ? "لا يوجد موظف يطابق البحث."
              : "لم تُقرأ قائمة موظفين لهذا الجهاز بعد. اضغط قراءة الموظفين، أو أكمل إعداد الاتصال أولاً."}
          </Empty>
        )}
        <details className="ac-details">
          <summary>استيراد وتصدير وإرسال موظف</summary>
          <div className="ac-actions">
            <Button
              disabled={busy || !admin || !supported(device, "users.add")}
              onClick={() => modal({ kind: "person" })}
            >
              إرسال موظف إلى الجهاز
            </Button>
            <Button
              disabled={busy || !admin || !supported(device, "users.add")}
              onClick={() => modal({ kind: "import" })}
            >
              استيراد CSV / Excel مع معاينة
            </Button>
            <Button
              disabled={!people.length}
              onClick={() =>
                downloadFile(
                  reportFileName(profileFrom(data.company), "employees", "csv"),
                  safeCsv(rows),
                  "text/csv;charset=utf-8",
                )
              }
            >
              تصدير CSV
            </Button>
            <Button
              disabled={!people.length}
              onClick={() =>
                downloadFile(
                  reportFileName(profileFrom(data.company), "employees", "xlsx"),
                  buildXlsx([
                    { name: "الموظفون", logo: profileFrom(data.company).logo, rows: [...reportSheetHeader(profileFrom(data.company), "قائمة الموظفين"), ...rows], widths: [18, 28, 24, 24, 24] },
                  ]),
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
              }
            >
              تصدير Excel
            </Button>
          </div>
          <p className="ac-muted">
            الإرسال يفتح نموذج المستخدم ثم المعاينة والتأكيد. لا يُكتب فوق رقم
            موجود تلقائياً.
          </p>
        </details>
      </Card>
    </div>
  );
}

export function ReportsPage() {
  const [type, setType] = useState("attendance");
  return (
    <div className="ac-stack">
      <p className="ac-page-description">
        اختر تقريراً، راجع الفترة والنتائج، ثم نزّل Excel أو PDF أو CSV.
      </p>
      <div className="ac-tabs ac-no-print">
        <Button
          aria-pressed={type === "attendance"}
          onClick={() => setType("attendance")}
        >
          تقرير الحضور
        </Button>
        <Button
          aria-pressed={type === "events"}
          onClick={() => setType("events")}
        >
          سجل الأحداث الخام
        </Button>
        <Button onClick={() => window.print()}>طباعة التقرير</Button>
      </div>
      {type === "attendance" ? <AttendancePanel /> : <EventsPanel />}
    </div>
  );
}
export function CapabilitiesPage() {
  const { device } = useCenter();
  return (
    <div className="ac-stack">
      <DevicePicker />
      <Card title="جدول دعم الوظائف">
        <p className="ac-muted">
          الفحص يميّز إعلان القدرة عن نجاح العملية فعلياً. يخص هذا الجدول الجهاز
          المحدد وإصداره؛ وجود الوظيفة في SDK لا يثبت توفرها.
        </p>
        {device ? (
          <div className="ac-capabilities">
            {device.capabilities.map((cap) => {
              const view = capabilityPresentation(cap, device);
              return (
                <article className="ac-item" key={cap.feature}>
                  <div className="ac-item-header">
                    <strong>{cap.label}</strong>
                    <span className={`ac-evidence ${view.kind}`}>
                      {view.label}
                    </span>
                  </div>
                  <p className="ac-muted">{view.reason}</p>
                  <details className="ac-details">
                    <summary>المرجع والمسار ونتيجة الفحص</summary>
                    <p className="ac-code">
                      {cap.endpoint}
                      <br />
                      {cap.reference}
                      <br />
                      HTTP: {cap.http ?? "لم يُنفذ"} ·{" "}
                      {cap.checkedAt || "لا يوجد فحص"}
                    </p>
                    <p>{cap.reason}</p>
                  </details>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty>اختر جهازاً.</Empty>
        )}
      </Card>
    </div>
  );
}
export function SettingsPage() {
  const { navigate, help, data } = useCenter();
  return (
    <div className="ac-stack">
      <Card title="مساحة إعدادات البرنامج">
        <p>
          حسابات البرنامج وسياسة الحضور محلية. إعدادات الجهاز الفعلية لها تحقق
          وموافقة منفصلان.
        </p>
        <div className="ac-actions">
          <Button onClick={() => help("clock")}>مراجعة ساعة البصمة</Button>
          <Button onClick={() => navigate("advanced")}>
            دعم الوظائف والتشخيص المتقدم
          </Button>
          <Button onClick={() => navigate("audit")}>سجل التدقيق الإداري</Button>
        </div>
      </Card>
      <details className="ac-details ac-settings-details">
        <summary>الحسابات والأمان وقواعد الحضور المتقدمة</summary>
        <SettingsPanel />
      </details>
      <CompanyIdentityCard />
      {data.actor.role === "admin" ? <HcTeamCard /> : null}
      <BrandAbout />
    </div>
  );
}
