import { useEffect, useMemo, useState } from "react";
import type { AttendanceRow } from "@/lib/access/domain";
import { dailyRows, mergeDailySources, type DailySource } from "@/lib/daily-report";
import { buildLayout, layoutHtml } from "@/lib/report-layout";
import { diffRows, diffSummary, DIFF_LABEL, fmtDiff, withDiffPages } from "@/lib/report-diff";
import { useTeamsPull } from "@/lib/teams-pull-store";
import { profileFrom } from "@/lib/company-profile";
import { useCenter, Button, Card, TableScroll, personPhoto, usePhotoVersion } from "./access-ui";

/** Daily report: Speed frame on top, company logo + name, then per employee per day: photo, English name, number, first/last punch and worked time. */
export function DailyReportCard({ rows, start, end }: { rows: AttendanceRow[]; start: string; end: string }) {
  const { data, read } = useCenter();
  const profile = profileFrom(data.company);
  const team = useTeamsPull();
  const [source, setSource] = useState<DailySource>("devices");
  const deviceRows = useMemo(() => dailyRows(rows, data.people), [rows, data.people]);
  const { base, warnings } = useMemo(() => {
    const warnings: string[] = [];
    const base = mergeDailySources(deviceRows.map((r) => ({ ...r, branch: undefined })), team, source, start, end, warnings);
    return { base, warnings };
  }, [deviceRows, team, source, start, end]);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const version = usePhotoVersion();
  useEffect(() => {
    let live = true;
    const ids = [...new Set(rows.map((r) => r.personId))];
    for (const id of ids) {
      const person = data.people.find((p) => p.id === id);
      if (!person) continue;
      void personPhoto(read, person).then((photo) => live && setPhotos((prev) => ({ ...prev, [id]: photo })));
    }
    return () => {
      live = false;
    };
  }, [rows, data.people, version]);
  const shown = base.map((row) => ({ ...row, photo: photos[row.personId] ?? row.photo ?? null }));
  const [view, setView] = useState<"table" | "report" | "diff">("table");
  const diff = useMemo(() => {
    if (!team) return null;
    const dev = mergeDailySources(deviceRows.map((r) => ({ ...r, branch: undefined })), team, "devices", start, end);
    const tm = mergeDailySources([], team, "teams", start, end);
    const pic = (r: (typeof dev)[number]) => ({ ...r, photo: photos[r.personId] ?? r.photo ?? null });
    return diffRows(dev.map(pic), tm.map(pic));
  }, [deviceRows, team, start, end, photos]);
  const reportDoc = useMemo(() => (view === "report" ? layoutHtml(buildLayout(start, end, shown), profile.name) : ""), [view, shown, start, end, profile.name]);
  const diffCount = diff ? diffSummary(diff) : null;
  const missing = data.people.filter((p) => rows.some((r) => r.personId === p.id) && !/^[A-Za-z0-9 .'-]+$/.test(p.name)).length;
  return (
    <Card>
      <div className="ac-daily-head" dir="ltr" style={{ background: "var(--ac-navy, #0b2242)", color: "#fff", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <img src="/speed-logo.png" alt="Speed" height={36} style={{ background: "#fff", borderRadius: 8, padding: 2 }} />
        <div>
          <strong>speed4trading</strong>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Daily attendance report · {start} → {end}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
        {profile.logo ? <img src={profile.logo} alt="شعار الشركة" height={44} /> : null}
        <h3 style={{ margin: 0 }}>{profile.name}</h3>
      </div>
      {missing ? (
        <p role="status" className="ac-message">
          {missing} موظف بلا اسم إنجليزي؛ يظهر في التقرير كـ «English name missing» حتى تحفظ اسمه الإنجليزي من «الموظفون».
        </p>
      ) : null}
      <div className="ac-actions ac-no-print" role="group" aria-label="مصدر البصمات">
        <label>
          مصدر البصمات:{" "}
          <select value={source} onChange={(e) => setSource(e.target.value as DailySource)}>
            <option value="devices">الأجهزة</option>
            <option value="teams">Hik-Connect Team</option>
            <option value="both">الاثنين (دمج بدون تكرار)</option>
          </select>
        </label>
        {source !== "devices" ? (
          <span className="ac-muted">
            {team
              ? `Team: ${team.punches.length} بصمة · ${team.people.length} شخص (${team.from} → ${team.to})`
              : "اسحب الحضور من Hik-Connect Team من شاشة الحضور أولاً، وبعدين ارجع هنا."}
          </span>
        ) : null}
      </div>
      {warnings.map((w) => (
        <p key={w} role="alert" className="ac-message error">
          {w}
        </p>
      ))}
      <div className="ac-actions ac-no-print" role="tablist" aria-label="طريقة العرض">
        <Button aria-pressed={view === "table"} onClick={() => setView("table")}>📋 الجدول</Button>
        <Button aria-pressed={view === "report"} disabled={!shown.length} onClick={() => setView("report")}>👁️ عرض التقرير</Button>
        <Button aria-pressed={view === "diff"} disabled={!diff} title={diff ? "" : "اسحب من Hik-Connect Team الأول"} onClick={() => setView("diff")}>⚖️ الفرق (أجهزة / Teams)</Button>
      </div>
      <div className="ac-actions ac-no-print">
        <Button
          disabled={!shown.length}
          onClick={async () => {
            const { saveDailyPdf } = await import("@/lib/daily-report");
            if (view === "diff" && diff) await saveDailyPdf(start, end, shown, profile.name, profile.logo, withDiffPages(layoutHtml(buildLayout(start, end, shown), profile.name), diff, profile.name, start, end));
            else await saveDailyPdf(start, end, shown, profile.name, profile.logo);
          }}
        >
          {view === "diff" ? "PDF التقرير + الفرق" : "PDF التقرير اليومي"}
        </Button>
        <Button
          disabled={!shown.length}
          onClick={async () => {
            const { saveDailyXlsx } = await import("@/lib/daily-report");
            await saveDailyXlsx(start, end, shown, profile.name, profile.logo, view === "diff" ? diff : null);
          }}
        >
          {view === "diff" ? "Excel التقرير + الفرق" : "Excel التقرير اليومي"}
        </Button>
      </div>
      {view === "report" ? (
        <iframe title="عرض التقرير" srcDoc={reportDoc} style={{ width: "100%", height: "75vh", border: "1px solid #b8c3d6", borderRadius: 10, background: "#fff" }} />
      ) : null}
      {view === "diff" && diff ? (
        <>
          <p className="ac-message" role="status">
            مطابق {diffCount!.match} · فرق في الوقت {diffCount!.time} · في الأجهزة بس {diffCount!["device-only"]} · في Teams بس {diffCount!["teams-only"]} · غياب في الاتنين {diffCount!.absent} (الفرق لحد دقيقتين يعتبر مطابق)
          </p>
          <TableScroll label="الفرق بين الأجهزة و Teams">
            <table className="ac-table">
              <thead><tr><th>الصورة</th><th>الاسم</th><th>التاريخ</th><th>أول (أجهزة)</th><th>آخر (أجهزة)</th><th>أول (Teams)</th><th>آخر (Teams)</th><th>فرق الأول</th><th>فرق الآخر</th><th>الحالة</th></tr></thead>
              <tbody>
                {diff.map((r) => (
                  <tr key={`${r.key}-${r.date}`} style={{ background: r.state === "match" ? "#E2F0D9" : r.state === "time" ? "#FFF4CE" : r.state === "absent" ? undefined : "#FDE2E1" }}>
                    <td>{r.photo ? <img src={r.photo} alt="" width={32} height={32} style={{ borderRadius: "50%", objectFit: "cover" }} /> : <span className="ac-avatar" style={{ width: 32, height: 32 }}>{r.name.slice(0, 1)}</span>}</td>
                    <td dir="ltr">{r.name}</td><td>{r.date}</td>
                    <td>{r.devFirst || "—"}</td><td>{r.devLast || "—"}</td><td>{r.teamFirst || "—"}</td><td>{r.teamLast || "—"}</td>
                    <td>{fmtDiff(r.firstDiff)}</td><td>{fmtDiff(r.lastDiff)}</td><td><b>{DIFF_LABEL[r.state]}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </>
      ) : null}
      {view === "table" ? <TableScroll label="التقرير اليومي — جدول قابل للتمرير">
        <table className="ac-table" dir="ltr">
          <thead>
            <tr>
              <th>Photo</th>
              <th>English name</th>
              <th>No.</th>
              <th>Date</th>
              <th>First punch</th>
              <th>Last punch</th>
              <th>Worked</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={`${row.personId}-${row.date}`} style={row.absent ? { background: "#fdecec" } : undefined}>
                <td>
                  {row.photo ? (
                    <img src={row.photo} alt="" width={32} height={32} style={{ borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <span className="ac-avatar" style={{ width: 32, height: 32 }}>{row.name.slice(0, 1)}</span>
                  )}
                </td>
                <td>{row.name}</td>
                <td>{row.employeeNo}</td>
                <td>{row.date}</td>
                <td>{row.first || "—"}</td>
                <td>{row.last || "—"}</td>
                <td>{row.worked}</td>
                <td style={row.absent ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll> : null}
    </Card>
  );
}
