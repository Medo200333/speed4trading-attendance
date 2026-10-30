import { companyNameError, englishCompanyNameError, normalizeCompanyName, normalizeEnglishName } from "../company-name.ts";
/** Pure rules for the one-time first-admin setup of packaged installs. */
export type SetupInput = { name: string; username: string; password: string; confirm: string; companyName?: string; companyNameEn?: string; logo?: string };
export type SetupPlatform = {
  companies: { id: string; nameAr: string; nameEn?: string; createdAt: string; logo?: string }[];
  accounts: { username: string; enabled: boolean }[];
};
export class SetupError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export function passwordStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score; // 0..5
}
export function validateSetup(input: SetupInput) {
  const username = String(input.username || "").trim().toLowerCase();
  const name = String(input.name || "").trim();
  const password = String(input.password || "");
  if (!name || name.length > 80) throw new SetupError("SETUP_INPUT", "اكتب اسم المسؤول (حتى 80 حرفاً).");
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw new SetupError("SETUP_INPUT", "اسم المستخدم من 3 إلى 32 حرفاً إنجليزياً أو أرقام أو . _ -");
  if (password.length < 8 || password.length > 128) throw new SetupError("WEAK_PASSWORD", "كلمة المرور يجب ألا تقل عن 8 أحرف.");
  if (passwordStrength(password) < 3) throw new SetupError("WEAK_PASSWORD", "كلمة المرور ضعيفة. استخدم حروفاً كبيرة وصغيرة وأرقاماً أو رموزاً.");
  if (password !== input.confirm) throw new SetupError("SETUP_INPUT", "تأكيد كلمة المرور غير مطابق.");
  if (password.toLowerCase().includes(username)) throw new SetupError("WEAK_PASSWORD", "لا تضع اسم المستخدم داخل كلمة المرور.");
  const companyName = normalizeCompanyName(input.companyName);
  const nameError = companyNameError(companyName);
  if (nameError) throw new SetupError("SETUP_INPUT", nameError);
  const companyNameEn = normalizeEnglishName(input.companyNameEn);
  const enError = englishCompanyNameError(companyNameEn);
  if (enError) throw new SetupError("SETUP_INPUT", enError);
  const logo = String(input.logo || "");
  if (logo && (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) || Math.floor((logo.length - logo.indexOf(",") - 1) * 3 / 4) > 1024 * 1024))
    throw new SetupError("SETUP_INPUT", "شعار الشركة غير صالح: يجب أن يكون صورة PNG أو JPG أو SVG حتى 1 ميجابايت.");
  return { username, name, password, companyName, companyNameEn, logo };
}
export const needsSetup = (platform: SetupPlatform) => !platform.accounts.some((a) => a.enabled) && platform.accounts.length === 0;
/** Mutates platform: adds the single system-owner admin. Refuses when any account exists. */
export function applySetup<P extends SetupPlatform>(platform: P, input: ReturnType<typeof validateSetup>, hashed: { salt: string; hash: string }, now = new Date()) {
  if (!needsSetup(platform)) throw new SetupError("SETUP_DONE", "تم إعداد حساب المسؤول مسبقاً. سجّل الدخول.");
  const company = platform.companies.find((c) => c.id === "legacy") || platform.companies[0];
  if (company) {
    company.nameAr = input.companyName;
    company.nameEn = input.companyNameEn;
    company.logo = input.logo || "";
    if (!company.createdAt) company.createdAt = now.toISOString();
  }
  const account = { username: input.username, name: input.name, role: "admin" as const, enabled: true, ...hashed, systemAdmin: true, memberships: [{ companyId: company?.id || "legacy", role: "admin" as const }] };
  (platform.accounts as unknown[]).push(account);
  return account;
}
const loopback = (host: string) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
/** Setup is accepted from the local machine, or from an explicitly trusted public origin. */
export function setupOriginAllowed(origin: string | null, host: string, trusted: string[]) {
  if (!origin) return false;
  let o: URL;
  try { o = new URL(origin); } catch { return false; }
  if (loopback(o.host) && loopback(host) && o.host.toLowerCase() === host.toLowerCase()) return true;
  return trusted.includes(o.origin);
}
