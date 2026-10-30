import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createServer } from "vite";

const folder = resolve(process.env.SKYLINE_ACCESS_DATA_DIR || join(process.env.LOCALAPPDATA || homedir(), "SKYLINE", "access-control"));
mkdirSync(folder, { recursive: true, mode: 0o700 });
if (process.platform === "win32") {
  const identity = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true });
  const sid = identity.match(/S-1-\d+(?:-\d+)+/)?.[0];
  if (!sid) throw new Error("Cannot determine private-store Windows SID");
  execFileSync("icacls.exe", [folder, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], { stdio: "ignore", windowsHide: true });
}
const target = join(folder, "state.json");
const priorStore = resolve(".skyline-private/state.json");
if (!existsSync(target) && existsSync(priorStore) && target !== priorStore) {
  copyFileSync(priorStore, target);
  if (!readFileSync(target).equals(readFileSync(priorStore))) throw new Error("Private-store copy validation failed");
}
if (!existsSync(target)) {
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  try {
    const { initialState } = await vite.ssrLoadModule("/src/lib/access/domain.ts");
    const state = initialState();
    const prior = readFileSync(".codex-backups/access-center-20261022/src/lib/hikvision.functions.ts", "utf8");
    const legacy = /username === "([^"]+)" && data\.password === "([^"]+)"/.exec(prior);
    const username = process.env.SKYLINE_ADMIN_USERNAME || legacy?.[1];
    const password = process.env.SKYLINE_ADMIN_PASSWORD || legacy?.[2];
    if (!username || !password) throw new Error("Set SKYLINE_ADMIN_USERNAME and SKYLINE_ADMIN_PASSWORD before bootstrap");
    const salt = randomBytes(24).toString("hex");
    const hash = pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex");
    state.accounts = [{ username: username.toLowerCase(), name: "مسؤول SKY LINE", role: "admin", enabled: true, salt, hash }];
    writeFileSync(target, JSON.stringify(state), { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ initialized: true, legacyLoginPreserved: Boolean(legacy), plaintextSecretsStored: false, privateAcl: process.platform === "win32" }));
  } finally { await vite.close(); }
} else console.log(JSON.stringify({ initialized: false, existingStatePreserved: true }));
