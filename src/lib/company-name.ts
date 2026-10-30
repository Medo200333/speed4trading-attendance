/** Company-name normalisation + validation shared by the browser and the server (Arabic + English). */
export const COMPANY_NAME_MAX = 120;
/** Old product names that must not stay as the visible company identity. */
export const LEGACY_BRAND = /sky\s*-?\s*line|سكاي\s*لاين/i;
const INVISIBLE = /[\u0000-\u001f\u007f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;
/** NFC, drop invisible/bidi control chars (keyboards and copy-paste add them), collapse spaces, trim. */
export function normalizeCompanyName(value: unknown) {
  return String(value ?? "").normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}
/** Visible length (Arabic diacritics and emoji count as one character). */
export function nameLength(value: string) {
  try { return [...new Intl.Segmenter("ar", { granularity: "grapheme" }).segment(value)].length; } catch { return [...value].length; }
}
/** English company name: required at first setup; also names the data folder (Documents\\<name>). */
export const ENGLISH_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,59}$/;
export function normalizeEnglishName(value: unknown) {
  return String(value ?? "").normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}
export function englishCompanyNameError(value: unknown) {
  const name = normalizeEnglishName(value);
  if (!name) return "اكتب اسم الشركة بالإنجليزية (مطلوب).";
  if (!ENGLISH_NAME_RE.test(name)) return "اسم الشركة بالإنجليزية: من 2 إلى 60 حرفاً، حروف إنجليزية وأرقام ومسافة و - و _ فقط، ويبدأ بحرف أو رقم.";
  if (LEGACY_BRAND.test(name)) return "«Skyline» اسم البرنامج القديم ولا يمكن استخدامه كاسم للشركة.";
  return "";
}
/** Returns "" when valid, otherwise an Arabic message that states the real cause. */
export function companyNameError(value: unknown) {
  const name = normalizeCompanyName(value);
  if (!name) return "اسم الشركة فارغ. اكتب اسم شركتك بالعربية أو الإنجليزية.";
  const n = nameLength(name);
  if (n > COMPANY_NAME_MAX) return `اسم الشركة طويل: ${n} حرفاً، والحد الأقصى ${COMPANY_NAME_MAX} حرفاً.`;
  if (LEGACY_BRAND.test(name)) return "«Skyline / سكاي لاين» اسم البرنامج القديم ولا يمكن استخدامه كاسم للشركة. اكتب اسم شركتك الفعلي.";
  return "";
}
