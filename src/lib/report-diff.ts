import type { DailyRow } from "./daily-report.ts";
import { buildXlsx, type SheetSpec } from "./xlsx-io.ts";
import { dayName, longDate, LAYOUT_CSS, layoutSheets, buildLayout } from "./report-layout.ts";

/** Devices vs Hik-Connect Team comparison, one line per employee per day. */
export type DiffState = "match" | "time" | "device-only" | "teams-only" | "absent";
export type DiffRow = { key: string; employeeNo: string; name: string; photo?: string | null; date: string; devFirst: string; devLast: string; teamFirst: string; teamLast: string; firstDiff: number | null; lastDiff: number | null; state: DiffState };
export const DIFF_LABEL: Record<DiffState, string> = { match: "مطابق", time: "فرق في الوقت", "device-only": "في الأجهزة بس", "teams-only": "في Teams بس", absent: "غياب في الاتنين" };
const hm = (v: string) => (v ? v.slice(0, 5) : "");
const min = (v: string) => { const [h, m] = v.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const d = (a: string, b: string) => (a && b ? min(b) - min(a) : null);
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** tolerance: minutes difference still counted as "مطابق" (default 2). */
export function diffRows(device: DailyRow[], teams: DailyRow[], tolerance = 2): DiffRow[] {
  const id = (r: DailyRow) => (r.employeeNo ? `no:${r.employeeNo}` : `nm:${norm(r.name)}`);
  const map = new Map<string, { dev?: DailyRow; team?: DailyRow }>();
  const add = (r: DailyRow, side: "dev" | "team") => {
    const k = `${id(r)}|${r.date}`; const cur = map.get(k) || {};
    const has = !r.absent && r.first;
    if (!cur[side] || (has && !(cur[side]!.first))) cur[side] = r;
    map.set(k, cur);
  };
  device.forEach((r) => add(r, "dev")); teams.forEach((r) => add(r, "team"));
  const out: DiffRow[] = [];
  for (const [k, { dev, team }] of map) {
    const base = dev || team!;
    const devFirst = dev && !dev.absent ? hm(dev.first) : "", devLast = dev && !dev.absent ? hm(dev.last) : "";
    const teamFirst = team && !team.absent ? hm(team.first) : "", teamLast = team && !team.absent ? hm(team.last) : "";
    const firstDiff = d(devFirst, teamFirst), lastDiff = d(devLast || devFirst, teamLast || teamFirst);
    let state: DiffState;
    if (!devFirst && !teamFirst) state = "absent";
    else if (!teamFirst) state = "device-only";
    else if (!devFirst) state = "teams-only";
    else state = Math.abs(firstDiff ?? 0) <= tolerance && Math.abs(lastDiff ?? 0) <= tolerance ? "match" : "time";
    out.push({ key: k.split("|")[0], employeeNo: base.employeeNo, name: (dev?.name && !/^team:/.test(dev.personId) ? dev.name : team?.name) || base.name, photo: dev?.photo || team?.photo || null, date: base.date, devFirst, devLast, teamFirst, teamLast, firstDiff, lastDiff, state });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}
export function diffSummary(rows: DiffRow[]) {
  const c: Record<DiffState, number> = { match: 0, time: 0, "device-only": 0, "teams-only": 0, absent: 0 };
  for (const r of rows) c[r.state]++;
  return c;
}
export const fmtDiff = (m: number | null) => (m == null ? "" : m === 0 ? "0" : `${m > 0 ? "+" : "−"}${Math.abs(m)} د`);

export function diffSheet(rows: DiffRow[]): SheetSpec {
  const s = diffSummary(rows);
  return { name: "الفرق", widths: [20, 10, 10, 12, 10, 10, 10, 10, 10, 10, 16], rows: [
    [`مقارنة الأجهزة و Hik-Connect Team — مطابق ${s.match} · فرق وقت ${s.time} · أجهزة بس ${s["device-only"]} · Teams بس ${s["teams-only"]}`],
    ["الاسم", "الكود", "اليوم", "التاريخ", "أول (أجهزة)", "آخر (أجهزة)", "أول (Teams)", "آخر (Teams)", "فرق الأول", "فرق الآخر", "الحالة"],
    ...rows.map((r) => [r.name, r.employeeNo, dayName(r.date), longDate(r.date), r.devFirst || "—", r.devLast || "—", r.teamFirst || "—", r.teamLast || "—", fmtDiff(r.firstDiff), fmtDiff(r.lastDiff), DIFF_LABEL[r.state]]),
  ] };
}
/** Agreed layout workbook (+ optional "الفرق" sheet). */
export function reportXlsxBytes(from: string, to: string, rows: DailyRow[], diff: DiffRow[] | null, companyName = "", companyLogo = "") {
  const sheets = layoutSheets(buildLayout(from, to, rows), companyName, companyLogo);
  if (diff) sheets.splice(1, 0, diffSheet(diff));
  return buildXlsx(sheets);
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const CLS: Record<DiffState, string> = { match: "g", time: "s", "device-only": "a", "teams-only": "a", absent: "" };
export function diffHtmlBody(rows: DiffRow[], companyName = "", from = "", to = "", perPage = 28) {
  const s = diffSummary(rows);
  const pages: string[] = [];
  for (let i = 0; i < Math.max(1, rows.length); i += perPage) {
    const trs = rows.slice(i, i + perPage).map((r) => `<tr class=${CLS[r.state]}><td class=nm>${esc(r.name)}</td><td>${esc(r.employeeNo)}</td><td>${dayName(r.date)}<br>${longDate(r.date)}</td><td>${r.devFirst || "—"}</td><td>${r.devLast || "—"}</td><td>${r.teamFirst || "—"}</td><td>${r.teamLast || "—"}</td><td>${fmtDiff(r.firstDiff)}</td><td>${fmtDiff(r.lastDiff)}</td><td><b>${DIFF_LABEL[r.state]}</b></td></tr>`).join("");
    pages.push(`<div class=pg><div class=bar><h1>${esc(companyName ? companyName + " — " : "")}الفرق بين الأجهزة و Teams</h1><span>${from ? `الفترة ${longDate(from)} – ${longDate(to)} · ` : ""}مطابق ${s.match} · فرق وقت ${s.time} · أجهزة بس ${s["device-only"]} · Teams بس ${s["teams-only"]}</span></div><table class=dt><tr><th style="width:130px">الاسم</th><th>الكود</th><th>التاريخ</th><th>أول (أجهزة)</th><th>آخر (أجهزة)</th><th>أول (Teams)</th><th>آخر (Teams)</th><th>فرق الأول</th><th>فرق الآخر</th><th>الحالة</th></tr>${trs}</table></div>`);
  }
  return pages.join("");
}
/** Adds the diff pages after the summary of a layoutHtml document. */
export function withDiffPages(layoutDoc: string, rows: DiffRow[], companyName = "", from = "", to = "") {
  return layoutDoc.replace("</body>", `${diffHtmlBody(rows, companyName, from, to)}</body>`);
}
export function diffHtml(rows: DiffRow[], companyName = "", from = "", to = "") {
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>${LAYOUT_CSS}</style></head><body>${diffHtmlBody(rows, companyName, from, to)}</body></html>`;
}
