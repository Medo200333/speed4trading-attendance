export type Company = { id: string; name: string; city: string };
export type Department = { id: string; companyId: string; name: string };
export type Shift = { id: string; companyId: string; name: string; start: string; end: string; grace: number };
export type Device = {
  id: string;
  companyId: string;
  branch: string;
  cloudName: string;
  ip: string;
  port: number;
  model: string;
  firmware: string;
  serial: string;
  online: boolean;
  lastSync: string;
  removed: boolean;
  user: string;
  pass: string;
};
export type Person = {
  id: string;
  companyId: string;
  deviceId: string;
  departmentId: string;
  shiftId: string;
  name: string;
  code: string;
  active: boolean;
  finger: boolean;
  face: boolean;
  card: boolean;
  cardNo: string;
};
export type Punch = {
  id: string;
  companyId: string;
  deviceId: string;
  personId: string;
  deviceName: string;
  branch: string;
  person: string;
  at: string;
  kind: "دخول" | "خروج";
  source: "جهاز" | "تصحيح";
};
export type Door = {
  id: string;
  companyId: string;
  deviceId: string;
  name: string;
  way: "دخول" | "خروج";
  state: "مغلقة" | "مفتوحة" | "مقفولة";
};
export type Finger = {
  id: string;
  companyId: string;
  personId: string;
  deviceId: string;
  slot: number;
  hand: "يمين" | "شمال";
  status: "على الجهاز" | "بانتظار التسجيل";
};
export type Level = {
  id: string;
  companyId: string;
  name: string;
  doorIds: string[];
  shiftId: string;
};
export type Audit = { id: string; companyId: string; at: string; text: string };
export type Store = {
  companyId: string;
  teamName: string;
  companies: Company[];
  departments: Department[];
  shifts: Shift[];
  devices: Device[];
  doors: Door[];
  people: Person[];
  fingers: Finger[];
  levels: Level[];
  punches: Punch[];
  audit: Audit[];
};

export type DayRow = {
  personId: string;
  name: string;
  code: string;
  branch: string;
  department: string;
  shift: string;
  inn: string;
  out: string;
  status: "حاضر" | "متأخر" | "غياب" | "لم ينصرف";
  late: number;
};

const day = "2026-10-29";

export const seed = (): Store => ({
  companyId: "sky",
  teamName: "",
  companies: [
    { id: "sky", name: "سكاي لاين", city: "القاهرة" },
    { id: "noor", name: "معهد النور", city: "الجيزة" },
  ],
  departments: [
    { id: "sales", companyId: "sky", name: "مبيعات" },
    { id: "ops", companyId: "sky", name: "تشغيل" },
    { id: "teach", companyId: "noor", name: "تدريس" },
  ],
  shifts: [
    { id: "morn", companyId: "sky", name: "صباحي", start: "08:00", end: "16:00", grace: 10 },
    { id: "eve", companyId: "sky", name: "مسائي", start: "16:00", end: "00:00", grace: 10 },
    { id: "noor-m", companyId: "noor", name: "صباحي", start: "08:00", end: "14:00", grace: 10 },
  ],
  devices: [
    device("alex", "sky", "الإسكندرية", "alex", "192.168.1.214", "DS-K1T342EFWX20260629V044840ENAE344661", "V4.48.40 build 260629", true, `${day} 08:12`),
    device("mans", "sky", "المنصورة", "mansora", "192.168.1.212", "DS-K1T342EFWX20220310V030305ENL1804374", "V4.48.40 build 260629", true, `${day} 08:07`),
    device("down", "sky", "كايرو داون تاون", "cairo dawin tawen", "192.168.1.213", "DS-K1T342EFWX20230331V031400ENAE344648", "V3.14.0 build 230331", true, `${day} 07:55`),
    device("heli", "sky", "مصر الجديدة", "Masr el gdeda", "192.168.1.111", "DS-K1T342EFWX20250912V0439180ENL282382", "V4.39.180 build 250912", true, `${day} 08:21`),
    device("noor1", "noor", "الفرع الرئيسي", "noor-gate", "192.168.1.20", "DS-K1T342-NOOR-DEMO", "V4.48.40", false, "لم يُفحص"),
  ],
  doors: [
    door("d-alex", "sky", "alex", "باب الإسكندرية", "دخول"),
    door("d-mans", "sky", "mans", "باب المنصورة", "دخول"),
    door("d-down", "sky", "down", "باب داون تاون", "دخول"),
    door("d-heli", "sky", "heli", "باب مصر الجديدة", "دخول"),
    door("d-noor", "noor", "noor1", "باب المعهد", "دخول"),
  ],
  people: [
    person("p1", "sky", "alex", "sales", "morn", "مريم عبد الله", "101", true, true, false),
    person("p2", "sky", "alex", "ops", "morn", "يوسف حسن", "102", true, false, true),
    person("p3", "sky", "mans", "sales", "morn", "هدى فتحي", "201", true, true, false),
    person("p4", "sky", "mans", "ops", "morn", "سامي رضوان", "202", true, false, false),
    person("p5", "sky", "down", "sales", "morn", "ليلى مراد", "301", true, true, true),
    person("p6", "sky", "down", "ops", "eve", "كريم نبيل", "302", true, false, false),
    person("p7", "sky", "heli", "ops", "morn", "وحيد فاروق", "401", true, true, false),
    person("p8", "sky", "heli", "sales", "morn", "ندى شريف", "402", false, true, false),
    person("p9", "noor", "noor1", "teach", "noor-m", "آية محمود", "501", true, false, true),
  ],
  fingers: [
    finger("f1", "sky", "p1", "alex", 1, "يمين", "على الجهاز"),
    finger("f3", "sky", "p3", "mans", 1, "يمين", "على الجهاز"),
    finger("f5", "sky", "p5", "down", 1, "شمال", "على الجهاز"),
    finger("f7", "sky", "p7", "heli", 1, "يمين", "على الجهاز"),
    finger("f8", "sky", "p8", "heli", 2, "يمين", "بانتظار التسجيل"),
  ],
  levels: [
    { id: "lv-day", companyId: "sky", name: "دوام الفروع", doorIds: ["d-alex", "d-mans", "d-down", "d-heli"], shiftId: "morn" },
    { id: "lv-eve", companyId: "sky", name: "مسائي داون تاون", doorIds: ["d-down"], shiftId: "eve" },
    { id: "lv-noor", companyId: "noor", name: "دوام المعهد", doorIds: ["d-noor"], shiftId: "noor-m" },
  ],
  punches: [
    punch("k1", "sky", "alex", "p1", "alex", "الإسكندرية", "مريم عبد الله", `${day} 08:02`, "دخول"),
    punch("k1o", "sky", "alex", "p1", "alex", "الإسكندرية", "مريم عبد الله", `${day} 16:01`, "خروج"),
    punch("k2", "sky", "alex", "p2", "alex", "الإسكندرية", "يوسف حسن", `${day} 08:11`, "دخول"),
    punch("k2o", "sky", "alex", "p2", "alex", "الإسكندرية", "يوسف حسن", `${day} 16:06`, "خروج"),
    punch("k3", "sky", "mans", "p3", "mansora", "المنصورة", "هدى فتحي", `${day} 07:58`, "دخول"),
    punch("k3o", "sky", "mans", "p3", "mansora", "المنصورة", "هدى فتحي", `${day} 16:04`, "خروج"),
    punch("k4", "sky", "down", "p5", "cairo dawin tawen", "كايرو داون تاون", "ليلى مراد", `${day} 08:16`, "دخول"),
    punch("k5", "sky", "heli", "p7", "Masr el gdeda", "مصر الجديدة", "وحيد فاروق", `${day} 08:04`, "دخول"),
    punch("k5o", "sky", "heli", "p7", "Masr el gdeda", "مصر الجديدة", "وحيد فاروق", `${day} 16:00`, "خروج"),
    punch("k6", "sky", "heli", "p8", "Masr el gdeda", "مصر الجديدة", "ندى شريف", `${day} 08:19`, "دخول"),
  ],
  audit: [
    { id: "a1", companyId: "sky", at: `${day} 08:00`, text: "فُتحت شركة سكاي لاين على أربع أجهزة." },
  ],
});

function device(id: string, companyId: string, branch: string, cloudName: string, ip: string, serial: string, firmware: string, online: boolean, lastSync: string): Device {
  return { id, companyId, branch, cloudName, ip, port: 80, model: "DS-K1T342", firmware, serial, online, lastSync, removed: false, user: "admin", pass: "" };
}
function person(id: string, companyId: string, deviceId: string, departmentId: string, shiftId: string, name: string, code: string, finger: boolean, face: boolean, card: boolean): Person {
  return { id, companyId, deviceId, departmentId, shiftId, name, code, active: true, finger, face, card, cardNo: card ? `${code}01` : "" };
}
function door(id: string, companyId: string, deviceId: string, name: string, way: Door["way"]): Door {
  return { id, companyId, deviceId, name, way, state: "مغلقة" };
}
function finger(id: string, companyId: string, personId: string, deviceId: string, slot: number, hand: Finger["hand"], status: Finger["status"]): Finger {
  return { id, companyId, personId, deviceId, slot, hand, status };
}
function punch(id: string, companyId: string, deviceId: string, personId: string, deviceName: string, branch: string, personName: string, at: string, kind: Punch["kind"]): Punch {
  return { id, companyId, deviceId, personId, deviceName, branch, person: personName, at, kind, source: "جهاز" };
}

const KEY = "speed-training-console-v4";

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem("speed-training-console-v3");
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Store;
    if (!parsed.companies?.length || !parsed.departments || !parsed.shifts || !parsed.people || !parsed.doors || !parsed.fingers || !parsed.levels) return seed();
    parsed.devices = parsed.devices.map((device) => ({ user: "admin", pass: "", ...device }));
    return parsed;
  } catch {
    return seed();
  }
}

export function saveStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function nowStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function todayKey() {
  return nowStamp().slice(0, 10);
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function daySheet(store: Store, companyId: string, date: string): DayRow[] {
  return store.people.filter((p) => p.companyId === companyId && p.active).map((p) => {
    const device = store.devices.find((d) => d.id === p.deviceId);
    const department = store.departments.find((d) => d.id === p.departmentId)?.name ?? "";
    const shift = store.shifts.find((s) => s.id === p.shiftId);
    const mine = store.punches.filter((k) => k.personId === p.id && k.at.startsWith(date)).sort((a, b) => a.at.localeCompare(b.at));
    const inn = mine.find((k) => k.kind === "دخول")?.at.slice(11, 16) ?? "";
    const outs = mine.filter((k) => k.kind === "خروج");
    const out = outs.length ? outs[outs.length - 1].at.slice(11, 16) : "";
    let status: DayRow["status"] = "غياب";
    let late = 0;
    if (inn) {
      if (shift) late = Math.max(0, toMin(inn) - toMin(shift.start) - shift.grace);
      status = late > 0 ? "متأخر" : out ? "حاضر" : "لم ينصرف";
    }
    return {
      personId: p.id, name: p.name, code: p.code, branch: device?.removed ? "جهاز محذوف" : device?.branch ?? "",
      department, shift: shift?.name ?? "", inn, out, status, late,
    };
  });
}

export function counts(rows: DayRow[]) {
  return {
    present: rows.filter((r) => r.status === "حاضر" || r.status === "لم ينصرف").length,
    late: rows.filter((r) => r.status === "متأخر").length,
    absent: rows.filter((r) => r.status === "غياب").length,
    open: rows.filter((r) => r.status === "لم ينصرف" || (r.status === "متأخر" && !r.out)).length,
  };
}

export function toCsv(rows: DayRow[]) {
  const head = ["الرقم", "الاسم", "الفرع", "القسم", "الوردية", "دخول", "خروج", "الحالة", "تأخير بالدقيقة"];
  const body = rows.map((r) => [r.code, r.name, r.branch, r.department, r.shift, r.inn, r.out, r.status, String(r.late)]);
  return [head, ...body].map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
}

export type LivePunch = { employeeNo: string; name: string; at: string; method: string };
export type LiveUser = { employeeNo: string; name: string; fingers: number; faces: number; cards: number };

export function applyLive(store: Store, device: Device, live: { punches: LivePunch[]; users: LiveUser[] }, day: string): Store {
  let people = store.people.slice();
  let fingers = store.fingers.slice();
  const departmentId = store.departments.find((item) => item.companyId === device.companyId)?.id ?? "";
  const shiftId = store.shifts.find((item) => item.companyId === device.companyId)?.id ?? "";
  for (const user of live.users) {
    let person = people.find((item) => item.companyId === device.companyId && item.code === user.employeeNo);
    if (!person && departmentId && shiftId) {
      person = {
        id: `p-${device.id}-${user.employeeNo}`,
        companyId: device.companyId,
        deviceId: device.id,
        departmentId,
        shiftId,
        name: user.name || user.employeeNo,
        code: user.employeeNo,
        active: true,
        finger: user.fingers > 0,
        face: user.faces > 0,
        card: user.cards > 0,
        cardNo: "",
      };
      people = [...people, person];
    } else if (person) {
      const current = person;
      people = people.map((item) => item.id === current.id ? { ...item, finger: user.fingers > 0 || item.finger, face: user.faces > 0 || item.face, card: user.cards > 0 || item.card } : item);
    }
    if (person && user.fingers > 0) {
      const exists = fingers.some((item) => item.personId === person.id && item.deviceId === device.id);
      fingers = exists
        ? fingers.map((item) => item.personId === person.id && item.deviceId === device.id ? { ...item, status: "على الجهاز" } : item)
        : [...fingers, { id: `fg-${device.id}-${user.employeeNo}`, companyId: device.companyId, personId: person.id, deviceId: device.id, slot: 1, hand: "يمين", status: "على الجهاز" }];
    }
  }
  const grouped = new Map<string, LivePunch[]>();
  for (const punch of live.punches.filter((item) => item.at.startsWith(day))) {
    grouped.set(punch.employeeNo, [...(grouped.get(punch.employeeNo) ?? []), punch]);
  }
  let punches = store.punches.filter((item) => !(item.deviceId === device.id && item.at.startsWith(day) && item.source === "جهاز"));
  for (const [code, list] of grouped) {
    const person = people.find((item) => item.companyId === device.companyId && item.code === code);
    if (!person) continue;
    const sorted = list.slice().sort((a, b) => a.at.localeCompare(b.at));
    sorted.forEach((item, index) => {
      const kind: Punch["kind"] = sorted.length > 1 && index === sorted.length - 1 ? "خروج" : "دخول";
      punches = [...punches, {
        id: `live-${device.id}-${code}-${item.at}`,
        companyId: device.companyId,
        deviceId: device.id,
        personId: person.id,
        deviceName: device.cloudName,
        branch: device.branch,
        person: person.name,
        at: item.at.slice(0, 16),
        kind,
        source: "جهاز",
      }];
    });
  }
  return {
    ...store,
    people,
    fingers,
    punches,
    devices: store.devices.map((item) => item.id === device.id ? { ...item, online: true, lastSync: nowStamp() } : item),
  };
}
