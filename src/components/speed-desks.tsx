import { useState } from "react";
import type { Door, Finger, Store } from "@/lib/speed-data";
import { applyLive, todayKey } from "@/lib/speed-data";
import { desktopOnly, speedApi, type CloudLoginResult, type TeamRow } from "@/lib/speed-link";

type Patch = (next: Store, message: string) => void;

export function DoorDesk({ store, patch }: { store: Store; patch: Patch }) {
  const doors = store.doors.filter((d) => d.companyId === store.companyId);
  const devices = store.devices.filter((d) => d.companyId === store.companyId && !d.removed);
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [way, setWay] = useState<Door["way"]>("دخول");
  const setState = async (door: Door, state: Door["state"]) => {
    const device = store.devices.find((item) => item.id === door.deviceId);
    const cmd = state === "مفتوحة" ? "open" : state === "مقفولة" ? "alwaysClose" : "close";
    const api = speedApi();
    if (!api) {
      patch(store, desktopOnly);
      return;
    }
    if (!device || device.removed) { patch(store, "الباب مش مربوط بجهاز."); return; }
    if (!device.pass) { patch(store, `اكتب كلمة سر جهاز ${device.branch} قبل أمر الباب.`); return; }
    const result = await api.door({ host: device.ip, port: device.port || 80, username: device.user || "admin", password: device.pass, cmd });
    if (!result.ok) { patch(store, `${door.name}: ${result.error}`); return; }
    patch({ ...store, doors: store.doors.map((item) => item.id === door.id ? { ...item, state } : item) }, `${door.name}: ${state}. الأمر اتنفّذ على الجهاز.`);
  };
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">كل باب مربوط بجهاز فرع. الفتح والقفل بيتبعتوا للجهاز على الشبكة، ومش بيتحفظوا كشكل بس.</p>
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
  const readDevices = async () => {
    const api = speedApi();
    if (!api) { patch(store, desktopOnly); return; }
    const targets = devices.filter((device) => device.pass);
    if (!targets.length) { patch(store, "اكتب كلمة سر الجهاز من تعديل الجهاز قبل قراءة البصمات."); return; }
    let next = store;
    const notes: string[] = [];
    for (const device of targets) {
      const result = await api.pull({ host: device.ip, port: device.port || 80, username: device.user || "admin", password: device.pass, day: todayKey() });
      if (!result.ok) { notes.push(`${device.branch}: ${result.error}`); continue; }
      const withFingers = result.users.filter((user) => user.fingers > 0).length;
      next = applyLive(next, device, { punches: [], users: result.users }, todayKey());
      notes.push(`${device.branch}: ${result.users.length} شخص، ${withFingers} عليهم بصمة`);
    }
    patch(next, notes.join(" · "));
  };
  const add = () => {
    const n = Number(slot);
    if (!personId || !deviceId || n < 1 || n > 10) return;
    const row: Finger = { id: `fg-${Date.now()}`, companyId: store.companyId, personId, deviceId, slot: n, hand, status: "بانتظار التسجيل" };
    patch({ ...store, fingers: [...store.fingers, row], people: store.people.map((p) => p.id === personId ? { ...p, finger: true } : p) }, `اتسجلت بصمة ${hand} خانة ${n}. القالب يتسجل على الجهاز نفسه.`);
  };
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">القراءة من الجهاز بتجيب الأشخاص وعدد البصمات المسجلة عندهم. قالب الإصبع نفسه يفضل على الجهاز وما يتسحش هنا.</p>
      <button className="min-h-11 rounded-card bg-ink px-4 text-panel" onClick={() => void readDevices()}>قراءة البصمات من الأجهزة</button>
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
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [imageCode, setImageCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [featureCode, setFeatureCode] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [needSms, setNeedSms] = useState(false);
  const [session, setSession] = useState<Extract<CloudLoginResult, { ok: true }> | null>(null);
  const [map, setMap] = useState<TeamRow[] | null>(null);
  const [busy, setBusy] = useState("");
  const devices = store.devices.filter((d) => d.companyId === store.companyId && !d.removed);
  const login = async () => {
    const api = speedApi();
    if (!api) { patch(store, desktopOnly); return; }
    if (!account.trim() || !password) { patch(store, "اكتب حساب هيك-كونكت وكلمة السر. مش هيتسجلوا في البرنامج."); return; }
    setBusy("login");
    try {
      const result = await api.cloudLogin({ account, password, imageCode, featureCode, smsCode });
      if (!result.ok) {
        setFeatureCode(result.featureCode || featureCode);
        setCaptcha(result.captcha || "");
        setNeedSms(Boolean(result.needSms));
        patch(store, result.error);
        return;
      }
      setSession(result);
      setCaptcha("");
      setPassword("");
      setMap(null);
      patch({ ...store, teamName: result.teamName || store.teamName }, result.notice || `الفريق اتفتح: ${result.teamName}`);
    } catch {
      patch(store, "دخول الفريق من جوه البرنامج وقف. افتح الموقع وسجّل الدخول من هناك.");
    } finally {
      setBusy("");
    }
  };
  const openSite = async () => {
    const api = speedApi();
    if (!api) { patch(store, desktopOnly); return; }
    try {
      await api.openSite();
      patch(store, "الموقع اتفتح. سجّل الدخول هناك، وبعدين اضغط سحب.");
    } catch {
      patch(store, "الموقع ما فتحش من البرنامج.");
    }
  };
  const readMap = async () => {
    const api = speedApi();
    if (!api) { patch(store, desktopOnly); return; }
    setBusy("map");
    try {
      const taken = await api.takeSite();
      const active = taken.ok ? taken : session;
      if (taken.ok) setSession(taken);
      if (!active) { patch(store, taken.ok ? "" : taken.error); return; }
      const result = await api.cloudMap({ apiBase: active.apiBase, sessionId: active.sessionId });
      if (!result.ok) { patch(store, `الجلسة من الموقع موجودة. الخريطة: ${result.error}`); return; }
      setMap(result.buttons);
      const report = result.buttons.find((button) => button.key === "report");
      patch(store, report?.found ? `الخريطة اتقرأت. التقارير: ${report.names.slice(0, 6).join("، ") || report.path}` : "الجلسة موجودة. الخريطة ما فيهاش تقرير ظاهر، والسحب يفضل شغال.");
    } catch {
      patch(store, "قراءة التيم وقفت. السحب من جلسة الموقع يفضل شغال.");
    } finally {
      setBusy("");
    }
  };
  const pullCloud = async () => {
    const api = speedApi();
    if (!api) { patch(store, desktopOnly); return; }
    if (!devices.length) { patch(store, "مفيش فرع نركّب عليه الحضور."); return; }
    setBusy("pull");
    try {
      let active = session;
      if (!active) {
        const taken = await api.takeSite();
        if (!taken.ok) { patch(store, taken.error); return; }
        active = taken;
        setSession(taken);
      }
      const result = await api.cloudPull({ apiBase: active.apiBase, sessionId: active.sessionId, featureCode: active.featureCode, day: todayKey() });
      if (!result.ok) { patch(store, result.error); return; }
      const buckets = new Map<string, { punches: { employeeNo: string; name: string; at: string; method: string }[]; users: { employeeNo: string; name: string; fingers: number; faces: number; cards: number; photo?: string }[] }>();
      const take = (deviceId: string) => {
        const found = buckets.get(deviceId);
        if (found) return found;
        const empty = { punches: [], users: [] as { employeeNo: string; name: string; fingers: number; faces: number; cards: number; photo?: string }[] };
        buckets.set(deviceId, empty);
        return empty;
      };
      const known = store.people.filter((person) => person.companyId === store.companyId);
      const deviceFor = (code: string, name: string) => known.find((person) => person.code === code || person.name === name)?.deviceId || devices[0].id;
      for (const person of result.people) {
        take(deviceFor(person.employeeNo, person.name)).users.push({ employeeNo: person.employeeNo, name: person.name, fingers: 0, faces: person.photo ? 1 : 0, cards: 0, photo: person.photo || "" });
      }
      for (const punch of result.punches) {
        const code = punch.employeeNo || punch.name;
        const bucket = take(deviceFor(code, punch.name));
        if (!bucket.users.some((user) => user.employeeNo === code)) bucket.users.push({ employeeNo: code, name: punch.name, fingers: 1, faces: 0, cards: 0 });
        else bucket.users = bucket.users.map((user) => user.employeeNo === code ? { ...user, fingers: 1 } : user);
        bucket.punches.push({ employeeNo: code, name: punch.name, at: `${punch.date} ${punch.time.slice(0, 5)}`, method: punch.method || "بصمة" });
      }
      let next = store;
      if (active.teamName) next = { ...next, teamName: active.teamName };
      for (const [deviceId, live] of buckets) {
        const device = devices.find((item) => item.id === deviceId);
        if (device) next = applyLive(next, device, live, todayKey());
      }
      patch(next, result.notice || `هيك-كونكت: ${result.punches.length} حركة و${result.people.length} شخص.`);
    } catch {
      patch(store, "السحب من الموقع وقف. افتح الموقع وتأكد إن الدخول لسه مفتوح.");
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="space-y-3">
      <article className="rounded-card border border-line bg-panel p-4">
        <h2 className="font-semibold">Hik-Connect</h2>
        <p className="mt-1 text-sm text-muted">الموقع هو اللي بيدخّلك. افتحه وسجّل الدخول هناك، وبعدين اسحب. زراير الكود مش مطلوبة.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="min-h-11 rounded-card bg-clay px-4 text-panel" onClick={() => void openSite()}>فتح الموقع</button>
          <button className="min-h-11 rounded-card bg-ink px-4 text-panel disabled:opacity-50" disabled={busy === "pull"} onClick={() => void pullCloud()}>{busy === "pull" ? "جارٍ السحب" : "سحب الحضور"}</button>
          <button className="min-h-11 rounded-card border border-line px-4 disabled:opacity-50" disabled={busy === "map"} onClick={() => void readMap()}>{busy === "map" ? "جارٍ القراءة" : "اقرأ التيم"}</button>
        </div>
        {session ? <p className="mt-2 text-sm">الجلسة من الموقع جاهزة.</p> : null}
      </article>
      <article className="rounded-card border border-line bg-panel p-4">
        <h2 className="font-semibold">دخول بالكود لو الموقع وقف</h2>
        <div className="mt-3 grid gap-2">
          <input className="min-h-11 rounded-card border border-line bg-paper px-3" dir="ltr" placeholder="الإيميل أو الموبايل" value={account} onChange={(e) => setAccount(e.target.value)} />
          <input className="min-h-11 rounded-card border border-line bg-paper px-3" dir="ltr" type="password" placeholder="كلمة سر هيك-كونكت" value={password} onChange={(e) => setPassword(e.target.value)} />
          {captcha ? <img src={captcha} alt="كود الصورة" className="h-16 w-40 rounded-card border border-line bg-paper object-contain" /> : null}
          {captcha ? <input className="min-h-11 rounded-card border border-line bg-paper px-3" dir="ltr" placeholder="كود الصورة" value={imageCode} onChange={(e) => setImageCode(e.target.value)} /> : null}
          {needSms ? <input className="min-h-11 rounded-card border border-line bg-paper px-3" dir="ltr" placeholder="كود الرسالة" value={smsCode} onChange={(e) => setSmsCode(e.target.value)} /> : null}
          <button className="min-h-11 rounded-card border border-line px-4 disabled:opacity-50" disabled={busy === "login"} onClick={() => void login()}>{busy === "login" ? "جارٍ الدخول" : "دخول الفريق بالكود"}</button>
        </div>
      </article>
      {map ? <ul className="grid gap-2">{map.map((button) => <li key={button.key} className="rounded-card border border-line bg-panel px-4 py-3"><strong>{button.ar}</strong><span className="mt-1 block text-sm text-muted">{button.found ? button.names.slice(0, 8).join(" · ") || button.path : "مش ظاهرة على الموقع"}</span><span className="mt-1 block text-xs text-muted">{button.meaning}</span></li>)}</ul> : null}
      <ol className="grid gap-2">{steps.map(([title, body]) => <li key={title} className="rounded-card border border-line bg-panel px-4 py-3"><strong>{title}</strong><span className="mt-1 block text-sm text-muted">{body}</span></li>)}</ol>
      <ul className="grid gap-2">{devices.map((d) => <li key={d.id} className="rounded-card border border-line bg-panel p-4"><div className="flex justify-between gap-2"><strong><bdi>{d.cloudName}</bdi></strong><span className="text-sm text-muted">{d.branch}</span></div><p className="text-xs text-muted"><bdi>{d.serial}</bdi></p></li>)}</ul>
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
