// ISAPI search contracts, not Push notification payloads. No external XML entities.
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
export class SearchPageError extends Error {
  code = "DEVICE_PROTOCOL";
  constructor() {
    super("رد البحث أو تسلسل صفحاته غير صالح؛ لم يُعتبر الرد سجلات فارغة.");
  }
}
function xml(text: string): Obj {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new SearchPageError();
  const stack: { name: string; children: Obj; text: string }[] = [];
  const root: Obj = Object.create(null);
  const decode = (s: string) =>
    s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
      if (e.startsWith("#")) {
        const n =
          e[1].toLowerCase() === "x"
            ? parseInt(e.slice(2), 16)
            : Number(e.slice(1));
        if (!Number.isInteger(n) || n < 0 || n > 0x10ffff)
          throw new SearchPageError();
        return String.fromCodePoint(n);
      }
      return (
        { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<
          string,
          string
        >
      )[e.toLowerCase()];
    });
  const attach = (name: string, value: unknown) => {
    if (["__proto__", "constructor", "prototype"].includes(name))
      throw new SearchPageError();
    const target = stack.at(-1)?.children || root;
    target[name] =
      target[name] === undefined
        ? value
        : Array.isArray(target[name])
          ? [...(target[name] as unknown[]), value]
          : [target[name], value];
  };
  for (const token of text
    .replace(/<!--[\s\S]*?-->/g, "")
    .match(/<[^>]+>|[^<]+/g) || []) {
    if (/^<\?/.test(token)) continue;
    if (/^<\//.test(token)) {
      const name = /^<\/([\w:]+)\s*>$/.exec(token)?.[1]?.split(":").at(-1);
      const row = stack.pop();
      if (!row || row.name !== name) throw new SearchPageError();
      attach(
        row.name,
        Object.keys(row.children).length
          ? row.children
          : decode(row.text.trim()),
      );
    } else if (token.startsWith("<")) {
      const name = /^<([\w:]+)/.exec(token)?.[1]?.split(":").at(-1);
      if (!name || stack.length > 32) throw new SearchPageError();
      if (/\/>$/.test(token)) attach(name, "");
      else stack.push({ name, children: Object.create(null), text: "" });
    } else if (stack.length) stack.at(-1)!.text += token;
    else if (token.trim()) throw new SearchPageError();
  }
  if (stack.length || Object.keys(root).length !== 1)
    throw new SearchPageError();
  return root;
}
export function parseSearchPage(
  text: string,
  kind: "events" | "users",
  position: number,
  searchID: string,
) {
  let root: Obj;
  try {
    root = object(text.trim().startsWith("{") ? JSON.parse(text) : xml(text));
  } catch {
    throw new SearchPageError();
  }
  const body = object(root[kind === "events" ? "AcsEvent" : "UserInfoSearch"]);
  const integer = (v: unknown) => {
    if (!/^[0-9]+$/.test(String(v))) throw new SearchPageError();
    const n = Number(v);
    if (!Number.isSafeInteger(n)) throw new SearchPageError();
    return n;
  };
  const count = integer(body.numOfMatches),
    total = integer(body.totalMatches);
  if (body.searchID !== undefined && String(body.searchID) !== searchID)
    throw new SearchPageError();
  if (
    body.searchResultPosition !== undefined &&
    integer(body.searchResultPosition) !== position
  )
    throw new SearchPageError();
  const status = String(body.responseStatusStrg || "").toUpperCase();
  if (!["OK", "MORE", "NO MATCH"].includes(status)) throw new SearchPageError();
  // InfoList is the documented AcsEvent list. matchList is never guessed as a Push alias.
  let list = body[kind === "events" ? "InfoList" : "UserInfo"];
  if (kind === "events" && list && !Array.isArray(list))
    list = object(list).Info ?? list;
  const records =
    list == null || list === ""
      ? []
      : Array.isArray(list)
        ? list.map(object)
        : [object(list)];
  if (
    records.some((r) =>
      kind === "events"
        ? !/^\d+$/.test(String(r.major)) ||
          !/^\d+$/.test(String(r.minor)) ||
          typeof r.time !== "string"
        : !String(r.employeeNo ?? r.employeeNoString ?? "").trim(),
    )
  )
    throw new SearchPageError();
  if (
    records.some((r) => !Object.keys(r).length) ||
    records.length !== count ||
    position + count > total ||
    (!count && position < total) ||
    (status === "MORE" && position + count >= total)
  )
    throw new SearchPageError();
  return {
    records,
    next: position + count,
    done: position + count >= total,
    meta: {
      count,
      total,
      status,
      position,
      searchID,
      format: text.trim().startsWith("{") ? "json" : "xml",
      container: kind === "events" ? "InfoList" : "UserInfo",
    },
  };
}

// A date selected by the operator means the literal date saved by the device.
// Read a UTC envelope covering historical offsets too, then filter on that literal date.
export function eventTimeBounds(start: string, end: string) {
  return {
    startTime: new Date(Date.parse(`${start}T00:00:00+14:00`))
      .toISOString()
      .replace(/\.\d{3}Z$/, "+00:00"),
    endTime: new Date(Date.parse(`${end}T23:59:59-14:00`))
      .toISOString()
      .replace(/\.\d{3}Z$/, "+00:00"),
  };
}
