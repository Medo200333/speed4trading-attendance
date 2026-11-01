import { useState } from "react";
import {
  ArrowLeft, Cable, CalendarRange, Check, Cloud, Download, FileSpreadsheet, FileText, Fingerprint,
  KeyRound, MousePointerClick, Network, Plus, RefreshCw, Save, Server, UserRound, type LucideIcon,
} from "lucide-react";
import { useCenter } from "./access-ui";

/** Picture guide (iVMS-4200 style): every step is a big picture made of icons, with one short line. */
type Step = { icons: LucideIcon[]; text: string; color: string };
type Guide = { id: string; title: string; icon: LucideIcon; tab: string; steps: Step[] };

const GUIDES: Guide[] = [
  { id: "device", title: "إضافة جهاز بصمة", icon: Server, tab: "devices", steps: [
    { icons: [Cable, Network], text: "وصّل الجهاز بنفس شبكة الكمبيوتر", color: "#1d5ed8" },
    { icons: [Server, Plus], text: "افتح «الأجهزة» واضغط زر +", color: "#0f766e" },
    { icons: [Network], text: "اكتب عنوان IP المكتوب على شاشة الجهاز", color: "#7c3aed" },
    { icons: [UserRound, KeyRound], text: "اكتب اسم الدخول وكلمة مرور الجهاز", color: "#b45309" },
    { icons: [Save, Check], text: "اضغط حفظ — تظهر علامة ✓ خضراء", color: "#15803d" },
  ] },
  { id: "teams", title: "ربط حساب Hik-Connect Team", icon: Cloud, tab: "teams", steps: [
    { icons: [Cloud], text: "افتح صفحة «Hik-Connect Team»", color: "#1d5ed8" },
    { icons: [UserRound, KeyRound], text: "اكتب إيميل وكلمة مرور حساب Team", color: "#b45309" },
    { icons: [MousePointerClick, Check], text: "اضغط دخول — تظهر صور الموظفين", color: "#15803d" },
  ] },
  { id: "pull", title: "سحب الحضور", icon: RefreshCw, tab: "teams", steps: [
    { icons: [CalendarRange], text: "اختر من يوم … إلى يوم", color: "#7c3aed" },
    { icons: [RefreshCw], text: "اضغط زر السحب وانتظر", color: "#1d5ed8" },
    { icons: [Fingerprint, Check], text: "تظهر البصمات الحقيقية لهذه الفترة الآن", color: "#15803d" },
  ] },
  { id: "export", title: "تصدير التقرير", icon: FileText, tab: "teams", steps: [
    { icons: [RefreshCw, Check], text: "اسحب الحضور أولاً (الخطوة السابقة)", color: "#1d5ed8" },
    { icons: [FileText], text: "زر PDF = تقرير للطباعة بالصور", color: "#a13b32" },
    { icons: [FileSpreadsheet], text: "زر Excel = جدول بالأسماء والأوقات", color: "#15803d" },
    { icons: [Download, Save], text: "اختر مكان الحفظ واضغط حفظ", color: "#0f766e" },
  ] },
];

export function PictureGuide() {
  const { navigate } = useCenter();
  const [open, setOpen] = useState<string>("");
  const [step, setStep] = useState(0);
  const guide = GUIDES.find((g) => g.id === open);
  return (
    <section className="pg-guide" aria-label="الدليل المصور">
      <h2>الدليل المصور</h2>
      <div className="pg-tiles">
        {GUIDES.map((g, i) => (
          <button key={g.id} type="button" className={`pg-tile${open === g.id ? " on" : ""}`} onClick={() => { setOpen(g.id); setStep(0); }}>
            <span className="pg-num">{i + 1}</span>
            <g.icon size={56} strokeWidth={1.6} aria-hidden />
            <b>{g.title}</b>
          </button>
        ))}
      </div>
      {guide && (
        <div className="pg-steps">
          <div className="pg-dots">{guide.steps.map((_, i) => <button key={i} type="button" aria-label={`الخطوة ${i + 1}`} className={i === step ? "on" : i < step ? "done" : ""} onClick={() => setStep(i)}>{i < step ? "✓" : i + 1}</button>)}</div>
          {(() => { const s = guide.steps[step]; return (
            <figure className="pg-picture" style={{ borderColor: s.color }}>
              <div className="pg-icons" style={{ color: s.color }}>
                {s.icons.map((I, k) => <span key={k}>{k > 0 && <ArrowLeft size={40} aria-hidden className="pg-arrow" />}<I size={110} strokeWidth={1.4} aria-hidden /></span>)}
              </div>
              <figcaption>{s.text}</figcaption>
            </figure>
          ); })()}
          <div className="pg-nav">
            <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>→ السابق</button>
            {step < guide.steps.length - 1
              ? <button type="button" className="pri" onClick={() => setStep(step + 1)}>التالي ←</button>
              : <button type="button" className="pri" onClick={() => navigate(guide.tab)}><guide.icon size={22} aria-hidden /> ابدأ الآن</button>}
          </div>
        </div>
      )}
    </section>
  );
}
