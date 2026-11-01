const {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  readdirSync,
} = require("node:fs");
const { join, resolve } = require("node:path");
const { randomBytes, pbkdf2Sync, timingSafeEqual } = require("node:crypto");
const ENGLISH_NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,59}$/;
/** Windows-safe folder name from the validated English company name. */
function folderName(nameEn) {
  let n = String(nameEn || "").trim().replace(/[^A-Za-z0-9 _-]/g, "").replace(/\s+/g, " ").replace(/[ .]+$/, "");
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(n)) n += "-data";
  return n || "SpeedForTraining";
}
const ourData = (dir) => existsSync(join(dir, "companies.json")) && existsSync(join(dir, "state.json"));
/** Documents\<Name>; an existing non-empty folder that is not our data gets -2, -3 … */
function pickDataDirectory(documents, nameEn) {
  const base = join(documents, folderName(nameEn));
  for (let i = 1; i < 100; i++) {
    const dir = i === 1 ? base : base + "-" + i;
    if (!existsSync(dir) || !readdirSync(dir).length) return { dir, reuse: false };
    // 1.2.10: never reuse a leftover data folder — a new install always starts fresh (old folder is left untouched).
  }
  throw new Error("DATA_NOT_EMPTY");
}
/** First free 127.0.0.1 port from start (tries the next ones). */
function findFreePort(start = 8787, tries = 50) {
  const net = require("node:net");
  return new Promise((done, fail) => {
    const attempt = (port, left) => {
      if (left <= 0 || port > 65535) return fail(new Error("NO_FREE_PORT"));
      const s = net.createServer();
      s.once("error", () => attempt(port + 1, left - 1));
      s.once("listening", () => s.close(() => done(port)));
      s.listen(port, "127.0.0.1");
    };
    attempt(start, tries);
  });
}
function atomic(file, value) {
  const temporary = file + "." + randomBytes(6).toString("hex") + ".tmp";
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  renameSync(temporary, file);
}
function safeDataDirectory(directory, installationRoot) {
  const selected=resolve(directory), installed=resolve(installationRoot), normalize=value=>process.platform==='win32'?value.toLowerCase():value;
  if(normalize(selected)===normalize(installed)||normalize(selected).startsWith(normalize(installed)+require('node:path').sep))throw new Error('DATA_INSIDE_INSTALLATION');
  return selected;
}
function createInstallation(directory, input) {
  const root = resolve(directory);
  if (
    existsSync(join(root, "state.json")) ||
    existsSync(join(root, "companies.json"))
  )
    throw new Error("DATA_EXISTS");
  if (
    root === require("node:path").parse(root).root ||
    (existsSync(root) && readdirSync(root).length)
  )
    throw new Error("DATA_NOT_EMPTY");
  if (
    !/^[a-z0-9_.-]{3,32}$/.test(input.username) ||
    typeof input.companyNameEn !== "string" ||
    !ENGLISH_NAME.test(input.companyNameEn) ||
    typeof input.password !== "string" ||
    input.password.length < 12 ||
    input.password.length > 128 ||
    typeof input.companyName !== "string" ||
    !input.companyName.trim() ||
    input.companyName.length > 120
  )
    throw new Error("SETUP_INPUT");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const salt = randomBytes(24).toString("hex"),
    hash = pbkdf2Sync(input.password, salt, 210000, 32, "sha256").toString(
      "hex",
    );
  const account = {
    username: input.username,
    name: input.adminName || "مسؤول النظام",
    role: "admin",
    salt,
    hash,
    enabled: true,
  };
  const state = {
    schemaVersion: 1,
    companyId: "legacy",
    revision: 0,
    devices: [],
    people: [],
    doors: [],
    events: [],
    plans: [],
    rules: {
      shifts: [
        {
          id: "day",
          name: "الدوام اليومي",
          start: "08:00",
          end: "16:00",
          graceMinutes: 15,
          earlyGraceMinutes: 10,
          maxHours: 14,
          days: [0, 1, 2, 3, 4],
        },
      ],
      holidays: [],
      leaves: [],
      duplicateSeconds: 45,
    },
    audit: [],
    accounts: [account],
    reviews: [],
  };
  const platform = {
    schemaVersion: 1,
    revision: 1,
    companies: [
      {
        id: "legacy",
        nameAr: input.companyName.trim(),
        nameEn: String(input.companyNameEn || "").trim(),
        address: "",
        contact: "",
        logo: "",
        branches: [],
        createdAt: new Date().toISOString(),
      },
    ],
    accounts: [
      {
        ...account,
        systemAdmin: true,
        memberships: [{ companyId: "legacy", role: "admin" }],
      },
    ],
    audit: [],
  };
  atomic(join(root, "state.json"), state);
  atomic(join(root, "companies.json"), platform);
  return {
    root,
    companyName: input.companyName.trim(),
    username: input.username,
  };
}
function checkAdministrator(directory, username, password) {
  try {
    const p = JSON.parse(
      readFileSync(join(directory, "companies.json"), "utf8"),
    );
    const a = p.accounts.find(
      (a) => a.username === username && a.enabled && a.systemAdmin,
    );
    if (!a) return false;
    const hash = pbkdf2Sync(password, a.salt, 210000, 32, "sha256");
    return timingSafeEqual(hash, Buffer.from(a.hash, "hex"));
  } catch {
    return false;
  }
}
function validateConnection(input) {
  const host = input.host || "127.0.0.1",
    port = Number(input.port || 8787);
  // port 0 = choose automatically (handled by the caller)
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.split(".").some((n) => Number(n) > 255)
  )
    throw new Error("CONNECTION_INPUT");
  if (
    host !== "127.0.0.1" &&
    (!input.tlsCert ||
      !input.tlsKey ||
      !input.serverName ||
      input.allowNetwork !== true)
  )
    throw new Error("HTTPS_REQUIRED");
  if (Boolean(input.tlsCert) !== Boolean(input.tlsKey)) throw new Error("HTTPS_PAIR_REQUIRED");
  if (input.serverName && !/^[a-zA-Z0-9.-]{1,253}$/.test(input.serverName)) throw new Error("SERVER_NAME");
  return {
    host,
    port,
    tlsCert: input.tlsCert || "",
    tlsKey: input.tlsKey || "",
    serverName: input.serverName || "",
    allowNetwork: input.allowNetwork === true,
  };
}
function validateCertificate(connection) {
  if (!connection.tlsCert) return;
  const {X509Certificate,createPrivateKey}=require("node:crypto");
  const cert = new X509Certificate(readFileSync(connection.tlsCert)),key=createPrivateKey(readFileSync(connection.tlsKey));
  const validName = require("node:net").isIP(connection.serverName) ? cert.checkIP(connection.serverName) : cert.checkHost(connection.serverName);
  if (!cert.checkPrivateKey(key) || !validName || Date.parse(cert.validTo)<Date.now() || Date.parse(cert.validFrom)>Date.now()) throw new Error("HTTPS_CERTIFICATE");
}
module.exports = {
  safeDataDirectory,
  createInstallation,
  checkAdministrator,
  validateConnection,
  pickDataDirectory,
  findFreePort,
  folderName,
  ourData,
  validateCertificate,
  atomic,
};
