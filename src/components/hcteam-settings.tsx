import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { hcTeamClearFn, hcTeamSaveFn, hcTeamStatusFn, hcTeamTestFn } from "@/lib/hcteam.functions";
import { HC_REGIONS, type HcPublic } from "@/lib/hcteam-shared";
import { Button, Card, Field } from "./access-ui";
import { useCompanyProfile } from "./company-profile";

/**
 * Hikvision support recipients for the AppKey request. Only addresses verified in the owner's documents
 * belong here — none were found in the OpenAPI guide or the SKY LINE Team guide, so the admin types them.
 */
export const HIKVISION_KEY_RECIPIENTS: { to: string[]; cc: string[] } = { to: [], cc: [] };

/** «ربط Hik-Connect Team»: admin enters the customer's own AppKey/AppSecret. */
/** Addresses stay readable (@ and , unescaped) so every mail client fills To/CC. */
const mailList = (v: string) => v.split(/[,;\s]+/).filter(Boolean).map((a) => encodeURIComponent(a).replace(/%40/g, "@")).join(",");
export function HcTeamCard() {
  const status = useServerFn(hcTeamStatusFn), save = useServerFn(hcTeamSaveFn), test = useServerFn(hcTeamTestFn), clear = useServerFn(hcTeamClearFn);
  const [s, setS] = useState<HcPublic | null>(null), [appKey, setAppKey] = useState(""), [secret, setSecret] = useState(""), [region, setRegion] = useState("isgp");
  const [busy, setBusy] = useState(""), [note, setNote] = useState({ text: "", error: false }), [guide, setGuide] = useState(false);
  useEffect(() => { status().then((r) => { if (r.ok) { setS(r.status); setRegion(r.status.region); } }).catch(() => {}); }, []);
  const run = async (kind: string, fn: () => Promise<void>) => { setBusy(kind); try { await fn(); } catch { setNote({ text: "تعذر الاتصال بالخادم.", error: true }); } finally { setBusy(""); } };
  return (
    <Card>
      <div className="ac-stack" dir="rtl">
        <h2 style={{ margin: 0 }}>ربط Hik-Connect Team</h2>
        <p className="ac-muted" style={{ margin: 0 }}>اربط حساب Hik-Connect for Teams الخاص بشركتك عبر OpenAPI الرسمي لسحب الحضور من السحابة إلى جانب الاتصال المباشر بالأجهزة. المفتاح يخص شركتك وحدها ويُحفظ مشفراً على هذا الخادم.</p>
        {s?.configured ? <p role="status" className="ac-message">مرتبط — AppKey <bdi dir="ltr">{s.appKey}</bdi>{s.tokenValidUntil ? ` · رمز الدخول صالح حتى ${new Date(s.tokenValidUntil).toLocaleString("ar-EG")}` : ""}</p> : <p className="ac-message">غير مرتبط بعد.</p>}
        <label className="ac-stack">منطقة الخادم
          <select value={region} onChange={(e) => setRegion(e.target.value)} dir="ltr">
            {HC_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label} — {r.url.replace("https://", "")}</option>)}
          </select>
        </label>
        <Field label="AppKey (AK)" value={appKey} onChange={(e) => setAppKey(e.target.value)} dir="ltr" autoComplete="off" placeholder={s?.appKey || ""} maxLength={64} />
        <Field label={s?.hasSecret ? "AppSecret (SK) — محفوظ. اتركه فارغاً للإبقاء عليه" : "AppSecret (SK)"} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} dir="ltr" autoComplete="new-password" maxLength={64} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button type="button" primary disabled={!!busy || !appKey.trim() || (!secret && !s?.hasSecret)} onClick={() => run("save", async () => {
            const r = await save({ data: { appKey: appKey.trim(), secret: secret.trim() || undefined, region } });
            setSecret("");
            if (r.ok) { setS(r.status); setAppKey(""); setNote({ text: "تم الحفظ. اضغط «اختبار الاتصال».", error: false }); } else setNote({ text: r.error, error: true });
          })}>{busy === "save" ? "جارٍ الحفظ…" : "حفظ"}</Button>
          <Button type="button" disabled={!!busy || !s?.configured} onClick={() => run("test", async () => {
            setNote({ text: "جارٍ طلب رمز الدخول من Hik-Connect…", error: false });
            const r = await test();
            if (r.ok) { setS(r.status); setNote({ text: `نجح الاتصال. رمز الدخول صالح حتى ${new Date(r.validUntil).toLocaleString("ar-EG")}.`, error: false }); } else setNote({ text: r.error, error: true });
          })}>{busy === "test" ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول إلى Hik-Connect Team"}</Button>
          {s?.configured ? <Button type="button" disabled={!!busy} onClick={() => run("clear", async () => { const r = await clear(); if (r.ok) { setS(r.status); setNote({ text: "تم حذف المفتاح من هذا الخادم.", error: false }); } })}>إلغاء الربط</Button> : null}
          <Button type="button" onClick={() => setGuide(!guide)}>{guide ? "إخفاء الدليل" : "كيف تحصل على مفتاح Hik-Connect Team"}</Button>
        </div>
        {note.text ? <p role={note.error ? "alert" : "status"} className={`ac-message${note.error ? " error" : ""}`}>{note.text}</p> : null}
        {guide ? <HcTeamGuide /> : null}
      </div>
    </Card>
  );
}

function template(lang: "ar" | "en", v: { company: string; account: string; country: string; devices: string }) {
  const c = v.company || "[اسم الشركة]", a = v.account || "[إيميل حساب Hik-Connect for Teams]", k = v.country || "[الدولة]", d = v.devices || "[موديلات وأرقام تسلسل الأجهزة]";
  return lang === "ar"
    ? { subject: `طلب AppKey و AppSecret لـ Hik-Connect for Teams OpenAPI — ${c}`, body: `السادة فريق دعم Hikvision،\n\nنرجو تفعيل خدمة Hik-Connect for Teams OpenAPI لحسابنا وإرسال AppKey (AK) و AppSecret (SK) الخاصة به، لاستخدامها في سحب سجلات الحضور والانصراف إلى برنامج الحضور الداخلي لدينا.\n\nاسم الشركة: ${c}\nإيميل حساب Hik-Connect for Teams: ${a}\nالدولة: ${k}\nالأجهزة (الموديل / الرقم التسلسلي):\n${d}\n\nالصلاحيات المطلوبة: قراءة سجلات الحضور (certificaterecords) وقائمة الأشخاص (persons) فقط.\n\nوشكراً لكم،\n${c}` }
    : { subject: `Request for Hik-Connect for Teams OpenAPI AppKey/AppSecret — ${c}`, body: `Dear Hikvision Support Team,\n\nPlease enable Hik-Connect for Teams OpenAPI for our account and send us its AppKey (AK) and AppSecret (SK). We will use them to read attendance records into our internal time-attendance software.\n\nCompany: ${c}\nHik-Connect for Teams account email: ${a}\nCountry: ${k}\nDevices (model / serial number):\n${d}\n\nRequired scope: read-only access to attendance records (certificaterecords) and the person list (persons).\n\nBest regards,\n${c}` };
}

/** «كيف تحصل على مفتاح Hik-Connect Team» — the app never sends mail; it opens the admin's own mail app. */
export function HcTeamGuide() {
  const profile = useCompanyProfile();
  const [v, setV] = useState({ company: profile.name, account: "", country: "مصر", devices: "" });
  const [to, setTo] = useState(HIKVISION_KEY_RECIPIENTS.to.join(", ")), [cc, setCc] = useState(HIKVISION_KEY_RECIPIENTS.cc.join(", "));
  const [lang, setLang] = useState<"ar" | "en">("en"), [note, setNote] = useState("");
  const t = template(lang, v);
  const mailto = `mailto:${mailList(to)}?${cc.trim() ? `cc=${mailList(cc)}&` : ""}subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(t.body)}`;
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setNote(`تم نسخ ${what}.`); } catch { setNote("حدد النص وانسخه يدوياً."); } };
  return (
    <section className="ac-stack sp-section" dir="rtl" aria-label="كيف تحصل على مفتاح Hik-Connect Team">
      <h3 style={{ margin: 0 }}>كيف تحصل على مفتاح Hik-Connect Team</h3>
      <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 1.9 }}>
        <li>تأكد أن لديك حساب Hik-Connect for Teams وأن أجهزتك مضافة إليه، واعرف منطقة الخادم (مثلاً Singapore لمصر والشرق الأوسط).</li>
        <li>املأ البيانات بالأسفل، ثم اضغط «فتح في برنامج البريد» أو انسخ الرسالة وأرسلها من بريد شركتك إلى دعم Hikvision.</li>
        <li>سيرسل لك الدعم AppKey (AK) و AppSecret (SK). لا ترسلهما لأي شخص آخر، وإذا تسرّبا اطلب مفتاحاً جديداً.</li>
        <li>أدخلهما في «ربط Hik-Connect Team» أعلاه، اختر نفس المنطقة، ثم «اختبار الاتصال».</li>
        <li>من شاشة الحضور اختر «Hik-Connect Team (OpenAPI)» لسحب السجلات.</li>
      </ol>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <Field label="اسم الشركة" value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} />
        <Field label="إيميل حساب Hik-Connect for Teams" value={v.account} onChange={(e) => setV({ ...v, account: e.target.value })} dir="ltr" />
        <Field label="الدولة" value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} />
      </div>
      <label className="ac-stack">الأجهزة (موديل / رقم تسلسلي، سطر لكل جهاز)
        <textarea rows={3} dir="ltr" value={v.devices} onChange={(e) => setV({ ...v, devices: e.target.value })} placeholder="DS-K1T343 / FX1234567" />
      </label>
      <Field label="إلى (To) — عنوان دعم Hikvision في بلدك" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" placeholder="support@…" />
      <Field label="نسخة (CC)" value={cc} onChange={(e) => setCc(e.target.value)} dir="ltr" />
      {!HIKVISION_KEY_RECIPIENTS.to.length ? <p className="ac-muted" style={{ margin: 0 }}>اكتب عنوان دعم Hikvision الذي تتعامل معه (الموزّع أو الدعم الفني الإقليمي).</p> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button type="button" onClick={() => setLang("ar")} disabled={lang === "ar"}>الرسالة بالعربية</Button>
        <Button type="button" onClick={() => setLang("en")} disabled={lang === "en"}>English</Button>
      </div>
      <label className="ac-stack">الموضوع<input readOnly value={t.subject} dir={lang === "ar" ? "rtl" : "ltr"} /></label>
      <label className="ac-stack">نص الرسالة<textarea readOnly rows={12} value={t.body} dir={lang === "ar" ? "rtl" : "ltr"} /></label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a className="ac-button primary" href={mailto} aria-disabled={!to.trim()} onClick={(e) => { if (!to.trim()) { e.preventDefault(); setNote("اكتب عنوان المستلم أولاً."); } }}>فتح في برنامج البريد</a>
        <Button type="button" onClick={() => copy(`${t.subject}\n\n${t.body}`, "الرسالة")}>نسخ الرسالة</Button>
        <Button type="button" onClick={() => copy([to, cc].filter((x) => x.trim()).join(", "), "العناوين")} disabled={!to.trim()}>نسخ العناوين</Button>
      </div>
      <p className="ac-muted" style={{ margin: 0 }}>البرنامج لا يرسل أي بريد بنفسه؛ الرسالة تُفتح في برنامج بريدك لتراجعها وترسلها أنت.</p>
      {note ? <p role="status" className="ac-message">{note}</p> : null}
    </section>
  );
}
