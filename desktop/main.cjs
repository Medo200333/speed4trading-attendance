const { app, BrowserWindow } = require("electron");
const path = require("path");

function create() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "سبيد فور تريدنج",
    autoHideMenuBar: true,
    backgroundColor: "#f6f5f8",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, "dist", "index.html"));
}

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
