type Probe = {
  path: string;
  http: number;
  recognized: boolean;
  nameCount: number;
};

type Entry = {
  key: string;
  found: boolean;
  count: number;
  diagnostics?: Probe[];
};

const sections = [
  {
    key: "person",
    ar: "الأشخاص",
    en: "Persons",
    note: "العدد المعروض عينة أسماء فقط، وليس إجمالي الموظفين. الصور والأرقام التفصيلية لم تُجرد بعد.",
  },
  {
    key: "department",
    ar: "الأقسام",
    en: "Departments",
    note: "لا توجد قراءة مؤكدة لشجرة الأقسام أو ارتباط كل موظف بقسمه.",
  },
  {
    key: "device",
    ar: "الأجهزة ونقاط الحضور",
    en: "Devices & Checkpoints",
    note: "القراءة الحالية تخص نقاط حضور محتملة. لا تعتبرها جردًا كاملًا للأجهزة.",
  },
  {
    key: "access",
    ar: "مستويات الوصول",
    en: "Access Levels",
    note: "مستوى الوصول ظاهر في الموقع الرسمي، لكن بنية استجابة API لم تُتحقق بعد.",
  },
  {
    key: "assignment",
    ar: "تعيينات الموظفين",
    en: "Assignments",
    note: "شوهدت تعيينات في Grant by Person، لكن لا يوجد قارئ API مؤكد لها داخل البرنامج.",
  },
  {
    key: "area",
    ar: "المناطق",
    en: "Areas",
    note: "قراءة المناطق غير مؤكدة. أسماء نقاط الحضور ليست دليلًا على إنشاء مناطق.",
  },
] as const;

export function TeamConfiguration({
  buttons,
}: {
  buttons: Entry[];
}) {
  return (
    <section
      className="mt-4 rounded-lg border border-brass bg-panel p-4"
      dir="rtl"
    >
      <h2 className="text-lg font-semibold">
        Configuration — الأشخاص والصلاحيات
      </h2>

      <p className="mt-2 text-sm text-muted">
        لوحة فحص للقراءة فقط. لا تنشئ أو تعدل أو تحذف
        موظفين أو أجهزة أو صلاحيات.
      </p>

      {!buttons.length ? (
        <p className="mt-3 text-sm text-muted">
          اضغط «اقرأ التيم» لعرض النتائج.
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {sections.map((section) => {
          const item = buttons.find(
            (button) => button.key === section.key
          );

          const sampleAllowed =
            section.key === "person" ||
            section.key === "department" ||
            section.key === "device";

          const sample =
            sampleAllowed && item?.found && item.count > 0
              ? item.count + " أسماء بالعينة"
              : "UNKNOWN";

          return (
            <article
              key={section.key}
              className="rounded-lg border border-line bg-canvas p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{section.ar}</h3>
                  <p className="text-xs text-muted" dir="ltr">
                    {section.en}
                  </p>
                </div>
                <span className="text-xs font-medium text-brass">
                  {sample}
                </span>
              </div>

              <p className="mt-3 text-sm leading-7 text-muted">
                {section.note}
              </p>

              {item?.diagnostics?.length ? (
                <details className="mt-3 text-xs text-muted">
                  <summary className="cursor-pointer">
                    تفاصيل قراءة API
                  </summary>

                  <ul className="mt-2 space-y-1 break-all" dir="ltr">
                    {item.diagnostics.map((probe) => (
                      <li key={probe.path}>
                        {probe.path}
                        {" | HTTP "}
                        {probe.http || "UNKNOWN"}
                        {" | "}
                        {probe.recognized
                          ? "READ_OK"
                          : "UNCONFIRMED"}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted">
        لا توجد عمليات Add أو Edit أو Delete أو Grant أو Sync
        في هذه المرحلة.
      </p>
    </section>
  );
}
