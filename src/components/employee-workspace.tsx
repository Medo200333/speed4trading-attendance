import { useEffect, useState } from "react";
import { isEnglishName, hasArabic, type Device, type Person } from "@/lib/access/domain";
import type { Confirmation } from "@/lib/access/contracts";
import {
  useCenter,
  Button,
  Field,
  Modal,
  supported,
  dateToday,
  PersonAvatar,
} from "./access-ui";
import { StepProgress } from "./access-brand";
import { InlineDeviceConnection } from "./inline-device-connection";
import { CredentialsPanel } from "./access-workflows";
export function EmployeeWorkspace({
  person,
  device,
  onClose,
}: {
  person?: Person;
  device?: Device;
  onClose: () => void;
}) {
  const { data, busy, workActive, run, select, selected } = useCenter();
  const [deviceId, setDeviceId] = useState(device?.id || selected),
    [step, setStep] = useState(0),
    [confirmation, setConfirmation] = useState<Confirmation>(),
    [phrase, setPhrase] = useState(""),
    [error, setError] = useState(""),
    [connection, setConnection] = useState(false);
  const [draft, setDraft] = useState({
    employeeNo: person?.employeeNo || "",
    name: person && isEnglishName(person.name) ? person.name : "",
    arabicName: person?.arabicName || (person && hasArabic(person.name) ? person.name : ""),
    begin: person?.validity?.beginTime.slice(0, 10) || dateToday(),
    end: person?.validity?.endTime.slice(0, 10) || "2037-12-31",
    permanent: person?.validity?.enable === false,
    grantDoor: !person,
  });
  const STEPS = [
    "بيانات الموظف",
    "مراجعة وحفظ على الجهاز",
    "الصورة / الوجه",
    "البصمة",
    "إذن الباب",
    "التحقق من الجهاز",
    "تم",
  ];
  // Guided wizard: once anything was sent to the device, leaving early needs an explicit confirmation.
  function leave() {
    if (step === 0 || step >= 6) return onClose();
    if (
      window.confirm(
        step === 1
          ? "لم يُحفظ الموظف على الجهاز بعد. هل تريد إلغاء الإضافة والخروج؟"
          : "إعداد الموظف لم يكتمل (الصورة/البصمة/الباب/التحقق). الموظف محفوظ على الجهاز كمسودة ويمكنك إكماله لاحقاً من «الموظفون». هل تريد الخروج الآن؟",
      )
    )
      onClose();
  }
  const target = data.devices.find((d) => d.id === deviceId),
    saved = data.people.find(
      (p) => p.deviceId === deviceId && p.employeeNo === draft.employeeNo,
    );
  async function preview() {
    if (!target) return;
    setError("");
    const result = await run(
      {
        action: "prepare",
        operation: {
          kind: person ? "editPerson" : "addPerson",
          deviceId,
          person: draft,
        },
      },
      { inline: true, onError: setError },
    );
    if (result?.confirmation) {
      setConfirmation(result.confirmation);
      setPhrase("");
      setStep(1);
    }
  }
  return (
    <>
      <Modal
        title={
          step === 1 && confirmation
            ? confirmation.title
            : step === 2
              ? "إعداد الموظف ووسائل التحقق"
              : person
                ? "تعديل موظف الجهاز"
                : "إضافة موظف"
        }
        busy={busy || workActive}
        onClose={leave}
      >
        <StepProgress steps={STEPS} current={step} />
        <p className="ac-muted">
          الشركة: {data.company?.nameAr || "—"}
        </p>
        {error && (
          <p role="alert" className="ac-message error">
            {error}
          </p>
        )}
        {step === 0 ? (
          <form
            className="ac-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void preview();
            }}
          >
            <Field label="جهاز الموظف">
              <select
                value={deviceId}
                disabled={Boolean(person) || busy}
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  select(e.target.value);
                }}
              >
                {data.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.model || "هوية غير مقروءة"}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="رقم الموظف الفريد"
              value={draft.employeeNo}
              onChange={(e) =>
                setDraft({ ...draft, employeeNo: e.target.value })
              }
              required
              readOnly={Boolean(person)}
              maxLength={32}
              dir="ltr"
            />
            {person && !isEnglishName(person.name) ? (
              <p role="status" className="ac-message">
                هذا الموظف بلا اسم إنجليزي على الجهاز. اكتب الاسم الإنجليزي ثم احفظ؛ لن يُكتب شيء على الجهاز قبل تأكيدك.
              </p>
            ) : null}
            <Field
              label="الاسم بالإنجليزية (يُحفظ على الجهاز ويظهر في التقارير)"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              maxLength={32}
              pattern="[A-Za-z0-9 .'\-]*[A-Za-z][A-Za-z0-9 .'\-]*"
              title="حروف لاتينية وأرقام ومسافة و . - ' فقط"
              placeholder="Employee Name"
              dir="ltr"
              lang="en"
            />
            {draft.name && !isEnglishName(draft.name) ? (
              <p role="alert" className="ac-message error">
                الاسم على الجهاز بالإنجليزية فقط (حروف لاتينية وأرقام ومسافة و . - &apos;).
              </p>
            ) : null}
            <Field
              label="الاسم بالعربية (اختياري، داخل البرنامج فقط)"
              value={draft.arabicName}
              onChange={(e) => setDraft({ ...draft, arabicName: e.target.value })}
              maxLength={64}
            />
            <details>
              <summary>فترة الصلاحية على الجهاز</summary>
              <div className="ac-fields">
                <Field
                  label="بداية الصلاحية"
                  type="date"
                  required
                  value={draft.begin}
                  onChange={(e) =>
                    setDraft({ ...draft, begin: e.target.value })
                  }
                />
                <Field
                  label="نهاية الصلاحية"
                  type="date"
                  required
                  max="2037-12-31"
                  value={draft.end}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
              </div>
              <label className="ac-check">
                <input
                  type="checkbox"
                  checked={draft.permanent}
                  onChange={(e) =>
                    setDraft({ ...draft, permanent: e.target.checked })
                  }
                />
                صلاحية دائمة (ليست تعطيل المستخدم)
              </label>
            </details>
            <label className="ac-check">
              <input
                type="checkbox"
                checked={draft.grantDoor}
                disabled={!supported(target, "permissions")}
                onChange={(e) =>
                  setDraft({ ...draft, grantDoor: e.target.checked })
                }
              />
              منح إذن الباب 1 بقالب الوقت 1 (طوال اليوم) حسب دليل التشغيل
            </label>
            <p>
              بعد الحفظ ستكمل: الصورة/الوجه ← البصمة ← إذن الباب ← التحقق من
              الجهاز. لا يمكنك الخروج قبل الإكمال إلا بتأكيد.
            </p>
            <div className="ac-actions">
              <Button
                primary
                type="submit"
                disabled={
                  busy ||
                  !isEnglishName(draft.name) ||
                  data.actor.role !== "admin" ||
                  !supported(target, person ? "users.edit" : "users.add")
                }
              >
                معاينة التغيير على الجهاز
              </Button>
              <Button
                onClick={() => setConnection(true)}
                disabled={!target || busy}
              >
                الاتصال بالجهاز من هنا
              </Button>
              <Button onClick={leave} disabled={busy}>
                إلغاء
              </Button>
            </div>
          </form>
        ) : step === 1 && confirmation ? (
          <div className="ac-stack">
            <p>{confirmation.description}</p>
            {confirmation.warnings.map((w, i) => (
              <p className="ac-message warning" key={i}>
                {w}
              </p>
            ))}
            <Field
              label={`اكتب: ${confirmation.phrase}`}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
            />
            <div className="ac-actions">
              <Button
                primary
                disabled={busy || phrase.trim() !== confirmation.phrase}
                onClick={async () => {
                  setError("");
                  const result = await run(
                    { action: "commit", token: confirmation.token, phrase },
                    { inline: true, onError: setError },
                  );
                  if (result) {
                    select(deviceId);
                    setStep(2);
                    setConfirmation(undefined);
                  }
                }}
              >
                تأكيد وإرسال إلى الجهاز
              </Button>
              <Button disabled={busy} onClick={() => setStep(0)}>
                تعديل المدخلات وإعادة المعاينة
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    {
                      action: "sync",
                      deviceId,
                      start: dateToday(),
                      end: dateToday(),
                      usersOnly: true,
                    },
                    { inline: true, onError: setError },
                  )
                }
              >
                إعادة قراءة الموظفين فقط
              </Button>
            </div>
          </div>
        ) : step === 2 ? (
          <div className="ac-stack">
            <p role="status" className="ac-message success">
              حُفظ الموظف وأعيدت قراءته من الجهاز. أضف صورة/وجه الموظف (من
              الكاميرا أو الهاتف أو كاميرا الجهاز).
            </p>
            {saved ? (
              <CredentialsPanel initialPersonId={saved.id} embedded />
            ) : (
              <p role="status">جارٍ تحديث بيانات الموظف المقروءة…</p>
            )}
            <div className="ac-actions">
              <Button primary disabled={busy || workActive} onClick={() => setStep(3)}>
                التالي: البصمة
              </Button>
            </div>
          </div>
        ) : step === 3 ? (
          <FingerprintStep deviceId={deviceId} employeeNo={draft.employeeNo} onNext={() => setStep(4)} />
        ) : step === 4 ? (
          <DoorStep
            deviceId={deviceId}
            draft={draft}
            onNext={() => setStep(5)}
            onError={setError}
          />
        ) : step === 5 ? (
          <VerifyStep deviceId={deviceId} draft={draft} onBack={setStep} onNext={() => setStep(6)} onError={setError} />
        ) : (
          <div className="ac-stack">
            <p role="status" className="ac-message success">
              اكتمل إعداد الموظف {draft.name} ({draft.employeeNo}) وتحققنا منه على الجهاز.
            </p>
            {saved && <PersonAvatar person={saved} size={96} />}
            <Button primary onClick={onClose}>إنهاء</Button>
          </div>
        )}
      </Modal>
      {connection && target && (
        <InlineDeviceConnection
          device={target}
          onClose={() => setConnection(false)}
        />
      )}
    </>
  );
}

type Draft = { employeeNo: string; name: string; arabicName: string; begin: string; end: string; permanent: boolean; grantDoor: boolean };
function FingerprintStep({ deviceId, employeeNo, onNext }: { deviceId: string; employeeNo: string; onNext: () => void }) {
  const { read, run, busy, data } = useCenter();
  const [info, setInfo] = useState<{ supported: boolean; count: number | null; reason: string }>();
  const [error, setError] = useState("");
  async function load() {
    setError("");
    const r = await read({ action: "fingerprint", deviceId, employeeNo }, true);
    if (r && "fingerprint" in r) setInfo(r.fingerprint as typeof info);
    else setError("تعذر قراءة حالة البصمة من الجهاز. تحقق من الاتصال ثم أعد القراءة.");
  }
  useEffect(() => { void load(); }, [deviceId, employeeNo]);
  return (
    <div className="ac-stack">
      {error && <p role="alert" className="ac-message error">{error}</p>}
      {!info ? <p role="status">جارٍ فحص دعم البصمة على الجهاز…</p> : (
        <>
          <p className={`ac-message ${info.supported ? "success" : "warning"}`}>{info.reason}</p>
          <p>بصمات الإصبع المسجلة للموظف على الجهاز: <strong>{info.count ?? "غير متاح على هذا الطراز"}</strong></p>
        </>
      )}
      <div className="ac-actions">
        {info?.supported && (
          <Button primary disabled={busy || data.actor.role !== "admin"} onClick={async () => {
            setError("");
            await run({ action: "fingerprint.enroll", deviceId, employeeNo, fingerNo: Math.min(10, (info.count || 0) + 1) }, { inline: true, onError: setError });
            await load();
          }}>إضافة بصمة (التقاط من حساس الجهاز)</Button>
        )}
        {info?.supported && Boolean(info.count) && (
          <Button disabled={busy || data.actor.role !== "admin"} onClick={async () => {
            if (!window.confirm(`حذف كل بصمات الموظف ${employeeNo} من الجهاز؟`)) return;
            setError("");
            await run({ action: "fingerprint.delete", deviceId, employeeNo }, { inline: true, onError: setError });
            await load();
          }}>مسح بصمات الموظف</Button>
        )}
        <Button disabled={busy} onClick={() => void load()}>إعادة القراءة</Button>
        <Button primary={!info?.supported} disabled={busy} onClick={onNext}>
          {info?.supported && !info.count ? "تخطي البصمة والمتابعة" : "التالي: إذن الباب"}
        </Button>
      </div>
    </div>
  );
}
function DoorStep({ deviceId, draft, onNext, onError }: { deviceId: string; draft: Draft; onNext: () => void; onError: (m: string) => void }) {
  const { data, run, busy } = useCenter();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [phrase, setPhrase] = useState("");
  const saved = data.people.find((p) => p.deviceId === deviceId && p.employeeNo === draft.employeeNo);
  const hasDoor = Boolean(saved && String(saved.doorRight || "").split(",").includes("1"));
  const hasPlan = Boolean(saved?.rightPlan?.some((p) => String(p.planTemplateNo || "").split(",").includes("1")));
  return (
    <div className="ac-stack">
      <p>حسب دليل التشغيل: إذن الباب 1 (doorRight=1) مع قالب الوقت 1 (RightPlan) خلال فترة الصلاحية {draft.permanent ? "الدائمة" : `${draft.begin} ← ${draft.end}`}.</p>
      <ul>
        <li>إذن الباب 1: <strong>{hasDoor ? "موجود ✓" : "غير موجود"}</strong></li>
        <li>قالب الوقت 1: <strong>{hasPlan ? "موجود ✓" : "غير موجود"}</strong></li>
      </ul>
      {confirmation ? (
        <>
          <p>{confirmation.description}</p>
          <Field label={`اكتب: ${confirmation.phrase}`} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
          <Button primary disabled={busy || phrase.trim() !== confirmation.phrase} onClick={async () => {
            const r = await run({ action: "commit", token: confirmation.token, phrase }, { inline: true, onError });
            if (r) { setConfirmation(undefined); await run({ action: "sync", deviceId, start: dateToday(), end: dateToday(), usersOnly: true }, { inline: true, onError }); }
          }}>تأكيد إرسال إذن الباب</Button>
        </>
      ) : (
        <div className="ac-actions">
          {!(hasDoor && hasPlan) && (
            <Button primary disabled={busy || data.actor.role !== "admin"} onClick={async () => {
              const r = await run({ action: "prepare", operation: { kind: "editPerson", deviceId, person: { ...draft, grantDoor: true } } }, { inline: true, onError });
              if (r?.confirmation) { setConfirmation(r.confirmation); setPhrase(""); }
            }}>منح إذن الباب 1 بالقالب 1</Button>
          )}
          <Button primary={hasDoor && hasPlan} disabled={busy} onClick={onNext}>التالي: التحقق من الجهاز</Button>
        </div>
      )}
    </div>
  );
}
function VerifyStep({ deviceId, draft, onBack, onNext, onError }: { deviceId: string; draft: Draft; onBack: (s: number) => void; onNext: () => void; onError: (m: string) => void }) {
  const { data, run, read, busy } = useCenter();
  const [fp, setFp] = useState<{ supported: boolean; count: number | null }>();
  const [checked, setChecked] = useState(false);
  async function verify() {
    await run({ action: "sync", deviceId, start: dateToday(), end: dateToday(), usersOnly: true }, { inline: true, onError });
    const r = await read({ action: "fingerprint", deviceId, employeeNo: draft.employeeNo }, true);
    if (r && "fingerprint" in r) setFp(r.fingerprint as typeof fp);
    setChecked(true);
  }
  useEffect(() => { void verify(); }, []);
  const saved = data.people.find((p) => p.deviceId === deviceId && p.employeeNo === draft.employeeNo);
  const rows: [string, boolean, string, number][] = [
    ["الموظف موجود على الجهاز بنفس الرقم والاسم", Boolean(saved && saved.name.trim() === draft.name.trim()), saved ? `${saved.employeeNo} · ${saved.name}` : "غير موجود", 0],
    ["صورة/وجه مسجل", Boolean(saved?.faceCount), `${saved?.faceCount ?? 0}`, 2],
    ["البصمة", fp ? (!fp.supported || Boolean(fp.count)) : false, fp ? (fp.supported ? `${fp.count ?? 0} بصمة` : "الطراز لا يدعم البصمة (وجه فقط)") : "…", 3],
    ["إذن الباب 1 وقالب الوقت 1", Boolean(saved && String(saved.doorRight || "").split(",").includes("1") && saved.rightPlan?.some((p) => String(p.planTemplateNo || "").split(",").includes("1"))), saved ? `doorRight=${saved.doorRight || "—"}` : "—", 4],
  ];
  const ok = rows.every((r) => r[1]);
  return (
    <div className="ac-stack">
      {!checked ? <p role="status">جارٍ إعادة قراءة الموظف من الجهاز…</p> : (
        <ul className="ac-stack">
          {rows.map(([label, good, value, back]) => (
            <li key={label}>
              <strong>{good ? "✓" : "✗"}</strong> {label}: <bdi>{value}</bdi>
              {!good && back > 0 && <> · <Button onClick={() => onBack(back)}>رجوع لهذه الخطوة</Button></>}
            </li>
          ))}
        </ul>
      )}
      <div className="ac-actions">
        <Button disabled={busy} onClick={() => void verify()}>إعادة التحقق</Button>
        <Button primary disabled={busy || !checked || !ok} onClick={onNext}>تم — إنهاء الإضافة</Button>
      </div>
      {checked && !ok && <p className="ac-message warning">أكمل البنود المعلمة ✗ أو ارجع لها. الخروج الآن يترك الموظف كمسودة.</p>}
    </div>
  );
}
