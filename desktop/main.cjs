const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const isapi = require("./isapi.cjs");

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

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
