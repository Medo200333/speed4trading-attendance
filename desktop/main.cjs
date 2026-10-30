const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const zlib = require("zlib");
const isapi = require("./isapi.cjs");
const hik = require("./hik-connect.cjs");

function pack(value) {
  return { gzip: zlib.gzipSync(JSON.stringify(value)).toString("base64") };
}

function create() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "سبيد فور تريدنج",
    autoHideMenuBar: true,
    backgroundColor: "#f6f5f8",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  win.loadFile(path.join(__dirname, "dist", "index.html"));
}

ipcMain.handle("speed:probe", (_event, link) => isapi.probe(link));
ipcMain.handle("speed:pull", (_event, link) => isapi.pull(link));
ipcMain.handle("speed:door", (_event, link) => isapi.door(link));

let siteWin = null;
ipcMain.handle("speed:openSite", () => {
  if (siteWin && !siteWin.isDestroyed()) {
    siteWin.show();
    siteWin.focus();
    return { ok: true };
  }
  siteWin = new BrowserWindow({
    width: 1200,
    height: 860,
    title: "Hik-Connect",
    autoHideMenuBar: true,
    webPreferences: { partition: "persist:hik-connect", contextIsolation: true, nodeIntegration: false },
  });
  siteWin.loadURL("https://www.hik-connect.com/");
  siteWin.on("closed", () => { siteWin = null; });
  return { ok: true };
});
ipcMain.handle("speed:takeSite", async () => {
  const cookies = await session.fromPartition("persist:hik-connect").cookies.get({});
  const team = cookies.find((cookie) => cookie.name === "JSESSIONID" && /hikcentralconnect/i.test(cookie.domain || ""));
  const portal = cookies.find((cookie) => cookie.name === "HC_sessionId");
  const anyTeam = cookies.find((cookie) => cookie.name === "JSESSIONID");
  if (team || (anyTeam && /hikcentral/i.test(anyTeam.domain || ""))) {
    const chosen = team || anyTeam;
    return { ok: true, apiBase: "https://ieu-team.hikcentralconnect.com/hcc", sessionId: chosen.value, featureCode: "site", teamName: "الفريق", notice: "جلسة الموقع اتاخدت." };
  }
  if (portal) {
    return { ok: true, apiBase: "https://www.hik-connect.com", sessionId: portal.value, featureCode: "site", teamName: "الموقع", notice: "جلسة الموقع اتاخدت." };
  }
  if (anyTeam) {
    return { ok: true, apiBase: "https://www.hik-connect.com", sessionId: anyTeam.value, featureCode: "site", teamName: "الموقع", notice: "جلسة الموقع اتاخدت." };
  }
  return { ok: false, error: "لسه مفيش دخول. افتح الموقع وسجّل الدخول من النافذة دي، وبعدين اسحب." };
});

ipcMain.handle("speed:cloudLogin", async (_event, input) => {
  try {
    return await hik.hikLogin(
      String(input?.account || ""),
      String(input?.password || ""),
      String(input?.imageCode || ""),
      String(input?.featureCode || ""),
      String(input?.smsCode || ""),
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "دخول الفريق وقف." };
  }
});
ipcMain.handle("speed:cloudPull", async (_event, input) => {
  const day = String(input?.day || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "تاريخ السحب مش مظبوط." };
  const base = {
    apiBase: String(input?.apiBase || ""),
    sessionId: String(input?.sessionId || ""),
    featureCode: String(input?.featureCode || ""),
    startDate: day,
    endDate: day,
    timeZone: "Africa/Cairo",
  };
  const drain = async (kind) => {
    const punches = [];
    const people = [];
    let page = 1;
    let done = false;
    let notice = "";
    for (let step = 0; step < 8 && !done; step += 1) {
      const chunk = await hik.hikPullChunk({ ...base, pageIndex: page, ...(kind ? { kind } : {}) });
      if (!chunk.ok) return { ok: false, error: chunk.error, punches, people, notice };
      punches.push(...(chunk.punches || []));
      for (const person of chunk.people || []) {
        if (!person?.employeeNo && !person?.name) continue;
        people.push({ employeeNo: person.employeeNo || person.name, name: person.name || person.employeeNo, photo: person.photo || "" });
      }
      notice = chunk.notice || notice;
      done = Boolean(chunk.done);
      page = chunk.pageIndex || page + 1;
    }
    return { ok: true, punches, people, notice };
  };
  const attendance = await drain();
  const transactions = await drain("transaction");
  if (!attendance.ok && !transactions.ok) return { ok: false, error: attendance.error || transactions.error };
  const seen = new Set();
  const punches = [];
  for (const punch of [...attendance.punches, ...transactions.punches]) {
    const key = `${punch.employeeNo}|${punch.date}|${String(punch.time || "").slice(0, 5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    punches.push(punch);
  }
  const people = [];
  const byCode = new Map();
  for (const person of [...attendance.people, ...transactions.people]) {
    const current = byCode.get(person.employeeNo);
    if (!current) {
      byCode.set(person.employeeNo, person);
      people.push(person);
    } else if (!current.photo && person.photo) {
      current.photo = person.photo;
    }
  }
  const photos = people.filter((person) => person.photo).length;
  const notice = `من الموقع: حضور ${attendance.punches.length}، Transaction ${transactions.punches.length}، صور ${photos}.`;
  return pack({ ok: true, punches, people, notice });
});
ipcMain.handle("speed:cloudMap", async (_event, input) => {
  const map = await hik.hikReadMap(String(input?.apiBase || ""), String(input?.sessionId || ""));
  if (!map.ok) return map;
  const buttons = (map.buttons || []).map((button) => ({
    key: button.key,
    ar: button.ar,
    en: button.en,
    meaning: button.meaning,
    found: Boolean(button.found),
    path: button.path || "",
    count: button.count || 0,
    names: button.names || [],
  }));
  return pack({ ok: true, buttons });
});

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
