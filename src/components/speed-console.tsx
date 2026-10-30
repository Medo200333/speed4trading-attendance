import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Fingerprint, LayoutDashboard, Server, Users, CalendarClock, Cloud, Trash2, Pencil, RefreshCw, Download, Clock, ClipboardList, Settings, DoorOpen, KeyRound, BookOpen,
} from "lucide-react";
import { AccessDesk, CloudDesk, DoorDesk, FingerDesk, GuideDesk } from "@/components/speed-desks";
import {
  counts, daySheet, loadStore, nowStamp, saveStore, seed, toCsv, todayKey, applyLive,
  type DayRow, type Device, type Person, type Punch, type Store,
} from "@/lib/speed-data";
import { desktopOnly, speedApi } from "@/lib/speed-link";

type Tab = "home" | "devices" | "doors" | "people" | "fingers" | "access" | "shifts" | "attendance" | "report" | "cloud" | "guide" | "setup";

const tabs: { id: Tab; name: string; icon: typeof Server }[] = [
  { id: "home", name: "اليوم", icon: LayoutDashboard },
  { id: "devices", name: "الأجهزة", icon: Server },
  { id: "doors", name: "الأبواب", icon: DoorOpen },
  { id: "people", name: "الموظفون", icon: Users },
  { id: "fingers", name: "البصمة", icon: Fingerprint },
  { id: "access", name: "الصلاحيات", icon: KeyRound },
  { id: "shifts", name: "الورديات", icon: Clock },
  { id: "attendance", name: "الحركات", icon: CalendarClock },
  { id: "report", name: "التقرير", icon: ClipboardList },
  { id: "cloud", name: "Hik-Connect", icon: Cloud },
  { id: "guide", name: "الدليل", icon: BookOpen },
  { id: "setup", name: "الإعداد", icon: Settings },
];

export function SpeedConsole() {
  const [store, setStore] = useState<Store>(() => seed());
  const [tab, setTab] = useState<Tab>("home");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<Device | null>(null);
  const [removing, setRemoving] = useState<Device | null>(null);
  const [typed, setTyped] = useState("");
  const [date, setDate] = useState(todayKey());
  const [query, setQuery] = useState("");
  const [showPerson, setShowPerson] = useState(false);
  const [showDevice, setShowDevice] = useState(false);
  const [clock, setClock] = useState(nowStamp);
  const [busy, setBusy] = useState("");

  useEffect(() => { setStore(loadStore()); }, []);
  useEffect(() => { saveStore(store); }, [store]);
  useEffect(() => {
    const timer = setInterval(() => setClock(nowStamp()), 30000);
    return () => clearInterval(timer);
  }, []);

  const company = store.companies.find((c) => c.id === store.companyId);
  const devices = useMemo(() => store.devices.filter((d) => d.companyId === store.companyId && !d.removed), [store]);
  const people = useMemo(() => store.people.filter((p) => p.companyId === store.companyId), [store]);
  const punches = useMemo(() => store.punches.filter((p) => p.companyId === store.companyId).slice().reverse(), [store]);
  const rows = useMemo(() => daySheet(store, store.companyId, date), [store, date]);
  const todayRows = useMemo(() => daySheet(store, store.companyId, todayKey()), [store]);
  const tally = counts(todayRows);

  if (!company) return null;

  const audit = (text: string, next: Store): Store => ({
    ...next,
    audit: [{ id: `au-${Date.now()}`, companyId: next.companyId, at: nowStamp(), text }, ...next.audit],
  });
  const patch = (next: Store, message: string) => { setStore(audit(message, next)); setNote(message); };

  const saveEdit = () => {
    if (!editing) return;
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(editing.ip)) { setNote("العنوان لازم يكون أربعة أرقام، زي 192.168.1.214."); return; }
    patch({ ...store, devices: store.devices.map((d) => d.id === editing.id ? editing : d) }, `اتحفظ جهاز ${editing.branch}.`);
    setEditing(null);
  };
  const confirmDelete = () => {
    if (!removing || typed.trim() !== removing.cloudName) { setNote("الاسم مش مطابق. الحذف متوقف."); return; }
    patch({
      ...store,
      devices: store.devices.map((d) => d.id === removing.id ? { ...d, removed: true, online: false } : d),
    }, `اتشال ${removing.cloudName} من الأجهزة. السجل محفوظ.`);
    setRemoving(null);
    setTyped("");
  };

  const checkDevice = async (device: Device) => {
    const api = speedApi();
    if (!api) { setNote(desktopOnly); return; }
    if (!device.pass) { setNote(`اكتب كلمة سر جهاز ${device.branch} من تعديل الجهاز.`); return; }
    setBusy(device.id);
    const result = await api.probe({ host: device.ip, port: device.port || 80, username: device.user || "admin", password: device.pass });
    setBusy("");
    if (!result.ok) {
      patch({ ...store, devices: store.devices.map((row) => row.id === device.id ? { ...row, online: false, lastSync: nowStamp() } : row) }, `${device.branch}: ${result.error}`);
      return;
    }
    patch({
      ...store,
      devices: store.devices.map((row) => row.id === device.id ? { ...row, online: true, lastSync: nowStamp(), model: result.model || row.model, firmware: result.firmware || row.firmware, serial: result.serial || row.serial } : row),
    }, `${device.branch} متصل. ${result.model}${result.serial ? ` · ${result.serial}` : ""}`);
  };

  const pullDay = async (day: string) => {
    const api = speedApi();
    if (!api) { setNote(desktopOnly); return; }
    const targets = store.devices.filter((device) => device.companyId === store.companyId && !device.removed);
    if (!targets.some((device) => device.pass)) { setNote("اكتب كلمة سر كل جهاز من تعديل الجهاز قبل السحب."); return; }
    setBusy("pull");
    let next = store;
    const notes: string[] = [];
    for (const device of targets) {
      if (!device.pass) { notes.push(`${device.branch}: من غير كلمة سر`); continue; }
      const result = await api.pull({ host: device.ip, port: device.port || 80, username: device.user || "admin", password: device.pass, day });
      if (!result.ok) {
        notes.push(`${device.branch}: ${result.error}`);
        next = { ...next, devices: next.devices.map((row) => row.id === device.id ? { ...row, online: false, lastSync: nowStamp() } : row) };
        continue;
      }
      const current = next.devices.find((row) => row.id === device.id) ?? device;
      next = applyLive(next, current, result, day);
      if (result.device.model || result.device.serial) {
        next = { ...next, devices: next.devices.map((row) => row.id === device.id ? { ...row, model: result.device.model || row.model, firmware: result.device.firmware || row.firmware, serial: result.device.serial || row.serial } : row) };
      }
      notes.push(`${device.branch}: ${result.punches.length} حركة، ${result.users.length} شخص`);
    }
    setBusy("");
    patch(next, notes.join(" · "));
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="bg-side text-panel">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}speed-logo.svg`} alt="سبيد فور تريدنج" className="h-10 w-auto" />
            <div>
              <p className="text-xs text-clay">سبيد فور تريدنج</p>
              <p className="text-lg font-semibold">الحضور والانصراف</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <bdi className="text-sm text-panel/80">{clock}</bdi>
            <select className="min-h-11 rounded-card border border-line bg-panel px-3 text-ink" value={store.companyId} onChange={(e) => setStore({ ...store, companyId: e.target.value })}>
              {store.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-panel/15 bg-nav px-3">
          {tabs.map((item) => {
            const Icon = item.icon;
            const on = tab === item.id;
            return (
              <button key={item.id} className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm ${on ? "border-clay text-panel" : "border-transparent text-panel/70"}`} onClick={() => setTab(item.id)}>
                <Icon className="size-4" />{item.name}
              </button>
            );
          })}
        </nav>
      </header>
      <div className="mx-auto min-w-0 max-w-6xl">
        {note ? <p className="mx-5 mt-5 rounded-card border border-line bg-panel px-4 py-3 text-sm">{note}</p> : null}
        <main className="space-y-6 p-5">
          <h1 className="text-3xl font-semibold">{tabs.find((item) => item.id === tab)?.name}</h1>
          {tab === "home" ? <Home tally={tally} devices={devices} rows={todayRows} punches={punches.slice(0, 6)} company={company.name} /> : null}
          {tab === "devices" ? (
            <Devices devices={devices} busy={busy} onAdd={() => setShowDevice(true)} onCheck={(d) => void checkDevice(d)} onEdit={(d) => setEditing({ ...d })} onDelete={(d) => { setRemoving(d); setTyped(""); }} />
          ) : null}
          {tab === "doors" ? <DoorDesk store={store} patch={patch} /> : null}
          {tab === "people" ? (
            <People store={store} people={people} query={query} setQuery={setQuery} onAdd={() => setShowPerson(true)} onToggle={(p) => patch({ ...store, people: store.people.map((row) => row.id === p.id ? { ...row, active: !row.active } : row) }, p.active ? `اتوقف ${p.name}.` : `اترّجّع ${p.name}.`)} />
          ) : null}
          {tab === "fingers" ? <FingerDesk store={store} patch={patch} /> : null}
          {tab === "access" ? <AccessDesk store={store} /> : null}
          {tab === "shifts" ? <Shifts store={store} /> : null}
          {tab === "attendance" ? <Moves punches={punches} date={date} setDate={setDate} people={people.filter((p) => p.active)} devices={devices} busy={busy === "pull"} onPull={() => void pullDay(date)} onAdd={(entry) => patch({ ...store, punches: [...store.punches, entry] }, `اتسجلت حركة ${entry.person} كتصحيح.`)} /> : null}
          {tab === "report" ? <Report date={date} setDate={setDate} rows={rows} company={company.name} /> : null}
          {tab === "cloud" ? <CloudDesk store={store} patch={patch} /> : null}
          {tab === "guide" ? <GuideDesk /> : null}
          {tab === "setup" ? <Setup store={store} patch={patch} /> : null}
        </main>
      </div>
      {editing ? (
        <Dialog title="تعديل الجهاز" onClose={() => setEditing(null)}>
          <Field label="الفرع" value={editing.branch} onChange={(branch) => setEditing({ ...editing, branch })} />
          <Field label="الاسم" value={editing.cloudName} onChange={(cloudName) => setEditing({ ...editing, cloudName })} />
          <Field label="عنوان البصمة" value={editing.ip} onChange={(ip) => setEditing({ ...editing, ip })} ltr />
          <Field label="حساب الجهاز" value={editing.user || "admin"} onChange={(user) => setEditing({ ...editing, user })} ltr />
          <Field label="كلمة سر الجهاز" value={editing.pass} onChange={(pass) => setEditing({ ...editing, pass })} ltr secret />
          <p className="text-xs text-muted">حساب البصمة نفسها على الشبكة، مش إيميل هيك-كونكت.</p>
          <button className="min-h-11 rounded-card bg-clay px-4 text-panel" onClick={saveEdit}>حفظ</button>
        </Dialog>
      ) : null}
      {removing ? (
        <Dialog title="حذف الجهاز" onClose={() => setRemoving(null)}>
          <p className="text-sm">يشيل الجهاز من الحضور فقط. البصمة لا تتصفر، والحركات تفضل في التقرير.</p>
          <p className="text-sm">اكتب: <bdi className="font-semibold">{removing.cloudName}</bdi></p>
          <input className="min-h-11 w-full rounded-card border border-line bg-paper px-3" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <button className="min-h-11 rounded-card bg-clay px-4 text-panel disabled:opacity-40" disabled={typed.trim() !== removing.cloudName} onClick={confirmDelete}>تأكيد الحذف</button>
        </Dialog>
      ) : null}
      {showDevice ? <AddDevice store={store} onClose={() => setShowDevice(false)} onSave={(device) => { patch({ ...store, devices: [...store.devices, device] }, `اتضاف ${device.branch}.`); setShowDevice(false); }} /> : null}
      {showPerson ? <AddPerson store={store} devices={devices} onClose={() => setShowPerson(false)} onSave={(person) => { patch({ ...store, people: [...store.people, person] }, `اتضاف ${person.name}.`); setShowPerson(false); }} /> : null}
    </div>
  );
}

function Home({ tally, devices, rows, punches, company }: { tally: ReturnType<typeof counts>; devices: Device[]; rows: DayRow[]; punches: Store["punches"]; company: string }) {
  const cards = [
    ["حاضر", tally.present, false],
    ["متأخر", tally.late, false],
    ["غياب", tally.absent, true],
    ["أجهزة متصلة", devices.filter((d) => d.online).length, false],
  ] as const;
  return (
    <>
      <p className="text-sm text-muted">{company}</p>
      <section className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-panel xl:grid-cols-4">
        {cards.map(([label, value, alert]) => (
          <article key={label} className="border-b border-line px-5 py-6 xl:border-b-0 xl:border-s xl:first:border-s-0">
            <p className={`text-5xl font-semibold leading-none ${alert && value > 0 ? "text-clay" : "text-ink"}`}>{value}</p>
            <p className="mt-3 text-sm text-muted">{label}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {devices.map((d) => {
          const branchRows = rows.filter((r) => r.branch === d.branch);
          const present = branchRows.filter((r) => r.status !== "غياب").length;
          const absent = branchRows.filter((r) => r.status === "غياب").length;
          return (
            <article key={d.id} className="overflow-hidden rounded-card border border-line bg-panel">
              <div className={`h-1 ${d.online ? "bg-ok" : "bg-line"}`} />
              <div className="p-4">
                <div className="flex items-center justify-between gap-2"><Status online={d.online} /><bdi className="text-xs text-muted">{d.ip}</bdi></div>
                <h2 className="mt-3 text-xl font-semibold">{d.branch}</h2>
                <p className="text-sm text-muted"><bdi>{d.cloudName}</bdi></p>
                <p className="mt-4 text-sm">حضور {present} · غياب {absent}</p>
              </div>
            </article>
          );
        })}
      </section>
      <section className="rounded-card border border-line bg-panel">
        <h2 className="border-b border-line px-4 py-3 font-semibold">آخر الحركات</h2>
        <ul>{punches.map((p) => <li key={p.id} className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm last:border-0"><span>{p.person}<span className="block text-muted">{p.branch} · {p.kind}</span></span><bdi>{p.at.slice(11, 16)}</bdi></li>)}</ul>
      </section>
    </>
  );
}

function Devices({ devices, busy, onAdd, onCheck, onEdit, onDelete }: { devices: Device[]; busy: string; onAdd: () => void; onCheck: (d: Device) => void; onEdit: (d: Device) => void; onDelete: (d: Device) => void }) {
  return (
    <>
      <div className="flex justify-end"><button className="min-h-11 rounded-card bg-clay px-4 text-panel" onClick={onAdd}>إضافة جهاز</button></div>
      {!devices.length ? <Empty text="لا توجد أجهزة. المحذوف يختفي من هنا ويبقى أثره في التقرير." /> : (
        <div className="overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-muted"><tr className="border-b border-line">{["الفرع", "الجهاز", "العنوان", "الموديل", "آخر فحص", "الحالة", ""].map((h) => <th key={h} className="px-3 py-3 text-right font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-3">{d.branch}</td>
                  <td className="px-3 py-3"><bdi>{d.cloudName}</bdi></td>
                  <td className="px-3 py-3"><bdi>{d.ip}:{d.port}</bdi></td>
                  <td className="px-3 py-3">{d.model}<span className="block text-xs text-muted">{d.firmware}</span></td>
                  <td className="px-3 py-3">{d.lastSync}</td>
                  <td className="px-3 py-3"><Status online={d.online} /></td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1">
                    <Mini label={busy === d.id ? "جارٍ الفحص" : "فحص"} onClick={() => onCheck(d)}><RefreshCw className="size-4" /></Mini>
                    <Mini label="تعديل" onClick={() => onEdit(d)}><Pencil className="size-4" /></Mini>
                    <Mini label="حذف" onClick={() => onDelete(d)}><Trash2 className="size-4" /></Mini>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function People({ store, people, query, setQuery, onAdd, onToggle }: { store: Store; people: Person[]; query: string; setQuery: (v: string) => void; onAdd: () => void; onToggle: (p: Person) => void }) {
  const shown = people.filter((p) => `${p.name} ${p.code}`.includes(query.trim()));
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <input className="min-h-11 flex-1 rounded-card border border-line bg-panel px-3" placeholder="بحث بالاسم أو الرقم" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="min-h-11 rounded-card bg-clay px-4 text-panel" onClick={onAdd}>إضافة موظف</button>
      </div>
      <ul className="grid gap-2">
        {shown.map((p) => {
          const device = store.devices.find((d) => d.id === p.deviceId);
          const department = store.departments.find((d) => d.id === p.departmentId)?.name ?? "";
          const shift = store.shifts.find((s) => s.id === p.shiftId)?.name ?? "";
          const means = [p.finger ? "بصمة" : "", p.face ? "وجه" : "", p.card ? "كارت" : ""].filter(Boolean).join(" · ") || "بدون وسيلة";
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-panel px-4 py-3">
              <span><strong>{p.name}</strong><span className="block text-sm text-muted"><bdi>{p.code}</bdi> · {department} · {shift} · {device?.branch ?? "بدون فرع"}</span><span className="text-sm text-muted">{means}</span></span>
              <button className="min-h-11 rounded-card border border-line px-3 text-sm" onClick={() => onToggle(p)}>{p.active ? "إيقاف" : "تفعيل"}</button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Shifts({ store }: { store: Store }) {
  const shifts = store.shifts.filter((s) => s.companyId === store.companyId);
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {shifts.map((s) => (
        <li key={s.id} className="rounded-card border border-line bg-panel p-4">
          <h2 className="font-semibold">{s.name}</h2>
          <p className="text-sm text-muted">من <bdi>{s.start}</bdi> إلى <bdi>{s.end}</bdi></p>
          <p className="text-sm">سماح التأخير {s.grace} دقيقة · {store.people.filter((p) => p.shiftId === s.id && p.active).length} موظف</p>
        </li>
      ))}
    </ul>
  );
}

function Moves({ punches, date, setDate, people, devices, busy, onPull, onAdd }: { punches: Store["punches"]; date: string; setDate: (v: string) => void; people: Person[]; devices: Device[]; busy: boolean; onPull: () => void; onAdd: (p: Punch) => void }) {
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [kind, setKind] = useState<Punch["kind"]>("دخول");
  const [time, setTime] = useState("09:00");
  const shown = punches.filter((p) => p.at.startsWith(date));
  return (
    <>
      <div className="grid gap-2 rounded-card border border-line bg-panel p-4 sm:grid-cols-4">
        <label className="text-sm">اليوم<input className="mt-1 min-h-11 w-full rounded-card border border-line bg-paper px-3" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-sm">الموظف<select className="mt-1 min-h-11 w-full rounded-card border border-line bg-paper px-3" value={personId} onChange={(e) => setPersonId(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-sm">النوع<select className="mt-1 min-h-11 w-full rounded-card border border-line bg-paper px-3" value={kind} onChange={(e) => setKind(e.target.value as Punch["kind"])}><option>دخول</option><option>خروج</option></select></label>
        <label className="text-sm">الوقت<input className="mt-1 min-h-11 w-full rounded-card border border-line bg-paper px-3" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <button className="min-h-11 rounded-card bg-ink px-4 text-panel sm:col-span-4" onClick={() => {
          const person = people.find((p) => p.id === personId);
          const device = devices.find((d) => d.id === person?.deviceId);
          if (!person || !time) return;
          onAdd({ id: `man-${Date.now()}`, companyId: person.companyId, deviceId: person.deviceId, personId: person.id, deviceName: device?.cloudName ?? "", branch: device?.branch ?? "", person: person.name, at: `${date} ${time}`, kind, source: "تصحيح" });
        }}>تسجيل تصحيح</button>
        <button className="min-h-11 rounded-card bg-clay px-4 text-panel disabled:opacity-50 sm:col-span-4" disabled={busy} onClick={onPull}>{busy ? "جارٍ السحب من الأجهزة" : "سحب حركات اليوم من الأجهزة"}</button>
      </div>
      <ul className="grid gap-2">{shown.map((p) => <li key={p.id} className="grid gap-1 rounded-card border border-line bg-panel px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto]"><span><strong>{p.person}</strong><span className="block text-muted">{p.branch} · {p.source}</span></span><span>{p.kind}</span><bdi>{p.at}</bdi></li>)}{!shown.length ? <Empty text="لا حركات في اليوم ده." /> : null}</ul>
    </>
  );
}

function Report({ date, setDate, rows, company }: { date: string; setDate: (v: string) => void; rows: DayRow[]; company: string }) {
  const tally = counts(rows);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="text-sm">يوم التقرير<input className="mt-1 block min-h-11 rounded-card border border-line bg-panel px-3" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-card bg-clay px-4 text-panel" onClick={() => download(`${company}-${date}.csv`, toCsv(rows))}><Download className="size-4" />تنزيل CSV</button>
      </div>
      <p className="text-sm text-muted">حاضر {tally.present} · متأخر {tally.late} · غياب {tally.absent}. التأخير يتحسب بعد سماح الوردية.</p>
      <div className="overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-muted"><tr className="border-b border-line">{["الموظف", "الفرع", "القسم", "دخول", "خروج", "الحالة", "تأخير"].map((h) => <th key={h} className="px-3 py-3 text-right font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.personId} className="border-b border-line last:border-0"><td className="px-3 py-3">{r.name}<span className="block text-xs text-muted"><bdi>{r.code}</bdi> · {r.shift}</span></td><td className="px-3 py-3">{r.branch}</td><td className="px-3 py-3">{r.department}</td><td className="px-3 py-3"><bdi>{r.inn || "—"}</bdi></td><td className="px-3 py-3"><bdi>{r.out || "—"}</bdi></td><td className="px-3 py-3">{r.status}</td><td className="px-3 py-3">{r.late ? `${r.late} د` : "—"}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function Setup({ store, patch }: { store: Store; patch: (next: Store, message: string) => void }) {
  const [companyName, setCompanyName] = useState("");
  const [department, setDepartment] = useState("");
  const deps = store.departments.filter((d) => d.companyId === store.companyId);
  const log = store.audit.filter((a) => a.companyId === store.companyId).slice(0, 8);
  return (
    <section className="grid gap-3">
      <article className="rounded-card border border-line bg-panel p-4">
        <h2 className="font-semibold">المنصة</h2>
        <p className="text-sm text-muted">النسخة دي للتشغيل اليومي. الربط مع منصة MK يتم من غير ما يظهر رقم داخلي على الشاشة.</p>
      </article>
      <article className="rounded-card border border-line bg-panel p-4">
        <h2 className="font-semibold">الأقسام</h2>
        <ul className="my-2 text-sm">{deps.map((d) => <li key={d.id}>{d.name}</li>)}</ul>
        <div className="flex gap-2"><input className="min-h-11 flex-1 rounded-card border border-line bg-paper px-3" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="قسم جديد" /><button className="min-h-11 rounded-card bg-ink px-3 text-panel" onClick={() => { const name = department.trim(); if (name.length < 2) return; patch({ ...store, departments: [...store.departments, { id: `dep-${Date.now()}`, companyId: store.companyId, name }] }, `اتضاف قسم ${name}.`); setDepartment(""); }}>إضافة</button></div>
      </article>
      <article className="rounded-card border border-line bg-panel p-4">
        <h2 className="font-semibold">شركة جديدة</h2>
        <div className="mt-2 flex gap-2"><input className="min-h-11 flex-1 rounded-card border border-line bg-paper px-3" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="اسم الشركة" /><button className="min-h-11 rounded-card bg-clay px-3 text-panel" onClick={() => { const name = companyName.trim(); if (name.length < 2) return; const id = `c-${Date.now()}`; patch({ ...store, companies: [...store.companies, { id, name, city: "غير محدد" }], shifts: [...store.shifts, { id: `sh-${id}`, companyId: id, name: "صباحي", start: "08:00", end: "16:00", grace: 10 }], companyId: id }, `اتفتحت شركة ${name}.`); setCompanyName(""); }}>فتح</button></div>
      </article>
      <article className="rounded-card border border-line bg-panel p-4">
        <h2 className="font-semibold">سجل التدقيق</h2>
        <ul className="mt-2 space-y-2 text-sm">{log.map((a) => <li key={a.id}><bdi className="text-muted">{a.at}</bdi> — {a.text}</li>)}{!log.length ? <li className="text-muted">لا سجلات.</li> : null}</ul>
      </article>
    </section>
  );
}

function AddDevice({ store, onClose, onSave }: { store: Store; onClose: () => void; onSave: (d: Device) => void }) {
  const [branch, setBranch] = useState("");
  const [cloudName, setCloudName] = useState("");
  const [ip, setIp] = useState("192.168.1.");
  return (
    <Dialog title="جهاز جديد" onClose={onClose}>
      <Field label="الفرع" value={branch} onChange={setBranch} />
      <Field label="الاسم على الجهاز" value={cloudName} onChange={setCloudName} />
      <Field label="العنوان" value={ip} onChange={setIp} ltr />
      <button className="min-h-11 rounded-card bg-clay px-4 text-panel" onClick={() => {
        if (branch.trim().length < 2 || cloudName.trim().length < 2 || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return;
        onSave({ id: `dev-${Date.now()}`, companyId: store.companyId, branch: branch.trim(), cloudName: cloudName.trim(), ip, port: 80, model: "DS-K1T342", firmware: "غير مقروء", serial: "يُقرأ من الجهاز", online: false, lastSync: "لم يُفحص", removed: false, user: "admin", pass: "" });
      }}>حفظ الجهاز</button>
    </Dialog>
  );
}

function AddPerson({ store, devices, onClose, onSave }: { store: Store; devices: Device[]; onClose: () => void; onSave: (p: Person) => void }) {
  const deps = store.departments.filter((d) => d.companyId === store.companyId);
  const shifts = store.shifts.filter((s) => s.companyId === store.companyId);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState(deps[0]?.id ?? "");
  const [shiftId, setShiftId] = useState(shifts[0]?.id ?? "");
  const [finger, setFinger] = useState(true);
  const [face, setFace] = useState(false);
  const [card, setCard] = useState(false);
  return (
    <Dialog title="موظف جديد" onClose={onClose}>
      <Field label="الاسم" value={name} onChange={setName} />
      <Field label="الرقم الوظيفي" value={code} onChange={setCode} ltr />
      <label className="text-sm">الفرع<select className="mt-1 min-h-11 w-full rounded-card border border-line bg-paper px-3" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>{devices.map((d) => <option key={d.id} value={d.id}>{d.branch}</option>)}</select></label>
      <label className="text-sm">القسم<select className="mt-1 min-h-11 w-full rounded-card border border-line bg-paper px-3" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>{deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="text-sm">الوردية<select className="mt-1 min-h-11 w-full rounded-card border border-line bg-paper px-3" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <div className="flex flex-wrap gap-3 text-sm">
        <label><input type="checkbox" checked={finger} onChange={(e) => setFinger(e.target.checked)} /> بصمة</label>
        <label><input type="checkbox" checked={face} onChange={(e) => setFace(e.target.checked)} /> وجه</label>
        <label><input type="checkbox" checked={card} onChange={(e) => setCard(e.target.checked)} /> كارت</label>
      </div>
      <button className="min-h-11 rounded-card bg-clay px-4 text-panel" onClick={() => {
        if (name.trim().length < 2 || !code.trim() || !deviceId || !departmentId || !shiftId) return;
        onSave({ id: `p-${Date.now()}`, companyId: store.companyId, deviceId, departmentId, shiftId, name: name.trim(), code: code.trim(), active: true, finger, face, card, cardNo: card ? `${code.trim()}01` : "" });
      }}>حفظ الموظف</button>
    </Dialog>
  );
}

function download(name: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Status({ online }: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm ${online ? "text-ok" : "text-muted"}`}>
      <span className={`size-2 rounded-full ${online ? "bg-ok" : "bg-line"}`} />
      {online ? "متصل" : "غير متصل"}
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-card border border-dashed border-line bg-panel p-6 text-sm text-muted">{text}</p>;
}
function Mini({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button className="inline-flex min-h-11 items-center gap-1 rounded-card border border-line px-2 text-xs" onClick={onClick}>{children}{label}</button>;
}
function Field({ label, value, onChange, ltr, secret }: { label: string; value: string; onChange: (v: string) => void; ltr?: boolean; secret?: boolean }) {
  return <label className="grid gap-1 text-sm">{label}<input className="min-h-11 rounded-card border border-line bg-paper px-3" type={secret ? "password" : "text"} dir={ltr ? "ltr" : undefined} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 grid place-items-end bg-ink/40 p-4 sm:place-items-center" onClick={onClose}>
      <div className="grid max-h-[90vh] w-full max-w-md gap-3 overflow-y-auto rounded-card bg-panel p-4" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-semibold">{title}</h2><button className="min-h-11 px-2" onClick={onClose}>إغلاق</button></div>
        {children}
      </div>
    </div>
  );
}
