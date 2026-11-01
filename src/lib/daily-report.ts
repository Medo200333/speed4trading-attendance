import type { AttendanceRow, Person } from "./access/domain";
import { buildLayout, layoutHtml, layoutXlsxBytes } from "./report-layout";
import { englishNameOf } from "./access/domain";
import { BRAND } from "./brand";
import { buildXlsx } from "./xlsx-io";
import type { Punch } from "./attendance";
import { concat, jpegBytes, jpegSize, logoJpeg, pdfText, pdfUnicode } from "./sheet-pdf";

/** One line per employee per day: English name, photo, first/last punch and worked time (Cairo local). */
export type DailyRow = {
  personId: string;
  employeeNo: string;
  name: string;
  date: string;
  first: string;
  last: string;
  worked: string;
  status: string;
  absent: boolean;
  photo?: string | null;
  /** Where the punches came from (device/branch names, "Teams"); shown as a column only when some row has it. */
  branch?: string;
};

const hm = (value: string) => (value ? value.slice(0, 5) : "");
const seconds = (value: string) => {
  const [h, m, s] = value.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
};
/** Worked = last - first as hh:mm; blank when there is only one punch. */
export function workedTime(first: string, last: string, count: number): string {
  if (count < 2 || !first || !last) return "";
  const diff = Math.max(0, seconds(last) - seconds(first));
  const minutes = Math.floor(diff / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
function statusOf(row: AttendanceRow): { status: string; absent: boolean } {
  if (row.count === 0) {
    if (/عطلة أسبوعية/.test(row.status)) return { status: "Weekend", absent: false };
    if (/عطلة رسمية/.test(row.status)) return { status: "Holiday", absent: false };
    if (/إجازة/.test(row.status)) return { status: "Leave", absent: false };
    return { status: "Absent", absent: true };
  }
  if (row.count === 1) return { status: "One punch only", absent: false };
  return { status: "Present", absent: false };
}
export function dailyRows(report: AttendanceRow[], people: Pick<Person, "id" | "name" | "employeeNo">[]): DailyRow[] {
  return report
    .map((row) => {
      const person = people.find((p) => p.id === row.personId);
      const { status, absent } = statusOf(row);
      return {
        personId: row.personId,
        employeeNo: row.employeeNo,
        name: englishNameOf(person || { name: row.name, employeeNo: row.employeeNo }),
        date: row.date,
        first: hm(row.first),
        last: row.count >= 2 ? hm(row.last) : "",
        worked: workedTime(row.first, row.last, row.count),
        status,
        absent,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name) || a.employeeNo.localeCompare(b.employeeNo));
}

export type DailySource = "devices" | "teams" | "both";
const sec = (t: string) => seconds(t.length === 5 ? `${t}:00` : t);
const hhmm = (n: number) => `${String(Math.floor(n / 3600)).padStart(2, "0")}:${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}`;
/**
 * Merge device rows with Hik-Connect Team punches for the same period. Rows meet on employeeNo + date;
 * all times are pooled and punches within 45 s of each other count once (the same swipe seen by the
 * device and by the cloud), then first/last/worked are recomputed. Shift markers 00:00/23:59 are ignored.
 */
/**
 * Device events are already absolute (their +hh:mm stamps are converted to Cairo time), but Hik-Connect Team
 * shows the wall clock the terminal had. When a terminal is set to the wrong zone (e.g. UTC+3 instead of Egypt's
 * UTC+2), every Team punch from it is a whole number of hours off. Detect that per device/branch — device
 * first/last punches of the same employee and day line up with Team punches only after a fixed ±N h shift, and
 * never at 0 — and move those Team punches back before de-duplication. Each correction is reported in `warnings`.
 */
export function correctTeamShift(device: DailyRow[], punches: Punch[], start: string, end: string, warnings?: string[]): Punch[] {
  const TOL = 120;
  const byKey = new Map<string, { branch: string; times: number[] }[]>();
  for (const row of device) {
    if (row.absent || row.date < start || row.date > end) continue;
    const times = [row.first, row.last].filter(Boolean).map(sec);
    if (!times.length) continue;
    const k = `${row.employeeNo}|${row.date}`;
    byKey.set(k, [...(byKey.get(k) || []), { branch: row.branch || "", times }]);
  }
  const teamBy = new Map<string, number[]>();
  for (const p of punches) if (p.time) { const k = `${p.employeeNo || p.name}|${p.date}`; teamBy.set(k, [...(teamBy.get(k) || []), sec(p.time)]); }
  const votes = new Map<string, Map<number, number>>();
  for (const [k, rows] of byKey) {
    const team = teamBy.get(k);
    if (!team) continue;
    for (const { branch, times } of rows)
      for (const y of times)
        for (let h = -3; h <= 3; h += 1)
          if (team.some((x) => Math.abs(x - y - h * 3600) <= TOL)) {
            const v = votes.get(branch) || new Map<number, number>();
            v.set(h, (v.get(h) || 0) + 1);
            votes.set(branch, v);
            break;
          }
  }
  const shift = new Map<string, number>();
  for (const [branch, v] of votes) {
    const best = [...v.entries()].filter(([h]) => h !== 0).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 1 && !(v.get(0) || 0)) shift.set(branch, best[0]);
  }
  if (!shift.size) return punches;
  let moved = 0;
  const outPunches = punches.map((p) => {
    const k = `${p.employeeNo || p.name}|${p.date}`;
    const rows = byKey.get(k);
    if (!rows || !p.time) return p;
    const hours = new Set(rows.map((r) => shift.get(r.branch) ?? 0));
    if (hours.size !== 1) return p;
    const h = [...hours][0];
    if (!h) return p;
    const x = sec(p.time);
    if (rows.some((r) => r.times.some((y) => Math.abs(x - y) <= TOL && !r.times.some((y2) => Math.abs(x - h * 3600 - y2) <= TOL)))) return p;
    const fixed = x - h * 3600;
    if (fixed < 0 || fixed >= 86400) return p;
    moved += 1;
    return { ...p, time: `${hhmm(fixed)}:${String(fixed % 60).padStart(2, "0")}` };
  });
  if (warnings)
    for (const [branch, h] of shift)
      warnings.push(`بصمات Hik-Connect Team لجهاز «${branch || "الجهاز"}» متقدمة ${h > 0 ? "+" : ""}${h} ساعة عن وقت الجهاز الفعلي (غالباً المنطقة الزمنية للجهاز غلط) — اتصححت تلقائياً قبل الدمج.`);
  if (warnings && moved) warnings.push(`اتصحح ${moved} بصمة من Team.`);
  return outPunches;
}

export function mergeDailySources(
  device: DailyRow[],
  team: { punches: Punch[]; people: { employeeNo: string; name: string; photo: string }[] } | null,
  source: DailySource,
  start: string,
  end: string,
  warnings?: string[],
): DailyRow[] {
  if (team && source !== "devices") team = { ...team, punches: correctTeamShift(device, team.punches, start, end, warnings) };
  type Acc = DailyRow & { times: number[]; from: string[] };
  const out = new Map<string, Acc>();
  const key = (no: string, date: string) => `${no}|${date}`;
  const tag = (row: Acc, from?: string) => { if (from && !row.from.includes(from)) row.from.push(from); };
  if (source !== "teams")
    for (const row of device) {
      const times = row.absent ? [] : [row.first, row.last].filter(Boolean).map(sec);
      const k = key(row.employeeNo, row.date);
      const seen = out.get(k);
      // The same employee is usually enrolled on several devices/branches: pool their punches instead of
      // letting the last device (often an "Absent" row) overwrite the others.
      if (!seen) {
        const { branch, ...rest } = row;
        const acc: Acc = { ...rest, times, from: [] };
        if (times.length) tag(acc, branch);
        out.set(k, acc);
      } else {
        seen.times.push(...times);
        if (times.length) tag(seen, row.branch);
        if (!seen.photo && row.photo) seen.photo = row.photo;
        if (seen.absent && !row.absent) Object.assign(seen, { status: row.status, absent: false });
      }
    }
  if (source !== "devices" && team) {
    const people = new Map(team.people.map((p) => [p.employeeNo, p]));
    for (const p of team.punches) {
      if (!p.date || !p.time || p.date < start || p.date > end || /^(00:00|23:59)/.test(p.time)) continue;
      const no = p.employeeNo || p.name;
      const k = key(no, p.date);
      let row = out.get(k);
      if (!row) {
        const person = people.get(no);
        row = { personId: `team:${no}`, employeeNo: no, name: person?.name || p.name || no, date: p.date, first: "", last: "", worked: "", status: "", absent: false, photo: person?.photo || null, times: [], from: [] };
        out.set(k, row);
      }
      row.times.push(sec(p.time));
      tag(row, "Teams");
    }
    for (const row of out.values()) if (!row.photo) row.photo = people.get(row.employeeNo)?.photo || row.photo;
  }
  const anyBranch = device.some((r) => r.branch);
  const rows: DailyRow[] = [];
  for (const { times, from, ...row } of out.values()) {
    const branch = anyBranch || (source !== "devices" && from.length) ? { branch: from.join(" + ") } : {};
    if (!times.length) { rows.push({ ...row, ...branch }); continue; }
    const kept: number[] = [];
    for (const t of [...times].sort((a, b) => a - b)) if (!kept.length || t - kept[kept.length - 1] > 45) kept.push(t);
    const first = hhmm(kept[0]), last = kept.length > 1 ? hhmm(kept[kept.length - 1]) : "";
    rows.push({ ...row, ...branch, first, last, worked: workedTime(first, last, kept.length), status: kept.length > 1 ? "Present" : "One punch only", absent: false });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name) || a.employeeNo.localeCompare(b.employeeNo));
}

const PT = 2.83465;
const HEAD = ["Photo", "English name", "No.", "Date", "First punch", "Last punch", "Worked", "Status"];

/** PDF: Speed frame + logo on top, company logo + name beneath, then the daily table. */
export function dailyPdfBytes(
  from: string,
  to: string,
  rows: DailyRow[],
  companyName = "",
  companyLogoJpeg = "",
  speedLogoJpeg = "",
): Uint8Array {
  const enc = new TextEncoder();
  const text = (v: string) => enc.encode(v);
  const pageW = 210 * PT, pageH = 297 * PT, left = 10 * PT, right = pageW - 10 * PT, bottom = 14 * PT;
  const withBranch = rows.some((r) => r.branch);
  const head = withBranch ? [...HEAD, "Branch / source"] : HEAD;
  const widths = (withBranch ? [11, 34, 19, 18, 17, 17, 14, 22, 38] : [14, 44, 20, 22, 20, 20, 18, 32]).map((w) => w * PT);
  const rowH = 12 * PT, headH = 8 * PT;
  const images = new Map<string, Uint8Array>();
  const slot = (key: string) => [...images.keys()].indexOf(key) + 1;
  const pages: string[] = [];
  let cmd = "";
  let y = 0;
  const speed = speedLogoJpeg ? jpegBytes(speedLogoJpeg) : null;
  const logo = companyLogoJpeg ? jpegBytes(companyLogoJpeg) : null;
  if (speed) images.set("speed", speed);
  if (logo) images.set("company", logo);
  const labelWidths = new Map<string, number>();
  const label = (value: string, x: number, base: number, maxW: number, h = 18) => {
    if (typeof document === "undefined" || !/[^\x20-\x7e]/.test(value)) return false;
    const key = `label:${value}`;
    if (!images.has(key)) {
      const c = document.createElement("canvas");
      const c0 = c.getContext("2d");
      if (!c0) return false;
      const font = 'bold 36px "IBM Plex Sans Arabic", sans-serif';
      c0.font = font;
      c.width = Math.min(1600, Math.ceil(c0.measureText(value).width) + 16);
      c.height = 60;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, 60);
      ctx.font = font; ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.fillStyle = "#0b2242";
      ctx.fillText(value, c.width - 8, 44);
      const bytes = jpegBytes(c.toDataURL("image/jpeg", 0.95));
      if (!bytes) return false;
      images.set(key, bytes); labelWidths.set(key, c.width);
    }
    let w = (h * (labelWidths.get(key) ?? 600)) / 60, hh = h;
    if (w > maxW) { hh = (hh * maxW) / w; w = maxW; }
    cmd += `q ${w} 0 0 ${hh} ${x} ${base - 4} cm /Im${slot(key)} Do Q\n`;
    return true;
  };
  const header = () => {
    // Speed frame (product identity) on top.
    cmd += `0.043 0.133 0.259 rg 0 ${pageH - 18 * PT} ${pageW} ${18 * PT} re f\n`;
    cmd += `0.878 0.694 0.353 rg 0 ${pageH - 19 * PT} ${pageW} ${1 * PT} re f\n`;
    let x = left;
    if (speed) {
      const s = jpegSize(speed) ?? { width: 1, height: 1 };
      const h = 13 * PT, w = Math.min(40 * PT, (h * s.width) / Math.max(1, s.height));
      cmd += `q ${w} 0 0 ${h} ${x} ${pageH - 15.5 * PT} cm /Im${slot("speed")} Do Q\n`;
      x += w + 4 * PT;
    }
    cmd += `BT /F1 15 Tf 1 1 1 rg 1 0 0 1 ${x} ${pageH - 9 * PT} Tm (${pdfText(BRAND.englishName || "speed4trading")}) Tj ET\n`;
    cmd += `BT /F2 9 Tf 1 1 1 rg 1 0 0 1 ${x} ${pageH - 14 * PT} Tm (Daily attendance report) Tj ET\n`;
    cmd += `BT /F2 9 Tf 1 1 1 rg 1 0 0 1 ${right - 48 * PT} ${pageH - 11 * PT} Tm (${pdfText(`${from}  to  ${to}`)}) Tj ET\n`;
    // Customer company logo + name beneath.
    x = left;
    if (logo) {
      const s = jpegSize(logo) ?? { width: 1, height: 1 };
      const h = 14 * PT, w = Math.min(40 * PT, (h * s.width) / Math.max(1, s.height));
      cmd += `q ${w} 0 0 ${h} ${x} ${pageH - 36 * PT} cm /Im${slot("company")} Do Q\n`;
      x += w + 4 * PT;
    }
    if (companyName && !label(companyName, x, pageH - 30 * PT, right - x, 22))
      cmd += `BT /F1 13 Tf 0.043 0.133 0.259 rg 1 0 0 1 ${x} ${pageH - 30 * PT} Tm (${pdfText(companyName)}) Tj ET\n`;
    cmd += `BT /F2 8 Tf 0.3 0.38 0.45 rg 1 0 0 1 ${x} ${pageH - 35 * PT} Tm (Times in Cairo local time. Worked = last punch - first punch.) Tj ET\n`;
    cmd += `0.859 0.882 0.902 RG 0.8 w ${left} ${pageH - 39 * PT} m ${right} ${pageH - 39 * PT} l S\n`;
    y = pageH - 42 * PT;
    cmd += `0.043 0.133 0.259 rg ${left} ${y - headH} ${right - left} ${headH} re f\n`;
    let cx = left;
    head.forEach((h, i) => {
      cmd += `BT /F1 8 Tf 1 1 1 rg 1 0 0 1 ${cx + 3} ${y - headH + 8} Tm (${h}) Tj ET\n`;
      cx += widths[i];
    });
    y -= headH;
  };
  const newPage = () => {
    if (cmd) pages.push(cmd);
    cmd = "";
    header();
  };
  newPage();
  let lastDate = "";
  rows.forEach((row, index) => {
    if (y - rowH < bottom) newPage();
    if (row.date !== lastDate && index > 0) cmd += `0.043 0.133 0.259 RG 1.2 w ${left} ${y} m ${right} ${y} l S\n`;
    lastDate = row.date;
    if (row.absent) cmd += `0.996 0.937 0.937 rg ${left} ${y - rowH} ${right - left} ${rowH} re f\n`;
    else if (index % 2 === 0) cmd += `0.953 0.965 0.976 rg ${left} ${y - rowH} ${right - left} ${rowH} re f\n`;
    cmd += `0.8 0.84 0.88 RG 0.5 w ${left} ${y - rowH} ${right - left} ${rowH} re S\n`;
    const photo = row.photo ? jpegBytes(row.photo) : null;
    if (photo) {
      const key = `photo:${row.employeeNo}`;
      if (!images.has(key)) images.set(key, photo);
      const size = 10 * PT, ix = left + (widths[0] - size) / 2, iy = y - rowH + (rowH - size) / 2;
      cmd += `q ${size} 0 0 ${size} ${ix} ${iy} cm /Im${slot(key)} Do Q\n`;
    }
    const cells = ["", row.name, row.employeeNo, row.date, row.first || "-", row.last || "-", row.worked || "", row.status, ...(withBranch ? [row.branch || ""] : [])];
    let cx = left;
    cells.forEach((value, i) => {
      if (i > 0 && value) {
        const red = i === 7 && row.absent;
        const color = red ? "0.75 0.1 0.1" : "0.063 0.141 0.2";
        const max = Math.floor(widths[i] / 4.6);
        cmd += `BT /${i === 1 ? "F1" : "F2"} 8.5 Tf ${color} rg 1 0 0 1 ${cx + 3} ${y - rowH / 2 - 3} Tm (${pdfText(value.slice(0, max))}) Tj ET\n`;
      }
      cx += widths[i];
    });
    y -= rowH;
  });
  if (!rows.length) cmd += `BT /F2 10 Tf 0.3 0.38 0.45 rg 1 0 0 1 ${left} ${y - 16} Tm (No employees in this period.) Tj ET\n`;
  const footer = (n: number, total: number) =>
    `BT /F2 7 Tf 0.45 0.5 0.55 rg 1 0 0 1 ${left} ${8 * PT} Tm (${pdfText(`speed4trading  -  page ${n} / ${total}`)}) Tj ET\n`;
  pages.push(cmd);

  const list = [...images.entries()];
  const objects: Uint8Array[] = [];
  const add = (b: Uint8Array) => (objects.push(b), objects.length);
  const count = pages.length;
  const fontBold = 3 + count, fontReg = fontBold + 1, imgStart = fontReg + 1, contentStart = imgStart + list.length;
  add(text(`<< /Type /Catalog /Pages 2 0 R >>`));
  add(text(`<< /Type /Pages /Count ${count} /Kids [${pages.map((_, i) => `${3 + i} 0 R`).join(" ")}] >>`));
  const refs = list.map((_, i) => `/Im${i + 1} ${imgStart + i} 0 R`).join(" ");
  pages.forEach((_, i) =>
    add(text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /Font << /F1 ${fontBold} 0 R /F2 ${fontReg} 0 R >> /XObject << ${refs} >> >> /Contents ${contentStart + i} 0 R >>`)),
  );
  add(text(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`));
  add(text(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`));
  for (const [, bytes] of list) {
    const s = jpegSize(bytes) ?? { width: 1, height: 1 };
    add(concat([text(`<< /Type /XObject /Subtype /Image /Width ${s.width} /Height ${s.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`), bytes, text("\nendstream")]));
  }
  pages.forEach((content, i) => {
    const stream = text(content + footer(i + 1, count));
    add(concat([text(`<< /Length ${stream.length} >>\nstream\n`), stream, text("endstream")]));
  });
  const info = add(text(`<< /Title ${pdfUnicode(`${companyName || "speed4trading"} - Daily attendance ${from} - ${to}`)} /Author ${pdfUnicode(companyName || "-")} /Producer (speed4trading) >>`));
  const chunks: Uint8Array[] = [text("%PDF-1.4\n")];
  let length = chunks[0].length;
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(length);
    const h = text(`${i + 1} 0 obj\n`), t = text("\nendobj\n");
    chunks.push(h, o, t);
    length += h.length + o.length + t.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${length}\n%%EOF`;
  chunks.push(text(xref));
  return concat(chunks);
}

/** Excel: same layout; photos embedded in column A, Speed logo + company logo at the top. */
export function dailyXlsxBytes(from: string, to: string, rows: DailyRow[], companyName = "", companyLogo = "", speedLogo = ""): Uint8Array {
  const top: (string | number)[][] = [
    ["", BRAND.englishName || "speed4trading", "", "", "", "", "", ""],
    ["", "Daily attendance report", "", "", "", "", "", ""],
    ["", companyName, "", "", "", "", "", ""],
    ["", `Period: ${from} to ${to} (Cairo local time)`, "", "", "", "", "", ""],
    [],
  ];
  const headRow = top.length;
  const withBranch = rows.some((r) => r.branch);
  const data = rows.map((r) => ["", r.name, r.employeeNo, r.date, r.first, r.last, r.worked, r.status, ...(withBranch ? [r.branch || ""] : [])]);
  const heights: Record<number, number> = { 0: 30, 2: 40 };
  const images: { col: number; row: number; dataUrl: string; maxW?: number; maxH?: number }[] = [];
  if (speedLogo) images.push({ col: 0, row: 0, dataUrl: speedLogo, maxW: 60, maxH: 38 });
  rows.forEach((r, i) => {
    heights[headRow + 1 + i] = 34;
    if (r.photo) images.push({ col: 0, row: headRow + 1 + i, dataUrl: r.photo, maxW: 40, maxH: 40 });
  });
  return buildXlsx([
    {
      name: "Daily attendance",
      ltr: true,
      logo: companyLogo,
      rows: [...top, withBranch ? [...HEAD, "Branch / source"] : HEAD, ...data],
      widths: [8, 30, 14, 13, 12, 12, 10, 16, ...(withBranch ? [28] : [])],
      heights,
      images,
    },
  ]);
}

async function asDataUrl(url: string): Promise<string> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}
function download(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
const fileBase = (company: string, from: string, to: string) =>
  `${(company || "Speed").replace(/[\\/:*?"<>|]+/g, "-")}-daily-${from}_${to}`;
export const SPEED_LOGO_URL = "/speed-logo.png";
/** 1.2.10 report layout: landscape summary matrix + one page per employee (src/lib/report-layout.ts).
 * EXE: Electron printToPDF (A4 landscape, save dialog). APK: Android print service ("Save as PDF").
 * Browser fallback: print dialog of a hidden frame. The old drawn PDF stays as a last resort. */
export async function saveDailyPdf(from: string, to: string, rows: DailyRow[], companyName = "", companyLogo = "") {
  const html = layoutHtml(buildLayout(from, to, rows), companyName);
  const name = `${fileBase(companyName, from, to)}.pdf`;
  const w = window as unknown as { zubaydDesktop?: { savePdf?: (i: { html: string; name: string }) => Promise<unknown> }; ZubaydPrint?: { print: (html: string, name: string) => void } };
  if (w.zubaydDesktop?.savePdf) { await w.zubaydDesktop.savePdf({ html, name }); return; }
  if (w.ZubaydPrint?.print) { w.ZubaydPrint.print(html, name); return; }
  try {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px";
    document.body.appendChild(frame);
    frame.contentDocument!.open(); frame.contentDocument!.write(html); frame.contentDocument!.close();
    await new Promise((r) => setTimeout(r, 400));
    frame.contentWindow!.focus(); frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 60_000);
  } catch {
    await document.fonts.ready;
    const bytes = dailyPdfBytes(from, to, rows, companyName, await logoJpeg(companyLogo), await logoJpeg(SPEED_LOGO_URL));
    download(name, bytes, "application/pdf");
  }
}
export async function saveDailyXlsx(from: string, to: string, rows: DailyRow[], companyName = "", companyLogo = "") {
  download(
    `${fileBase(companyName, from, to)}.xlsx`,
    layoutXlsxBytes(from, to, rows, companyName, companyLogo),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
/** Teams/sheet rows (+ full roster so people without punches show as absent) -> DailyRow[] for the layout. */
export function rowsForLayout(shown: { employeeNo: string; name: string; date: string; first: string; last: string; minutes: number | null }[], roster: { employeeNo: string; name: string; photo?: string }[], from: string): DailyRow[] {
  const photo = new Map(roster.map((p) => [p.employeeNo, p.photo || null]));
  const out: DailyRow[] = shown.map((r) => ({ personId: r.employeeNo || r.name, employeeNo: r.employeeNo, name: r.name, date: r.date, first: r.first, last: r.last, worked: r.last && r.minutes != null ? `${String(Math.floor(r.minutes / 60)).padStart(2, "0")}:${String(r.minutes % 60).padStart(2, "0")}` : "", status: "", absent: false, photo: photo.get(r.employeeNo) || null }));
  const seen = new Set(out.map((r) => r.personId));
  for (const p of roster) if (p.employeeNo && !seen.has(p.employeeNo)) out.push({ personId: p.employeeNo, employeeNo: p.employeeNo, name: p.name, date: from, first: "", last: "", worked: "", status: "", absent: true, photo: p.photo || null });
  return out;
}

/** Manager "who came today" summary: حضر = one punch (still inside), خرج = has a last punch, غائب = no punch. */
export type ManagerRow = DailyRow & { state: "inside" | "left" | "absent"; label: "حضر" | "خرج" | "غائب" };
export function managerSummary(rows: DailyRow[]) {
  const list: ManagerRow[] = rows.map((r) => {
    const state = r.absent || !r.first ? "absent" : r.last ? "left" : "inside";
    return { ...r, state, label: state === "absent" ? "غائب" : state === "left" ? "خرج" : "حضر" };
  });
  const order = { inside: 0, left: 1, absent: 2 } as const;
  list.sort((a, b) => order[a.state] - order[b.state] || (a.first || "").localeCompare(b.first || "") || a.name.localeCompare(b.name));
  const inside = list.filter((r) => r.state === "inside").length, left = list.filter((r) => r.state === "left").length;
  return { present: inside + left, absent: list.length - inside - left, inside, left, list };
}
