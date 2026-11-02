import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { discoverDevicesFn, activateDeviceFn, modifyDeviceNetworkFn, configureWifiFn } from "@/lib/discovery.functions";
import type { FoundDevice } from "@/lib/access/sadp.server";
import { Button } from "./access-ui";

type Row = FoundDevice & { via: "server" | "phone"; reachable?: boolean; password?: string };
type Suggestion = { ip: string; mask: string; gateway: string } | null;
declare global {
  interface Window { ZubaydSadp?: { scan(): string } }
}
/** SADP-style scan. Un-activated devices get one "تفعيل" flow: password → activate → network (DHCP/static) → auto-add. */
export function DeviceDiscovery({ onPick, known }: { onPick: (row: Row) => void; known: string[] }) {
  const discover = useServerFn(discoverDevicesFn);
  const [rows, setRows] = useState<Row[] | null>(null),
    [loading, setLoading] = useState(""),
    [note, setNote] = useState({ text: "", error: false }),
    [picked, setPicked] = useState(""),
    [suggestion, setSuggestion] = useState<Suggestion>(null),
    [flow, setFlow] = useState<Row | null>(null),
    [pcap, setPcap] = useState(""),
    [auto, setAuto] = useState(false),
    [updatedAt, setUpdatedAt] = useState("");
  async function scan(deepScan: boolean): Promise<Row[]> {
    setLoading(deepScan ? "جارٍ الفحص العميق للشبكة (قد يستغرق حتى دقيقة)…" : "جارٍ البحث عن أجهزة Hikvision على الشبكة…");
    setNote({ text: "", error: false });
    const found: Row[] = [];
    let serverError = "";
    try {
      const result = await discover({ data: { deepScan } });
      if (result.ok) {
        found.push(...result.data.devices.map((row) => ({ ...row, via: "server" as const })));
        setSuggestion(result.data.suggestion);
        setPcap(result.data.pcap);
      }
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
    setUpdatedAt(new Date().toLocaleTimeString("ar-EG"));
    if (found.length) setNote({ text: `تم العثور على ${found.length} جهاز. اختر جهازاً ثم أدخل اسم المستخدم وكلمة المرور الخاصين به.`, error: false });
    else setNote({ text: serverError || "لم يُعثر على أجهزة. تأكد أن البصمة تعمل ومتصلة بنفس الشبكة، ثم جرّب الفحص العميق أو أدخل العنوان يدوياً.", error: true });
    return found;
  }
  // Optional auto-refresh while the page is open (paused during a scan or an activation flow).
  const busyRef = useRef(false);
  busyRef.current = Boolean(loading) || Boolean(flow);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => { if (!busyRef.current) void scan(false); }, 15000);
    return () => clearInterval(id);
  }, [auto]);
  return (
    <section className="ac-stack ac-discovery" aria-busy={Boolean(loading)}>
      <ol className="ac-wizard-steps" aria-label="الخطوات" style={{ display: "flex", gap: 12, listStyle: "none", padding: 0, flexWrap: "wrap", fontSize: 15 }}>
        <li>🔍 1. بحث</li><li>🔑 2. تفعيل</li><li>🌐 3. ضبط العنوان</li><li>➕ 4. إضافة</li>
      </ol>
      <p>دوس «فحص الشبكة». البرنامج بيدوّر على أجهزة البصمة زي برنامج SADP، حتى لو عنوان الجهاز من شبكة تانية (زي 192.168.1.64 أو 192.0.0.64). الجهاز اللي عليه علامة حمرا «غير مفعّل» دوس «تفعيل» جنبه.</p>
      <div className="ac-actions">
        <Button type="button" disabled={Boolean(loading)} onClick={() => scan(false)}>{loading ? "جارٍ الفحص…" : rows ? "🔄 تحديث" : "فحص الشبكة"}</Button>
        {rows ? <Button type="button" disabled={Boolean(loading)} onClick={() => scan(true)}>فحص عميق</Button> : null}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> تحديث تلقائي كل 15 ثانية</label>
        {updatedAt ? <span className="ac-muted">آخر تحديث: {updatedAt}</span> : null}
      </div>
      {loading ? <p role="status" className="ac-message"><span className="ac-loading-line" aria-hidden="true" /> {loading}</p> : null}
      {note.text && !loading ? <p role={note.error ? "alert" : "status"} className={`ac-message${note.error ? " error" : ""}`}>{note.text}</p> : null}
      {rows && (pcap === "npcap-missing" || pcap === "module-missing") ? (
        <p className="ac-message">
          💡 لو الجهاز مش ظاهر وهو على شبكة تانية خالص، نزّل برنامج Npcap المجاني (نفس اللي برنامج SADP بيستخدمه) وسطّبه وبعدين أعد الفحص:{" "}
          <a href="https://npcap.com/#download" target="_blank" rel="noreferrer">تحميل Npcap</a>
          {pcap === "module-missing" ? " (Npcap متسطب، بس مكوّن الفحص العميق مش موجود في النسخة دي)" : ""}
        </p>
      ) : null}
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
                {row.activated === false ? <span className="ac-badge" style={{ background: "#c62828", color: "#fff", borderRadius: 6, padding: "1px 8px", marginInlineStart: 8 }}>غير مفعّل</span> : null}
                <small>
                  {row.activated === false ? "" : row.activated ? "مُفعّل" : "حالة التفعيل غير معروفة"}
                  {row.reachable === false && row.activated !== false ? " • عنوانه من شبكة تانية: دوس «ضبط العنوان»" : ""}
                  {row.via === "phone" ? " • ظهر من شبكة الهاتف؛ يجب أن يصل إليه الخادم أيضاً" : ""}
                  {added ? " • مضاف بالفعل" : ""}
                </small>
                <div className="ac-actions">
                  {row.activated === false && row.mac ? <Button type="button" onClick={() => setFlow(row)}>تفعيل</Button> : null}
                  {row.activated !== false && row.reachable === false && row.mac ? <Button type="button" onClick={() => setFlow({ ...row, activated: true })}>ضبط العنوان</Button> : null}
                  <Button type="button" disabled={added || row.activated === false || row.reachable === false} onClick={() => { setPicked(row.ip); onPick(row); setNote({ text: `تم اختيار ${row.ip}. أكمل الاسم وبيانات الدخول ثم اضغط التالي.`, error: false }); }}>
                    {picked === row.ip ? "تم الاختيار" : "اختيار هذا الجهاز"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {flow ? (
        <ActivationFlow
          row={flow}
          suggestion={suggestion}
          onCancel={() => setFlow(null)}
          rescan={() => scan(false)}
          onDone={(row) => { setFlow(null); setPicked(row.ip); onPick(row); setNote({ text: `تم تجهيز الجهاز ${row.ip} وإضافته للنموذج. اكتب اسم للجهاز واضغط التالي.`, error: false }); }}
        />
      ) : null}
    </section>
  );
}

/** One flow from one button: (1) new password → activate, (2) network DHCP/static with admin password, (3) find it again and hand it to the add form. */
function ActivationFlow({ row, suggestion, onCancel, onDone, rescan }: { row: Row; suggestion: Suggestion; onCancel: () => void; onDone: (row: Row) => void; rescan: () => Promise<Row[]> }) {
  const activate = useServerFn(activateDeviceFn), modify = useServerFn(modifyDeviceNetworkFn);
  const [stage, setStage] = useState<"password" | "network">(row.activated === false ? "password" : "network"),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [adminPassword, setAdminPassword] = useState(""),
    [dhcp, setDhcp] = useState(true),
    [ip, setIp] = useState(suggestion?.ip || ""),
    [mask, setMask] = useState(suggestion?.mask || "255.255.255.0"),
    [gateway, setGateway] = useState(suggestion?.gateway || ""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [useWifi, setUseWifi] = useState(false),
    [ssid, setSsid] = useState(""),
    [wifiPassword, setWifiPassword] = useState(""),
    [security, setSecurity] = useState<"WPA2-personal" | "WPA-personal" | "WPA3-personal" | "disable">("WPA2-personal");
  const wifi = useServerFn(configureWifiFn);
  async function finish(found: Row) {
    if (useWifi) {
      setBusy("جارٍ ضبط الواي فاي على الجهاز…");
      const w = await wifi({ data: { ip: found.ip, httpPort: found.httpPort, password: adminPassword, ssid, wifiPassword, security } }).catch(() => ({ ok: false as const, error: "انقطع الاتصال بالخادم." }));
      setBusy("");
      if (!w.ok) return setError(`العنوان اتضبط، بس الواي فاي لأ: ${w.error}`);
      setBusy("");
      setError("✅ الواي فاي اتحفظ. شيل كابل الشبكة من الجهاز، استنى دقيقة ودوس «إعادة الفحص» واختاره.");
      return;
    }
    onDone({ ...found, password: adminPassword });
  }
  async function doActivate() {
    setError(""); setBusy("جارٍ تفعيل الجهاز…");
    const r = await activate({ data: { ip: row.ip, httpPort: row.httpPort, mac: row.mac, password, confirm } }).catch(() => ({ ok: false as const, error: "انقطع الاتصال بالخادم." }));
    setBusy("");
    if (!r.ok) return setError(r.error);
    setStage("network");
  }
  async function doNetwork() {
    setError(""); setBusy("جارٍ ضبط عنوان الجهاز…");
    const r = await modify({ data: { mac: row.mac, password: adminPassword, dhcp, ip, mask, gateway, httpPort: row.httpPort } }).catch(() => ({ ok: false as const, error: "انقطع الاتصال بالخادم." }));
    if (!r.ok) { setBusy(""); return setError(r.error); }
    setBusy("الجهاز بيعيد ضبط الشبكة… بندوّر عليه تاني (ممكن ياخد 30 ثانية)");
    for (let i = 0; i < 4; i++) {
      await new Promise((ok) => setTimeout(ok, 6000));
      const found = (await rescan()).find((d) => d.mac === row.mac && d.reachable !== false);
      if (found) { setBusy(""); return finish(found); }
    }
    setBusy("");
    if (!dhcp) return finish({ ...row, ip, reachable: true, activated: true });
    setError("الجهاز اتضبط بس لسه مش ظاهر. استنى دقيقة ودوس «إعادة الفحص».");
  }
  const field = { display: "grid", gap: 4 } as const;
  return (
    <div role="dialog" aria-modal="true" aria-label="تفعيل الجهاز" className="ac-card ac-stack" style={{ padding: 16, border: "2px solid #1565c0" }}>
      <strong>{row.model || "جهاز Hikvision"} <span dir="ltr">{row.mac}</span></strong>
      <p style={{ fontSize: 15 }}>{stage === "password" ? "🔑 خطوة 2 من 4: اختار كلمة مرور جديدة للجهاز" : "🌐 خطوة 3 من 4: خلّي الجهاز ياخد عنوان من شبكتك"}</p>
      {stage === "password" ? (
        <>
          <small>من 8 لـ 16 حرف، وفيها نوعين على الأقل (حروف كبيرة، صغيرة، أرقام، رموز). احفظها كويس: هي اللي هتدخل بيها الجهاز بعد كده.</small>
          <label style={field}>كلمة المرور الجديدة<input type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <label style={field}>تأكيد كلمة المرور<input type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
          <div className="ac-actions"><Button type="button" disabled={Boolean(busy)} onClick={doActivate}>تفعيل</Button><Button type="button" onClick={onCancel}>إلغاء</Button></div>
        </>
      ) : (
        <>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={dhcp} onChange={(e) => setDhcp(e.target.checked)} />عنوان تلقائي من الراوتر (DHCP) — الأسهل</label>
          {!dhcp ? (
            <>
              <small>اقترحنا عنوان فاضي في شبكتك، تقدر تغيّره.</small>
              <label style={field}>عنوان IP<input dir="ltr" value={ip} onChange={(e) => setIp(e.target.value)} /></label>
              <label style={field}>قناع الشبكة (Subnet)<input dir="ltr" value={mask} onChange={(e) => setMask(e.target.value)} /></label>
              <label style={field}>البوابة (Gateway)<input dir="ltr" value={gateway} onChange={(e) => setGateway(e.target.value)} /></label>
            </>
          ) : null}
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={useWifi} onChange={(e) => setUseWifi(e.target.checked)} />📶 الجهاز هيشتغل على الواي فاي</label>
          {useWifi ? (
            <>
              <small>وصّل الجهاز بكابل الأول. اكتب اسم الشبكة بإيدك بالظبط (حروف كبيرة وصغيرة زي ما هي).</small>
              <label style={field}>اسم الواي فاي (SSID)<input dir="ltr" value={ssid} onChange={(e) => setSsid(e.target.value)} /></label>
              <label style={field}>باسورد الواي فاي<input type="password" dir="ltr" autoComplete="off" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} /></label>
              <label style={field}>نوع الحماية<select value={security} onChange={(e) => setSecurity(e.target.value as typeof security)}><option value="WPA2-personal">WPA2 (الأشهر)</option><option value="WPA-personal">WPA</option><option value="WPA3-personal">WPA3</option><option value="disable">بدون باسورد</option></select></label>
            </>
          ) : null}
          <label style={field}>كلمة مرور الأدمن للجهاز (مطلوبة للحفظ)<input type="password" dir="ltr" autoComplete="current-password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} /></label>
          <div className="ac-actions"><Button type="button" disabled={Boolean(busy)} onClick={doNetwork}>حفظ وإضافة</Button><Button type="button" onClick={onCancel}>إلغاء</Button></div>
        </>
      )}
      {busy ? <p role="status" className="ac-message"><span className="ac-loading-line" aria-hidden="true" /> {busy}</p> : null}
      {error ? <p role="alert" className="ac-message error">{error}</p> : null}
    </div>
  );
}
