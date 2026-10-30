import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { activateLicenseFn, licensePollFn, licenseRequestFn, licenseStatusFn } from "@/lib/license.functions";
import { SetupGate } from "./admin-setup";
import { Brand } from "./access-brand";
import { Button } from "./access-ui";
import { brandTheme } from "@/lib/brand";
import "./access-center.css";
import "./speed-design.css";

type Status = Awaited<ReturnType<typeof licenseStatusFn>>;
const mac = (m: string) => m.match(/.{2}/g)?.join(":") || m;
/** Packaged builds only: 24h trial, then an activation screen. Dev servers are never enforced. */
export function LicensedAccessCenter() {
  const status = useServerFn(licenseStatusFn), activate = useServerFn(activateLicenseFn);
  const [state, setState] = useState<Status | null>(null), [failed, setFailed] = useState(false);
  const request = useServerFn(licenseRequestFn), poll = useServerFn(licensePollFn);
  const [email, setEmail] = useState(""), [company, setCompany] = useState(""), [online, setOnline] = useState({ text: "", error: false, busy: false, waiting: false });
  const [activateNow, setActivateNow] = useState(false);
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState({ text: "", error: false });
  const load = () => {
    setFailed(false);
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10_000));
    return Promise.race([status(), timeout]).then((s) => { setState(s); setFailed(false); }).catch(() => setFailed(true));
  };
  useEffect(() => { load(); const t = setInterval(load, 5 * 60_000); return () => clearInterval(t); }, []);
  const locked = state?.enforced && (state.mode === "locked" || (state.mode === "trial" && activateNow));
  useEffect(() => {
    if (!locked) return;
    let stop = false;
    const tick = async () => {
      const r = await poll().catch(() => ({ status: "offline" as const }));
      if (stop) return;
      if (r.status === "activated") { setOnline({ text: `تمت الموافقة والتفعيل باسم ${"customer" in r ? r.customer : ""}. جارٍ فتح البرنامج…`, error: false, busy: false, waiting: false }); setTimeout(load, 800); }
      else if (r.status === "pending") setOnline((o) => ({ ...o, waiting: true, text: "تم إرسال الطلب وهو قيد المراجعة. سيتم التفعيل تلقائياً فور الموافقة.", error: false }));
      else if (r.status === "rejected") setOnline((o) => ({ ...o, waiting: false, text: "تم رفض الطلب. تواصل مع Speed for Training.", error: true }));
    };
    void tick(); const t = setInterval(tick, 20_000); return () => { stop = true; clearInterval(t); };
  }, [locked]);
  if (failed && !state)
    return <main className="access-center ac-login" dir="rtl" style={brandTheme}><div className="ac-loading"><Brand /><p role="alert">تعذر الوصول إلى الخادم للتحقق من الترخيص. تأكد من الاتصال ثم أعد المحاولة.</p><Button onClick={() => { void load(); }}>إعادة المحاولة</Button></div></main>;
  if (!state) return <main className="access-center ac-login" dir="rtl" style={brandTheme}><div className="ac-loading"><Brand /><span className="ac-loading-line" aria-hidden="true" /><p role="status">جارٍ التحقق من الترخيص…</p></div></main>;
  if (!state.enforced || state.mode === "licensed") return <SetupGate />;
  if (state.mode === "trial" && !activateNow)
    return (<>
      <p role="status" className="ac-message" dir="rtl" style={{ margin: 0, textAlign: "center", background: "#e8eef6", color: "#0B2242", borderBottom: "1px solid #dbe1e6", padding: "6px 12px" }}>
        نسخة تجريبية — تنتهي {new Date(state.trialEndsAt || "").toLocaleString("ar-EG")}{" "}
        <button type="button" onClick={() => setActivateNow(true)} style={{ background: "none", border: 0, color: "#0B2242", fontWeight: 700, textDecoration: "underline", cursor: "pointer", font: "inherit" }}>تفعيل الآن</button>
      </p>
      <SetupGate />
    </>);
  const copy = async () => {
    try { await navigator.clipboard.writeText(state.requestCode); setNote({ text: "تم نسخ كود الطلب. أرسله إلى Speed for Training للحصول على كود التفعيل.", error: false }); }
    catch { setNote({ text: "تعذر النسخ التلقائي. حدد كود الطلب وانسخه يدوياً.", error: true }); }
  };
  const mailBody = `طلب ترخيص Speed for Training\nالبريد: ${email}\nالشركة: ${company}\nاسم الجهاز: ${state.machineName}\nكود الطلب:\n${state.requestCode}`;
  const mailto = `mailto:${state.email || ""}?subject=${encodeURIComponent("طلب ترخيص Speed for Training")}&body=${encodeURIComponent(mailBody)}`;
  const copyMail = async () => { try { await navigator.clipboard.writeText(mailBody); setNote({ text: "تم نسخ نص الرسالة. أرسله بنفسك بالبريد إلى Speed for Training.", error: false }); } catch { setNote({ text: "تعذر النسخ التلقائي.", error: true }); } };
  return (
    <main className="access-center ac-login" dir="rtl" style={brandTheme}>
      <form className="ac-card ac-stack" style={{ maxWidth: 520, width: "100%" }} onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setNote({ text: "جارٍ التحقق من كود التفعيل…", error: false });
        try {
          const r = await activate({ data: { code } });
          if (r.ok) { setNote({ text: `تم التفعيل باسم ${r.customer}. جارٍ فتح البرنامج…`, error: false }); setTimeout(load, 800); }
          else setNote({ text: r.error, error: true });
        } catch { setNote({ text: "تعذر الاتصال بالخادم. أعد المحاولة.", error: true }); }
        finally { setBusy(false); }
      }}>
        <Brand />
        <h1 style={{ fontSize: 22, margin: 0 }}>تفعيل Speed for Training</h1>
        {state.mode === "trial" ? <p role="status" className="ac-message">النسخة التجريبية ما زالت تعمل حتى {new Date(state.trialEndsAt || "").toLocaleString("ar-EG")}. <button type="button" className="ac-button" onClick={() => setActivateNow(false)}>رجوع للبرنامج</button></p> : <p role="alert" className="ac-message error">{state.message || "البرنامج غير مفعّل."}</p>}
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", margin: 0 }}>
          <dt>اسم الجهاز</dt><dd dir="ltr" style={{ margin: 0, fontWeight: 700 }}>{state.machineName}</dd>
          <dt>عنوان MAC</dt><dd dir="ltr" style={{ margin: 0, wordBreak: "break-all" }}>{state.macs.map(mac).join(" ، ") || "غير متاح"}</dd>
        </dl>
        {state.server ? <section className="ac-stack" aria-label="طلب ترخيص عبر الإنترنت">
          <h2 style={{ fontSize: 17, margin: 0 }}>طلب ترخيص عبر الإنترنت</h2>
          <label className="ac-stack">البريد الإلكتروني<input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></label>
          <label className="ac-stack">اسم الشركة<input value={company} onChange={(e) => setCompany(e.target.value)} /></label>
          <Button type="button" primary disabled={online.busy || !/^\S+@\S+\.\S+$/.test(email)} onClick={async () => {
            setOnline({ text: "جارٍ إرسال الطلب…", error: false, busy: true, waiting: false });
            const r = await request({ data: { email, company } }).catch(() => ({ ok: false as const, error: "تعذر الوصول لخادم التراخيص. استخدم الطلب اليدوي بالبريد." }));
            if (!r.ok) setOnline({ text: r.error, error: true, busy: false, waiting: false });
            else if (r.status === "issued") { setOnline({ text: "تم التفعيل. جارٍ فتح البرنامج…", error: false, busy: false, waiting: false }); setTimeout(load, 800); }
            else setOnline({ text: "تم إرسال الطلب وهو قيد المراجعة. سيتم التفعيل تلقائياً فور الموافقة.", error: false, busy: false, waiting: true });
          }}>{online.busy ? "جارٍ الإرسال…" : "طلب ترخيص"}</Button>
          {online.text ? <p role={online.error ? "alert" : "status"} className={`ac-message${online.error ? " error" : ""}`}>{online.text}</p> : null}
        </section> : null}
        <h2 style={{ fontSize: 17, margin: 0 }}>بدون إنترنت: طلب يدوي</h2>
        <label className="ac-stack">كود الطلب
          <textarea readOnly dir="ltr" rows={3} value={state.requestCode} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 12 }} />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button type="button" onClick={copy}>نسخ كود الطلب</Button>
          <Button type="button" onClick={copyMail}>نسخ نص رسالة الطلب</Button>
          <a className="ac-button" href={mailto}>فتح برنامج البريد</a>
        </div>
        <p className="ac-message" style={{ fontSize: 13 }}>أرسل الرسالة بنفسك من بريدك، وستصلك رسالة بها كود التفعيل لتلصقه بالأسفل.</p>
        <label className="ac-stack">كود التفعيل
          <textarea dir="ltr" rows={4} required value={code} onChange={(e) => setCode(e.target.value)} placeholder="SFT-LIC-..." style={{ fontSize: 12 }} />
        </label>
        <Button type="submit" primary disabled={busy || !code.trim()}>{busy ? "جارٍ التفعيل…" : "تفعيل"}</Button>
        {note.text ? <p role={note.error ? "alert" : "status"} className={`ac-message${note.error ? " error" : ""}`}>{note.text}</p> : null}
      </form>
    </main>
  );
}
