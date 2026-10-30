import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  biometricInspectFn,
  biometricPrepareFn,
  biometricCommitFn,
  biometricCancelFn,
  biometricStatusFn,
} from "@/lib/biometric.functions";
import {
  initialBioInspection,
  type BioInspection,
  type BioSupport,
} from "@/lib/access/biometric-status";
import type { Device, Person } from "@/lib/access/domain";
import { FacePhotoEditor } from "./face-photo-editor";
import { InlineDeviceConnection } from "./inline-device-connection";
import { StepProgress } from "./access-brand";
import { Button, Card, Field, Modal, useCenter, When } from "./access-ui";
type Prepared = Extract<
  Awaited<ReturnType<typeof biometricPrepareFn>>,
  { ok: true }
>["data"];
const labels: Record<BioSupport["state"], string> = {
  ready: "جاهز",
  "needs-login": "يحتاج تسجيل دخول",
  "needs-device": "يحتاج خطوة على الجهاز",
  unsupported: "غير مدعوم",
  "needs-check": "يحتاج فحص قراءة",
};
function Support({ value }: { value: BioSupport }) {
  return (
    <p className="ac-message">
      <strong>{labels[value.state]}</strong> · {value.reason}
    </p>
  );
}
export function EmployeeBiometrics({
  person,
  device,
  selection,
}: {
  person: Person;
  device: Device;
  selection?: ReactNode;
}) {
  const { data, busy, refresh, modal, setWorkPending } = useCenter();
  const inspect = useServerFn(biometricInspectFn),
    prepare = useServerFn(biometricPrepareFn),
    commit = useServerFn(biometricCommitFn),
    cancel = useServerFn(biometricCancelFn),
    poll = useServerFn(biometricStatusFn);
  const [inspection, setInspection] = useState<BioInspection>(),
    [working, setWorking] = useState(false),
    [photo, setPhoto] = useState<string | null>(null),
    [reset, setReset] = useState(0),
    [replaceExisting, setReplace] = useState(false),
    [prepared, setPrepared] = useState<Prepared>(),
    [phrase, setPhrase] = useState(""),
    [jobId, setJobId] = useState(""),
    [jobSource, setJobSource] = useState<"phone" | "terminal">("phone"),
    [job, setJob] = useState<{
      phase: string;
      message: string;
      progress: number;
    }>(),
    [error, setError] = useState(""),
    [loginNeeded, setLoginNeeded] = useState(false),
    [step, setStep] = useState(0),
    [source, setSource] = useState<"phone" | "terminal">("phone"),
    [imageReady, setImageReady] = useState(false),
    [imageSelected, setImageSelected] = useState(false),
    [atDevice, setAtDevice] = useState(false);
  const companyId = data.companyId;
  const [connection, setConnection] = useState(false);
  const pendingToken = useRef("");
  const admin = data.actor.role === "admin",
    state = inspection || initialBioInspection(device, person.employeeNo),
    locked = working || job?.phase === "running";
  useEffect(() => {
    const key = `face:${device.id}:${person.employeeNo}`;
    setWorkPending(key, step > 0 && (!job || job.phase === "running"));
    return () => setWorkPending(key, false);
  }, [step, job?.phase]);
  useEffect(
    () => () => {
      if (pendingToken.current)
        void cancel({ data: { companyId, token: pendingToken.current } });
    },
    [],
  );
  useEffect(() => {
    if (!jobId) return;
    let current = true,
      inFlight = false,
      done = false;
    const read = async () => {
      if (inFlight || done) return;
      inFlight = true;
      try {
        const result = await poll({ data: { companyId, jobId, stop: false } });
        if (!current) return;
        if (!result.ok) {
          setError(result.error);
          done = true;
          return;
        }
        setJob(result.data);
        if (result.data.phase !== "running") {
          done = true;
          if (result.data.phase === "verified") {
            setInspection((previous) =>
              previous
                ? { ...previous, facePresent: true, faceCount: 1 }
                : previous,
            );
            await refresh();
          }
        }
      } catch {
        if (current)
          setError(
            "تعذرت متابعة التسجيل. لا تعاود الإرسال قبل فحص حالة الجهاز.",
          );
      } finally {
        inFlight = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 1000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [jobId]);
  function failure(text: string, code = "") {
    setError(text);
    setLoginNeeded(
      ["LOGIN_REQUIRED", "CREDENTIAL_REQUIRED", "DEVICE_AUTH"].includes(code),
    );
  }
  async function load() {
    setWorking(true);
    setError("");
    try {
      const result = await inspect({
        data: { companyId, deviceId: device.id, employeeNo: person.employeeNo },
      });
      if (result.ok) {
        setInspection(result.data);
        setLoginNeeded(false);
      } else failure(result.error, result.code);
    } catch {
      failure("تعذر الوصول إلى خادم البرنامج. لم تُرسل عملية تسجيل.");
    } finally {
      setWorking(false);
    }
  }
  async function preview(source: "phone" | "terminal") {
    setWorking(true);
    setError("");
    try {
      const result = await prepare({
        data: {
          companyId,
          deviceId: device.id,
          employeeNo: person.employeeNo,
          source,
          photo: source === "phone" ? photo || undefined : undefined,
          replaceExisting,
        },
      });
      if (result.ok) {
        setPrepared(result.data);
        pendingToken.current = result.data.token;
        setPhrase("");
      } else failure(result.error, result.code);
    } catch {
      failure("تعذرت معاينة التسجيل. لم يُرسل أمر تسجيل للجهاز.");
    } finally {
      setWorking(false);
    }
  }
  async function close() {
    if (prepared)
      await cancel({ data: { companyId, token: prepared.token } }).catch(
        () => undefined,
      );
    pendingToken.current = "";
    setPrepared(undefined);
    setPhrase("");
    setPhoto(null);
    setReset((v) => v + 1);
    setStep(1);
  }
  async function send() {
    if (!prepared) return;
    setWorking(true);
    try {
      const result = await commit({
        data: { companyId, token: prepared.token, phrase },
      });
      if (!result.ok) {
        failure(result.error, result.code);
        return;
      }
      setJobSource(prepared.source);
      setJob({
        phase: "running",
        progress: 0,
        message:
          prepared.source === "terminal"
            ? "قف أمام كاميرا الجهاز واتبع تعليمات الشاشة."
            : "جارٍ تسجيل الوجه وإعادة قراءته.",
      });
      setJobId(result.data.jobId);
      setStep(5);
      pendingToken.current = "";
      setPrepared(undefined);
      setPhoto(null);
      setReset((v) => v + 1);
    } catch {
      failure(
        "تعذر تأكيد إرسال التسجيل. راجع الجهاز والتدقيق قبل المحاولة مجدداً.",
      );
    } finally {
      setWorking(false);
    }
  }
  const faceSupport = !admin
    ? {
        state: "needs-login" as const,
        reason: "رفع الوجه وبدء كاميرا الجهاز يحتاج حساب مسؤول في Speed for Training.",
      }
    : loginNeeded
      ? {
          state: "needs-login" as const,
          reason: "أعد إدخال اعتماد الجهاز في إعداد الاتصال داخل البرنامج.",
        }
      : state.upload;
  return (
    <>
      {connection && (
        <InlineDeviceConnection
          device={device}
          onClose={() => setConnection(false)}
          onConnected={load}
        />
      )}
      <Card title="تسجيل بصمة الوجه">
        <StepProgress
          steps={[
            "الجهاز والموظف",
            "اختيار الصورة",
            "التعديل والمعاينة",
            "جودة الصورة",
            "تأكيد التسجيل",
            "النتيجة والتحقق",
          ]}
          current={step}
        />
        <div className="ac-enrollment-context">
          <strong>{person.name}</strong>
          <span>
            رقم <bdi>{person.employeeNo}</bdi> · {device.name}
          </span>
        </div>
        {error && (
          <p role="alert" className="ac-message error">
            {error}
          </p>
        )}
        {loginNeeded && admin && (
          <Button onClick={() => setConnection(true)}>
            إعداد الاتصال وإدخال اعتماد الجهاز
          </Button>
        )}
        {step === 0 && (
          <div className="ac-stack">
            {selection}
            <p>
              اختر الموظف الموجود على الجهاز. سنقرأ وسائل التحقق قبل إتاحة
              التسجيل المدعوم.
            </p>
            <div className="ac-actions">
              <Button
                primary
                onClick={() => void load()}
                disabled={locked || busy || data.actor.role === "viewer"}
              >
                فحص وسائل الموظف (قراءة فقط)
              </Button>
              <Button
                onClick={() => modal({ kind: "person", person })}
                disabled={!admin || locked}
              >
                تعديل بيانات الموظف
              </Button>
            </div>
            {inspection && (
              <p className="ac-muted">
                آخر فحص لهذا الموظف: <When value={inspection.checkedAt} />
              </p>
            )}
            <Support value={faceSupport} />
            <p>
              حالة الوجه:{" "}
              {state.facePresent === true
                ? "يوجد وجه مسجل"
                : state.facePresent === false
                  ? "لا يوجد وجه في المكتبة المفحوصة"
                  : "لم تُقرأ بعد؛ ابدأ بالفحص"}
              .
            </p>
            <details className="ac-details">
              <summary>بصمات الأصابع وطريقة التسجيل اليدوي</summary>
              <Support value={state.fingerprint} />
              <ol>
                <li>من شاشة Hikvision افتح إدارة المستخدمين بحساب المسؤول.</li>
                <li>
                  اختر رقم <bdi>{person.employeeNo}</bdi> ثم الوجه، أو الإصبع
                  إذا كان هناك مستشعر مدعوم فعلياً.
                </li>
                <li>
                  اتبع تعليمات الجهاز واحفظ، ثم ارجع واضغط فحص وسائل الموظف.
                </li>
              </ol>
              <p>لا يستخدم البرنامج مستشعر الإصبع في الهاتف.</p>
            </details>
          </div>
        )}
        {step === 1 && (
          <div className="ac-stack">
            <h3>كيف تريد تسجيل الوجه؟</h3>
            <div
              className="ac-choice-grid"
              role="group"
              aria-label="مصدر صورة الوجه"
            >
              <Button
                aria-pressed={source === "phone"}
                onClick={() => setSource("phone")}
                disabled={state.upload.state !== "ready"}
              >
                صورة من الهاتف أو المعرض
              </Button>
              <Button
                aria-pressed={source === "terminal"}
                onClick={() => {
                  setSource("terminal");
                  setPhoto(null);
                  setReset((v) => v + 1);
                }}
                disabled={state.capture.state !== "ready"}
              >
                كاميرا جهاز البصمة
              </Button>
            </div>
            {source === "terminal" && (
              <>
                <Support value={state.capture} />
                <p>
                  لن تبدأ الكاميرا الآن. سنعرض تعليمات الوقوف أمام الجهاز ثم
                  نطلب تأكيدك.
                </p>
              </>
            )}
          </div>
        )}
        {admin && step >= 1 && step <= 4 && source === "phone" && (
          <FacePhotoEditor
            key={reset}
            onPhoto={setPhoto}
            onReady={setImageReady}
            onSelected={setImageSelected}
            onRetake={() => {
              setPhoto(null);
              setImageReady(false);
              setImageSelected(false);
              setReset((v) => v + 1);
              setStep(1);
            }}
            stage={
              step === 1
                ? "choose"
                : step === 2
                  ? "crop"
                  : step === 3
                    ? "quality"
                    : "review"
            }
            disabled={locked}
          />
        )}
        {source === "terminal" && step === 2 && (
          <div className="ac-instruction">
            <h3>جهّز الموظف أمام كاميرا Hikvision</h3>
            <ol>
              <li>
                تأكد من أن الشخص هو {person.name} ورقمه{" "}
                <bdi>{person.employeeNo}</bdi>.
              </li>
              <li>قف أمام الجهاز والوجه في منتصف الإطار، بإضاءة مناسبة.</li>
              <li>
                بعد التأكيد في الخطوة الأخيرة ستبدأ الكاميرا. اتبع تعليمات شاشة
                الجهاز حتى انتهاء الالتقاط.
              </li>
            </ol>
            <p>
              صورة كاميرا الجهاز لا تتوفر للمعاينة قبل بدء الالتقاط. لا يعني
              الالتقاط وحده أن الوجه حُفظ.
            </p>
          </div>
        )}
        {source === "terminal" && step === 3 && (
          <div className="ac-instruction">
            <h3>مراجعة الاستعداد للتصوير</h3>
            <p>
              وجه واحد واضح دون قناع أو نظارة شمسية. الجهاز هو الذي يحكم على
              جودة الالتقاط.
            </p>
            <label className="ac-check">
              <input
                type="checkbox"
                checked={atDevice}
                onChange={(e) => setAtDevice(e.target.checked)}
              />
              الموظف الصحيح يقف أمام الجهاز ومستعد للتسجيل.
            </label>
          </div>
        )}
        {step === 4 && (
          <div className="ac-stack">
            <h3>راجع العملية قبل إرسالها</h3>
            <p>
              سيُربط الوجه برقم <bdi>{person.employeeNo}</bdi> على {device.name}
              . بعد إرسال التسجيل سنعيد قراءة سجل هذا الرقم للتحقق من الحفظ.
            </p>
            {state.facePresent && (
              <label className="ac-check">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  disabled={locked}
                  onChange={(e) => setReplace(e.target.checked)}
                />
                أوافق على استبدال الوجه الحالي لهذا الموظف بعد المعاينة
                والتأكيد.
              </label>
            )}
            <p className="ac-muted">
              الصورة مؤقتة في الذاكرة؛ لا تُحفظ في المتصفح أو الملفات العامة.
            </p>
            <Button
              primary
              disabled={
                locked ||
                loginNeeded ||
                (source === "phone"
                  ? !photo || state.upload.state !== "ready"
                  : !atDevice || state.capture.state !== "ready") ||
                Boolean(state.facePresent && !replaceExisting)
              }
              onClick={() => void preview(source)}
            >
              مراجعة تأكيد التسجيل
            </Button>
          </div>
        )}
        {step === 5 && job && (
          <div
            className={`ac-message ${["failed", "uncertain"].includes(job.phase) ? "error" : job.phase === "verified" ? "success" : ""}`}
            role="status"
          >
            <strong>
              {job.phase === "verified"
                ? "اكتمل وتحققنا منه"
                : job.phase === "running"
                  ? "جارٍ التسجيل والتحقق من الجهاز"
                  : job.phase === "uncertain"
                    ? "نتيجة غير مؤكدة"
                    : "فشل التسجيل"}
            </strong>
            <p>{job.message}</p>
            {job.phase === "running" && (
              <progress
                max={100}
                value={job.progress}
                aria-label="تقدم تسجيل الوجه"
              />
            )}
            {job.phase === "running" && jobSource === "terminal" && (
              <>
                <Button
                  onClick={() =>
                    void poll({ data: { companyId, jobId, stop: true } }).then(
                      (r) => {
                        if (r.ok) setJob(r.data);
                      },
                    )
                  }
                >
                  إيقاف المتابعة فقط
                </Button>
                <p>
                  قد يستمر الجهاز حتى انتهاء مهلته؛ لم يثبت دعم أمر إلغاء
                  التسجيل عن بعد.
                </p>
              </>
            )}
            {job.phase !== "running" && (
              <Button
                onClick={() => {
                  setStep(0);
                  setJob(undefined);
                  setJobId("");
                  setInspection(undefined);
                  setReplace(false);
                }}
              >
                العودة إلى بيانات الموظف وفحصه
              </Button>
            )}
          </div>
        )}
        {step < 5 && (
          <footer className="ac-wizard-actions">
            {step > 0 && (
              <Button disabled={locked} onClick={() => setStep((s) => s - 1)}>
                السابق
              </Button>
            )}
            {step === 0 && (
              <Button
                primary
                disabled={
                  locked ||
                  !admin ||
                  loginNeeded ||
                  !inspection ||
                  (state.upload.state !== "ready" &&
                    state.capture.state !== "ready")
                }
                onClick={() => {
                  setSource(
                    state.upload.state === "ready" ? "phone" : "terminal",
                  );
                  setStep(1);
                }}
              >
                التالي: اختيار صورة الوجه
              </Button>
            )}
            {step === 1 && (
              <Button
                primary
                disabled={locked || (source === "phone" && !imageSelected)}
                onClick={() => setStep(2)}
              >
                التالي: التعديل والمعاينة
              </Button>
            )}
            {step === 2 && (
              <Button
                primary
                disabled={locked || (source === "phone" && !imageReady)}
                onClick={() => setStep(3)}
              >
                التالي: مراجعة الجودة
              </Button>
            )}
            {step === 3 && (
              <Button
                primary
                disabled={locked || (source === "phone" ? !photo : !atDevice)}
                onClick={() => setStep(4)}
              >
                التالي: تأكيد التسجيل
              </Button>
            )}
            {step > 0 && (
              <Button
                disabled={locked}
                onClick={() => {
                  setPhoto(null);
                  setReset((v) => v + 1);
                  setReplace(false);
                  setAtDevice(false);
                  setStep(0);
                }}
              >
                إلغاء العملية
              </Button>
            )}
          </footer>
        )}
      </Card>
      {prepared && (
        <Modal
          title="تأكيد تسجيل الوجه للموظف المحدد"
          onClose={() => void close()}
          busy={working}
        >
          <p>
            <strong>{person.name}</strong> · رقم{" "}
            <bdi>{prepared.employeeNo}</bdi> · {prepared.deviceName}
          </p>
          <p>
            {prepared.source === "terminal"
              ? "سيبدأ التقاط صورة الشخص الموجود أمام الجهاز ثم حفظها لهذا الرقم. تأكد من وقوف الموظف الصحيح."
              : "ستُرسل الصورة المقصوصة لرقم الموظف الموضح. لا يكفي اختيار الصورة لإرسالها."}
          </p>
          <p>
            {prepared.replacing
              ? "سيُستبدل الوجه الموجود. إذا لم تثبت إعادة القراءة تغيّر السجل ستظهر النتيجة غير مؤكدة."
              : "ستُضاف صورة وجه للموظف ثم يعاد البحث عن نفس FPID للتحقق."}
          </p>
          <p>
            اتصال الجهاز الحالي {device.https ? "HTTPS" : "HTTP محلي"}. الصورة
            بيومترية، وتبقى المعاينة المؤقتة في ذاكرة الخادم لمدة دقيقتين فقط.
          </p>
          <Field
            label={`اكتب: ${prepared.phrase}`}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
          />
          <div className="ac-actions">
            <Button
              primary
              disabled={working || phrase !== prepared.phrase}
              onClick={() => void send()}
            >
              تأكيد تسجيل الوجه
            </Button>
            <Button disabled={working} onClick={() => void close()}>
              إلغاء دون إرسال
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
