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
  const punches = [];
  const people = [];
  let page = 1;
  let done = false;
  let notice = "";
  for (let step = 0; step < 8 && !done; step += 1) {
    const chunk = await hik.hikPullChunk({
      apiBase: String(input?.apiBase || ""),
      sessionId: String(input?.sessionId || ""),
      featureCode: String(input?.featureCode || ""),
      startDate: day,
      endDate: day,
      timeZone: "Africa/Cairo",
      pageIndex: page,
      kind: "transaction",
    });
    if (!chunk.ok) return chunk;
    punches.push(...(chunk.punches || []));
    for (const person of chunk.people || []) {
      people.push({ employeeNo: person.employeeNo, name: person.name });
    }
    notice = chunk.notice || notice;
    done = Boolean(chunk.done);
    page = chunk.pageIndex || page + 1;
  }
  return { ok: true, punches, people, notice };
});

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
