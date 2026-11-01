/** Pure rules for the mandatory company setup of existing installs (users exist, no company profile yet). */
import { passwordStrength, SetupError } from "./first-admin-core.ts";
import { profileFrom } from "../company-profile.ts";
import { companyNameError, normalizeCompanyName, LEGACY_BRAND } from "../company-name.ts";
export { LEGACY_BRAND };
export type CompanySetupInput = { companyName: string; logo?: string; displayName?: string; newUsername?: string; newPassword?: string; confirm?: string };
type Co = { id: string; nameAr: string; nameEn?: string; logo?: string; createdAt?: string };
type Acc = { username: string; name: string; enabled: boolean; salt?: string; hash?: string; memberships?: { companyId: string }[] };
const LOGO = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export function companyFor(platform: { companies: Co[] }, companyId?: string) {
  return platform.companies.find((c) => c.id === companyId) || platform.companies.find((c) => c.id === "legacy") || platform.companies[0];
}
export function companySetupNeeded(platform: { companies: Co[] }, companyId?: string) {
  const c = companyFor(platform, companyId);
  // The Sky Line edition legitimately carries the Sky Line name; only generic installs must rename a legacy brand.
  const edition = typeof process !== "undefined" && Boolean(process.env?.SKYLINE_EDITION_SEED);
  return !c || !profileFrom(c).name || (!edition && LEGACY_BRAND.test(c.nameAr || ""));
}
export function validateCompanySetup(input: CompanySetupInput, currentUsername: string) {
  const companyName = normalizeCompanyName(input.companyName);
  const nameError = companyNameError(companyName);
  if (nameError) throw new SetupError("SETUP_INPUT", nameError);
  const logo = String(input.logo || "");
  if (logo && (!LOGO.test(logo) || Math.floor((logo.length - logo.indexOf(",") - 1) * 3 / 4) > 1024 * 1024)) throw new SetupError("SETUP_INPUT", "شعار الشركة غير صالح: يجب أن يكون صورة PNG أو JPG أو SVG حتى 1 ميجابايت.");
  const displayName = String(input.displayName || "").trim().slice(0, 80);
  const newUsername = String(input.newUsername || "").trim().toLowerCase();
  if (newUsername && !/^[a-z0-9_.-]{3,32}$/.test(newUsername)) throw new SetupError("SETUP_INPUT", "اسم المستخدم من 3 إلى 32 حرف إنجليزي صغير أو أرقام أو . _ -");
  const newPassword = String(input.newPassword || "");
  if (newPassword) {
    if (newPassword.length < 8 || newPassword.length > 128 || passwordStrength(newPassword) < 3) throw new SetupError("WEAK_PASSWORD", "كلمة المرور ضعيفة: 8 أحرف على الأقل، وامزج حروف كبيرة وصغيرة وأرقام أو رموز.");
    if (newPassword !== input.confirm) throw new SetupError("SETUP_INPUT", "تأكيد كلمة المرور غير مطابق.");
    if (newPassword.toLowerCase().includes(newUsername || currentUsername)) throw new SetupError("WEAK_PASSWORD", "كلمة المرور لا يجب أن تحتوي على اسم المستخدم.");
  }
  return { companyName, logo, displayName, newUsername: newUsername === currentUsername ? "" : newUsername, newPassword };
}
/** Mutates platform. Never deletes accounts, devices or people; only renames/rebrands. */
export function applyCompanySetup<P extends { companies: Co[]; accounts: Acc[] }>(platform: P, actorUsername: string, companyId: string | undefined, v: ReturnType<typeof validateCompanySetup>, hashed?: { salt: string; hash: string }, now = new Date()) {
  const company = companyFor(platform, companyId);
  if (!company) throw new SetupError("COMPANY", "الشركة غير موجودة.");
  company.nameAr = v.companyName;
  if (!company.nameEn || LEGACY_BRAND.test(company.nameEn)) company.nameEn = v.companyName;
  if (v.logo) company.logo = v.logo;
  if (!company.createdAt) company.createdAt = now.toISOString();
  const account = platform.accounts.find((a) => a.username === actorUsername);
  if (!account) throw new SetupError("ACCOUNT", "الحساب الحالي غير موجود.");
  if (v.newUsername) {
    if (platform.accounts.some((a) => a.username === v.newUsername)) throw new SetupError("SETUP_INPUT", "اسم المستخدم ده مستخدم بالفعل.");
    account.username = v.newUsername;
  }
  if (v.displayName) account.name = v.displayName;
  else if (!account.name || LEGACY_BRAND.test(account.name)) account.name = "مسؤول " + v.companyName;
  if (hashed) { account.salt = hashed.salt; account.hash = hashed.hash; }
  for (const a of platform.accounts) if (LEGACY_BRAND.test(a.name || "")) a.name = a.name.replace(LEGACY_BRAND, v.companyName);
  return { company, username: account.username, credentialsChanged: Boolean(v.newUsername || hashed) };
}
