import { useMemo, useState } from "react";
import { mergeDailySources } from "@/lib/daily-report";
import { buildLayout, simpleHeader, simpleRows } from "@/lib/report-layout";
import { useTeamsPull } from "@/lib/teams-pull-store";
import { profileFrom } from "@/lib/company-profile";
import { useCenter, Button, Card, TableScroll } from "./access-ui";

const today = () => new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10);
const monthRange = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  return [`${m}-01`, last < today() ? last : today()] as const;
};

/** Hik-Connect Team reports: from/to or a whole month → one simple table (name, date, first, last, work hours), PDF + Excel. */
export function TeamReportsCard() {
  const { data } = useCenter();
  const profile = profileFrom(data.company);
  const web = useTeamsPull("team"), api = useTeamsPull("openapi");
  const [kind, setKind] = useState<"openapi" | "team">("openapi");
  const pull = kind === "openapi" ? api ?? web : web ?? api;
  const [from, setFrom] = useState(() => today().slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [detailed, setDetailed] = useState(false);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const rows = useMemo(() => (pull ? mergeDailySources([], pull, "teams", from, to) : []), [pull, from, to]);
  const layout = useMemo(() => buildLayout(from, to, rows), [from, to, rows]);
  const outside = !!pull && (from < pull.from || to > pull.to);
  return (
    <Card title="تقارير Hik-Connect Team">
      <div className="ac-actions" role="group" aria-label="فترة تقرير Team">
        <label>المصدر:{" "}
          <select value={kind} onChange={(e) => setKind(e.target.value as "openapi" | "team")}>
            <option value="openapi">OpenAPI</option>
            <option value="team">Hik-Connect Team (دخول بالحساب)</option>
          </select>
        </label>
        <label>الشهر:{" "}
          <input type="month" dir="ltr" value={month} onChange={(e) => { setMonth(e.target.value); if (e.target.value) { const [a, b] = monthRange(e.target.value); setFrom(a); setTo(b); } }} />
        </label>
        <label>من تاريخ Team <input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>إلى تاريخ Team <input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {!pull ? <p className="ac-muted">اسحب الحضور من Hik-Connect Team (فوق) للفترة دي الأول.</p> : (
        <p className={outside ? "ac-message error" : "ac-muted"} role="status">
          آخر سحب: {pull.from} → {pull.to} · {pull.punches.length} بصمة{outside ? " — الفترة المختارة أكبر من اللي اتسحب، اسحب الفترة كلها الأول." : ""}
        </p>
      )}
      <label><input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} /> تقرير مفصّل (ملخص + كارت لكل موظف)</label>
      <div className="ac-actions">
        <Button disabled={!rows.length} onClick={async () => { const { saveDailyPdf } = await import("@/lib/daily-report"); await saveDailyPdf(from, to, rows, profile.name, profile.logo, undefined, detailed); }}>PDF تقرير Team</Button>
        <Button disabled={!rows.length} onClick={async () => { const { saveDailyXlsx } = await import("@/lib/daily-report"); await saveDailyXlsx(from, to, rows, profile.name, profile.logo, null, undefined, detailed); }}>Excel تقرير Team</Button>
      </div>
      {rows.length ? (
        <TableScroll label="تقرير Hik-Connect Team">
          <table className="ac-table">
            <thead><tr>{simpleHeader(layout).map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{simpleRows(layout).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} dir={j === 0 ? "ltr" : undefined}>{c}</td>)}</tr>)}</tbody>
          </table>
        </TableScroll>
      ) : null}
    </Card>
  );
}
