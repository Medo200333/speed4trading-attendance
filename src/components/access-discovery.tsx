import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { discoverDevicesFn } from "@/lib/discovery.functions";
import type { FoundDevice } from "@/lib/access/sadp.server";
import { Button } from "./access-ui";

type Row = FoundDevice & { via: "server" | "phone" };
declare global {
  interface Window { ZubaydSadp?: { scan(): string } }
}
/** First-run network scan. Read-only: lists devices, never activates or logs in. */
export function DeviceDiscovery({ onPick, known }: { onPick: (row: Row) => void; known: string[] }) {
  const discover = useServerFn(discoverDevicesFn);
  const [rows, setRows] = useState<Row[] | null>(null),
    [loading, setLoading] = useState(""),
    [note, setNote] = useState({ text: "", error: false }),
    [picked, setPicked] = useState("");
  async function scan(deepScan: boolean) {
    setLoading(deepScan ? "جارٍ الفحص العميق للشبكة (قد يستغرق حتى دقيقة)…" : "جارٍ البحث عن أجهزة Hikvision على الشبكة…");
    setNote({ text: "", error: false });
    const found: Row[] = [];
    let serverError = "";
    try {
      const result = await discover({ data: { deepScan } });
      if (result.ok) found.push(...result.data.devices.map((row) => ({ ...row, via: "server" as const })));
      else serverError = result.error;
    } catch {
      serverError = "انقطع الاتصال بالخادم أثناء الفحص. أعد المحاولة.";
    }
    if (window.ZubaydSadp) {
      setLoading("جارٍ البحث من شبكة الهاتف أيضاً…");
      try {
        const phone = JSON.parse(await Promise.resolve(window.ZubaydSadp.scan())) as FoundDevice[];
        for (const row of phone) if (!found.some((f) => f.ip === row.ip)) found.push({ ...row, via: "phone" });
      } catch { /* native scan unavailable */ }
    }
    setRows(found);
    setLoading("");
    if (found.length) setNote({ text: `تم العثور على ${found.length} جهاز. اختر جهازاً ثم أدخل اسم المستخدم وكلمة المرور الخاصين به.`, error: false });
    else setNote({ text: serverError || "لم يُعثر على أجهزة. تأكد أن البصمة تعمل ومتصلة بنفس الشبكة، ثم جرّب الفحص العميق أو أدخل العنوان يدوياً.", error: true });
  }
  return (
    <section className="ac-stack ac-discovery" aria-busy={Boolean(loading)}>
      <p>ابحث تلقائياً عن أجهزة البصمة في الشبكة. الفحص للقراءة فقط: لا يغيّر إعدادات الجهاز ولا يسجل الدخول إليه.</p>
      <div className="ac-actions">
        <Button type="button" disabled={Boolean(loading)} onClick={() => scan(false)}>{loading ? "جارٍ الفحص…" : rows ? "إعادة الفحص" : "فحص الشبكة"}</Button>
        {rows ? <Button type="button" disabled={Boolean(loading)} onClick={() => scan(true)}>فحص عميق</Button> : null}
      </div>
      {loading ? <p role="status" className="ac-message"><span className="ac-loading-line" aria-hidden="true" /> {loading}</p> : null}
      {note.text && !loading ? <p role={note.error ? "alert" : "status"} className={`ac-message${note.error ? " error" : ""}`}>{note.text}</p> : null}
      {rows?.length ? (
        <ul className="ac-list" style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {rows.map((row) => {
            const added = known.includes(`${row.ip}:${row.httpPort}`);
            return (
              <li key={row.mac || row.ip} className="ac-card" style={{ padding: 12 }}>
                <strong>{row.model || "جهاز Hikvision"}</strong>
                <div dir="ltr" style={{ fontSize: 13, wordBreak: "break-all" }}>
                  {row.ip}:{row.httpPort}{row.mac ? ` • ${row.mac}` : ""}{row.serial ? ` • ${row.serial}` : ""}
                </div>
                <small>
                  {row.activated === false ? "غير مُفعّل: فعّله أولاً من أداة Hikvision أو شاشة الجهاز" : row.activated ? "مُفعّل" : "حالة التفعيل غير معروفة"}
                  {row.via === "phone" ? " • ظهر من شبكة الهاتف؛ يجب أن يصل إليه الخادم أيضاً" : ""}
                  {added ? " • مضاف بالفعل" : ""}
                </small>
                <div>
                  <Button type="button" disabled={added || row.activated === false} onClick={() => { setPicked(row.ip); onPick(row); setNote({ text: `تم اختيار ${row.ip}. أكمل الاسم وبيانات الدخول ثم اضغط التالي.`, error: false }); }}>
                    {picked === row.ip ? "تم الاختيار" : "اختيار هذا الجهاز"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
