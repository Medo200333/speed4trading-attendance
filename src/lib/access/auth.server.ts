import {
  getCookie,
  setCookie,
  deleteCookie,
  getRequest,
} from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import {
  AccessError,
  authenticate,
  resolveSession,
  runtime,
} from "./store.server";

const cookie = "skyline-access";
// Tailscale Serve terminates HTTPS on the MagicDNS host and proxies to http://127.0.0.1:8080,
// so the browser Origin (https://<host>.ts.net) never equals request.url. Accept the forwarded
// public origin and an explicit allowlist (SKYLINE_TRUSTED_ORIGINS, comma separated).
const defaultTrusted = [
  "https://desktop-gd5rj4m-1.tailc255fa.ts.net",
  "https://desktop-gd5rj4m-1.tailc255fa.ts.net:8444",
];
function safeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}
function allowedOrigins(request: Request) {
  const allowed = new Set<string>([new URL(request.url).origin]);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (proto && host && /^https?$/.test(proto)) allowed.add(safeOrigin(`${proto}://${host}`));
  for (const item of [
    ...defaultTrusted,
    ...(process.env.SKYLINE_TRUSTED_ORIGINS || "").split(","),
  ])
    if (item.trim()) allowed.add(safeOrigin(item.trim()));
  allowed.delete("");
  return allowed;
}
/** Explicitly trusted public origins (defaults + SKYLINE_TRUSTED_ORIGINS), excluding the request's own origin. */
export function explicitTrustedOrigins() {
  return [...defaultTrusted, ...(process.env.SKYLINE_TRUSTED_ORIGINS || "").split(",")].map(safeOrigin).filter(Boolean);
}
export function assertOrigin() {
  const request = getRequest();
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(request).has(safeOrigin(origin)))
    throw new AccessError(
      "ORIGIN",
      "تم رفض الطلب لأن مصدره غير مطابق للتطبيق.",
    );
}
export async function currentActor() {
  return resolveSession(getCookie(cookie) || "");
}
export async function requireActor() {
  assertOrigin();
  const license = await import("./license.server");
  if (license.licenseEnforced()) {
    const state = license.licenseState();
    if (state.mode === "locked")
      throw new AccessError("LICENSE", license.LICENSE_MESSAGES[state.reason] || "البرنامج غير مفعّل.");
  }
  const actor = await currentActor();
  if (!actor)
    throw new AccessError("LOGIN_REQUIRED", "سجّل الدخول إلى Speed for Training أولاً.");
  return actor;
}
/** Legacy cloud/direct tools have no company identifier; keep them with the system owner. */
export async function requireLegacyActor() {
  const actor=await requireActor();
  await (await import("./companies.server")).requireSystemAdmin(actor);
  return actor;
}
export async function login(username: string, password: string) {
  assertOrigin();
  const account = await authenticate(username, password);
  if (!account)
    return {
      ok: false as const,
      error: "اسم المستخدم أو كلمة المرور غير صحيحين.",
    };
  const token = randomBytes(32).toString("hex");
  runtime().sessions.set(token, {
    username: account.username,
    until: Date.now() + 8 * 3600000,
  });
  setCookie(cookie, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(getRequest().url).protocol === "https:",
    path: "/",
    maxAge: 8 * 3600,
  });
  return { ok: true as const };
}
export async function logout() {
  assertOrigin();
  runtime().sessions.delete(getCookie(cookie) || "");
  deleteCookie(cookie, { path: "/" });
  return { ok: true as const };
}
