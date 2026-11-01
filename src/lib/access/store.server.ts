import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import {companyDirectory,companyContext,LEGACY_COMPANY} from "./tenant-context.server";
import { applyEditionSeed } from "./edition-seed.server";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  timingSafeEqual,
} from "node:crypto";
import {
  initialState,
  type AccessState,
  type Account,
  type Role,
} from "./domain";

export class AccessError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
type Runtime = {
  state?: AccessState;
  chain: Promise<unknown>;
  secrets: Map<string, { username: string; password: string; until: number }>;
  sessions: Map<string, { username: string; until: number }>;
  attempts: Map<string, { count: number; since: number }>;
};
const globals = globalThis as typeof globalThis & {
  __skylineAccessStores?: Map<string, Runtime>;
};
export const privateDirectory = () =>
  companyDirectory();
export function runtime(): Runtime {
  globals.__skylineAccessStores ??= new Map();
  const key = privateDirectory();
  if (!globals.__skylineAccessStores.has(key))
    globals.__skylineAccessStores.set(key, {
      chain: Promise.resolve(),
      secrets: new Map(),
      sessions: new Map(),
      attempts: new Map(),
    });
  return globals.__skylineAccessStores.get(key)!;
}
async function load(): Promise<AccessState> {
  const cache = runtime();
  if (cache.state) return cache.state;
  try {
    const value = JSON.parse(
      await readFile(join(privateDirectory(), "state.json"), "utf8"),
    ) as AccessState;
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.devices) ||
      !Array.isArray(value.accounts)
    )
      throw new AccessError(
        "STORAGE_VERSION",
        "إصدار التخزين غير متوافق. راجع النسخة الاحتياطية.",
      );
    if (value.companyId && value.companyId !== companyContext())
      throw new AccessError("COMPANY_STORAGE", "ملف البيانات لا يتبع الشركة المطلوبة. أُوقفت القراءة لحماية البيانات.");
    cache.state = value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cache.state = initialState();
    if(companyContext()!==LEGACY_COMPANY){cache.state.devices=[];cache.state.companyId=companyContext();if(applyEditionSeed(cache.state))await writeFile(join(companyDirectory(companyContext()),"state.json"),JSON.stringify(cache.state),{mode:0o600}).catch(()=>{});}
  }
  return cache.state;
}
export async function readState() {
  await runtime().chain;
  return structuredClone(await load());
}
export async function updateState<T>(
  change: (state: AccessState) => T | Promise<T>,
): Promise<T> {
  const cache = runtime();
  const operation = cache.chain
    .catch(() => undefined)
    .then(async () => {
      const next = structuredClone(await load());
      const result = await change(next);
      if (next.events.length > 100000 || next.audit.length > 100000)
        throw new AccessError(
          "STORAGE_LIMIT",
          "بلغ مخزن السجلات حده. احتفظ بأرشيف قبل متابعة الاستيراد.",
        );
      next.revision += 1;
      const root = privateDirectory();
      await mkdir(root, { recursive: true, mode: 0o700 });
      const target = join(root, "state.json");
      const temporary = join(
        root,
        `state-${randomBytes(8).toString("hex")}.tmp`,
      );
      await writeFile(temporary, JSON.stringify(next), {
        mode: 0o600,
        flag: "wx",
      });
      try {
        await copyFile(target, join(root, "state.previous.json"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await rename(temporary, target);
      cache.state = next;
      return result;
    });
  cache.chain = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
export function passwordHash(
  password: string,
  salt = randomBytes(24).toString("hex"),
) {
  return {
    salt,
    hash: pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex"),
  };
}
export async function authenticate(
  username: string,
  password: string,
): Promise<Account | null> {
  const name = username.trim().toLowerCase();
  const cache = runtime();
  const old = cache.attempts.get(name);
  const bucket = old && Date.now() - old.since < 60000 ? old : undefined;
  if (bucket && bucket.count >= 5)
    throw new AccessError(
      "RATE_LIMIT",
      "محاولات كثيرة. انتظر دقيقة ثم حاول مجدداً.",
    );
  const {identityByName} = await import("./companies.server");
  const stored = await identityByName(name);
  let account:Account|undefined = stored?.enabled ? stored : undefined;
  if (
    !stored &&
    process.env.SKYLINE_ADMIN_PASSWORD &&
    name === (process.env.SKYLINE_ADMIN_USERNAME || "skyline").toLowerCase()
  )
    account = {
      username: name,
      name: "مسؤول النظام",
      role: "admin",
      enabled: true,
      ...passwordHash(
        process.env.SKYLINE_ADMIN_PASSWORD,
        "skyline-env-account",
      ),
    };
  const candidate = passwordHash(
    password,
    account?.salt || "skyline-no-account",
  ).hash;
  const valid =
    account &&
    timingSafeEqual(
      Buffer.from(candidate, "hex"),
      Buffer.from(account.hash, "hex"),
    );
  if (!valid) {
    cache.attempts.set(name, {
      count: (bucket?.count || 0) + 1,
      since: bucket?.since || Date.now(),
    });
    return null;
  }
  cache.attempts.delete(name);
  return account!;
}
export type Actor = {
  companyId?:string;
  systemAdmin?:boolean;
  username: string;
  name: string;
  role: Role;
  sessionId: string;
};
export async function resolveSession(token: string): Promise<Actor | null> {
  const entry = runtime().sessions.get(token);
  if (!entry || entry.until < Date.now()) {
    runtime().sessions.delete(token);
    return null;
  }
  const {identityByName}=await import("./companies.server");
  const account=await identityByName(entry.username);
  if (account)
    return account.enabled
      ? {
          username: account.username,
          name: account.name,
          role: account.role,
          systemAdmin:account.systemAdmin,
          sessionId: token,
        }
      : null;
  if (
    entry.username ===
      (process.env.SKYLINE_ADMIN_USERNAME || "skyline").toLowerCase() &&
    process.env.SKYLINE_ADMIN_PASSWORD
  )
    return {
      username: entry.username,
      name: "مسؤول النظام",
      role: "admin",
      sessionId: token,
    };
  return null;
}
export function requireRole(actor: Actor, minimum: Role) {
  if (
    { manager: 0, accountant: 0, viewer: 0, operator: 1, admin: 2 }[actor.role] <
    { manager: 0, accountant: 0, viewer: 0, operator: 1, admin: 2 }[minimum]
  )
    throw new AccessError(
      "FORBIDDEN",
      "هذه العملية تتطلب صلاحية أعلى داخل البرنامج.",
    );
}
const vaultKey = () =>
  process.env.SKYLINE_VAULT_KEY
    ? createHash("sha256").update(process.env.SKYLINE_VAULT_KEY).digest()
    : null;
export async function rememberCredential(
  deviceId: string,
  username: string,
  password: string,
) {
  runtime().secrets.set(deviceId, {
    username,
    password,
    until: Date.now() + 8 * 3600000,
  });
  const key = vaultKey();
  if (!key) return;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(deviceId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ username, password })),
    cipher.final(),
  ]);
  await mkdir(privateDirectory(), { recursive: true, mode: 0o700 });
  const file = join(
    privateDirectory(),
    `credential-${createHash("sha256").update(deviceId).digest("hex")}.json`,
  );
  await writeFile(
    file,
    JSON.stringify({
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    }),
    { mode: 0o600 },
  );
}
export async function credential(deviceId: string) {
  const entry = runtime().secrets.get(deviceId);
  if (entry && entry.until > Date.now())
    return { username: entry.username, password: entry.password };
  runtime().secrets.delete(deviceId);
  if (
    deviceId === "hikvision-main" &&
    companyContext() === LEGACY_COMPANY &&
    process.env.HIKVISION_USERNAME &&
    process.env.HIKVISION_PASSWORD
  )
    return {
      username: process.env.HIKVISION_USERNAME,
      password: process.env.HIKVISION_PASSWORD,
    };
  const key = vaultKey();
  if (key) {
    try {
      const file = join(
        privateDirectory(),
        `credential-${createHash("sha256").update(deviceId).digest("hex")}.json`,
      );
      const value = JSON.parse(await readFile(file, "utf8"));
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(value.nonce, "base64"),
      );
      decipher.setAAD(Buffer.from(deviceId));
      decipher.setAuthTag(Buffer.from(value.tag, "base64"));
      const secret = JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(value.ciphertext, "base64")),
          decipher.final(),
        ]).toString("utf8"),
      );
      if (
        typeof secret.username === "string" &&
        typeof secret.password === "string"
      )
        return secret as { username: string; password: string };
    } catch {
      /* Fail closed without logging vault data. */
    }
  }
  throw new AccessError(
    "CREDENTIAL_REQUIRED",
    "أعد الاتصال بالجهاز وأدخل كلمة مروره. لا توجد بيانات اعتماد متاحة على الخادم.",
  );
}
export function vaultPersistent() {
  return Boolean(vaultKey());
}
