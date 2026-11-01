const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  Menu,
  shell,
} = require("electron");
/** Only mail composer (never sends) and web links leave the app, and they open in the system apps. */
function openOutside(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "mailto:" || u.protocol === "https:" || u.protocol === "http:") { void shell.openExternal(u.toString()); return true; }
  } catch {}
  return false;
}
const { spawn } = require("node:child_process");
const { join, resolve } = require("node:path");
const {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} = require("node:fs");
const { randomBytes } = require("node:crypto");
const {
  safeDataDirectory,
  createInstallation,
  checkAdministrator,
  validateConnection,
  validateCertificate,
  atomic,
  pickDataDirectory,
  findFreePort,
} = require("./desktop-config.cjs");
const brand = require("./resources/brand.json");
let window,
  maintenance,
  server,
  configuration,
  origin = "",
  shuttingDown = false,
  maintaining = false,
  restorePending;
// Keep the original storage name so upgrades keep the same userData folder and data.
app.setName(brand.storageName || brand.name);
app.setAppUserModelId(brand.appId);
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  window?.show();
  window?.focus();
});
/** The NSIS uninstaller reads this value to delete the customer's data folder (see build/installer.nsh). */
function recordDataDirectory(root) {
  if (process.platform !== "win32") return;
  try {
    require("node:child_process").execFileSync("reg", ["add", "HKCU\\Software\\SpeedForTraining\\Install", "/v", "DataDirectory", "/t", "REG_SZ", "/d", root, "/f"], { windowsHide: true, stdio: "ignore" });
  } catch { /* best effort */ }
}
const settings = () => join(app.getPath("userData"), "installation.json");
const eventLog = (code) => {
  try {
    const root = join(app.getPath("userData"), "logs");
    mkdirSync(root, { recursive: true });
    require("node:fs").appendFileSync(
      join(root, "runtime.log"),
      new Date().toISOString() +
        " " +
        String(code)
          .replace(/[^a-zA-Z0-9_-]/g, "")
          .slice(0, 80) +
        "\n",
    );
  } catch {}
};
function trusted(event) {
  const u = event.senderFrame?.url || "";
  // Compare real file: URLs. Install paths can contain spaces, which Chromium %20-encodes.
  const page = (name) => require("node:url").pathToFileURL(join(__dirname, name)).href.toLowerCase();
  const local = ["setup.html", "maintenance.html", "connection.html"].some((name) => u.toLowerCase() === page(name));
  let fromServer = false;
  try { fromServer = Boolean(origin && new URL(u).origin === origin); } catch {}
  return event.senderFrame === event.sender.mainFrame && (local || fromServer);
}
function checkSender(event) {
  if (!trusted(event)) throw new Error("IPC_ORIGIN");
}
function createWindow() {
  const w = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 360,
    minHeight: 540,
    title: brand.name,
    icon: join(__dirname, "resources", "app.ico"),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  w.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) {
      if (!url.endsWith("/setup.html") && !url.endsWith("/maintenance.html") && !url.endsWith("/connection.html"))
        event.preventDefault();
    } else if (!origin || new URL(url).origin !== origin) {
      event.preventDefault();
      openOutside(url);
    }
  });
  w.webContents.session.setPermissionRequestHandler(
    (_wc, permission, callback) =>
      callback(permission === "media" && _wc.getURL().startsWith(origin + "/")),
  );
  return w;
}
async function startServer() {
  const config = configuration.connection,
    root = configuration.dataDirectory;
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("OS_ENCRYPTION_UNAVAILABLE");
  const vault = safeStorage.decryptString(
    readFileSync(join(root, "vault-key.bin")),
  );
  const instance = randomBytes(24).toString("hex");
  const env = {};
  for (const key of [
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "PATH",
    "LOCALAPPDATA",
    "APPDATA",
    "USERPROFILE",
    "ProgramFiles",
    "COMSPEC",
  ])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    VITE_AUTH_ENABLED: "false",
    VITE_GROK_EXTENSIONS: "0",
    SKYLINE_ACCESS_DATA_DIR: root,
    SKYLINE_EMPTY_INSTALL: "1",
    SKYLINE_LICENSE_ENFORCE: "1",
    SKYLINE_VAULT_KEY: vault,
    NITRO_HOST: config.host,
    NITRO_PORT: String(config.port),
  });
  env.ZUBAYD_INSTANCE_ID = instance;
  if (config.tlsCert && config.tlsKey) {
    env.NITRO_SSL_CERT = readFileSync(config.tlsCert, "utf8");
    env.NITRO_SSL_KEY = readFileSync(config.tlsKey, "utf8");
  }
  origin =
    (config.tlsCert ? "https://" + config.serverName : "http://127.0.0.1") +
    ":" +
    config.port;
  const entry = app.isPackaged
    ? join(process.resourcesPath, "server", "server", "index.mjs")
    : join(__dirname, "..", "dist-server", "server", "index.mjs");
  if (!existsSync(entry)) throw new Error("SERVER_BUNDLE_MISSING");
  server = spawn(process.execPath, [entry], {
    env,
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", () => eventLog("SERVER_STDERR"));
  server.on("error", () => eventLog("SERVER_START_FAILED"));
  server.on("exit", (code) => {
    server = undefined;
    eventLog("SERVER_EXIT_" + code);
    if (!shuttingDown && !maintaining)
      dialog.showErrorBox(
        brand.name,
        "توقف خادم التطبيق. راجع سجل الأحداث ثم أعد فتح البرنامج.",
      );
  });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin + "/__zubayd/instance");
      if (r.ok && (await r.json()).instance === instance) {
        window.loadURL(origin + "/");
        eventLog("SERVER_READY");
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("SERVER_NOT_READY");
}
async function stopOwnedServer() {
  const child = server;
  if (!child) return;
  await new Promise((done, fail) => {
    const timeout = setTimeout(() => fail(new Error("SERVER_STOP_TIMEOUT")), 10000);
    child.once("exit", () => { clearTimeout(timeout); done(); });
    child.kill();
  });
}
ipcMain.handle("zubayd:info", (event) => {
  checkSender(event);
  return {
    name: brand.name,
    version: brand.version,
    dataDirectory:
      configuration?.dataDirectory || join(app.getPath("userData"), "data"),
    connection: configuration?.connection,
    installed: Boolean(configuration),
  };
});
ipcMain.handle("zubayd:folder", async (event) => {
  checkSender(event);
  if (configuration) throw new Error("ALREADY_CONFIGURED");
  const result = await dialog.showOpenDialog(window, {
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("zubayd:setup", async (event, input) => {
  checkSender(event);
  if (configuration) throw new Error("ALREADY_CONFIGURED");
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("OS_ENCRYPTION_UNAVAILABLE");
  try {
    const wanted = { ...(input.connection || {}) };
    if (!Number(wanted.port)) wanted.port = await findFreePort(8787);
    const connection = validateConnection(wanted);
    validateCertificate(connection);
    // Data folder: real Documents known folder (follows OneDrive/redirect) \ <English company name>.
    const picked = pickDataDirectory(app.getPath("documents"), input.companyNameEn);
    const directory = safeDataDirectory(picked.dir, require("node:path").dirname(process.execPath));
    let root = directory;
    if (picked.reuse) {
      safeStorage.decryptString(readFileSync(join(directory, "vault-key.bin")));
      eventLog("SETUP_REUSED_DATA");
    } else {
      root = createInstallation(directory, input).root;
      writeFileSync(
        join(root, "vault-key.bin"),
        safeStorage.encryptString(randomBytes(32).toString("base64")),
        { mode: 0o600, flag: "wx" },
      );
    }
    configuration = { dataDirectory: root, connection };
    atomic(settings(), configuration);
    recordDataDirectory(root);
    await startServer();
    return { ok: true, dataDirectory: root, port: connection.port };
  } catch (error) {
    eventLog("SETUP_FAILED_" + String(error && error.message || error));
    if (!server) configuration = undefined;
    throw error;
  }
});
ipcMain.handle("zubayd:maintenance", (event) => {
  checkSender(event);
  if (!configuration) return;
  maintenance = createWindow();
  maintenance.loadFile(join(__dirname, "maintenance.html"));
});
const attempts = new Map();
function administrator(input) {
  if (!configuration || maintaining) throw new Error("MAINTENANCE_BUSY");
  const name=String(input.username||"").slice(0,80),old=attempts.get(name),bucket=old&&Date.now()-old.since<60000?old:{count:0,since:Date.now()};
  if(bucket.count>=5)throw new Error("RATE_LIMIT");
  if(!checkAdministrator(configuration.dataDirectory,name,input.password)){bucket.count++;attempts.set(name,bucket);throw new Error("ADMIN_REQUIRED");}
  attempts.delete(name);
}
ipcMain.handle("zubayd:connection",async(event,input)=>{
 checkSender(event);administrator(input);
 if(input.phrase!=="تغيير اتصال speed4trading")throw new Error("CONFIRMATION_REQUIRED");
 const connection=validateConnection(input.connection);validateCertificate(connection);
 const previous=configuration;maintaining=true;
 try{
  await stopOwnedServer();configuration={...previous,connection};atomic(settings(),configuration);
  await startServer();eventLog("CONNECTION_CHANGED");
  return {ok:true,notice:"تم تشغيل خادم speed4trading بإعداد الاتصال الجديد. لم تتغير قواعد Firewall أو Tailscale."};
 }catch(error){
  await stopOwnedServer();configuration=previous;atomic(settings(),previous);await startServer();throw error;
 }finally{maintaining=false;}
});
// 1.2.10: attendance report -> PDF (A4 landscape) through Chromium's printer, then a save dialog.
ipcMain.handle("zubayd:pdf", async (event, input) => {
  checkSender(event);
  const html = String(input && input.html || "");
  if (!html || html.length > 80 * 1024 * 1024) throw new Error("BAD_REPORT");
  const name = String(input && input.name || "report.pdf").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 150);
  const tmp = join(app.getPath("temp"), "s4t-report-" + randomBytes(6).toString("hex") + ".html");
  writeFileSync(tmp, html, { mode: 0o600 });
  const { BrowserWindow: Win } = require("electron");
  const view = new Win({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await view.loadFile(tmp);
    const pdf = await view.webContents.printToPDF({ landscape: true, pageSize: "A4", printBackground: true, margins: { marginType: "none" } });
    const target = await dialog.showSaveDialog(window || undefined, { defaultPath: join(app.getPath("documents"), name), filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (target.canceled || !target.filePath) return { ok: false, canceled: true };
    writeFileSync(target.filePath, pdf);
    return { ok: true, path: target.filePath };
  } finally {
    view.destroy();
    try { require("node:fs").unlinkSync(tmp); } catch { /* ignore */ }
  }
});
ipcMain.handle("zubayd:backup", async (event, input) => {
  checkSender(event);
  administrator(input);
  const result = await dialog.showSaveDialog(maintenance || window, {
    defaultPath: "SpeedForTraining-backup.zubayd",
    filters: [{ name: "speed4trading encrypted backup", extensions: ["zubayd"] }],
  });
  if (result.canceled) return { cancelled: true };
  const backupRoot=resolve(configuration.dataDirectory),backupTarget=resolve(result.filePath);
  if(maintaining || backupTarget===backupRoot || backupTarget.startsWith(backupRoot+require("node:path").sep) || !backupTarget.toLowerCase().endsWith(".zubayd")) throw new Error("BACKUP_TARGET");
  const { exportBackup } = require("./maintenance.cjs");
  maintaining = true;
  try {
  await stopOwnedServer();
  await exportBackup(
    configuration.dataDirectory,
    result.filePath,
    input.backupPassword,
    safeStorage,
  );
  } finally { try { await startServer(); } finally { maintaining = false; } }
  eventLog("BACKUP_EXPORTED");
  return { ok: true };
});
ipcMain.handle("zubayd:restore", async (event, input) => {
  checkSender(event);
  administrator(input);
  const { decodeBackup, restoreBackup, summary } = require("./maintenance.cjs");
  if (input.phase === "commit") {
    const pending = restorePending;
    if (!pending || pending.sender !== event.sender.id || pending.username !== input.username || pending.until < Date.now() || input.token !== pending.token || input.phrase !== "استعادة بيانات speed4trading") throw new Error("CONFIRMATION_REQUIRED");
    restorePending = undefined;
    maintaining = true;
    try {
      await stopOwnedServer();
      await restoreBackup(configuration.dataDirectory, pending.data, safeStorage);
      await window.webContents.session.clearStorageData({storages:["cookies","localstorage","indexdb","cachestorage"]});
      eventLog("BACKUP_RESTORED");
    } finally { pending.data.vaultKey = ""; try { await startServer(); } finally { maintaining = false; } }
    return {ok:true,notice:"استُعيدت النسخة وأعيد تشغيل خادم speed4trading. بقي مجلد البيانات السابق بجواره للرجوع إليه. سجّل الدخول بحساب النسخة المستعادة."};
  }
  if (input.phase !== "inspect") throw new Error("RESTORE_PHASE");
  const result = await dialog.showOpenDialog(maintenance || window, {
    properties: ["openFile"],
    filters: [{ name: "speed4trading encrypted backup", extensions: ["zubayd"] }],
  });
  if (result.canceled) return { cancelled: true };
  const data = await decodeBackup(
    result.filePaths[0],
    input.backupPassword,
  );
  if (restorePending) restorePending.data.vaultKey = "";
  const token = randomBytes(24).toString("hex");
  restorePending = {token,data,sender:event.sender.id,username:input.username,until:Date.now()+120000};
  setTimeout(() => { if(restorePending?.token === token) {restorePending.data.vaultKey="";restorePending=undefined;} },120000).unref();
  return {
    token,
    preview: summary(data),
    requiresServerStop: true,
    notice:
      "فُحصت النسخة فقط. التأكيد التالي يوقف خادم speed4trading الخاص بالتطبيق مؤقتاً ثم يستعيد النسخة، مع الاحتفاظ بمجلد البيانات الحالي كاملاً.",
  };
});
app.whenReady().then(async () => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: brand.name,
        submenu: [
          {
            label: "حول speed4trading",
            click: () =>
              dialog.showMessageBox({
                title: brand.name,
                message: brand.name + " " + brand.version,
                detail:
                  "المالك: " +
                  brand.ownerName +
                  "\nتدار شركات العملاء بصورة مستقلة.",
              }),
          },
          {
            label: "اتصال الهاتف وHTTPS",
            click: () => { if(configuration){const connectionWindow=createWindow();connectionWindow.loadFile(join(__dirname,"connection.html"));} },
          },
          {
            label: "النسخ الاحتياطي والصيانة",
            click: () => {
              if (configuration) {
                maintenance = createWindow();
                maintenance.loadFile(join(__dirname, "maintenance.html"));
              }
            },
          },
          { role: "quit", label: "خروج" },
        ],
      },
    ]),
  );
  window = createWindow();
  if (existsSync(settings())) {
    configuration = JSON.parse(readFileSync(settings(), "utf8"));
    try {
      if (configuration.connection?.host === "127.0.0.1") {
        const free = await findFreePort(Number(configuration.connection.port) || 8787);
        if (free !== configuration.connection.port) { configuration.connection.port = free; atomic(settings(), configuration); eventLog("PORT_MOVED_" + free); }
      }
      await startServer();
    } catch (error) {
      eventLog(error.message);
      dialog.showErrorBox(
        brand.name,
        "تعذر بدء الخادم المحلي. تحقق من المنفذ ومجلد البيانات والشهادة.",
      );
    }
  } else window.loadFile(join(__dirname, "setup.html"));
});
app.on("before-quit", () => {
  shuttingDown = true;
  if (server) server.kill();
});
app.on("window-all-closed", () => app.quit());
