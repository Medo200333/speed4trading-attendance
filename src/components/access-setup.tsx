import { useState } from "react";
import type { Device } from "@/lib/access/domain";
import { Button, Field, Modal, supported, useCenter } from "./access-ui";
import { DeviceInfo } from "./access-device-info";
import { DeviceDiscovery } from "./access-discovery";
import { TailscaleLink, ReachButton } from "./branch-tailscale";

export function DeviceSetup({
  existing,
  onClose,
  serverError,
}: {
  existing?: Device;
  onClose: () => void;
  serverError?: string;
}) {
  const { data, run, busy, select, navigate, modal, help } = useCenter();
  const [step, setStep] = useState(1),
    [transport, setTransport] = useState("local");
  const [name, setName] = useState(existing?.name || ""),
    [host, setHost] = useState(existing?.host || ""),
    [port, setPort] = useState(existing?.port || 80),
    [https, setHttps] = useState(existing?.https || false);
  const [username, setUsername] = useState("admin"),
    [password, setPassword] = useState(""),
    [location, setLocation] = useState(existing?.location || ""),
    [id, setId] = useState(existing?.id || ""),
    [tested, setTested] = useState(false),
    [error, setError] = useState("");
  const device = data.devices.find((row) => row.id === id);
  const [branchId, setBranchId] = useState(existing?.branchId || "");
  const close = () => {
    setPassword("");
    onClose();
  };
  async function test() {
    setError("");
    setTested(false);
    const match = data.devices.find(
      (row) => row.host === host.trim() && row.port === port,
    );
    if (match && match.https !== https) {
      setError(
        "العنوان مسجل بنوع نقل مختلف. راجع HTTPS والبورت دون تعديل تعريف الجهاز الحالي.",
      );
      return;
    }
    let deviceId = match?.id || id;
    if (!deviceId) {
      const saved = await run({
        action: "device.save",
        name: name.trim() || `بصمة ${host.trim()}`,
        host: host.trim(),
        port,
        https,
        branchId,
      });
      if (!saved?.deviceId) {
        setError(
          "تعذر حفظ عنوان الجهاز. راجع رسالة الخطأ ثم عد إلى معلومات الاتصال.",
        );
        return;
      }
      deviceId = saved.deviceId;
    }
    setId(deviceId);
    select(deviceId);
    const result = await run({
      action: "connect",
      deviceId,
      username: username.trim(),
      password,
    });
    if (result) {
      setTested(true);
      setPassword("");
    } else
      setError(
        "لم تنجح قراءة هوية الجهاز بعد المصادقة. راجع عنوانه وحساب الجهاز ورسالة الخطأ الظاهرة، ثم أعد الاختبار.",
      );
  }
  async function finish(firstEmployee: boolean) {
    if (!tested || !device || !id) return;
    const result = await run({
      action: "device.save",
      id,
      name: name.trim() || device.info?.reportedName || device.name,
      location,
      host: device.host,
      port: device.port,
      https: device.https,
      branchId,
    });
    if (!result) return;
    select(id);
    close();
    if (firstEmployee && supported(device, "users.add"))
      modal({ kind: "person", device });
  }
  return (
    <Modal title="إضافة جهاز بصمة جديد" busy={busy} onClose={close}>
      <p className="ac-message">الشركة: <strong>{data.company?.nameAr}</strong>. الجهاز واعتماداته يتبعان هذه الشركة.</p>
      <ol className="ac-stepper" aria-label="خطوات إعداد الجهاز">
        {["معلومات الاتصال", "اختبار الاتصال", "إكمال الإعداد"].map(
          (label, index) => (
            <li
              key={label}
              aria-current={step === index + 1 ? "step" : undefined}
            >
              <span>{index + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      {(serverError || error) && (
        <p role="alert" className="ac-message error">
          {serverError || error}
        </p>
      )}
      {step === 1 ? (
        <form
          className="ac-stack"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            setStep(2);
          }}
        >
          <p>
            نحتاج عنوان الجهاز وحساب الجهاز نفسه. مثال عنوان:{" "}
            <bdi>192.168.1.21</bdi>. كلمة المرور لا تُحفظ في المتصفح.
          </p>
          <div className="ac-transport">
            <label>
              <input
                type="radio"
                checked={transport === "local"}
                onChange={() => setTransport("local")}
              />{" "}
              اتصال محلي ISAPI
              <small>الخادم يصل إلى عنوان البصمة داخل الشبكة.</small>
            </label>
            <label>
              <input
                type="radio"
                checked={transport === "cloud"}
                onChange={() => setTransport("cloud")}
              />{" "}
              Hik-Connect<small>حساب السحابة ومسار دخول مستقلان.</small>
            </label>
          </div>
          {transport === "local" ? (
            <>
              {!existing ? (
                <DeviceDiscovery
                  known={data.devices.map((row) => `${row.host}:${row.port}`)}
                  onPick={(row) => {
                    setHost(row.ip);
                    setPort(row.httpPort);
                    setHttps(false);
                    setId("");
                    if (!name.trim()) setName(`${row.model || "بصمة"} ${row.ip}`.slice(0, 80));
                  }}
                />
              ) : null}
              {!existing ? (
                <TailscaleLink
                  onPick={(row) => {
                    setHost(row.ip);
                    setPort(row.httpPort);
                    setHttps(false);
                    setId("");
                    if (!name.trim()) setName(`${row.peer || "فرع"} ${row.ip}`.slice(0, 80));
                  }}
                />
              ) : null}
              <div className="ac-fields">
                <Field label="الفرع أو الموقع">
                  <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                    <option value="">الموقع العام للشركة</option>
                    {data.company?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </Field>
                <Field
                  label="اسم الجهاز (اختياري)"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="بصمة المدخل الرئيسي"
                  maxLength={80}
                />
                <Field
                  label="عنوان IP للبصمة"
                  value={host}
                  onChange={(event) => {
                    setHost(event.target.value);
                    setId("");
                  }}
                  readOnly={Boolean(existing)}
                  required
                  dir="ltr"
                  placeholder="192.168.1.21"
                />
                <ReachButton host={host} port={port} />
                <Field
                  label="منفذ الاتصال"
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  readOnly={Boolean(existing)}
                  onChange={(event) => {
                    setPort(Number(event.target.value));
                    setId("");
                  }}
                  required
                />
                <label className="ac-check">
                  <input
                    type="checkbox"
                    checked={https}
                    disabled={Boolean(existing)}
                    onChange={(event) => {
                      setHttps(event.target.checked);
                      setPort(event.target.checked ? 443 : 80);
                      setId("");
                    }}
                  />
                  HTTPS بشهادة موثوقة
                </label>
                <Field
                  label="اسم مستخدم البصمة"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  autoComplete="off"
                  dir="ltr"
                />
                <Field
                  label="كلمة مرور البصمة"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="new-password"
                  dir="ltr"
                />
              </div>
              <details className="ac-details"><summary>مساعدة: أين أجد عنوان IP؟</summary><p>على شاشة البصمة افتح الشبكة ثم TCP/IP واقرأ العنوان والبورت دون تغييرهما. يجب أن يصل خادم الشركة إلى هذا العنوان، حتى لو كان الهاتف متصلاً عن طريق Tailscale.</p></details>
              <footer>
                <Button onClick={close}>إلغاء</Button>
                <Button primary type="submit">
                  التالي: اختبار الاتصال
                </Button>
              </footer>
            </>
          ) : (
            <>
              <p className="ac-message">
                اختر «فتح تسجيل Hik-Connect» لاستخدام الاتصال السحابي الموجود،
                بما يشمل التحقق الإضافي. حساب السحابة لا يُستخدم مكان admin
                البصمة. اعتمادات OpenAPI وخدمة Push لهما إعداد مستقل.
              </p>
              <Button disabled={!data.systemAdmin}
                primary
                onClick={() => {
                  close();
                  navigate("legacy");
                }}
              >
                فتح تسجيل Hik-Connect
              </Button>
            </>
          )}
        </form>
      ) : step === 2 ? (
        <div className="ac-stack">
          <div className="ac-item">
            <strong>
              قراءة فقط من{" "}
              <bdi>
                {host}:{port}
              </bdi>
            </strong>
            <p className="ac-muted">
              سنقرأ الهوية وFirmware والساعة والقدرات وعدد المستخدمين إن دعمه
              الجهاز. لن نغيّر المستخدمين أو الساعة أو حالة أي باب.
            </p>
          </div>
          {tested && device ? (
            <>
              <p className="ac-message">
                نجحت مصادقة الجهاز وقراءة بياناته. راجعها ثم أكمل الإعداد.
              </p>
              <DeviceInfo device={device} />
              <details className="ac-details">
                <summary>الإمكانيات التي أعلنها الجهاز</summary>
                {device.capabilities
                  .filter((cap) => cap.state === "supported")
                  .map((cap) => (
                    <p key={cap.feature}>
                      {cap.label} — أعلنها الجهاز؛ اختبار الكتابة يحتاج تأكيداً
                      مستقلاً.
                    </p>
                  ))}
              </details>
            </>
          ) : (
            <Button
              primary
              disabled={busy || !password}
              onClick={() => void test()}
            >
              {busy ? "جارٍ اختبار الاتصال وقراءة الجهاز…" : "اختبار الاتصال"}
            </Button>
          )}
          <footer>
            <Button
              disabled={busy}
              onClick={() => {
                setStep(1);
                setTested(false);
              }}
            >
              السابق
            </Button>
            <Button
              primary
              disabled={busy || !tested}
              onClick={() => setStep(3)}
            >
              التالي: إكمال الإعداد
            </Button>
          </footer>
        </div>
      ) : (
        <div className="ac-stack">
          <p className="ac-message">
            الاتصال جاهز. سمِّ الجهاز وحدد موقعه ليكون اختياره سهلاً لاحقاً.
          </p>
          <Field
            label="اسم الجهاز النهائي"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={device?.info?.reportedName || "بصمة المدخل الرئيسي"}
            maxLength={80}
          />
          <Field
            label="مكان تركيب الجهاز"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="الدور الأرضي — المدخل الرئيسي"
            maxLength={160}
          />
          <p>
            ساعة الجهاز: <bdi>{device?.clock?.original || "لم تُقرأ"}</bdi>
          </p>
          <p className="ac-muted">
            مراجعة الساعة لا تضبطها تلقائياً. اتبع دليل الوقت إذا كانت غير
            صحيحة، مع إبقاء أوقات الأحداث السابقة كما هي. حفظ بيانات الدخول مشفر
            على الخادم عند وجود مفتاح الخزنة، أو في ذاكرة الخادم 8 ساعات.
          </p>
          <footer>
            <Button onClick={() => setStep(2)} disabled={busy}>
              السابق
            </Button>
            <Button onClick={() => void finish(false)} disabled={busy}>
              حفظ وإنهاء
            </Button>
            <Button primary onClick={() => void finish(true)} disabled={busy}>
              حفظ وإضافة أول موظف هنا
            </Button>
          </footer>
        </div>
      )}
    </Modal>
  );
}
