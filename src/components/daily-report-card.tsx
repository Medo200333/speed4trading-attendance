import { useEffect, useMemo, useState } from "react";
import type { AttendanceRow } from "@/lib/access/domain";
import { dailyRows, mergeDailySources, type DailySource } from "@/lib/daily-report";
import { buildLayout, layoutHtml } from "@/lib/report-layout";
import { diffRows, diffSummary, DIFF_LABEL, fmtDiff, withDiffPages } from "@/lib/report-diff";
import { useTeamsPull } from "@/lib/teams-pull-store";
import { HC_FAILED_LABEL } from "@/lib/hcteam-shared";
import { profileFrom } from "@/lib/company-profile";
import { useCenter, Button, Card, TableScroll, personPhoto, usePhotoVersion } from "./access-ui";

/** Daily report: Speed frame on top, company logo + name, then per employee per day: photo, English name, number, first/last punch and worked time. */
export function DailyReportCard({ rows, start, end }: { rows: AttendanceRow[]; start: string; end: string }) {
  const { data, read } = useCenter();
  const profile = profileFrom(data.company);
  const teamWeb = useTeamsPull("team"), teamApi = useTeamsPull("openapi");
  const [pick, setPick] = useState<DailySource | "openapi">("devices");
  // OpenAPI is the third source: it is merged like Team but from its own pull.
  const source: DailySource = pick === "openapi" ? "teams" : pick;
  const team = pick === "openapi" ? teamApi : teamWeb ?? (pick === "devices" ? teamApi : null);
  const [diffWith, setDiffWith] = useState<"team" | "openapi">("openapi");
  const cmp = diffWith === "openapi" ? teamApi ?? teamWeb : teamWeb ?? teamApi;
  const cmpName = cmp === teamApi ? "OpenAPI" : "Teams";
  const deviceRows = useMemo(() => dailyRows(rows, data.people), [rows, data.people]);
  const { base, warnings } = useMemo(() => {
    const warnings: string[] = [];
    const base = mergeDailySources(deviceRows.map((r) => ({ ...r, branch: undefined })), team, source, start, end, warnings);
    if (pick === "openapi" && teamApi) {
      for (const c of teamApi.clock ?? []) warnings.push(`⏰ ساعة جهاز «${c.device}» ${c.offsetMin > 0 ? "متقدمة" : "متأخرة"} ${Math.abs(c.offsetMin)} دقيقة عن وقت السحابة (OpenAPI).`);
      if (teamApi.attempts?.length) warnings.push(`${teamApi.attempts.length} ${HC_FAILED_LABEL} في OpenAPI — مش محسوبة حضور.`);
    }
    return { base, warnings };
  }, [deviceRows, team, source, start, end, pick, teamApi]);
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
    if (!cmp) return null;
    const dev = mergeDailySources(deviceRows.map((r) => ({ ...r, branch: undefined })), cmp, "devices", start, end);
    const tm = mergeDailySources(deviceRows.map((r) => ({ ...r, branch: undefined })), cmp, "teams", start, end);
    const pic = (r: (typeof dev)[number]) => ({ ...r, photo: photos[r.personId] ?? r.photo ?? null });
    return diffRows(dev.map(pic), tm.map(pic));
  }, [deviceRows, cmp, start, end, photos]);
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
          <select value={pick} onChange={(e) => setPick(e.target.value as DailySource | "openapi")}>
            <option value="devices">الأجهزة</option>
            <option value="teams">Hik-Connect Team</option>
            <option value="openapi">Hik-Connect Team (OpenAPI)</option>
            <option value="both">الاثنين (دمج بدون تكرار)</option>
          </select>
        </label>
        {pick !== "devices" ? (
          <span className="ac-muted">
            {team
              ? `Team: ${team.punches.length} بصمة · ${team.people.length} شخص (${team.from} → ${team.to})`
              : pick === "openapi" ? "اسحب من «Hik-Connect Team (OpenAPI)» في شاشة الحضور أولاً." : "اسحب الحضور من Hik-Connect Team من شاشة الحضور أولاً، وبعدين ارجع هنا."}
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
        <Button aria-pressed={view === "diff"} disabled={!diff} title={diff ? "" : "اسحب من Hik-Connect Team الأول"} onClick={() => setView("diff")}>⚖️ الفرق (أجهزة / {cmpName})</Button>
        {teamWeb && teamApi ? (
          <label>
            قارن الأجهزة مع:{" "}
            <select value={diffWith} onChange={(e) => setDiffWith(e.target.value as "team" | "openapi")}>
              <option value="openapi">OpenAPI</option>
              <option value="team">Hik-Connect Team (دخول بالحساب)</option>
            </select>
          </label>
        ) : null}
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
            مطابق {diffCount!.match} · فرق في الوقت {diffCount!.time} · في الأجهزة بس {diffCount!["device-only"]} · في {cmpName} بس {diffCount!["teams-only"]} · غياب في الاتنين {diffCount!.absent} (الفرق لحد دقيقتين يعتبر مطابق)
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
