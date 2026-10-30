const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const isapi = require("./isapi.cjs");
const hik = require("./hik-connect.cjs");

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
ipcMain.handle("speed:cloudLogin", (_event, input) => hik.hikLogin(
  String(input?.account || ""),
  String(input?.password || ""),
  String(input?.imageCode || ""),
  String(input?.featureCode || ""),
  String(input?.smsCode || ""),
));
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
  const notice = `الحضور ${attendance.punches.length} حركة. Transaction ${transactions.punches.length} حركة. صور ${photos}.`;
  return { ok: true, punches, people, notice };
});

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
