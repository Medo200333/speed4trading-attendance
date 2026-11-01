import { formatMinutes, type DayRow } from "./attendance";
import { BRAND } from "./brand";

type Face = { employeeNo: string; name: string; photo: string; gender?: string };

const WEEK = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const PT = 2.83465;

function saturdayOf(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 1) % 7));
  return date.toISOString().slice(0, 10);
}

function plusDays(iso: string, count: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function dayMark(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(day)}/${Number(month)}`;
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] || name, last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function pdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, " ");
}

export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let index = 2;
  while (index < bytes.length - 8) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = bytes[index + 1];
    const size = (bytes[index + 2] << 8) | bytes[index + 3];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: (bytes[index + 5] << 8) | bytes[index + 6], width: (bytes[index + 7] << 8) | bytes[index + 8] };
    }
    if (size < 2) break;
    index += 2 + size;
  }
  return null;
}

export function jpegBytes(url: string): Uint8Array | null {
  if (!url.startsWith("data:image/jp")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const binary = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return jpegSize(bytes) ? bytes : null;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/** PDF string in UTF-16BE hex, so Arabic company names survive in document metadata. */
export function pdfUnicode(value: string): string {
  let hex = "FEFF";
  for (let i = 0; i < value.length; i += 1) hex += value.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

/** Report layout: Speed frame (product) at the top, the customer company logo + name under it, then the table. */
export function attendancePdfBytes(from: string, to: string, rows: DayRow[], people: Face[], companyName = "", companyLogoJpeg = ""): Uint8Array {
  const encoder = new TextEncoder();
  const text = (value: string) => encoder.encode(value);
  const photoW = 14 * PT;
  const nameW = 24 * PT;
  const dayW = 24 * PT;
  const tableW = photoW + nameW * 2 + dayW * 7;
  const left = (297 * PT - tableW) / 2;
  const right = left + tableW;
  const rowH = 13.5 * PT;
  const headH = 11 * PT;
  const pageW = 297 * PT;
  const pageH = 210 * PT;
  const bottom = 14 * PT;
  const pageCommands: string[] = [];
  const photos = new Map<string, Uint8Array>();
  let commands = "";
  const top = pageH - 34 * PT;
  let y = top;

  // Browser shaping preserves Arabic glyphs and RTL; image bytes remain in RAM.
  const label = (value: string, x: number, baseline: number, width: number, white = false, height = 0) => {
    if (typeof document === "undefined" || !/[^\x20-\x7e]/.test(value)) return false;
    const key = `label:${white}:${value}`;
    if (!photos.has(key)) {
      const canvas = document.createElement("canvas"); const ctx0 = canvas.getContext("2d"); if (!ctx0) return false;
      const font = '36px "IBM Plex Sans Arabic", sans-serif'; ctx0.font = font;
      // Size the image to the shaped text so short names are not shrunk into a wide blank strip.
      canvas.width = Math.min(1600, Math.max(40, Math.ceil(ctx0.measureText(value).width) + 16)); canvas.height = 80;
      const ctx = canvas.getContext("2d"); if (!ctx) return false;
      ctx.fillStyle = white ? "#0c3d66" : "#ffffff"; ctx.fillRect(0,0,canvas.width,80);
      ctx.font = font; ctx.direction = "rtl"; ctx.textAlign = "right";
      ctx.fillStyle = white ? "#ffffff" : "#102433"; ctx.fillText(value, canvas.width - 8, 53);
      const bytes = jpegBytes(canvas.toDataURL("image/jpeg",0.95)); if (!bytes) return false;
      photos.set(key,bytes); labelWidths.set(key, canvas.width);
    }
    const slot = [...photos.keys()].indexOf(key)+1, cw = labelWidths.get(key) ?? 640;
    let h = height || 20, w = (h * cw) / 80;
    if (w > width) { h = (h * width) / w; w = width; }
    commands += `q ${w} 0 0 ${h} ${x} ${baseline-4} cm /Im${slot} Do Q\n`;
    return true;
  };
  const labelWidths = new Map<string, number>();

  const logo = companyLogoJpeg ? jpegBytes(companyLogoJpeg) : null;
  if (logo) photos.set("company-logo", logo);
  const banner = () => {
    // Speed frame: navy band with the product name (primary brand) and the period.
    commands += `0.043 0.133 0.259 rg 0 ${pageH - 14 * PT} ${pageW} ${14 * PT} re f\n`;
    commands += `0.184 0.259 0.365 rg 0 ${pageH - 14.8 * PT} ${pageW} ${0.8 * PT} re f\n`;
    commands += `BT /F1 14 Tf 1 1 1 rg 1 0 0 1 ${left} ${pageH - 10 * PT} Tm (${pdfText(BRAND.englishName || BRAND.name)}) Tj ET\n`;
    commands += `BT /F2 9 Tf 1 1 1 rg 1 0 0 1 ${right - 55 * PT} ${pageH - 10 * PT} Tm (${pdfText(`${from} - ${to}`)}) Tj ET\n`;
    // Customer company (report owner) under the Speed frame.
    let x = left;
    if (logo) {
      const size = jpegSize(logo) ?? { width: 1, height: 1 };
      const h = 12 * PT, w = Math.min(36 * PT, (h * size.width) / Math.max(1, size.height));
      const slot = [...photos.keys()].indexOf("company-logo") + 1;
      commands += `q ${w} 0 0 ${h} ${x} ${pageH - 29 * PT} cm /Im${slot} Do Q\n`;
      x += w + 4 * PT;
    }
    const title = companyName ? `${companyName} — تقرير الحضور والانصراف` : "تقرير الحضور والانصراف";
    if (!label(title, x, pageH - 22 * PT, 150 * PT)) commands += `BT /F1 12 Tf 0.043 0.133 0.259 rg 1 0 0 1 ${x} ${pageH - 22 * PT} Tm (${pdfText(companyName ? `${companyName} - Attendance report` : "Attendance report")}) Tj ET\n`;
    commands += `0.859 0.882 0.902 RG 0.8 w ${left} ${pageH - 31 * PT} m ${right} ${pageH - 31 * PT} l S\n`;
  };
  const weekHead = (days: string[]) => {
    commands += `0.043 0.133 0.259 rg ${left} ${y - headH} ${right - left} ${headH} re f\n`;
    commands += `BT /F1 8 Tf 1 1 1 rg 1 0 0 1 ${left + 4} ${y - headH + 16} Tm (Photo) Tj ET\n`;
    commands += `BT /F1 8 Tf 1 0 0 1 ${left + photoW + 4} ${y - headH + 16} Tm (First name) Tj ET\n`;
    commands += `BT /F1 8 Tf 1 0 0 1 ${left + photoW + nameW + 4} ${y - headH + 16} Tm (Last name) Tj ET\n`;
    days.forEach((date, index) => {
      const x = left + photoW + nameW * 2 + dayW * index;
      commands += `BT /F1 7 Tf 1 0 0 1 ${x + 6} ${y - 11} Tm (${pdfText(WEEK[index])}) Tj ET\n`;
      commands += `BT /F2 8 Tf 1 0 0 1 ${x + 12} ${y - headH + 8} Tm (${pdfText(dayMark(date))}) Tj ET\n`;
    });
    y -= headH;
  };
  const nextPage = (days?: string[]) => {
    if (commands) pageCommands.push(commands);
    commands = "";
    y = top;
    banner();
    if (days) weekHead(days);
  };

  nextPage();
  const weeks = new Map<string, DayRow[]>();
  for (const row of rows) {
    const start = saturdayOf(row.date);
    const list = weeks.get(start);
    if (list) list.push(row);
    else weeks.set(start, [row]);
  }
  for (const start of [...weeks.keys()].sort()) {
    const days = WEEK.map((_, index) => plusDays(start, index));
    const inWeek = weeks.get(start) ?? [];
    const names = new Map<string, { employeeNo: string; name: string }>();
    for (const row of inWeek) names.set(row.employeeNo || row.name, { employeeNo: row.employeeNo, name: row.name });
    if (y - headH - rowH < bottom) nextPage(days);
    else weekHead(days);
    [...names.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((person, index) => {
        if (y - rowH < bottom) nextPage(days);
        if (index % 2 === 0) commands += `0.953 0.965 0.976 rg ${left} ${y - rowH} ${right - left} ${rowH} re f\n`;
        commands += `0.557 0.639 0.71 RG 0.8 w ${left} ${y - rowH} ${right - left} ${rowH} re S\n`;
        const parts = splitName(person.name);
        const face = people.find((item) => item.employeeNo === person.employeeNo || item.name === person.name);
        const key = person.employeeNo || person.name;
        const photo = face ? jpegBytes(face.photo) : null;
        if (photo) {
          if (!photos.has(key)) photos.set(key, photo);
          const slot = [...photos.keys()].indexOf(key) + 1;
          const size = 11 * PT;
          const imgX = left + (photoW - size) / 2;
          const imgY = y - rowH + (rowH - size) / 2;
          const radius = size / 2;
          const cx = imgX + radius;
          const cy = imgY + radius;
          const k = 0.5522847498;
          const circle = [
            `${cx - radius} ${cy} m`,
            `${cx - radius} ${cy + radius * k} ${cx - radius * k} ${cy + radius} ${cx} ${cy + radius} c`,
            `${cx + radius * k} ${cy + radius} ${cx + radius} ${cy + radius * k} ${cx + radius} ${cy} c`,
            `${cx + radius} ${cy - radius * k} ${cx + radius * k} ${cy - radius} ${cx} ${cy - radius} c`,
            `${cx - radius * k} ${cy - radius} ${cx - radius} ${cy - radius * k} ${cx - radius} ${cy} c`,
          ].join("\n");
          commands += `q\n${circle}\nW n\n${size} 0 0 ${size} ${imgX} ${imgY} cm /Im${slot} Do Q\n`;
          commands += `q 0.043 0.133 0.259 RG 0.7 w\n${circle}\nS Q\n`;
        }
        if (!label(parts.first,left+photoW+4,y-9*PT,nameW-8,false,13)) commands += `BT /F1 9 Tf 0.063 0.141 0.2 rg 1 0 0 1 ${left + photoW + 4} ${y - 9 * PT} Tm (${pdfText(parts.first.slice(0, 18))}) Tj ET\n`;
        if (!label(parts.last,left+photoW+nameW+4,y-9*PT,nameW-8,false,13)) commands += `BT /F2 9 Tf 1 0 0 1 ${left + photoW + nameW + 4} ${y - 9 * PT} Tm (${pdfText(parts.last.slice(0, 18))}) Tj ET\n`;
        days.forEach((date, dayIndex) => {
          const cell = inWeek.find((row) => row.date === date && (row.employeeNo === person.employeeNo || row.name === person.name));
          const edge = left + photoW + nameW * 2 + dayW * dayIndex;
          commands += `0.557 0.639 0.71 RG ${edge} ${y - rowH} m ${edge} ${y} l S\n`;
          const x = edge + 3;
          if (!cell) {
            commands += `BT /F2 8 Tf 0.557 0.639 0.71 rg 1 0 0 1 ${edge + dayW / 2 - 3} ${y - rowH / 2 - 2} Tm (-) Tj ET\n`;
            return;
          }
          const stay = cell.minutes == null ? "" : formatMinutes(cell.minutes);
          commands += `BT /F1 8 Tf 0.043 0.133 0.259 rg 1 0 0 1 ${x} ${y - 3.4 * PT} Tm (${pdfText(cell.first)}) Tj ET\n`;
          commands += `BT /F2 8 Tf 0.063 0.141 0.2 rg 1 0 0 1 ${x} ${y - 6.8 * PT} Tm (${pdfText(cell.last || "-")}) Tj ET\n`;
          commands += `BT /F2 6.5 Tf 0.302 0.384 0.451 rg 1 0 0 1 ${x} ${y - 10.2 * PT} Tm (${pdfText(stay)}) Tj ET\n`;
        });
        y -= rowH;
      });
    y -= 6 * PT;
  }
  if (commands) pageCommands.push(commands);

  const photoList = [...photos.entries()];
  const pageCount = pageCommands.length || 1;
  const objects: Uint8Array[] = [];
  const add = (body: Uint8Array) => {
    objects.push(body);
    return objects.length;
  };
  const fontBold = 3 + pageCount;
  const fontRegular = fontBold + 1;
  const imageStart = fontRegular + 1;
  const contentStart = imageStart + photoList.length;
  add(text(`<< /Type /Catalog /Pages 2 0 R >>`));
  const kids = Array.from({ length: pageCount }, (_, index) => `${3 + index} 0 R`).join(" ");
  add(text(`<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>`));
  pageCommands.forEach((_, index) => {
    const imageRefs = photoList.map((_, slot) => `/Im${slot + 1} ${imageStart + slot} 0 R`).join(" ");
    const contentId = contentStart + index;
    add(
      text(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /Font << /F1 ${fontBold} 0 R /F2 ${fontRegular} 0 R >> /XObject << ${imageRefs} >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
  });
  add(text(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`));
  add(text(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`));
  for (const [, bytes] of photoList) {
    const size = jpegSize(bytes) ?? { width: 1, height: 1 };
    const head = text(
      `<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
    );
    const tail = text("\nendstream");
    add(concat([head, bytes, tail]));
  }
  for (const content of pageCommands) {
    const stream = text(content);
    add(concat([text(`<< /Length ${stream.length} >>\nstream\n`), stream, text("endstream")]));
  }

  const infoId = add(text(`<< /Title ${pdfUnicode(companyName ? `${companyName} — تقرير الحضور والانصراف` : "تقرير الحضور والانصراف")} /Author ${pdfUnicode(companyName || "—")} /Producer (speed4trading) >>`));
  const chunks: Uint8Array[] = [text("%PDF-1.4\n")];
  let length = chunks[0].length;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(length);
    const head = text(`${index + 1} 0 obj\n`);
    const tail = text("\nendobj\n");
    chunks.push(head, object, tail);
    length += head.length + object.length + tail.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${length}\n%%EOF`;
  chunks.push(text(xref));
  return concat(chunks);
}

/** Flattens any logo (PNG with transparency, WebP) onto white JPEG so it can be embedded with DCTDecode. */
export async function logoJpeg(logo: string): Promise<string> {
  if (!logo || typeof document === "undefined") return "";
  try {
    const img = new Image(); img.src = logo; await img.decode();
    const scale = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext("2d"); if (!ctx) return "";
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.92);
  } catch { return ""; }
}
export async function saveAttendancePdf(from: string, to: string, rows: DayRow[], people: Face[], companyName = "", companyLogo = "") {
  await document.fonts.ready;
  const bytes = attendancePdfBytes(from, to, rows, people, companyName, await logoJpeg(companyLogo));
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(companyName || "Attendance").replace(/[\\/:*?"<>|]+/g, "-")}-${from}_${to}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
