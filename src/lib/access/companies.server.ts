import { readFile, writeFile, mkdir, rename, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  baseDirectory,
  inCompany,
  companyDirectory,
  LEGACY_COMPANY,
} from "./tenant-context.server";
import {
  AccessError,
  readState,
  updateState,
  passwordHash,
  type Actor,
} from "./store.server";
import { initialState, type Role } from "./domain";
import type { Company, Identity, Platform } from "./company-domain";
const locks = globalThis as typeof globalThis & {
  __zubaydPlatformLocks?: Map<string, Promise<unknown>>;
};
const file = () => join(baseDirectory(), "companies.json");
export async function platformState(): Promise<Platform> {
  try {
    const value = JSON.parse(await readFile(file(), "utf8")) as Platform;
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.companies) ||
      !Array.isArray(value.accounts)
    )
      throw new AccessError(
        "COMPANY_STORAGE",
        "ملف الشركات غير متوافق. لم تُعد كتابة البيانات.",
      );
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // A read-only compatibility view. Loading the new application never rewrites production.
  const legacy = await inCompany(LEGACY_COMPANY, () => readState());
  const owner = legacy.accounts.find(
    (a) => a.enabled && a.role === "admin",
  )?.username;
  return {
    schemaVersion: 1,
    revision: 0,
    companies: [
      {
        id: LEGACY_COMPANY,
        nameAr: "الشركة الحالية",
        nameEn: "",
        address: "",
        contact: "",
        logo: "",
        branches: [],
        createdAt: "",
      },
    ],
    accounts: legacy.accounts.map((a) => ({
      ...a,
      systemAdmin: a.username === owner,
      memberships: [{ companyId: LEGACY_COMPANY, role: a.role }],
    })),
    audit: [],
  };
}
async function changePlatform<T>(
  run: (p: Platform) => Promise<T> | T,
): Promise<T> {
  const key = baseDirectory();
  locks.__zubaydPlatformLocks ??= new Map();
  const previous = locks.__zubaydPlatformLocks.get(key) || Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(async () => {
      const next = structuredClone(await platformState()),
        result = await run(next);
      next.revision++;
      await mkdir(key, { recursive: true, mode: 0o700 });
      const temp = join(key, `companies-${randomBytes(8).toString("hex")}.tmp`);
      await writeFile(temp, JSON.stringify(next), { mode: 0o600, flag: "wx" });
      try {
        await copyFile(file(), join(key, "companies.previous.json"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      await rename(temp, file());
      return result;
    });
  locks.__zubaydPlatformLocks.set(
    key,
    operation.then(
      () => undefined,
      () => undefined,
    ),
  );
  return operation;
}
export async function identityByName(
  username: string,
): Promise<Identity | undefined> {
  const platform = await platformState();
  const existing = platform.accounts.find((a) => a.username === username);
  if (existing) return existing;
  if (
    username ===
      (process.env.SKYLINE_ADMIN_USERNAME || "skyline").toLowerCase() &&
    process.env.SKYLINE_ADMIN_PASSWORD
  )
    return {
      username,
      name: "مسؤول النظام",
      role: "admin",
      enabled: true,
      ...passwordHash(
        process.env.SKYLINE_ADMIN_PASSWORD,
        "skyline-env-account",
      ),
      systemAdmin: true,
      memberships: [],
    };
}
export async function requireSystemAdmin(actor: Actor) {
  const identity = await identityByName(actor.username);
  if (!identity?.enabled || !identity.systemAdmin)
    throw new AccessError(
      "FORBIDDEN",
      "هذه العملية متاحة لمسؤول نظام speed4trading فقط.",
    );
  return identity;
}
export async function withCompany<T>(
  actor: Actor,
  requested: string | undefined,
  run: (actor: Actor) => Promise<T> | T,
): Promise<T> {
  const identity = await identityByName(actor.username),
    platform = await platformState();
  if (!identity?.enabled)
    throw new AccessError("LOGIN_REQUIRED", "أعد تسجيل الدخول إلى speed4trading.");
  const companyId =
    requested ||
    identity.memberships[0]?.companyId ||
    (identity.systemAdmin ? platform.companies[0]?.id : "");
  const membership = identity.memberships.find(
    (m) => m.companyId === companyId,
  );
  if (
    !companyId ||
    !platform.companies.some((c) => c.id === companyId) ||
    (!identity.systemAdmin && !membership)
  )
    throw new AccessError(
      "COMPANY_FORBIDDEN",
      "لا تملك تصريحاً للوصول إلى هذه الشركة.",
    );
  return inCompany(companyId, () =>
    run({
      ...actor,
      companyId,
      systemAdmin: identity.systemAdmin,
      role: identity.systemAdmin ? "admin" : membership!.role,
    }),
  );
}
export async function companyView(actor: Actor) {
  const identity = await identityByName(actor.username),
    platform = await platformState();
  const companies = platform.companies.filter(
    (c) =>
      identity?.systemAdmin ||
      identity?.memberships.some((m) => m.companyId === c.id),
  );
  const selected = companies.find((c) => c.id === actor.companyId);
  return {
    companies,
    company: selected,
    companyId: selected?.id,
    systemAdmin: Boolean(identity?.systemAdmin),
  };
}
export async function saveCompany(
  actor: Actor,
  input: {
    id?: string;
    nameAr: string;
    nameEn: string;
    address: string;
    contact: string;
    logo: string;
  },
) {
  if (input.id)
    await withCompany(actor, input.id, async (a) => {
      if (a.role !== "admin")
        throw new AccessError(
          "FORBIDDEN",
          "تعديل بيانات الشركة يحتاج مسؤول الشركة.",
        );
    });
  else await requireSystemAdmin(actor);
  return changePlatform(async (p) => {
    let company = p.companies.find((c) => c.id === input.id);
    if (input.id && !company)
      throw new AccessError("COMPANY", "الشركة غير موجودة.");
    if (!company) {
      company = {
        id: `co-${randomBytes(12).toString("hex")}`,
        nameAr: "",
        nameEn: "",
        address: "",
        contact: "",
        logo: "",
        branches: [],
        createdAt: new Date().toISOString(),
      };
      const state = initialState();
      state.devices = [];
      state.companyId = company.id;
      const directory = companyDirectory(company.id);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(join(directory, "state.json"), JSON.stringify(state), {
        mode: 0o600,
        flag: "wx",
      });
      p.companies.push(company);
    }
    const { id, ...profile } = input;
    Object.assign(company, profile);
    p.audit.push({
      at: new Date().toISOString(),
      actor: actor.username,
      action: id ? "company.update" : "company.create",
      companyId: company.id,
    });
    return company;
  });
}
export async function saveBranch(
  actor: Actor,
  companyId: string,
  input: { id?: string; name: string; address: string },
) {
  return withCompany(actor, companyId, async (a) => {
    if (a.role !== "admin")
      throw new AccessError("FORBIDDEN", "إضافة الفروع تحتاج مسؤول الشركة.");
    return changePlatform((p) => {
      const company = p.companies.find((c) => c.id === companyId)!;
      let branch = company.branches.find((b) => b.id === input.id);
      if (!branch) {
        branch = {
          id: `br-${randomBytes(8).toString("hex")}`,
          name: "",
          address: "",
        };
        company.branches.push(branch);
      }
      branch.name = input.name;
      branch.address = input.address;
      p.audit.push({
        at: new Date().toISOString(),
        actor: a.username,
        action: "branch.save",
        companyId,
      });
      return branch;
    });
  });
}
export async function saveCompanyAccount(
  actor: Actor,
  companyId: string,
  input: {
    username: string;
    name: string;
    password: string;
    role: Role;
    enabled: boolean;
  },
) {
  return withCompany(actor, companyId, async (scoped) => {
    if (scoped.role !== "admin")
      throw new AccessError("FORBIDDEN", "إدارة الحسابات تحتاج مسؤول الشركة.");
    return changePlatform((p) => {
      const old = p.accounts.find((a) => a.username === input.username);
      if (
        old &&
        !scoped.systemAdmin &&
        (old.systemAdmin ||
          !old.memberships.some((m) => m.companyId === companyId) ||
          old.memberships.some((m) => m.companyId !== companyId))
      )
        throw new AccessError(
          "FORBIDDEN",
          "لا يمكن لمسؤول شركة تعديل حساب مرتبط بشركة أخرى أو مسؤول النظام.",
        );
      if (
        old?.username === actor.username &&
        (!input.enabled || input.role !== "admin")
      )
        throw new AccessError(
          "SELF_LOCK",
          "لا يمكنك تعطيل حسابك الإداري أو تخفيض دوره من هذه الشاشة.",
        );
      const account: Identity = old || {
        username: input.username,
        name: input.name,
        role: input.role,
        enabled: input.enabled,
        ...passwordHash(input.password),
        systemAdmin: false,
        memberships: [],
      };
      // Never persist the clear-text input password.
      account.name = input.name;
      account.role = input.role;
      account.enabled = input.enabled;
      Object.assign(account, passwordHash(input.password));
      account.memberships = account.memberships.filter(
        (m) => m.companyId !== companyId,
      );
      account.memberships.push({ companyId, role: input.role });
      if (!old) p.accounts.push(account);
      p.audit.push({
        at: new Date().toISOString(),
        actor: actor.username,
        action: "account.save",
        companyId,
      });
      return { notice: "تم حفظ حساب الشركة وصلاحياته على الخادم." };
    });
  });
}

/** Atomic (platform lock) creation of the first system-owner admin; refuses once any account exists. */
export async function setupFirstAdmin(input: ReturnType<typeof import("./first-admin-core").validateSetup>) {
  const { applySetup } = await import("./first-admin-core");
  return changePlatform((platform) => {
    const account = applySetup(platform, input, passwordHash(input.password));
    platform.audit.push({ at: new Date().toISOString(), actor: account.username, action: "setup.firstAdmin", companyId: account.memberships[0].companyId });
    return { username: account.username };
  });
}

/** Mandatory company setup for existing installs: rename/rebrand only, never deletes data. */
export async function completeCompanySetup(actor: Actor, input: import("./company-setup-core").CompanySetupInput) {
  const { validateCompanySetup, applyCompanySetup } = await import("./company-setup-core");
  const v = validateCompanySetup(input, actor.username);
  const hashed = v.newPassword ? passwordHash(v.newPassword) : undefined;
  return changePlatform((platform) => {
    const r = applyCompanySetup(platform as never, actor.username, actor.companyId, v, hashed);
    platform.audit.push({ at: new Date().toISOString(), actor: actor.username, action: "company.setup", companyId: r.company.id });
    return { username: r.username, credentialsChanged: r.credentialsChanged };
  });
}
