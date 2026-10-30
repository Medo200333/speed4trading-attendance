import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  Users,
  DoorOpen,
  Fingerprint,
  ShieldCheck,
  CalendarClock,
  ListFilter,
  Server,
  Settings,
  FileSpreadsheet,
  Menu,
  LogOut,
  ScrollText,
  BookOpen,
  ChartNoAxesCombined,
  CircleHelp,
} from "lucide-react";
import {
  centerQueryFn,
  centerActionFn,
  centerLogoutFn,
} from "@/lib/access.functions";
import { openGateFn } from "@/lib/hikvision.functions";
import type { Snapshot } from "@/lib/access/service.server";
import type {
  ActionInput,
  QueryInput,
  Confirmation,
} from "@/lib/access/contracts";
import {
  CenterContext,
  Button,
  Badge,
  Field,
  Modal,
  type ModalData,
  type QueryData,
  type ActionData,
} from "./access-ui";
import { AccessPanels } from "./access-panels";
import { CenterForms } from "./access-forms";
import { DeviceSetup } from "./access-setup";
import type { Device } from "@/lib/access/domain";
import { Brand } from "./access-brand";
import { AppNavigation } from "./access-navigation";
import { BRAND, brandTheme } from "@/lib/brand";
import { CompaniesPage } from "./company-workspace";
import "./access-center.css";
import "./speed-design.css";

const tabs = [
  { id: "dashboard", name: "الرئيسية", icon: LayoutDashboard },
  { id: "devices", name: "الأجهزة", icon: Server },
  { id: "people", name: "الموظفون", icon: Users },
  { id: "credentials", name: "بصمة الوجه ووسائل التحقق", icon: Fingerprint },
  { id: "doors", name: "الأبواب", icon: DoorOpen },
  { id: "attendance", name: "الحضور والانصراف", icon: CalendarClock },
  { id: "reports", name: "التقارير", icon: ChartNoAxesCombined },
  { id: "guide", name: "دليل التشغيل", icon: BookOpen },
  { id: "settings", name: "الإعدادات", icon: Settings },
];
const extraTabs = [
  { id: "permissions", name: "الصلاحيات", icon: ShieldCheck },
  { id: "events", name: "الأحداث والاستثناءات", icon: ListFilter },
  { id: "audit", name: "سجل التدقيق", icon: ScrollText },
  { id: "advanced", name: "دعم الوظائف والتشخيص", icon: Settings },
  { id: "legacy", name: "Hik-Connect والملفات", icon: FileSpreadsheet },
  { id: "companies", name: "الشركات والفروع", icon: Users },
];

export function AccessCenter() {
  const query = useServerFn(centerQueryFn),
    action = useServerFn(centerActionFn),
    login = useServerFn(openGateFn),
    logout = useServerFn(centerLogoutFn);
  const [companyId, setCompanyId] = useState("");
  const activeCompany = useRef(companyId);
  const deviceSelections = useRef<Record<string,string>>({});
  activeCompany.current = companyId;
  const [pendingWork, setPendingWork] = useState<Record<string, boolean>>({});
  const workActive = Object.values(pendingWork).some(Boolean);
  const [data, setData] = useState<Snapshot | null>(null),
    [initial, setInitial] = useState(true),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("dashboard"),
    [selected, setSelected] = useState("hikvision-main"),
    [employeeId, setEmployeeId] = useState(""),
    [menu, setMenu] = useState(false);
  const [message, setMessage] = useState({ text: "", error: false });
  const pendingPerson = useRef<{ deviceId: string; employeeNo: string } | null>(
    null,
  );
  const [enrollNext, setEnrollNext] = useState<{
    deviceId: string;
    employeeNo: string;
  } | null>(null);
  const [guideTopic, setGuideTopic] = useState("start"),
    [setupOpen, setSetupOpen] = useState(false),
    [setupDevice, setSetupDevice] = useState<Device | undefined>();
  const [modal, setModal] = useState<ModalData | null>(null),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [phrase, setPhrase] = useState("");
  const tell = (text: string, error = false) => setMessage({ text, error });
  const firstRun = useRef(false);
  useEffect(() => {
    if (data && data.devices.length === 0 && !firstRun.current) {
      firstRun.current = true;
      setSetupDevice(undefined);
      setSetupOpen(true);
    }
  }, [data]);
  async function refresh() {
    try {
      const result = await query({
        data: { action: "snapshot", companyId: companyId || undefined },
      });
      if (activeCompany.current !== companyId) return;
      if (result.ok && result.data.snapshot) {
        setData(result.data.snapshot);
        const snapshot = result.data.snapshot, key = snapshot.companyId || "legacy";
        const preferred = deviceSelections.current[key] || selected;
        const next = snapshot.devices.some(device=>device.id===preferred) ? preferred : snapshot.devices[0]?.id || "";
        deviceSelections.current[key] = next;
        setSelected(next);
      } else if (!result.ok && result.code === "LOGIN_REQUIRED") setData(null);
      else if (!result.ok) tell(result.error, true);
    } catch {
      tell("تعذر الوصول إلى خادم Speed for Training. حاول تحديث الصفحة.", true);
    } finally {
      setInitial(false);
    }
  }
  useEffect(() => {
    for (const key of ["awwal-akher-link", "awwal-akher-gate"]) {
      try {
        const stored = JSON.parse(localStorage.getItem(key) || "null");
        if (stored && typeof stored === "object" && "password" in stored) {
          delete stored.password;
          localStorage.setItem(key, JSON.stringify(stored));
        }
      } catch {
        /* Invalid old settings are not used for authentication. */
      }
    }
    void refresh();
  }, [companyId]);
  const isSyncing = data?.devices.some(
    (device) => device.sync.running || device.sync.enabled,
  );
  useEffect(() => {
    if (!isSyncing) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [isSyncing, companyId]);
  async function read(input: QueryInput, quiet = false): Promise<QueryData | undefined> {
    try {
      const result = await query({
        data: { ...input, companyId: companyId || undefined },
      });
      if (result.ok) return result.data;
      if (quiet) return undefined;
      tell(result.error, true);
      if (result.code === "LOGIN_REQUIRED") setData(null);
    } catch {
      if (!quiet) tell("تعذر إكمال القراءة. تحقق من اتصال البرنامج بالخادم.", true);
    }
  }
  async function run(
    input: ActionInput,
    options?: { inline?: boolean; onError?: (message: string) => void },
  ): Promise<ActionData | undefined> {
    if (busy) return;
    setBusy(true);
    tell("");
    try {
      const result = await action({
        data: { ...input, companyId: companyId || undefined },
      });
      if (!result.ok) {
        options?.onError?.(result.error);
        tell(result.error, true);
        if (result.code === "LOGIN_REQUIRED") setData(null);
        else if (input.action === "sync.diagnose" || input.action === "sync")
          await refresh();
        return;
      }
      if (result.data.confirmation && !options?.inline) {
        pendingPerson.current =
          input.action === "prepare" && input.operation.kind === "addPerson"
            ? {
                deviceId: input.operation.deviceId,
                employeeNo: input.operation.person.employeeNo,
              }
            : null;
        setConfirmation(result.data.confirmation);
        setPhrase("");
      }
      if (result.data.notice) tell(result.data.notice);
      if (input.action === "commit" && pendingPerson.current) {
        setEnrollNext(pendingPerson.current);
        pendingPerson.current = null;
      }
      await refresh();
      return result.data;
    } catch {
      options?.onError?.(
        "تعذر تأكيد العملية. راجع حالة الجهاز قبل إعادة المحاولة.",
      );
      tell("تعذر تأكيد العملية. راجع سجل التدقيق قبل إعادة المحاولة.", true);
      return;
    } finally {
      setBusy(false);
    }
  }
  async function act(input: ActionInput) {
    return Boolean(await run(input));
  }
  const setup = (device?: Device) => {
    setSetupDevice(device);
    setSetupOpen(true);
  };
  const selectDevice = (id:string) => { deviceSelections.current[data?.companyId || companyId || "legacy"] = id; setSelected(id); };
  const help = (topic = "start") => {
    setModal(null);
    setSetupOpen(false);
    setGuideTopic(topic);
    navigate("guide");
  };
  const navigate = (next: string) => {
    if (workActive) {
      setMenu(false);
      tell(
        "أكمل العملية المفتوحة أو ألغها من نفس الشاشة قبل الانتقال إلى قسم آخر.",
        true,
      );
      return;
    }
    setTab(next);
    setMenu(false);
    tell("");
    window.scrollTo(0, 0);
  };
  if (initial)
    return (
      <main className="access-center ac-login" dir="rtl" style={brandTheme}>
        <div className="ac-loading">
          <Brand />
          <span className="ac-loading-line" aria-hidden="true" />
          <p role="status">جارٍ تجهيز مساحة العمل…</p>
        </div>
      </main>
    );
  if (!data)
    return (
      <main className="access-center ac-login" dir="rtl" style={brandTheme}>
        <form
          className="ac-card ac-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            try {
              const result = await login({
                data: {
                  username: String(form.get("username")),
                  password: String(form.get("password")),
                },
              });
              if (!result.ok) tell(result.error, true);
              else {
                sessionStorage.setItem("skyline-gate", "1");
                tell("");
                await refresh();
              }
            } catch {
              tell("تعذر تسجيل الدخول إلى الخادم.", true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Brand />
            <span className="ac-eyebrow">مرحباً بك</span>
            <h1>كل أجهزة موقعك، في مكان واحد</h1>
            <p className="ac-muted">
              ادخل بحساب البرنامج. بيانات دخول جهاز البصمة تُدخل لاحقاً في قسم
              الأجهزة.
            </p>
          </div>
          {message.text ? (
            <p
              role="alert"
              className={`ac-message ${message.error ? "error" : ""}`}
            >
              {message.text}
            </p>
          ) : null}
          <Field
            label="اسم مستخدم البرنامج"
            name="username"
            autoComplete="username"
            required
            dir="ltr"
          />
          <Field
            label="كلمة مرور البرنامج"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            dir="ltr"
          />
          <Button primary type="submit" disabled={busy}>
            {busy ? "جارٍ الدخول…" : `دخول ${BRAND.name}`}
          </Button>
          <small className="ac-muted">
            الجلسة محفوظة بملف تعريف ارتباط محمي. كلمات المرور لا تُحفظ في
            المتصفح.
          </small>
        </form>
      </main>
    );
  const device = data.devices.find((device) => device.id === selected);
  const activeTab =
    [...tabs, ...extraTabs].find((item) => item.id === tab) || tabs[0];
  return (
    <CenterContext.Provider
      value={{
        workActive,
        setWorkPending: (key, pending) =>
          setPendingWork((previous) =>
            previous[key] === pending
              ? previous
              : { ...previous, [key]: pending },
          ),
        data,
        device,
        selected,
        employeeId,
        openEmployee: (id) => {
          const target = data.people.find((p) => p.id === id);
          if (target) selectDevice(target.deviceId);
          setEmployeeId(id);
          navigate("credentials");
        },
        select: selectDevice,
        busy,
        act,
        read,
        refresh,
        modal: setModal,
        tell,
        navigate,
        setup,
        help,
        run,
      }}
    >
      <div className="access-center" dir="rtl" style={brandTheme}>
        <a className="ac-skip" href="#main-content">
          انتقل إلى محتوى الصفحة
        </a>
        {menu && (
          <AppNavigation
            drawer
            tabs={tabs}
            active={tab}
            navigate={navigate}
            help={() => help("start")}
            close={() => setMenu(false)}
          />
        )}
        <div className="ac-layout">
          <AppNavigation
            tabs={tabs}
            active={tab}
            navigate={navigate}
            help={() => help("start")}
          />
          <main className="ac-main" id="main-content" tabIndex={-1}>
            <div className="ac-print-brand">
              <Brand />
            </div>
            <div className="ac-mobile-brand">
              <Brand compact />
            </div>
            <div className="ac-company-bar">
              <div>
                {data.company?.logo && (
                  <img src={data.company.logo} alt={`شعار ${data.company.nameAr}`} />
                )}
                <span>الشركة</span>
                <strong>{data.company?.nameAr || "—"}</strong>
              </div>
              <label>
                تبديل الشركة
                <select
                  aria-label="تبديل الشركة"
                  value={data.companyId || "legacy"}
                  disabled={
                    busy ||
                    workActive ||
                    Boolean(modal || setupOpen || confirmation)
                  }
                  onChange={(e) => {
                    setCompanyId(e.target.value);
                    setEmployeeId("");
                    setSelected(deviceSelections.current[e.target.value] || "");
                    setEnrollNext(null);
                  }}
                >
                  {data.companies?.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.nameAr}
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={() => navigate("companies")}>
                إدارة الشركات والفروع
              </Button>
            </div>
            <header className="ac-top">
              <div className="ac-actions">
                <button
                  className="ac-nav-toggle"
                  aria-label="فتح قائمة الأقسام"
                  aria-expanded={menu}
                  aria-controls={menu ? "access-mobile-navigation" : undefined}
                  onClick={() => setMenu(!menu)}
                >
                  <Menu size={22} />
                </button>
                <div>
                  <h1>{activeTab.name}</h1>
                  <p>{BRAND.description}</p>
                </div>
              </div>
              <div className="ac-actions">
                <Button
                  aria-label="مساعدة هذه الصفحة"
                  onClick={() =>
                    help(
                      (
                        {
                          dashboard: "start",
                          devices: "connect",
                          people: "employee",
                          doors: "doors",
                          credentials: "credentials",
                          permissions: "permissions",
                          attendance: "shifts",
                          reports: "reports",
                          settings: "errors",
                        } as Record<string, string>
                      )[tab] || "start",
                    )
                  }
                >
                  <CircleHelp size={18} />
                  <span className="ac-help-label">مساعدة</span>
                </Button>
                <span className="ac-muted">{data.actor.name}</span>
                <Badge value={data.actor.role} />
                <Button
                  aria-label="تسجيل الخروج"
                  disabled={busy}
                  onClick={async () => {
                    await logout();
                    sessionStorage.removeItem("skyline-gate");
                    setData(null);
                    setCompanyId("");
                    setPendingWork({});
                  }}
                >
                  <LogOut size={17} />
                </Button>
              </div>
            </header>
            {message.text ? (
              <div
                role={message.error ? "alert" : "status"}
                className={`ac-message ${message.error ? "error" : ""}`}
              >
                {message.text}
                {!message.error &&
                  enrollNext &&
                  data.people.some(
                    (p) =>
                      p.deviceId === enrollNext.deviceId &&
                      p.employeeNo === enrollNext.employeeNo,
                  ) && (
                    <div className="ac-actions" style={{ marginTop: 12 }}>
                      <Button
                        primary
                        onClick={() => {
                          const person = data.people.find(
                            (p) =>
                              p.deviceId === enrollNext.deviceId &&
                              p.employeeNo === enrollNext.employeeNo,
                          );
                          if (person) {
                            selectDevice(person.deviceId);
                            setEmployeeId(person.id);
                            setEnrollNext(null);
                            navigate("credentials");
                          }
                        }}
                      >
                        الخطوة التالية: تسجيل وجه الموظف الجديد
                      </Button>
                    </div>
                  )}
              </div>
            ) : null}
            {companyId && data.companyId !== companyId ? (
              <section className="ac-card" role="status">
                جارٍ فتح بيانات الشركة المختارة…
                <Button onClick={() => void refresh()}>إعادة المحاولة</Button>
              </section>
            ) : (
              <div key={data.companyId || "legacy"}>
                {tab === "companies" ? (
                  <CompaniesPage
                    onSelect={(id) => {
                      setCompanyId(id);
                      setSelected(deviceSelections.current[id] || "");
                      navigate("devices");
                    }}
                  />
                ) : (
                  <AccessPanels tab={tab} guideTopic={guideTopic} />
                )}
              </div>
            )}
          </main>
        </div>
        <nav className="ac-bottom" aria-label="التنقل السريع للموبايل">
          {tabs
            .filter((item) =>
              ["dashboard", "people", "credentials", "attendance"].includes(
                item.id,
              ),
            )
            .map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                aria-current={tab === item.id ? "page" : undefined}
              >
                <item.icon size={21} aria-hidden="true" />
                {item.id === "credentials"
                  ? "الوجه"
                  : item.id === "attendance"
                    ? "الحضور"
                    : item.name}
              </button>
            ))}
          <button onClick={() => setMenu(!menu)} aria-expanded={menu}>
            <Menu size={21} />
            المزيد
          </button>
        </nav>
        {modal ? (
          <CenterForms modal={modal} onClose={() => setModal(null)} />
        ) : null}
        {setupOpen ? (
          <DeviceSetup
            existing={setupDevice}
            onClose={() => setSetupOpen(false)}
            serverError={message.error ? message.text : ""}
          />
        ) : null}
        {confirmation ? (
          <Modal
            title={confirmation.title}
            busy={busy}
            onClose={() => setConfirmation(null)}
          >
            <p>{confirmation.description}</p>
            {confirmation.warnings.map((warning, index) => (
              <p key={index} className="ac-message warning">
                {warning}
              </p>
            ))}
            <p className="ac-muted">
              ينتهي التأكيد خلال دقيقتين؛ عدد العناصر: {confirmation.affected}.
            </p>
            <Field
              label={`اكتب: ${confirmation.phrase}`}
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              autoComplete="off"
            />
            <footer>
              <Button onClick={() => setConfirmation(null)} disabled={busy}>
                إلغاء
              </Button>
              <Button
                danger
                disabled={busy || phrase.trim() !== confirmation.phrase}
                onClick={async () => {
                  if (
                    await act({
                      action: "commit",
                      token: confirmation.token,
                      phrase,
                    })
                  ) {
                    setConfirmation(null);
                    setPhrase("");
                  }
                }}
              >
                {busy ? "جارٍ التنفيذ…" : "تأكيد وإرسال إلى الجهاز"}
              </Button>
            </footer>
          </Modal>
        ) : null}
      </div>
    </CenterContext.Provider>
  );
}
