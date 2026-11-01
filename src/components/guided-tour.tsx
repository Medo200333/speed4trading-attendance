import { useEffect, useState } from "react";

const STEPS: { title: string; body: string }[] = [
  { title: "أهلاً بيك في speed4trading", body: "الجولة دي بتعرّفك على كل قسم في البرنامج في أقل من دقيقة. تقدر تقفلها في أي وقت وتفتحها تاني من «دليل البداية السريعة»." },
  { title: "الرئيسية", body: "ملخص سريع: عدد الموظفين، الأجهزة الشغالة، وأحداث النهارده. ومنها تبدأ إعداد أول جهاز." },
  { title: "الأجهزة", body: "ضيف أجهزة البصمة (عنوان IP وحساب الجهاز)، افحص الاتصال، اسحب البصمات من الجهاز مباشرة، وظبط وقت الجهاز." },
  { title: "Hik-Connect Team", body: "صفحة مستقلة تماماً: تدخل بحساب موقع Hik-Connect Team وتسحب الحركات والتقارير من النت، حتى لو أجهزة الفروع مقفولة ومن غير Tailscale." },
  { title: "الموظفون ووسائل التحقق", body: "قائمة الموظفين، صورهم، وإضافة/مسح البصمة والوجه والكارت (بعد تأكيدك)." },
  { title: "الحضور والانصراف والتقارير", body: "أول وآخر بصمة ومدة الحضور لكل موظف يومياً، والتصدير Excel و PDF بالصور." },
  { title: "الإعدادات", body: "المستخدمين والصلاحيات (أدمن، محاسب للتقارير بس، مدير لشاشة «مين حضر النهارده»)، الترخيص، والنسخ الاحتياطي. النسخة التجريبية 30 يوم." },
];
const KEY = "s4t-tour-done-v1";

export function GuidedTour({ forceOpen = 0 }: { forceOpen?: number }) {
  const [step, setStep] = useState(-1);
  useEffect(() => { try { if (!localStorage.getItem(KEY)) setStep(0); } catch { /* ignore */ } }, []);
  useEffect(() => { if (forceOpen) setStep(0); }, [forceOpen]);
  if (step < 0) return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } setStep(-1); };
  const s = STEPS[step];
  return (
    <div className="ac-tour-backdrop" role="dialog" aria-modal="true" aria-label="جولة تعريفية">
      <div className="ac-tour-card">
        <small>{step + 1} / {STEPS.length}</small>
        <h2>{s.title}</h2>
        <p>{s.body}</p>
        <div className="ac-tour-actions">
          <button type="button" onClick={close}>تخطي</button>
          {step > 0 && <button type="button" onClick={() => setStep(step - 1)}>السابق</button>}
          <button type="button" className="primary" onClick={() => (step + 1 < STEPS.length ? setStep(step + 1) : close())}>
            {step + 1 < STEPS.length ? "التالي" : "يلا نبدأ"}
          </button>
        </div>
      </div>
    </div>
  );
}
