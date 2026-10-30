import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { companySetupSaveFn, companySetupStatusFn } from "@/lib/company-setup.functions";
import { centerLogoutFn } from "@/lib/access.functions";
import { Brand } from "./access-brand";
import { Button } from "./access-ui";
import { brandTheme } from "@/lib/brand";
import { LogoPicker, setCompanyProfile } from "./company-profile";
import { companyNameError, normalizeCompanyName } from "@/lib/company-name";

/** Wraps the app: once an admin is signed in on an install without a company profile, the company setup is mandatory. */
export function CompanySetupGate({ children }: { children: ReactNode }) {
  const status = useServerFn(companySetupStatusFn);
  const [needs, setNeeds] = useState(false), [user, setUser] = useState({ username: "", name: "" });
  useEffect(() => {
    let stop = false;
    const tick = () => status().then((s) => { if (stop) return; setUser({ username: s.username, name: s.name }); setNeeds(s.needs); }).catch(() => undefined);
    void tick();
    const t = setInterval(() => { if (!stop) void tick(); }, 4000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return <>{children}{needs ? <CompanySetupScreen user={user} onDone={() => setNeeds(false)} /> : null}</>;
}
function CompanySetupScreen({ user, onDone }: { user: { username: string; name: string }; onDone: () => void }) {
  const save = useServerFn(companySetupSaveFn), logout = useServerFn(centerLogoutFn);
  const [f, setF] = useState({ companyName: "", logo: "", displayName: "", newUsername: "", newPassword: "", confirm: "" });
  const [creds, setCreds] = useState(false), [busy, setBusy] = useState(false), [note, setNote] = useState({ text: "", error: false });
  // Functional updates: an async callback (logo decoding, IME commit) can never overwrite newer fields with a stale copy.
  const set = (k: keyof typeof f) => (e: { currentTarget: { value: string } }) => { const v = e.currentTarget.value; setF((p) => ({ ...p, [k]: v })); };
  return (
    <div className="access-center" dir="rtl" style={{ ...brandTheme, position: "fixed", inset: 0, zIndex: 9000, overflow: "auto", background: "var(--sp-navy, #0B2242)", padding: 16 }}>
      <form className="ac-card ac-stack" style={{ maxWidth: 560, margin: "24px auto" }} onSubmit={async (e) => {
        e.preventDefault();
        // Read what is really in the inputs at submit time (Android IMEs may not have committed into React state yet).
        const fd = new FormData(e.currentTarget), val = (k: keyof typeof f) => (fd.has(k) ? String(fd.get(k) ?? "") : f[k]);
        const data = { ...f, companyName: normalizeCompanyName(val("companyName")), displayName: val("displayName"), newUsername: creds ? val("newUsername") : "", newPassword: creds ? val("newPassword") : "", confirm: creds ? val("confirm") : "" };
        const nameError = companyNameError(data.companyName);
        if (nameError) return setNote({ text: nameError, error: true });
        if (creds && data.newPassword !== data.confirm) return setNote({ text: "تأكيد كلمة المرور غير مطابق.", error: true });
        setF((p) => ({ ...p, companyName: data.companyName }));
        setBusy(true); setNote({ text: "جارٍ الحفظ…", error: false });
        try {
          const r = await save({ data });
          if (!r.ok) return setNote({ text: r.error, error: true });
          setCompanyProfile({ name: data.companyName, logo: data.logo });
          if (r.credentialsChanged) {
            setNote({ text: `تم الحفظ. سجّل الدخول من جديد باسم المستخدم ${r.username}.`, error: false });
            await logout().catch(() => undefined); sessionStorage.removeItem("skyline-gate");
            setTimeout(() => location.reload(), 1500);
          } else { onDone(); location.reload(); }
        } catch { setNote({ text: "تعذر الاتصال بالخادم. حاول تاني.", error: true }); }
        finally { setBusy(false); }
      }}>
        <Brand />
        <h1 style={{ fontSize: 22, margin: 0 }}>بيانات شركتك</h1>
        <p className="ac-muted" style={{ margin: 0 }}>خطوة واحدة مطلوبة قبل الاستخدام: اسم الشركة وشعارها يظهروا تحت إطار Speed وفي كل التقارير. بياناتك وأجهزتك وموظفينك محفوظين زي ما هم.</p>
        <label className="ac-field"><span>اسم الشركة</span><input name="companyName" required maxLength={240} autoComplete="organization" value={f.companyName} onChange={set("companyName")} onCompositionEnd={set("companyName")} onBlur={set("companyName")} /></label>
        <LogoPicker value={f.logo} onChange={(logo) => setF((p) => ({ ...p, logo }))} onError={(m) => m && setNote({ text: m, error: true })} />
        <label className="ac-field"><span>اسم المسؤول الظاهر (اختياري)</span><input name="displayName" maxLength={80} value={f.displayName} placeholder={user.name} onChange={set("displayName")} /></label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={creds} onChange={(e) => setCreds(e.target.checked)} /> تغيير اسم المستخدم أو كلمة المرور (الحالي: <b dir="ltr">{user.username}</b>)</label>
        {creds ? <>
          <label className="ac-field"><span>اسم المستخدم الجديد (اختياري)</span><input dir="ltr" name="newUsername" autoComplete="username" value={f.newUsername} onChange={set("newUsername")} placeholder={user.username} /></label>
          <label className="ac-field"><span>كلمة المرور الجديدة (اختياري)</span><input dir="ltr" type="password" name="newPassword" autoComplete="new-password" value={f.newPassword} onChange={set("newPassword")} /></label>
          <label className="ac-field"><span>تأكيد كلمة المرور</span><input dir="ltr" type="password" name="confirm" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} /></label>
        </> : null}
        <Button type="submit" primary disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ والمتابعة"}</Button>
        {note.text ? <p role={note.error ? "alert" : "status"} className={`ac-message${note.error ? " error" : ""}`}>{note.text}</p> : null}
      </form>
    </div>
  );
}
