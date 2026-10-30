import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type SheetSpec = {
  name: string;
  widths: number[];
  rows: (string | number)[][];
  ltr?: boolean;
  /** Optional company logo (PNG/JPEG data URL) drawn at the top of the sheet. */
  logo?: string;
  /** Extra pictures anchored to cells (0-based col/row), e.g. employee photo thumbnails. */
  images?: { col: number; row: number; dataUrl: string; maxW?: number; maxH?: number }[];
  /** Custom row heights in points, keyed by 0-based row index. */
  heights?: Record<number, number>;
};

type LogoImage = { bytes: Uint8Array; ext: "png" | "jpeg"; w: number; h: number };
/** Decode a PNG/JPEG data URL and read its pixel size; SVG/other formats are skipped (Excel cannot embed them). */
export function decodeLogo(dataUrl?: string): LogoImage | null {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl || "");
  if (!m) return null;
  let bytes: Uint8Array;
  try {
    const bin = atob(m[2].replace(/\s+/g, ""));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch { return null; }
  const ext = m[1].toLowerCase() === "png" ? "png" : "jpeg";
  let w = 0, h = 0;
  if (ext === "png" && bytes.length > 24) {
    w = (bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19]) >>> 0;
    h = (bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23]) >>> 0;
  } else if (ext === "jpeg") {
    for (let i = 2; i + 9 < bytes.length; ) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1], len = bytes[i + 2] << 8 | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) { h = bytes[i + 5] << 8 | bytes[i + 6]; w = bytes[i + 7] << 8 | bytes[i + 8]; break; }
      i += 2 + len;
    }
  }
  if (!w || !h) { w = 160; h = 80; }
  return { bytes, ext, w, h };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

function colName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows: (string | number)[][], widths: number[], shared: Map<string, number>, ltr: boolean, drawing = false, heights: Record<number, number> = {}): string {
  const cols = widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const body = rows
    .map((row, rowIndex) => {
      const tall = row.some((value) => String(value ?? "").includes("\n"));
      const header = ltr ? row[0] === "First name" || rowIndex === 0 : rowIndex === 0;
      const cells = row
        .map((value, colIndex) => {
          const ref = `${colName(colIndex)}${rowIndex + 1}`;
          const style = ltr ? (header ? 3 : 2) : header ? 1 : 0;
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
          }
          const text = value == null ? "" : String(value);
          if (!text) return "";
          let id = shared.get(text);
          if (id == null) {
            id = shared.size;
            shared.set(text, id);
          }
          return `<c r="${ref}" t="s" s="${style}"><v>${id}</v></c>`;
        })
        .join("");
      const height = heights[rowIndex] ? ` ht="${heights[rowIndex]}" customHeight="1"` : tall ? ` ht="${header ? 32 : 48}" customHeight="1"` : "";
      return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
    })
    .join("");
  const direction = ltr ? "" : ` rightToLeft="1"`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView${direction} workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData>${body}</sheetData>${drawing ? `\n  <drawing r:id="rId1"/>` : ""}
</worksheet>`;
}

export function buildXlsx(sheets: SheetSpec[]): Uint8Array {
  const shared = new Map<string, number>();
  const logos = sheets.map((sheet) => decodeLogo(sheet.logo));
  const pictures = sheets.map((sheet, i) => {
    const list: { col: number; row: number; img: LogoImage; maxW: number; maxH: number; name: string }[] = [];
    const logo = logos[i];
    if (logo) list.push({ col: Math.max(3, Math.min(6, (sheet.widths.length || 4) - 1)), row: 0, img: logo, maxW: 180, maxH: 70, name: "Company logo" });
    for (const item of sheet.images || []) {
      const img = decodeLogo(item.dataUrl);
      if (img) list.push({ col: item.col, row: item.row, img, maxW: item.maxW ?? 40, maxH: item.maxH ?? 40, name: `Picture ${list.length + 1}` });
    }
    return list;
  });
  const sheetXmls = sheets.map((sheet, i) => sheetXml(sheet.rows, sheet.widths, shared, Boolean(sheet.ltr), pictures[i].length > 0, sheet.heights));
  const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.size}" uniqueCount="${shared.size}">
${[...shared.keys()].map((value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`).join("")}
</sst>`;
  const overrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const sheetRels = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");
  const styleId = sheets.length + 1;
  const sheetTags = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  ${overrides}${pictures.map((l, i) => (l.length ? `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : "")).join("")}
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetTags}</sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${styleId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF1C1408"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE0B15A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0C3D66"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center" readingOrder="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" horizontal="center" vertical="center" readingOrder="1"/></xf>
  </cellXfs>
</styleSheet>`),
    "xl/sharedStrings.xml": strToU8(sharedXml),
  };

  sheetXmls.forEach((xml, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(xml);
    const list = pictures[index];
    if (!list.length) return;
    const n = index + 1;
    const rels: string[] = [], anchors: string[] = [];
    list.forEach((pic, k) => {
      const scale = Math.min(pic.maxW / pic.img.w, pic.maxH / pic.img.h, 1);
      const cx = Math.round(pic.img.w * scale * 9525), cy = Math.round(pic.img.h * scale * 9525);
      const file = pic.name === "Company logo" ? `logo${n}.${pic.img.ext}` : `img${n}_${k + 1}.${pic.img.ext}`;
      files[`xl/media/${file}`] = pic.img.bytes;
      rels.push(`<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${file}"/>`);
      anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${pic.col}</xdr:col><xdr:colOff>19050</xdr:colOff><xdr:row>${pic.row}</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${k + 2}" name="${escapeXml(pic.name)}" descr="${escapeXml(pic.name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rId${k + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
    });
    files[`xl/worksheets/_rels/sheet${n}.xml.rels`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`);
    files[`xl/drawings/_rels/drawing${n}.xml.rels`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`);
    files[`xl/drawings/drawing${n}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${anchors.join("\n")}
</xdr:wsDr>`);
  });
  return zipSync(files);
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&" + "lt;", "<")
    .replaceAll("&" + "gt;", ">")
    .replaceAll("&" + "quot;", '"')
    .replaceAll("&" + "apos;", "'")
    .replaceAll("&" + "amp;", "&");
}

function sharedStrings(xml: string): string[] {
  const values: string[] = [];
  const itemRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml))) {
    const parts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    values.push(parts.join(""));
  }
  return values;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return Math.max(0, n - 1);
}

export function sheetRows(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("الملف مش إكسل xlsx سليم.");
  }
  const names = Object.keys(files);
  const sheetName =
    names.find((name) => /xl\/worksheets\/sheet1\.xml$/i.test(name)) ??
    names.find((name) => /xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  if (!sheetName) throw new Error("مش لاقي شيت جوه الملف.");
  const sstName = names.find((name) => /xl\/sharedstrings\.xml$/i.test(name));
  const shared = sstName ? sharedStrings(strFromU8(files[sstName])) : [];
  const xml = strFromU8(files[sheetName]);
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells: { col: number; value: string }[] = [];
    const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    let fallback = 0;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = /r="([A-Z]+)/i.exec(attrs)?.[1]?.toUpperCase() ?? "";
      const col = ref ? columnIndex(ref) : fallback;
      fallback = col + 1;
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      let value = "";
      if (type === "s") {
        const id = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
        value = shared[id] ?? "";
      } else if (type === "inlineStr") {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join("");
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      }
      cells.push({ col, value });
    }
    if (!cells.length) continue;
    const line = Array(Math.max(...cells.map((cell) => cell.col)) + 1).fill("");
    for (const cell of cells) line[cell.col] = cell.value;
    rows.push(line);
  }
  return rows;
}
