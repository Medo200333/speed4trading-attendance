import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { companyFn } from "@/lib/company.functions";
import { Button, Card, Field, useCenter } from "./access-ui";
import { LogoPicker, setCompanyProfile } from "./company-profile";
import { profileFrom } from "@/lib/company-profile";
import { companyNameError, normalizeCompanyName } from "@/lib/company-name";

/** Settings → company identity (admin only): name + logo used in the header, login screen and every report. */
export function CompanyIdentityCard() {
  const { data, refresh } = useCenter();
  const save = useServerFn(companyFn);
  const c = data.company;
  const [name, setName] = useState(c?.nameAr && c.nameAr !== "الشركة الحالية" ? c.nameAr : "");
  const [logo, setLogo] = useState(c?.logo || "");
  const [busy, setBusy] = useState(false), [note, setNote] = useState({ text: "", error: false });
  if (data.actor.role !== "admin" || !c) return null;
  return (
    <Card title="هوية الشركة في البرنامج والتقارير">
      <form className="ac-stack" onSubmit={async (e) => {
        e.preventDefault();
        const typed = normalizeCompanyName(new FormData(e.currentTarget).get("companyName") ?? name);
        const nameError = companyNameError(typed);
        if (nameError) return setNote({ text: nameError, error: true });
        setName(typed);
        setBusy(true); setNote({ text: "جارٍ الحفظ…", error: false });
        try {
          const r = await save({ data: { action: "company.save", company: { id: c.id, nameAr: typed, nameEn: c.nameEn || "", address: c.address || "", contact: c.contact || "", logo } } });
          if (!r.ok) return setNote({ text: r.error, error: true });
          setCompanyProfile(profileFrom({ nameAr: typed, logo }));
          await refresh();
          setNote({ text: "تم حفظ اسم الشركة وشعارها. ستظهر في الواجهة وكل التقارير الجديدة.", error: false });
        } catch { setNote({ text: "تعذر الحفظ. أعد المحاولة.", error: true }); } finally { setBusy(false); }
      }}>
        <Field label="اسم الشركة" name="companyName" autoComplete="organization" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.currentTarget.value)} onCompositionEnd={(e: React.CompositionEvent<HTMLInputElement>) => setName(e.currentTarget.value)} required maxLength={240} />
        <LogoPicker value={logo} onChange={setLogo} onError={(m) => m && setNote({ text: m, error: true })} />
        <Button primary type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ هوية الشركة"}</Button>
        {note.text ? <p role={note.error ? "alert" : "status"} className={`ac-message${note.error ? " error" : ""}`}>{note.text}</p> : null}
      </form>
    </Card>
  );
}
