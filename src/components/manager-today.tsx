import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { AttendanceRow } from "@/lib/access/domain";
import type { Punch } from "@/lib/attendance";
import { dailyRows, managerSummary, mergeDailySources } from "@/lib/daily-report";
import { hcTeamPullFn } from "@/lib/hcteam.functions";
import { useCenter, Button, dateToday, personPhoto } from "./access-ui";

type Summary = ReturnType<typeof managerSummary>;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Manager home: one button -> today's attendance from every configured source, merged and shown centered. Read-only. */
export function ManagerToday() {
  const { data, read, run } = useCenter();
  const teamPull = useServerFn(hcTeamPullFn);
  const [busy, setBusy] = useState(false), [note, setNote] = useState(""), [sum, setSum] = useState<Summary | null>(null), [at, setAt] = useState("");
  async function load() {
    setBusy(true); setNote("");
    const day = dateToday();
    try {
      for (const d of data.devices) await run({ action: "sync", deviceId: d.id, start: day, end: day, usersOnly: false }, { inline: true, onError: () => undefined });
      for (let i = 0; i < 45; i++) {
        await wait(2000);
        const q = (await read({ action: "snapshot" }, true)) as { snapshot?: { devices: { sync: { running?: boolean } }[] } } | undefined;
        if (!q?.snapshot?.devices.some((d) => d.sync.running)) break;
      }
      let team: { punches: Punch[]; people: { employeeNo: string; name: string; photo: string }[] } | null = null;
      try {
        const punches: Punch[] = []; let people: { employeeNo: string; name: string; photo: string }[] = [];
        let page = 1, done = false, guard = 0, ok = false;
        while (!done && guard++ < 30) {
          const r = await teamPull({ data: { from: day, to: day, pageIndex: page } });
          if (!r.ok) break;
          ok = true; punches.push(...r.punches); if (r.people?.length) people = r.people; page = r.pageIndex; done = r.done;
        }
        if (ok) team = { punches, people };
      } catch { /* source not configured */ }
      const q = (await read({ action: "attendance", start: day, end: day }, true)) as { report?: AttendanceRow[] } | undefined;
      const device = dailyRows(q?.report ?? [], data.people).map((r) => ({ ...r, branch: undefined }));
      const merged = mergeDailySources(device, team, team ? "both" : "devices", day, day);
      const photos = await Promise.all(merged.map(async (r) => {
        if (r.photo) return r.photo;
        const p = data.people.find((x) => x.id === r.personId);
        return p ? await personPhoto(read, p).catch(() => null) : null;
      }));
      setSum(managerSummary(merged.map((r, i) => ({ ...r, photo: photos[i] }))));
      setAt(new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }).format(new Date()));
    } catch { setNote("تعذر تحميل حضور النهارده. حاول تاني."); }
    finally { setBusy(false); }
  }
  const tile = (label: string, value: number, color: string) => (
    <div style={{ flex: "1 1 120px", background: "#fff", borderRadius: 14, padding: 14, textAlign: "center", boxShadow: "0 1px 4px #0002" }}>
      <div style={{ fontSize: 34, fontWeight: 800, color }}>{value}</div><div>{label}</div>
    </div>
  );
  const color = { inside: "#15803d", left: "#1d4ed8", absent: "#b91c1c" } as const;
  return (
    <main id="main-content" dir="rtl" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: sum ? "flex-start" : "center", gap: 18, padding: 20, background: "#f4f6fa" }}>
      <img src="/speed-logo.png" alt="Speed" height={56} />
      <Button primary disabled={busy} onClick={() => void load()}>
        <span style={{ display: "block", fontSize: 26, padding: "18px 36px" }}>{busy ? "ثواني…" : "مين حضر النهارده"}</span>
      </Button>
      {note ? <p role="alert" className="ac-message error">{note}</p> : null}
      {sum ? (
        <section aria-label="ملخص حضور اليوم" style={{ width: "100%", maxWidth: 720 }}>
          <p className="ac-muted" style={{ textAlign: "center" }}>{dateToday()} · آخر تحديث {at}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {tile("حاضر", sum.present, "#15803d")}{tile("غائب", sum.absent, "#b91c1c")}{tile("لسه جوه", sum.inside, "#15803d")}{tile("خرج", sum.left, "#1d4ed8")}
          </div>
          <ul style={{ listStyle: "none", padding: 0, marginTop: 16, display: "grid", gap: 8 }}>
            {sum.list.map((r) => (
              <li key={`${r.employeeNo}-${r.personId}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderRadius: 12, padding: 10 }}>
                {r.photo ? <img src={r.photo} alt="" width={48} height={48} style={{ borderRadius: "50%", objectFit: "cover" }} /> : <span className="ac-avatar" style={{ width: 48, height: 48 }}>{r.name.slice(0, 1)}</span>}
                <div style={{ flex: 1 }}><strong>{r.name}</strong><div className="ac-muted" dir="ltr" style={{ textAlign: "right" }}>{r.first || "—"} ← {r.last || "—"}</div></div>
                <span style={{ color: color[r.state], fontWeight: 800 }}>{r.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
