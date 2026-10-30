import { useEffect, useState } from "react";
import { companyNameError, englishCompanyNameError, normalizeCompanyName, normalizeEnglishName } from "@/lib/company-name";
import { useServerFn } from "@tanstack/react-start";
import { setupAdminFn, setupStatusFn } from "@/lib/setup.functions";
import { activateLicenseFn, licenseStatusFn } from "@/lib/license.functions";
import { passwordStrength } from "@/lib/access/first-admin-core";
import { AccessCenter } from "./access-center";
import { Brand } from "./access-brand";
import { Button, Field } from "./access-ui";
import { CompanySetupGate } from "./company-setup";
import { CompanyBadge, LogoPicker, setCompanyProfile } from "./company-profile";
import { brandTheme } from "@/lib/brand";

const levels = ["ضعيفة جداً", "ضعيفة", "مقبولة", "جيدة", "قوية", "قوية جداً"];
type License = Awaited<ReturnType<typeof licenseStatusFn>>;
/** Packaged first run: if the server has zero accounts, the onboarding screen comes before anything else. */
export function SetupGate() {
  const status = useServerFn(setupStatusFn);
  const [needs, setNeeds] = useState<boolean | null>(null);
  useEffect(() => { status().then((r) => setNeeds(r.needsSetup)).catch(() => setNeeds(false)); }, []);
  if (needs === null)
    return <main className="access-center ac-login" dir="rtl" style={brandTheme}><div className="ac-loading"><Brand company={false} /><span className="ac-loading-line" aria-hidden="true" /><p role="status">جارٍ تجهيز البرنامج…</p></div></main>;
  return needs ? <Onboarding onDone={() => setNeeds(false)} /> : <CompanySetupGate><AccessCenter /></CompanySetupGate>;
}

/** License status inside onboarding: trial can continue; the request code and activation entry are always here. */
function LicensePanel() {
  const status = useServerFn(licenseStatusFn), activate = useServerFn(activateLicenseFn);
  const [s, setS] = useState<License | null>(null), [code, setCode] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState({ text: "", error: false });
  const load = () => status().then(setS).catch(() => setS(null));
  useEffect(() => { load(); }, []);
  if (!s || !s.enforced) return null;
  const licensed = s.mode === "licensed";
  return (
    <section className="sp-section" aria-label="الترخيص">
      <h2>1. الترخيص</h2>
      <p role="status" className={`ac-message${licensed ? "" : ""}`}>
        {licensed ? `البرنامج مفعّل باسم ${s.customer || ""}.` : `نسخة تجريبية تعمل حتى ${new Date(s.trialEndsAt || "").toLocaleString("ar-EG")}. يمكنك المتابعة الآن والتفعيل لاحقاً من نفس المكان.`}
      </p>
      {!licensed ? (
        <details className="ac-details">
          <summary>لديّ كود تفعيل / أريد كود الطلب</summary>
          <div className="ac-stack" style={{ marginTop: 10 }}>
            <label className="ac-stack">كود الطلب (أرسله إلى Speed for Training)
              <textarea readOnly dir="ltr" rows={3} value={s.requestCode} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 12 }} />
            </label>
            <Button type="button" onClick={async () => { try { await navigator.clipboard.writeText(s.requestCode); setNote({ text: "تم نسخ كود الطلب.", error: false }); } catch { setNote({ text: "حدد كود الطلب وانسخه يدوياً.", error: true }); } }}>نسخ كود الطلب</Button>
            <label className="ac-stack">كود التفعيل
              <textarea dir="ltr" rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="SFT-LIC-..." style={{ fontSize: 12 }} />
            </label>
            <Button type="button" disabled={busy || !code.trim()} onClick={async () => {
              setBusy(true); setNote({ text: "جارٍ التحقق من كود التفعيل…", error: false });
              try { const r = await activate({ data: { code } }); if (r.ok) { setNote({ text: `تم التفعيل باسم ${r.customer}.`, error: false }); setCode(""); load(); } else setNote({ text: r.error, error: true }); }
              catch { setNote({ text: "تعذر الاتصال بالخادم.", error: true }); } finally { setBusy(false); }
            }}>{busy ? "جارٍ التفعيل…" : "تفعيل"}</Button>
            {note.text ? <p role={note.error ? "alert" : "status"} className={`ac-message${note.error ? " error" : ""}`}>{note.text}</p> : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

/** «شاشة البيانات الأولى»: license + company name/logo + owner account, in one atomic submit. */
function Onboarding({ onDone }: { onDone: () => void }) {
  const setup = useServerFn(setupAdminFn);
  const [f, setF] = useState({ companyName: "", companyNameEn: "", logo: "", name: "", username: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false), [note, setNote] = useState({ text: "", error: false });
  const score = passwordStrength(f.password);
  const set = (k: keyof typeof f) => (e: { currentTarget: { value: string } }) => { const v = e.currentTarget.value; setF((p) => ({ ...p, [k]: v })); };
  return (
    <main className="access-center ac-login" dir="rtl" style={brandTheme}>
      <form className="ac-card ac-stack sp-onboarding" style={{ maxWidth: 560, width: "100%" }} onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget), val = (k: keyof typeof f) => (fd.has(k) ? String(fd.get(k) ?? "") : f[k]);
        const data = { ...f, companyName: normalizeCompanyName(val("companyName")), companyNameEn: normalizeEnglishName(val("companyNameEn")), name: val("name"), username: val("username"), password: val("password"), confirm: val("confirm") };
        const nameError = companyNameError(data.companyName);
        if (nameError) return setNote({ text: nameError, error: true });
        const enError = englishCompanyNameError(data.companyNameEn);
        if (enError) return setNote({ text: enError, error: true });
        if (data.password !== data.confirm) return setNote({ text: "تأكيد كلمة المرور غير مطابق.", error: true });
        setBusy(true); setNote({ text: "جارٍ حفظ بيانات الشركة وإنشاء حساب المسؤول…", error: false });
        try {
          const r = await setup({ data });
          if (!r.ok) { setNote({ text: r.error, error: true }); return; }
          setCompanyProfile({ name: data.companyName, logo: data.logo });
          setF((p) => ({ ...p, password: "", confirm: "" }));
          setNote({ text: r.loggedIn ? "تم الحفظ وتسجيل الدخول. جارٍ فتح البحث عن أجهزة البصمة…" : "تم الحفظ. سجّل الدخول للمتابعة.", error: false });
          setTimeout(onDone, 900);
        } catch { setNote({ text: "تعذر الاتصال بالخادم. أعد المحاولة.", error: true }); }
        finally { setBusy(false); }
      }}>
        <Brand company={false} subtitle="شاشة البيانات الأولى — إعداد البرنامج لشركتك" />
        <p className="ac-muted" style={{ margin: 0 }}>أول تشغيل على هذا الجهاز. لا توجد حسابات أو كلمات مرور افتراضية. كل البيانات هنا تُحفظ على هذا الخادم فقط.</p>
        <LicensePanel />
        <section className="sp-section" aria-label="بيانات الشركة">
          <h2>2. بيانات الشركة</h2>
          <Field label="اسم الشركة (يظهر في الواجهة وكل التقارير)" name="companyName" autoComplete="organization" value={f.companyName} onChange={set("companyName")} onCompositionEnd={set("companyName")} onBlur={set("companyName")} required maxLength={240} />
          <Field label="اسم الشركة بالإنجليزية (مطلوب — حروف إنجليزية وأرقام ومسافة و - و _)" name="companyNameEn" dir="ltr" autoComplete="off" value={f.companyNameEn} onChange={set("companyNameEn")} onBlur={set("companyNameEn")} required maxLength={60} pattern="[A-Za-z0-9][A-Za-z0-9 _\-]{1,59}" title="English letters, digits, space, - and _" />
          <LogoPicker value={f.logo} onChange={(logo) => setF((p) => ({ ...p, logo }))} onError={(m) => m && setNote({ text: m, error: true })} />
          {f.companyName.trim() ? <div><small className="ac-muted">معاينة: هكذا تظهر شركتك تحت إطار Speed</small><CompanyBadge profile={{ name: f.companyName.trim(), logo: f.logo }} /></div> : null}
        </section>
        <section className="sp-section" aria-label="حساب المسؤول">
          <h2>3. حساب المسؤول</h2>
          <Field label="اسم المسؤول" name="name" value={f.name} onChange={set("name")} required maxLength={80} autoComplete="name" />
          <Field label="اسم المستخدم" name="username" value={f.username} onChange={set("username")} required dir="ltr" autoComplete="username" pattern="[A-Za-z0-9_.\-]{3,32}" placeholder="owner" />
          <Field label="كلمة المرور (8 أحرف على الأقل)" type="password" name="password" value={f.password} onChange={set("password")} required minLength={8} maxLength={128} dir="ltr" autoComplete="new-password" />
          {f.password ? <p role="status" style={{ margin: 0, color: score < 3 ? "#9f1239" : "#3f6212" }}>قوة كلمة المرور: {levels[score]}{score < 3 ? " — أضف حروفاً كبيرة وأرقاماً أو رموزاً" : ""}</p> : null}
          <Field label="تأكيد كلمة المرور" type="password" name="confirm" value={f.confirm} onChange={set("confirm")} required dir="ltr" autoComplete="new-password" />
        </section>
        <Button type="submit" primary disabled={busy || score < 3 || !f.confirm}>{busy ? "جارٍ الحفظ…" : "حفظ والمتابعة إلى البحث عن الأجهزة"}</Button>
        {note.text ? <p role={note.error ? "alert" : "status"} className={`ac-message${note.error ? " error" : ""}`}>{note.text}</p> : null}
        <p className="sp-powered">برنامج من إنتاج Speed for Training</p>
      </form>
    </main>
  );
}
