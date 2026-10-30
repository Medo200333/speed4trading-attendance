import { useRef, useState } from "react";
import { LiveConfiguration } from "@/components/configuration-live";

type Area = { id: string; name: string; code: string };
type Device = { id: string; name: string; serial: string; areaId: string; kind: "face" | "fingerprint" | "intercom"; door: string };
type Department = { id: string; name: string; areaId: string };
type Person = { id: string; code: string; name: string; departmentId: string; photoFileName: string };
type Level = { id: string; name: string; schedule: string; deviceIds: string[] };
type Assignment = { id: string; personId: string; levelId: string };
type ConfigDraft = { schemaVersion: 1; areas: Area[]; devices: Device[]; departments: Department[]; persons: Person[]; levels: Level[]; assignments: Assignment[] };
type SectionKey = "areas" | "devices" | "departments" | "persons" | "levels" | "assignments" | "sync" | "backup";

const empty = (): ConfigDraft => ({ schemaVersion: 1, areas: [], devices: [], departments: [], persons: [], levels: [], assignments: [] });
const sections: { id: SectionKey; title: string; description: string }[] = [
  { id: "areas", title: "1. المناطق", description: "Areas" },
  { id: "devices", title: "2. الأجهزة والأبواب", description: "Devices & Doors" },
  { id: "departments", title: "3. الأقسام", description: "Departments" },
  { id: "persons", title: "4. الموظفون والصور", description: "Persons" },
  { id: "levels", title: "5. مستويات الوصول", description: "Access Levels" },
  { id: "assignments", title: "6. منح الصلاحيات", description: "Grant by Person" },
  { id: "sync", title: "7. إرسال الأجهزة", description: "Synchronization" },
  { id: "backup", title: "8. النسخ الاحتياطي", description: "Backup & Restore" },
];
const inputClass = "h-11 w-full min-w-0 rounded-md border border-line bg-canvas px-3 text-ink";
const buttonClass = "min-h-11 rounded-md border border-line bg-panel px-4 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-40";
const labelClass = "flex flex-col gap-1.5 text-sm text-muted";
const id = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validText(value: unknown, max = 200): value is string {
  return typeof value === "string" && value.length <= max;
}
function parseDraft(input: unknown): ConfigDraft {
  if (!isRecord(input) || input.schemaVersion !== 1) throw new Error("ملف الإعدادات ليس من إصدار متوافق.");
  const keys = ["areas", "devices", "departments", "persons", "levels", "assignments"] as const;
  for (const key of keys) {
    if (!Array.isArray(input[key]) || input[key].length > 2000) throw new Error(`قائمة ${key} غير صالحة.`);
    const seen = new Set<string>();
    for (const item of input[key]) {
      if (!isRecord(item) || !validText(item.id, 100) || !item.id || seen.has(item.id)) throw new Error(`معرّف غير صالح في ${key}.`);
      seen.add(item.id);
    }
  }
  const draft = input as ConfigDraft;
  if (draft.areas.some((x) => !validText(x.name) || !validText(x.code))) throw new Error("المناطق غير صالحة.");
  if (draft.devices.some((x) => !validText(x.name) || !validText(x.serial) || !validText(x.areaId, 100) || !validText(x.door) || !["face", "fingerprint", "intercom"].includes(x.kind))) throw new Error("الأجهزة غير صالحة.");
  if (draft.departments.some((x) => !validText(x.name) || !validText(x.areaId, 100))) throw new Error("الأقسام غير صالحة.");
  if (draft.persons.some((x) => !validText(x.code, 100) || !validText(x.name) || !validText(x.departmentId, 100) || !validText(x.photoFileName))) throw new Error("الموظفون غير صالحين.");
  if (draft.levels.some((x) => !validText(x.name) || !validText(x.schedule) || !Array.isArray(x.deviceIds) || x.deviceIds.length > 2000 || x.deviceIds.some((v) => !validText(v, 100)))) throw new Error("الصلاحيات غير صالحة.");
  if (draft.assignments.some((x) => !validText(x.personId, 100) || !validText(x.levelId, 100))) throw new Error("تعيينات الأشخاص غير صالحة.");
  const ids = (key: keyof ConfigDraft) => new Set((draft[key] as { id: string }[]).map((x) => x.id));
  const areas = ids("areas"); const devices = ids("devices"); const departments = ids("departments"); const persons = ids("persons"); const levels = ids("levels");
  if (draft.devices.some((x) => !areas.has(x.areaId)) || draft.departments.some((x) => !areas.has(x.areaId))) throw new Error("توجد أجهزة أو أقسام مرتبطة بمناطق غير موجودة.");
  if (draft.persons.some((x) => !departments.has(x.departmentId))) throw new Error("يوجد موظف في قسم غير موجود.");
  if (draft.levels.some((x) => x.deviceIds.some((deviceId) => !devices.has(deviceId)))) throw new Error("توجد صلاحية مرتبطة بجهاز غير موجود.");
  if (draft.assignments.some((x) => !persons.has(x.personId) || !levels.has(x.levelId))) throw new Error("توجد تعيينات غير مرتبطة بأشخاص أو صلاحيات.");
  if (new Set(draft.persons.map((x) => x.code.trim())).size !== draft.persons.length) throw new Error("هناك أرقام موظفين مكررة.");
  if (draft.persons.some((x) => !x.code.trim() || !x.name.trim())) throw new Error("اسم أو رقم موظف ناقص.");
  return {
    schemaVersion: 1,
    areas: draft.areas.map((x) => ({ id: x.id, name: x.name, code: x.code })),
    devices: draft.devices.map((x) => ({ id: x.id, name: x.name, serial: x.serial, areaId: x.areaId, kind: x.kind, door: x.door })),
    departments: draft.departments.map((x) => ({ id: x.id, name: x.name, areaId: x.areaId })),
    persons: draft.persons.map((x) => ({ id: x.id, code: x.code, name: x.name, departmentId: x.departmentId, photoFileName: x.photoFileName })),
    levels: draft.levels.map((x) => ({ id: x.id, name: x.name, schedule: x.schedule, deviceIds: [...x.deviceIds] })),
    assignments: draft.assignments.map((x) => ({ id: x.id, personId: x.personId, levelId: x.levelId })),
  };
}

export function ConfigurationStudio({ apiBase, sessionId }: { apiBase: string; sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionKey>("areas");
  const [draft, setDraft] = useState<ConfigDraft>(empty);
  const [notice, setNotice] = useState("");
  const [areaName, setAreaName] = useState(""); const [areaCode, setAreaCode] = useState("");
  const [deviceName, setDeviceName] = useState(""); const [serial, setSerial] = useState(""); const [deviceArea, setDeviceArea] = useState(""); const [deviceKind, setDeviceKind] = useState<Device["kind"]>("face"); const [door, setDoor] = useState("");
  const [depName, setDepName] = useState(""); const [depArea, setDepArea] = useState("");
  const [personCode, setPersonCode] = useState(""); const [personName, setPersonName] = useState(""); const [personDep, setPersonDep] = useState(""); const [personPhoto, setPersonPhoto] = useState<File | null>(null);
  const [levelName, setLevelName] = useState(""); const [schedule, setSchedule] = useState("All-day Template"); const [levelDeviceIds, setLevelDeviceIds] = useState<string[]>([]);
  const [grantPerson, setGrantPerson] = useState(""); const [grantLevel, setGrantLevel] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const tell = (message: string) => setNotice(message);
  const update = (next: ConfigDraft, message: string) => { setDraft(next); tell(message + " — تغييرات محلية فقط؛ نزّل ملف الخطة للاحتفاظ بها."); };
  const hasDependent = (kind: string, entryId: string) => {
    if (kind === "areas") return draft.devices.some((x) => x.areaId === entryId) || draft.departments.some((x) => x.areaId === entryId);
    if (kind === "devices") return draft.levels.some((x) => x.deviceIds.includes(entryId));
    if (kind === "departments") return draft.persons.some((x) => x.departmentId === entryId);
    if (kind === "persons") return draft.assignments.some((x) => x.personId === entryId);
    if (kind === "levels") return draft.assignments.some((x) => x.levelId === entryId);
    return false;
  };
  function rename(kind: "areas" | "devices" | "departments" | "persons" | "levels", entryId: string) {
    const entry = (draft[kind] as { id: string; name: string }[]).find((row) => row.id === entryId);
    if (!entry) return;
    const value = window.prompt("الاسم الجديد في الخطة المحلية:", entry.name);
    if (value === null) return;
    const name = value.trim();
    if (!name || name.length > 160) return tell("الاسم غير صالح.");
    const next = { ...draft, [kind]: (draft[kind] as { id: string; name: string }[]).map((row) => row.id === entryId ? { ...row, name } : row) } as ConfigDraft;
    update(next, "تم تعديل الاسم محليًا");
  }
  function editPersonCode(entryId: string) {
    const entry = draft.persons.find((row) => row.id === entryId);
    if (!entry) return;
    const value = window.prompt("رقم الموظف الجديد في الخطة:", entry.code);
    if (value === null) return;
    const code = value.trim();
    if (!code || code.length > 100 || draft.persons.some((row) => row.code === code && row.id !== entryId)) return tell("رقم موظف غير صالح أو مكرر.");
    update({ ...draft, persons: draft.persons.map((row) => row.id === entryId ? { ...row, code } : row) }, "تم تعديل الرقم محليًا");
  }
  function editDoor(entryId: string) {
    const entry = draft.devices.find((row) => row.id === entryId);
    if (!entry) return;
    const value = window.prompt("اسم الباب في الخطة:", entry.door);
    if (value === null) return;
    const doorName = value.trim();
    if (!doorName || doorName.length > 120) return tell("اسم الباب غير صالح.");
    update({ ...draft, devices: draft.devices.map((row) => row.id === entryId ? { ...row, door: doorName } : row) }, "تم تعديل الباب محليًا");
  }
  function editSchedule(entryId: string) {
    const entry = draft.levels.find((row) => row.id === entryId);
    if (!entry) return;
    const value = window.prompt("اسم جدول السماح:", entry.schedule);
    if (value === null) return;
    const scheduleName = value.trim();
    if (!scheduleName || scheduleName.length > 120) return tell("جدول السماح غير صالح.");
    update({ ...draft, levels: draft.levels.map((row) => row.id === entryId ? { ...row, schedule: scheduleName } : row) }, "تم تعديل الجدول محليًا");
  }
  function remove<K extends "areas" | "devices" | "departments" | "persons" | "levels" | "assignments">(kind: K, entryId: string) {
    if (hasDependent(kind, entryId)) return tell("لا يمكن حذف العنصر؛ فيه ارتباطات لازم تتفك الأول.");
    if (!window.confirm("حذف العنصر من الخطة المحلية فقط؟ لن يؤثر في Hik-Connect.")) return;
    const next = { ...draft, [kind]: draft[kind].filter((x) => x.id !== entryId) } as ConfigDraft;
    update(next, "تم الحذف من الخطة");
  }
  function downloadDraft() {
    const body = JSON.stringify({ ...draft, exportedAt: new Date().toISOString(), note: "Speed for Training local configuration plan only. NOT a backup from Hik-Connect devices. No biometric images." }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `SpeedForTraining-config-plan-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    tell("تم تجهيز تنزيل نسخة الخطة. الملف غير مشفّر ويحتوي أسماء وأرقام الموظفين؛ احفظه بمكان آمن.");
  }
  async function importDraft(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) return tell("الملف أكبر من الحد المسموح (2MB).");
    try {
      const restored = parseDraft(JSON.parse(await file.text()) as unknown);
      if (!window.confirm("استيراد الملف سيستبدل خطة الإعدادات الحالية في هذه الصفحة. هل حفظت نسخة منها؟")) return;
      setDraft(restored); tell("تم استيراد خطة الإعدادات محليًا؛ لم تُرسَل أي بيانات للأجهزة.");
    } catch (error) { tell(error instanceof Error ? error.message : "تعذّر قراءة الملف."); }
  }
  const counts = `${draft.areas.length} مناطق · ${draft.devices.length} أجهزة · ${draft.persons.length} موظفين · ${draft.levels.length} صلاحيات`;
  const nameById = <T extends { id: string; name: string }>(items: T[], key: string) => items.find((x) => x.id === key)?.name ?? "غير موجود";

  return (
    <section className="mt-4 rounded-lg border-2 border-brass bg-panel p-4" dir="rtl" aria-labelledby="studio-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="studio-title" className="text-lg font-bold">Speed for Training — مدير الإعدادات</h2>
          <p className="mt-1 text-xs text-muted">Areas → Devices → Departments → Persons → Access → Sync → Backup</p>
        </div>
        <button type="button" className={buttonClass} onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "إغلاق المدير" : "فتح مدير الإعدادات"}</button>
      </div>
      <p className="mt-2 text-sm leading-7 text-muted">محرر خطة إعدادات حقيقي وقابل للتصدير والاستيراد. <strong>غير متصل حاليًا بعمليات الكتابة في Hik-Connect</strong>؛ لا يُنشئ موظفين أو أبوابًا فعلية على السحابة أو الأجهزة.</p>
      {open ? (
        <div className="mt-4 space-y-4">
          <LiveConfiguration apiBase={apiBase} sessionId={sessionId} draft={draft} />
          <p className="rounded-md border border-line bg-canvas p-3 text-xs text-muted">{counts} — الخطة محفوظة في ذاكرة الصفحة فقط. نزّل نسخة JSON قبل تحديث الصفحة أو إغلاقها.</p>
          <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="أقسام مدير الإعدادات">
            {sections.map((s) => <button key={s.id} type="button" onClick={() => { setSection(s.id); tell(""); }} className={`${buttonClass} shrink-0 ${section === s.id ? "border-brass text-brass" : ""}`} aria-current={section === s.id ? "page" : undefined}>{s.title}</button>)}
          </nav>
          {notice ? <p role="status" className="rounded-md border border-line bg-canvas p-3 text-sm leading-6 text-ink">{notice}</p> : null}
          {section === "areas" ? <div className="space-y-4">
            <h3 className="font-semibold">المناطق والفروع</h3>
            <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!areaName.trim() || !areaCode.trim()) return tell("اكتب اسم المنطقة وكودها."); if (draft.areas.some((x) => x.code === areaCode.trim())) return tell("كود المنطقة موجود بالفعل."); update({ ...draft, areas: [...draft.areas, { id: id(), name: areaName.trim(), code: areaCode.trim() }] }, "تمت إضافة المنطقة"); setAreaName(""); setAreaCode(""); }}>
              <label className={labelClass}>اسم الفرع<input className={inputClass} required maxLength={120} value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="مثال: القاهرة" /></label>
              <label className={labelClass}>كود داخلي<input className={inputClass} required maxLength={40} value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="CAI" /></label>
              <button className={buttonClass} type="submit">إضافة منطقة للخطة</button>
            </form>
            <ul className="space-y-2">{draft.areas.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-line p-3 text-sm"><span>{a.name} <span className="text-muted" dir="ltr">({a.code})</span></span><button className={buttonClass} type="button" onClick={() => rename("areas", a.id)}>تعديل الاسم</button><button className={buttonClass} type="button" onClick={() => remove("areas", a.id)}>حذف</button></li>)}</ul>
          </div> : null}
          {section === "devices" ? <div className="space-y-4">
            <h3 className="font-semibold">الأجهزة والأبواب</h3>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!deviceArea || !deviceName.trim() || !door.trim()) return tell("اسم الجهاز والمنطقة واسم الباب مطلوبين."); if (serial.trim() && draft.devices.some((x) => x.serial === serial.trim())) return tell("السيريال موجود بالفعل في الخطة."); update({ ...draft, devices: [...draft.devices, { id: id(), name: deviceName.trim(), serial: serial.trim(), areaId: deviceArea, kind: deviceKind, door: door.trim() }] }, "تمت إضافة الجهاز للخطة"); setDeviceName(""); setSerial(""); setDoor(""); }}>
              <label className={labelClass}>اسم الجهاز<input required className={inputClass} maxLength={120} value={deviceName} onChange={(e) => setDeviceName(e.target.value)}/></label>
              <label className={labelClass}>المنطقة<select required className={inputClass} value={deviceArea} onChange={(e) => setDeviceArea(e.target.value)}><option value="">اختر منطقة</option>{draft.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              <label className={labelClass}>نوع الجهاز<select className={inputClass} value={deviceKind} onChange={(e) => setDeviceKind(e.target.value as Device["kind"])}><option value="face">بصمة وجه / تحكم دخول</option><option value="fingerprint">بصمة إصبع</option><option value="intercom">إنتركم</option></select></label>
              <label className={labelClass}>الباب المرتبط<input required className={inputClass} maxLength={120} value={door} onChange={(e) => setDoor(e.target.value)}/></label>
              <label className={labelClass}>السيريال (اختياري في الخطة)<input className={inputClass} maxLength={120} value={serial} onChange={(e) => setSerial(e.target.value)}/></label>
              <button type="submit" disabled={!draft.areas.length} className={buttonClass}>إضافة جهاز للخطة</button>
            </form>
            <ul className="space-y-2">{draft.devices.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-line p-3 text-sm"><span>{d.name} — {d.door} <span className="text-muted">({nameById(draft.areas, d.areaId)})</span></span><button type="button" className={buttonClass} onClick={() => editDoor(d.id)}>تعديل الباب</button><button type="button" className={buttonClass} onClick={() => rename("devices", d.id)}>تعديل الاسم</button><button type="button" className={buttonClass} onClick={() => remove("devices", d.id)}>حذف</button></li>)}</ul>
          </div> : null}
          {section === "departments" ? <div className="space-y-4">
            <h3 className="font-semibold">الأقسام</h3>
            <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!depName.trim() || !depArea) return tell("اكتب القسم واختر المنطقة."); update({ ...draft, departments: [...draft.departments, { id: id(), name: depName.trim(), areaId: depArea }] }, "تمت إضافة القسم"); setDepName(""); }}>
              <label className={labelClass}>اسم القسم<input required maxLength={120} className={inputClass} value={depName} onChange={(e) => setDepName(e.target.value)}/></label>
              <label className={labelClass}>المنطقة<select required className={inputClass} value={depArea} onChange={(e) => setDepArea(e.target.value)}><option value="">اختر منطقة</option>{draft.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              <button type="submit" disabled={!draft.areas.length} className={buttonClass}>إضافة قسم للخطة</button>
            </form>
            <ul className="space-y-2">{draft.departments.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-line p-3 text-sm"><span>{d.name} — {nameById(draft.areas, d.areaId)}</span><button type="button" className={buttonClass} onClick={() => rename("departments", d.id)}>تعديل الاسم</button><button type="button" className={buttonClass} onClick={() => remove("departments", d.id)}>حذف</button></li>)}</ul>
          </div> : null}
          {section === "persons" ? <div className="space-y-4">
            <h3 className="font-semibold">الموظفون والصور</h3>
            <p className="text-xs text-muted">الصورة يُحفظ اسم ملفها في الخطة فقط، ولا يتم رفعها أو تضمينها في نسخة JSON. احتفظ بملف الصورة الأصلي.</p>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const code = personCode.trim(); if (!code || !personName.trim() || !personDep) return tell("اكتب رقم الموظف واسمه وقسمه."); if (draft.persons.some((p) => p.code === code)) return tell("رقم الموظف مستخدم بالفعل."); update({ ...draft, persons: [...draft.persons, { id: id(), code, name: personName.trim(), departmentId: personDep, photoFileName: personPhoto?.name ?? "" }] }, "تمت إضافة الموظف للخطة فقط"); setPersonCode(""); setPersonName(""); setPersonPhoto(null); }}>
              <label className={labelClass}>رقم الموظف<input required maxLength={100} className={inputClass} value={personCode} onChange={(e) => setPersonCode(e.target.value)}/></label>
              <label className={labelClass}>اسم الموظف<input required maxLength={160} className={inputClass} value={personName} onChange={(e) => setPersonName(e.target.value)}/></label>
              <label className={labelClass}>القسم<select required className={inputClass} value={personDep} onChange={(e) => setPersonDep(e.target.value)}><option value="">اختر القسم</option>{draft.departments.map((d) => <option key={d.id} value={d.id}>{d.name} — {nameById(draft.areas, d.areaId)}</option>)}</select></label>
              <label className={labelClass}>صورة الموظف (للتجهيز فقط)<input className="mt-2 w-full text-xs" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0] ?? null; if (file && (file.size > 1_000_000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) { tell("اختر صورة JPEG أو PNG أو WebP أقل من 1MB."); e.target.value = ""; return; } setPersonPhoto(file); }}/></label>
              <button className={buttonClass} type="submit" disabled={!draft.departments.length}>إضافة موظف للخطة</button>
            </form>
            <ul className="space-y-2">{draft.persons.map((p) => <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-line p-3 text-sm"><span><strong dir="ltr">{p.code}</strong> — {p.name} <span className="text-muted">({nameById(draft.departments, p.departmentId)})</span>{p.photoFileName ? <span className="block text-xs text-muted">ملف الصورة: {p.photoFileName} (لم يُرفع)</span> : null}</span><button type="button" className={buttonClass} onClick={() => rename("persons", p.id)}>تعديل الاسم</button><button type="button" className={buttonClass} onClick={() => editPersonCode(p.id)}>تعديل الرقم</button><button type="button" className={buttonClass} onClick={() => remove("persons", p.id)}>حذف</button></li>)}</ul>
          </div> : null}
          {section === "levels" ? <div className="space-y-4">
            <h3 className="font-semibold">مستويات الوصول وجداول الأبواب</h3>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!levelName.trim() || !schedule.trim() || !levelDeviceIds.length) return tell("اكتب المستوى والجدول وحدد بابًا على الأقل."); update({ ...draft, levels: [...draft.levels, { id: id(), name: levelName.trim(), schedule: schedule.trim(), deviceIds: [...levelDeviceIds] }] }, "تمت إضافة مستوى الوصول للخطة"); setLevelName(""); setLevelDeviceIds([]); }}>
              <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>اسم مستوى الوصول<input required maxLength={120} className={inputClass} value={levelName} onChange={(e) => setLevelName(e.target.value)} placeholder="مثال: دخول الموظفين"/></label><label className={labelClass}>اسم جدول السماح<input required maxLength={120} className={inputClass} value={schedule} onChange={(e) => setSchedule(e.target.value)}/></label></div>
              <fieldset className="rounded-md border border-line p-3"><legend className="px-1 text-sm">اختيار الأجهزة والأبواب</legend><div className="grid gap-3 sm:grid-cols-2">{draft.devices.map((d) => <label key={d.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={levelDeviceIds.includes(d.id)} onChange={(e) => setLevelDeviceIds((current) => e.target.checked ? [...current, d.id] : current.filter((x) => x !== d.id))}/>{d.name} — {d.door}</label>)}</div></fieldset>
              <button className={buttonClass} type="submit" disabled={!draft.devices.length}>إضافة مستوى وصول للخطة</button>
            </form>
            <ul className="space-y-2">{draft.levels.map((l) => <li key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-line p-3 text-sm"><span>{l.name} — {l.schedule} — {l.deviceIds.length} أجهزة/أبواب في الخطة</span><button type="button" className={buttonClass} onClick={() => rename("levels", l.id)}>تعديل الاسم</button><button type="button" className={buttonClass} onClick={() => editSchedule(l.id)}>تعديل الجدول</button><button type="button" className={buttonClass} onClick={() => remove("levels", l.id)}>حذف</button></li>)}</ul>
          </div> : null}
          {section === "assignments" ? <div className="space-y-4">
            <h3 className="font-semibold">ربط الموظف بمستوى الوصول</h3>
            <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!grantPerson || !grantLevel) return tell("اختر الموظف ومستوى الوصول."); if (draft.assignments.some((a) => a.personId === grantPerson && a.levelId === grantLevel)) return tell("التعيين موجود في الخطة."); update({ ...draft, assignments: [...draft.assignments, { id: id(), personId: grantPerson, levelId: grantLevel }] }, "تم ربط الموظف بالصلاحية في الخطة"); }}>
              <label className={labelClass}>الموظف<select required className={inputClass} value={grantPerson} onChange={(e) => setGrantPerson(e.target.value)}><option value="">اختر موظف</option>{draft.persons.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
              <label className={labelClass}>مستوى الوصول<select required className={inputClass} value={grantLevel} onChange={(e) => setGrantLevel(e.target.value)}><option value="">اختر مستوى</option>{draft.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
              <button className={buttonClass} disabled={!draft.persons.length || !draft.levels.length} type="submit">إضافة تعيين للخطة</button>
            </form>
            <ul className="space-y-2">{draft.assignments.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-line p-3 text-sm"><span>{nameById(draft.persons, a.personId)} → {nameById(draft.levels, a.levelId)}</span><button type="button" className={buttonClass} onClick={() => remove("assignments", a.id)}>حذف</button></li>)}</ul>
          </div> : null}
          {section === "sync" ? <div className="space-y-3">
            <h3 className="font-semibold">إرسال الإعدادات إلى الأجهزة</h3>
            <p className="text-sm leading-7">جاهزية الخطة: {draft.persons.length} موظفًا و{draft.assignments.length} تعيينًا على {draft.devices.length} جهازًا. <strong>لم يُرسل أي شيء حتى الآن.</strong></p>
            <p className="text-sm leading-7 text-muted">التوصيل الفعلي يتطلب تحديد وتنفيذ واجهات كتابة مدعومة ومعتمدة لكل نوع جهاز، وتسجيل نتيجة المزامنة من الجهاز. لن نعرض نجاحًا وهميًا.</p>
            <button className={buttonClass} type="button" disabled>إرسال ومزامنة — غير متاح قبل التوصيل المعتمد</button>
          </div> : null}
          {section === "backup" ? <div className="space-y-3">
            <h3 className="font-semibold">تصدير واستيراد خطة Configuration</h3>
            <p className="text-sm leading-7">ملف JSON يحتوي المناطق والأجهزة والموظفين (الأسماء والأرقام) والصلاحيات والتعيينات في <strong>الخطة المحلية فقط</strong>. لا يحتوي صورًا أو بصمات أو كلمات مرور. <strong>ليس Backup فعليًا لإعدادات Hik-Connect أو الأجهزة.</strong></p>
            <p className="text-sm text-muted">الملف غير مشفّر؛ احتفظ به في مكان آمن، ولا ترسله إلى طرف غير موثوق.</p>
            <div className="flex flex-wrap gap-2"><button className={buttonClass} type="button" onClick={downloadDraft}>تنزيل نسخة من الخطة (JSON)</button><button className={buttonClass} type="button" onClick={() => fileInput.current?.click()}>استيراد خطة محفوظة</button></div>
            <input className="sr-only" ref={fileInput} type="file" accept=".json,application/json" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; void importDraft(file); }}/>
          </div> : null}
        </div>
      ) : null}
    </section>
  );
}
