export function csvRows(text: string): string[][] {
  const sample = text.split(/\r?\n/)[0] || "";
  const delimiter = sample.includes("\t")
    ? "\t"
    : (sample.match(/;/g)?.length || 0) > (sample.match(/,/g)?.length || 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += char;
        index += 1;
      } else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && /[\r\n]/.test(char)) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("علامات اقتباس غير مكتملة في ملف CSV.");
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}
export function peoplePreview(rows: string[][], existing: Set<string>) {
  if (!rows.length) throw new Error("الملف فارغ.");
  const headers = rows[0].map((cell) => cell.toLowerCase().trim());
  const employee = headers.findIndex((cell) =>
    /^(employeeno|employee no|employee_no|id|رقم|رقم الموظف|الرقم الوظيفي)$/.test(
      cell,
    ),
  );
  const name = headers.findIndex((cell) =>
    /^(name|الاسم|اسم الموظف)$/.test(cell),
  );
  if (employee < 0 || name < 0)
    throw new Error("استخدم عمودي employeeNo وname أو رقم الموظف والاسم.");
  if (rows.length > 51) throw new Error("كل دفعة استيراد حتى 50 موظفاً.");
  const seen = new Set<string>();
  return rows.slice(1).map((row, index) => {
    const employeeNo = (row[employee] || "").trim();
    const personName = (row[name] || "").trim();
    const error =
      !employeeNo || !personName
        ? "الرقم والاسم مطلوبان"
        : seen.has(employeeNo)
          ? "مكرر داخل الملف"
          : existing.has(employeeNo)
            ? "موجود في قائمة الجهاز المسحوبة"
            : employeeNo.length > 32 || personName.length > 64
              ? "يتجاوز الطول المسموح"
              : "";
    seen.add(employeeNo);
    return { line: index + 2, employeeNo, name: personName, error };
  });
}
export function safeCsv(rows: (string | number | null)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let cell = String(value ?? "");
            if (/^[=+@\-\t\r]/.test(cell)) cell = `'${cell}`;
            return `"${cell.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
