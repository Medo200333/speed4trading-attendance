/** The customer company shown as secondary branding (under the Speed frame) and as the owner of every report. */
export type CompanyProfile = { name: string; logo: string };
export const EMPTY_PROFILE: CompanyProfile = { name: "", logo: "" };
/** Placeholder names that must never appear as a customer identity. */
const PLACEHOLDERS = new Set(["الشركة الحالية", "شركة العميل", ""]);
export function profileFrom(company?: { nameAr?: string; logo?: string } | null): CompanyProfile {
  const name = String(company?.nameAr || "").trim();
  const logo = String(company?.logo || "");
  return { name: PLACEHOLDERS.has(name) ? "" : name, logo: /^data:image\/(png|jpeg|webp);base64,/.test(logo) ? logo : "" };
}
/** Report owner line: always the customer company; product name only as a small "powered by". */
export function reportHeader(profile: CompanyProfile, title: string) {
  return { owner: profile.name || "—", title: profile.name ? `${profile.name} — ${title}` : title, poweredBy: "Speed for Training" };
}
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
/** Excel/CSV header block: Speed frame line, then the customer company (report owner), title and period. */
export function reportSheetHeader(profile: CompanyProfile, title: string, period = ""): string[][] {
  const rows = [["Speed for Training"], ["الشركة", profile.name || "—"], ["التقرير", title]];
  if (period) rows.push(["الفترة", period]);
  rows.push([]);
  return rows;
}
/** Download names use the customer company, never the product or owner. */
export function reportFileName(profile: CompanyProfile, kind: string, ext: string) {
  const base = (profile.name || "report").replace(/[\\/:*?"<>|]+/g, "-").trim() || "report";
  return `${base}-${kind}.${ext}`;
}
