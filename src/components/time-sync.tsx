import { useState } from "react";
import type { Device } from "@/lib/access/domain";
import { hostMismatch } from "@/lib/access/timezone";
import { Button, useCenter } from "./access-ui";

type Row = { name: string; ok: boolean; error: string; before?: { zone: string; localTime: string }; after?: { zone: string; localTime: string }; driftSeconds?: number | null };
const hostOffset = () => -new Date().getTimezoneOffset();
const fmtOffset = (n: number) => `UTC${n >= 0 ? "+" : "-"}${Math.floor(Math.abs(n) / 60)}${Math.abs(n) % 60 ? `:${String(Math.abs(n) % 60).padStart(2, "0")}` : ""}`;

/** Badge shown when a device clock or zone differs from this PC/phone. */
export function ClockBadge({ device }: { device: Device }) {
  const w = hostMismatch(device.clock?.zone, device.clock?.driftSeconds, hostOffset());
  return w ? <span className="ac-badge error" title={w} role="img" aria-label={`تحذير الوقت: ${w}`}>⏰ الوقت مختلف</span> : null;
}

/** «ضبط التوقيت لكل البصمات» (or one device): sets timeZone + localTime from this PC/phone, reads back, shows a table. */
export function TimeSyncPanel({ devices, single }: { devices: Device[]; single?: boolean }) {
  const { data, busy, run } = useCenter();
  const [rows, setRows] = useState<Row[]>([]);
  const [working, setWorking] = useState(false);
  if (data.actor.role !== "admin") return null;
  const go = async () => {
    const off = hostOffset();
    const list = devices.filter((d) => d.status !== "offline" || single);
    if (!list.length) return;
    if (!window.confirm(`ضبط التوقيت على وقت ${/Android/i.test(navigator.userAgent) ? "الموبايل" : "الكمبيوتر"} ده (${new Date().toLocaleString("ar-EG")} — ${fmtOffset(off)}) في ${list.length} جهاز:\n${list.map((d) => "• " + d.name).join("\n")}\n\nهيتغير timeZone و localTime بس، وكل عملية بتتسجل في سجل العمليات.`)) return;
    setWorking(true); const out: Row[] = []; setRows([]);
    for (const d of list) {
      let err = "";
      const r = await run({ action: "time.sync", deviceId: d.id, offsetMinutes: off, hostTime: Date.now() }, { inline: true, onError: (m) => (err = m) });
      const t = r?.timeSync;
      out.push(t ? { name: d.name, ok: t.ok, error: t.error, before: t.before, after: t.after, driftSeconds: t.driftSeconds } : { name: d.name, ok: false, error: err || "تعذر الاتصال بالجهاز" });
      setRows([...out]);
    }
    setWorking(false);
  };
  return (
    <div className="ac-stack">
      <div className="ac-actions">
        <Button primary={!single} disabled={busy || working || !devices.length} onClick={go}>
          {working ? "جارٍ ضبط التوقيت…" : single ? "ضبط توقيت الجهاز ده على وقت الكمبيوتر/الموبايل" : "⏰ ضبط التوقيت لكل البصمات"}
        </Button>
      </div>
      {rows.length ? (
        <table className="ac-table" aria-label="نتيجة ضبط التوقيت">
          <thead><tr><th>الجهاز</th><th>قبل</th><th>بعد</th><th>الفرق</th><th>النتيجة</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td dir="ltr">{r.before ? `${r.before.localTime} ${r.before.zone}` : "—"}</td>
                <td dir="ltr">{r.after ? `${r.after.localTime} ${r.after.zone}` : "—"}</td>
                <td dir="ltr">{r.driftSeconds == null ? "—" : `${r.driftSeconds}s`}</td>
                <td>{r.ok ? "✅ تم" : `❌ فشل — ${r.error}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
