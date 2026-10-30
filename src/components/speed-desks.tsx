import { useState } from "react";
import type { Door, Finger, Store } from "@/lib/speed-data";

type Patch = (next: Store, message: string) => void;

export function DoorDesk({ store, patch }: { store: Store; patch: Patch }) {
  const doors = store.doors.filter((d) => d.companyId === store.companyId);
  const devices = store.devices.filter((d) => d.companyId === store.companyId && !d.removed);
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [way, setWay] = useState<Door["way"]>("دخول");
  const setState = (door: Door, state: Door["state"]) => {
    patch({ ...store, doors: store.doors.map((d) => d.id === door.id ? { ...d, state } : d) }, `${door.name}: ${state}. الأمر يتنفّذ على الجهاز عند الاتصال.`);
  };
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">كل باب مربوط بجهاز فرع. الفتح والقفل أمر محفوظ هنا، ويتنفّذ على البصمة لما الجهاز يبقى واصل.</p>
      <div className="grid gap-2 rounded-card border border-line bg-panel p-4 sm:grid-cols-4">
        <input className="min-h-11 rounded-card border border-line bg-paper px-3" placeholder="اسم الباب" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="min-h-11 rounded-card border border-line bg-paper px-3" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>{devices.map((d) => <option key={d.id} value={d.id}>{d.branch}</option>)}</select>
        <select className="min-h-11 rounded-card border border-line bg-paper px-3" value={way} onChange={(e) => setWay(e.target.value as Door["way"])}><option>دخول</option><option>خروج</option></select>
        <button className="min-h-11 rounded-card bg-clay px-3 text-panel" onClick={() => {
          if (name.trim().length < 2 || !deviceId) return;
          const door: Door = { id: `door-${Date.now()}`, companyId: store.companyId, deviceId, name: name.trim(), way, state: "مغلقة" };
          patch({ ...store, doors: [...store.doors, door] }, `اتضاف ${door.name}.`);
          setName("");
        }}>إضافة باب</button>
      </div>
      <ul className="grid gap-2">{doors.map((door) => {
        const device = store.devices.find((d) => d.id === door.deviceId);
        return (
          <li key={door.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-panel px-4 py-3">
            <span><strong>{door.name}</strong><span className="block text-sm text-muted">{device?.branch ?? "بدون جهاز"} · {door.way} · {door.state}</span></span>
            <span className="flex flex-wrap gap-1">
              <button className="min-h-11 rounded-card border border-line px-3 text-sm" onClick={() => setState(door, "مفتوحة")}>فتح</button>
              <button className="min-h-11 rounded-card border border-line px-3 text-sm" onClick={() => setState(door, "مغلقة")}>إغلاق</button>
              <button className="min-h-11 rounded-card border border-line px-3 text-sm" onClick={() => setState(door, "مقفولة")}>قفل مستمر</button>
            </span>
          </li>
        );
      })}</ul>
    </section>
  );
}

export function FingerDesk({ store, patch }: { store: Store; patch: Patch }) {
  const people = store.people.filter((p) => p.companyId === store.companyId && p.active);
  const devices = store.devices.filter((d) => d.companyId === store.companyId && !d.removed);
  const fingers = store.fingers.filter((f) => f.companyId === store.companyId);
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [hand, setHand] = useState<Finger["hand"]>("يمين");
  const [slot, setSlot] = useState("1");
  const [cardPerson, setCardPerson] = useState(people[0]?.id ?? "");
  const [cardNo, setCardNo] = useState("");
  const add = () => {
    const n = Number(slot);
    if (!personId || !deviceId || n < 1 || n > 10) return;
    const row: Finger = { id: `fg-${Date.now()}`, companyId: store.companyId, personId, deviceId, slot: n, hand, status: "بانتظار التسجيل" };
    patch({ ...store, fingers: [...store.fingers, row], people: store.people.map((p) => p.id === personId ? { ...p, finger: true } : p) }, `اتسجلت بصمة ${hand} خانة ${n}. القالب يتسجل على الجهاز نفسه.`);
  };
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">البرنامج يحفظ الخانة واليد. قالب البصمة نفسه يتسجل على جهاز الفرع، ومش بيتخزن هنا.</p>
      <div className="grid gap-2 rounded-card border border-line bg-panel p-4 sm:grid-cols-5">
        <select className="min-h-11 rounded-card border border-line bg-paper px-3" value={personId} onChange={(e) => setPersonId(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className="min-h-11 rounded-card border border-line bg-paper px-3" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>{devices.map((d) => <option key={d.id} value={d.id}>{d.branch}</option>)}</select>
        <select className="min-h-11 rounded-card border border-line bg-paper px-3" value={hand} onChange={(e) => setHand(e.target.value as Finger["hand"])}><option>يمين</option><option>شمال</option></select>
        <input className="min-h-11 rounded-card border border-line bg-paper px-3" inputMode="numeric" value={slot} onChange={(e) => setSlot(e.target.value)} />
        <button className="min-h-11 rounded-card bg-clay px-3 text-panel" onClick={add}>إضافة بصمة</button>
      </div>
      <ul className="grid gap-2">{fingers.map((f) => {
        const person = store.people.find((p) => p.id === f.personId);
        const device = store.devices.find((d) => d.id === f.deviceId);
        return (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-panel px-4 py-3">
            <span><strong>{person?.name ?? "موظف محذوف"}</strong><span className="block text-sm text-muted">{device?.branch} · {f.hand} · خانة {f.slot} · {f.status}</span></span>
            <span className="flex gap-1">
              <button className="min-h-11 rounded-card border border-line px-3 text-sm" onClick={() => patch({ ...store, fingers: store.fingers.map((row) => row.id === f.id ? { ...row, status: row.status === "على الجهاز" ? "بانتظار التسجيل" : "على الجهاز" } : row) }, `اتعدّل حالة بصمة ${person?.name ?? ""}.`)}>تعديل الحالة</button>
              <button className="min-h-11 rounded-card border border-line px-3 text-sm" onClick={() => patch({ ...store, fingers: store.fingers.filter((row) => row.id !== f.id) }, `اتشالت خانة البصمة من السجل. القالب على الجهاز لو كان اتسجل هناك.`)}>حذف السجل</button>
            </span>
          </li>
        );
      })}</ul>
      <div className="grid gap-2 rounded-card border border-line bg-panel p-4 sm:grid-cols-3">
        <select className="min-h-11 rounded-card border border-line bg-paper px-3" value={cardPerson} onChange={(e) => setCardPerson(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input className="min-h-11 rounded-card border border-line bg-paper px-3" placeholder="رقم الكارت" value={cardNo} onChange={(e) => setCardNo(e.target.value)} />
        <button className="min-h-11 rounded-card bg-ink px-3 text-panel" onClick={() => {
          if (!cardPerson || cardNo.trim().length < 3) return;
          patch({ ...store, people: store.people.map((p) => p.id === cardPerson ? { ...p, card: true, cardNo: cardNo.trim() } : p) }, "اتحفظ رقم الكارت.");
          setCardNo("");
        }}>حفظ الكارت</button>
      </div>
      <ul className="text-sm text-muted">{people.filter((p) => p.cardNo).map((p) => <li key={p.id}>{p.name} · <bdi>{p.cardNo}</bdi></li>)}</ul>
    </section>
  );
}

export function AccessDesk({ store }: { store: Store }) {
  const levels = store.levels.filter((l) => l.companyId === store.companyId);
  return (
    <ul className="grid gap-2">
      {levels.map((level) => {
        const shift = store.shifts.find((s) => s.id === level.shiftId);
        const doors = store.doors.filter((d) => level.doorIds.includes(d.id));
        return (
          <li key={level.id} className="rounded-card border border-line bg-panel p-4">
            <h2 className="font-semibold">{level.name}</h2>
            <p className="text-sm text-muted">{shift?.name} · من <bdi>{shift?.start}</bdi> إلى <bdi>{shift?.end}</bdi></p>
            <p className="mt-2 text-sm">{doors.map((d) => d.name).join(" · ") || "بدون أبواب"}</p>
          </li>
        );
      })}
      {!levels.length ? <li className="rounded-card border border-dashed border-line bg-panel p-6 text-sm text-muted">لا مستويات دخول للشركة دي.</li> : null}
    </ul>
  );
}

const steps = [
  ["1. الدخول", "افتح https://www.hik-connect.com/ بحساب الفريق. كلمة السر مش بتتحفظ في Speed."],
  ["2. الجهاز", "من المنطقة، أضف جهاز التحكم بالسيريال أو بالكود. لازم الجهاز يبقى Online."],
  ["3. الشخص", "من Person أضف الاسم وفترة الصلاحية. البصمة والوجه والكارت يتسجلوا من صفحة الشخص."],
  ["4. مستوى الدخول", "من Access Control ثم Access Level: اسم، الباب، وجدول الوقت."],
  ["5. التعيين", "اربط المستوى بالشخص أو بالقسم، وبعدين طبّق الإعداد على الجهاز."],
  ["6. الباب", "من Door Control: فتح، قفل، إبقاء مفتوح، أو إبقاء مقفول. السجل في Access Record."],
  ["7. زائر", "Temporary Pass: اسم، مستوى دخول، عدد مرات، وبداية ونهاية. الكود يتبعت للزائر."],
];

export function CloudDesk({ store, patch }: { store: Store; patch: Patch }) {
  const [team, setTeam] = useState(store.teamName);
  const devices = store.devices.filter((d) => d.companyId === store.companyId);
  return (
    <section className="space-y-3">
      <article className="rounded-card border border-line bg-panel p-4">
        <h2 className="font-semibold">دخول Hik-Connect Team</h2>
        <p className="mt-1 text-sm text-muted">الدخول يتم على صفحة Hikvision نفسها، مش من إيميل محفوظ جوه البرنامج.</p>
        <a className="mt-3 inline-flex min-h-11 items-center rounded-card bg-clay px-4 text-panel" href="https://www.hik-connect.com/" target="_blank" rel="noreferrer">فتح صفحة الدخول</a>
        <div className="mt-4 flex flex-wrap gap-2">
          <input className="min-h-11 flex-1 rounded-card border border-line bg-paper px-3" placeholder="اسم الفريق بعد ما تسجّل دخولك" value={team} onChange={(e) => setTeam(e.target.value)} />
          <button className="min-h-11 rounded-card bg-ink px-3 text-panel" onClick={() => patch({ ...store, teamName: team.trim() }, team.trim() ? `اتسجل فريق ${team.trim()}.` : "اتمسح اسم الفريق.")}> حفظ اسم الفريق</button>
        </div>
        {store.teamName ? <p className="mt-2 text-sm">الفريق المحفوظ: {store.teamName}</p> : null}
      </article>
      <ol className="grid gap-2">{steps.map(([title, body]) => <li key={title} className="rounded-card border border-line bg-panel px-4 py-3"><strong>{title}</strong><span className="mt-1 block text-sm text-muted">{body}</span></li>)}</ol>
      <ul className="grid gap-2">{devices.map((d) => <li key={d.id} className="rounded-card border border-line bg-panel p-4"><div className="flex justify-between gap-2"><strong><bdi>{d.cloudName}</bdi></strong><span className="text-sm text-muted">{d.removed ? "اتشال من الأجهزة" : d.branch}</span></div><p className="text-xs text-muted"><bdi>{d.serial}</bdi></p></li>)}</ul>
    </section>
  );
}

const chapters: { title: string; lines: string[] }[] = [
  { title: "الحساب", lines: ["كل مشرف يعمل حسابه على بوابة Hik-Connect.", "أول حساب يضيف الجهاز يبقى المالك، وهو اللي يقدر يشارك الباقي.", "اللغة تتختار من أعلى صفحة الدخول."] },
  { title: "الفريق", lines: ["Team Mode بيجمع الأجهزة تحت فريق واحد مش تحت إيميل شخصي.", "الدعوة بتوصل بالإيميل، والعضو يفتحها ويسجّل دخول.", "من غير دعوة، العضو يشوف أجهزته هو بس."] },
  { title: "الجهاز", lines: ["أضف جهاز البصمة من المنطقة بالسيريال المكتوب على الجهاز.", "لو الجهاز Offline، الأشخاص والصلاحيات مش هتتطبق.", "Speed يحتفظ بنسخة الأسماء والعناوين المحلية 192.168.1."] },
  { title: "البصمة العادية", lines: ["من صفحة الشخص اختر Fingerprint وسجّل الإصبع على الجهاز.", "تقدر تعدّل الخانة أو تحذف السجل من Speed، والقالب يتمسح من الجهاز بأمر منفصل.", "الكارت والوجه وسيلة إضافية، مش بديل إجباري."] },
  { title: "الأبواب والصلاحية", lines: ["اعمل Access Level: باب + جدول وقت.", "اربط الشخص أو القسم بالمستوى.", "طبّق المستوى على الجهاز، وإلا الباب مش هيعترف بالشخص."] },
  { title: "التشغيل اليومي", lines: ["Door Control للفتح والقفل لحظيًا.", "Access Record لمراجعة مين دخل ومتى.", "التقرير في Speed بيحسب التأخير بعد سماح الوردية."] },
];

export function GuideDesk() {
  return (
    <section className="grid gap-3">
      {chapters.map((chapter) => (
        <article key={chapter.title} className="rounded-card border border-line bg-panel p-4">
          <h2 className="font-semibold">{chapter.title}</h2>
          <ul className="mt-2 list-disc space-y-1 pe-4 text-sm text-muted">{chapter.lines.map((line) => <li key={line}>{line}</li>)}</ul>
        </article>
      ))}
    </section>
  );
}
