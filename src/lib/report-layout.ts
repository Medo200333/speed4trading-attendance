import { buildXlsx, type SheetSpec } from "./xlsx-io.ts";
import type { DailyRow } from "./daily-report.ts";

/**
 * Hikvision-style attendance report layout (v2):
 *  - Summary matrix: rows = employees (photo + name), columns = dates across, cell = in/out | "غياب".
 *  - One sheet / one page per employee: photo + name header, then one row per day.
 * Pure functions: feed DailyRow[] (devices, Teams or merged) and a date range.
 */
export const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const ABSENT = "غياب";
export const SINGLE = "بصمة واحدة";

export type LayoutDay = { date: string; dayName: string; first: string; last: string; worked: string; minutes: number; branch: string; state: "present" | "single" | "absent" };
export type LayoutEmployee = { key: string; employeeNo: string; name: string; photo?: string | null; branch: string; days: LayoutDay[]; present: number; absent: number; totalMinutes: number };
export type ReportLayout = { from: string; to: string; dates: string[]; employees: LayoutEmployee[] };

const hm5 = (v: string) => (v ? v.slice(0, 5) : "");
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const fmtMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function dateRange(from: string, to: string): string[] {
  const out: string[] = []; const d = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
export const dayName = (date: string) => AR_DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
export const shortDate = (date: string) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;
export const longDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

export function buildLayout(from: string, to: string, rows: DailyRow[]): ReportLayout {
  const dates = dateRange(from, to);
  const groups = new Map<string, DailyRow[]>();
  for (const r of rows) { const k = r.personId || r.employeeNo || r.name; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  const employees: LayoutEmployee[] = [];
  for (const [key, list] of groups) {
    const byDate = new Map(list.filter((r) => !r.absent && r.first).map((r) => [r.date, r]));
    const branches = new Map<string, number>();
    let totalMinutes = 0;
    const days: LayoutDay[] = dates.map((date) => {
      const r = byDate.get(date);
      if (!r) return { date, dayName: dayName(date), first: "", last: "", worked: "", minutes: 0, branch: "", state: "absent" };
      const first = hm5(r.first), last = hm5(r.last);
      const single = !last || last === first;
      const minutes = single ? 0 : Math.max(0, toMin(last) - toMin(first));
      totalMinutes += minutes;
      if (r.branch) branches.set(r.branch, (branches.get(r.branch) || 0) + 1);
      return { date, dayName: dayName(date), first, last: single ? "" : last, worked: single ? SINGLE : fmtMinutes(minutes), minutes, branch: r.branch || "", state: single ? "single" : "present" };
    });
    const present = days.filter((d) => d.state !== "absent").length;
    const head = list[0];
    employees.push({ key, employeeNo: head.employeeNo, name: head.name, photo: list.find((r) => r.photo)?.photo, branch: [...branches].sort((a, b) => b[1] - a[1])[0]?.[0] || "-", days, present, absent: dates.length - present, totalMinutes });
  }
  employees.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return { from, to, dates, employees };
}

const safeSheet = (name: string, used: Set<string>) => {
  const base = name.replace(/[[\]:*?/\\]/g, "").trim().slice(0, 28) || "موظف"; let n = base; let i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 26)}_${i++}`;
  used.add(n.toLowerCase()); return n;
};
export function matrixCell(d: LayoutDay): string { return d.state === "absent" ? ABSENT : d.state === "single" ? d.first : `${d.first}\n${d.last}`; }

export function layoutSheets(layout: ReportLayout, companyName = "", companyLogo = ""): SheetSpec[] {
  const { dates, employees } = layout;
  const period = `${longDate(layout.from)} – ${longDate(layout.to)}`;
  const title = `${companyName ? companyName + " — " : ""}تقرير الحضور والانصراف (${period})`;
  const sumRows: (string | number)[][] = [[title], ["الصورة", "الاسم", "الكود", ...dates.map((d) => `${dayName(d)}\n${shortDate(d)}`), "أيام الحضور", "إجمالي الساعات"]];
  const sumHeights: Record<number, number> = { 0: 30, 1: 34 };
  employees.forEach((e, i) => { sumRows.push(["", e.name, e.employeeNo, ...e.days.map(matrixCell), e.present, fmtMinutes(e.totalMinutes)]); sumHeights[i + 2] = 42; });
  const summary: SheetSpec = { name: "الملخص", logo: companyLogo || undefined, widths: [8, 20, 12, ...dates.map(() => 8), 10, 12], rows: sumRows, heights: sumHeights,
    images: employees.flatMap((e, i) => (e.photo ? [{ col: 0, row: i + 2, dataUrl: e.photo, maxW: 50, maxH: 50 }] : [])) };
  const used = new Set<string>(["الملخص"]);
  const sheets = employees.map((e): SheetSpec => ({
    name: safeSheet(e.name, used),
    widths: [16, 14, 12, 12, 13, 22, 4],
    heights: { 0: 30, 1: 22, 2: 22, 3: 22, 4: 22 },
    images: e.photo ? [{ col: 0, row: 0, dataUrl: e.photo, maxW: 100, maxH: 100 }] : [],
    rows: [
      ["", e.name], ["", "الكود", e.employeeNo], ["", "الفرع", e.branch], ["", "الفترة", period], ["", "أيام الحضور / الغياب", `${e.present} / ${e.absent}`], [],
      ["اليوم", "التاريخ", "أول بصمة", "آخر بصمة", "المدة", "الفرع"],
      ...e.days.map((d) => (d.state === "absent" ? [d.dayName, longDate(d.date), ABSENT, "", "", ""] : [d.dayName, longDate(d.date), d.first, d.last || "—", d.worked, d.branch])),
      ["الإجمالي", `${e.present} يوم حضور`, "", "", fmtMinutes(e.totalMinutes), ""],
    ],
  }));
  return [summary, ...sheets];
}
export function layoutXlsxBytes(from: string, to: string, rows: DailyRow[], companyName = "", companyLogo = ""): Uint8Array {
  return buildXlsx(layoutSheets(buildLayout(from, to, rows), companyName, companyLogo));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeImg = (u?: string | null) => (u && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : "");
export const LAYOUT_CSS = `@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{font-family:'IBM Plex Sans Arabic','Cairo','Noto Sans Arabic',sans-serif;margin:0;color:#1d2433}
.pg{page-break-after:always}.pg:last-child{page-break-after:auto}.bar{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1F3864;padding-bottom:4px;margin-bottom:6px}
.bar h1{margin:0;font-size:18px;color:#1F3864}.bar span{font-size:11px;color:#555}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #b8c3d6;text-align:center;padding:1px}
th{background:#1F3864;color:#fff;font-weight:600}.mx th{font-size:8px;line-height:1.15}.mx td{font-size:8px;height:27px;line-height:1.15}.mx td.nm{text-align:right;font-weight:700;font-size:9px;padding-right:3px}
.mx img{width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle}.g{background:#E2F0D9}.a{background:#FDE2E1;color:#C00000}.s{background:#FFF4CE}.t{background:#EAF0F8;font-weight:700}
.hd{display:flex;gap:16px;align-items:center;background:#EAF0F8;border-radius:10px;padding:6px 12px;margin-bottom:5px}.hd img{width:72px;height:72px;border-radius:10px;object-fit:cover;border:2px solid #1F3864}
.hd h2{margin:0;font-size:22px;color:#1F3864}.chips{display:flex;gap:8px;margin-top:4px;flex-wrap:wrap}.chips b{background:#fff;border:1px solid #b8c3d6;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600}
.dt td,.dt th{font-size:9px;height:13px;padding:0;line-height:1.1}.leg{font-size:9px;margin-top:4px;color:#555}.leg i{display:inline-block;width:10px;height:10px;border:1px solid #999;margin:0 3px -1px 2px}`;

/** Full RTL HTML document (A4 landscape) — print with Electron webContents.printToPDF or window.print(). */
export function layoutHtml(layout: ReportLayout, companyName = "", perPage = 19, colsPerPage = 16): string {
  const { dates, employees } = layout;
  const period = `${longDate(layout.from)} – ${longDate(layout.to)}`;
  const bar = (sub: string) => `<div class=bar><h1>${esc(companyName ? companyName + " — " : "")}تقرير الحضور والانصراف</h1><span>${esc(sub)} · الفترة ${period} · توقيت القاهرة</span></div>`;
  const parts: string[][] = []; for (let i = 0; i < dates.length; i += colsPerPage) parts.push(dates.slice(i, i + colsPerPage));
  const pages: string[] = [];
  parts.forEach((part, pi) => {
    const last = pi === parts.length - 1; const idx = part.map((d) => dates.indexOf(d));
    for (let c = 0; c < Math.max(1, employees.length); c += perPage) {
      const rows = employees.slice(c, c + perPage).map((e) => {
        const img = safeImg(e.photo);
        const cells = idx.map((j) => { const d = e.days[j]; return d.state === "absent" ? `<td class=a>${ABSENT}</td>` : d.state === "single" ? `<td class=s>${d.first}</td>` : `<td class=g>${d.first}<br>${d.last}</td>`; }).join("");
        return `<tr><td>${img ? `<img src="${img}">` : ""}</td><td class=nm>${esc(e.name)}<br><small>${esc(e.employeeNo)}</small></td>${cells}${last ? `<td class=t>${e.present}</td><td class=t>${fmtMinutes(e.totalMinutes)}</td>` : ""}</tr>`;
      }).join("");
      const th = part.map((d) => `<th>${dayName(d)}<br>${shortDate(d)}</th>`).join("");
      pages.push(`<div class=pg>${bar(`الملخص (${pi + 1}/${parts.length})`)}<table class=mx><tr><th style="width:34px">الصورة</th><th style="width:110px">الاسم</th>${th}${last ? `<th style="width:42px">أيام<br>الحضور</th><th style="width:46px">إجمالي<br>الساعات</th>` : ""}</tr>${rows}</table><div class=leg><i class=g></i>حضور (أول/آخر بصمة) <i class=s></i>${SINGLE} <i class=a></i>${ABSENT}</div></div>`);
    }
  });
  for (const e of employees) {
    const img = safeImg(e.photo);
    const trs = e.days.map((d) => { const base = `<td>${d.dayName}</td><td>${longDate(d.date)}</td>`;
      return d.state === "absent" ? `<tr class=a>${base}<td colspan=4>${ABSENT}</td></tr>` : `<tr${d.state === "single" ? " class=s" : ""}>${base}<td>${d.first}</td><td>${d.last || "—"}</td><td><b>${d.worked}</b></td><td>${esc(d.branch)}</td></tr>`; }).join("");
    pages.push(`<div class=pg>${bar("تقرير موظف")}<div class=hd>${img ? `<img src="${img}">` : ""}<div><h2>${esc(e.name)}</h2><div class=chips><b>الكود: ${esc(e.employeeNo)}</b><b>الفرع: ${esc(e.branch)}</b><b>أيام الحضور: ${e.present}</b><b>الغياب: ${e.absent}</b><b>إجمالي الساعات: ${fmtMinutes(e.totalMinutes)}</b></div></div></div><table class=dt><tr><th>اليوم</th><th>التاريخ</th><th>أول بصمة</th><th>آخر بصمة</th><th>المدة</th><th>الفرع</th></tr>${trs}<tr class=t><td colspan=2>الإجمالي</td><td colspan=2>${e.present} يوم حضور · ${e.absent} ${ABSENT}</td><td>${fmtMinutes(e.totalMinutes)}</td><td></td></tr></table></div>`);
  }
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>${LAYOUT_CSS}</style></head><body>${pages.join("")}</body></html>`;
}
