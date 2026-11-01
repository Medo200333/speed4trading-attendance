import { useState } from "react";
import { EmployeeWorkspace } from "./employee-workspace";
import { sheetRows } from "@/lib/xlsx-io";
import { csvRows, peoplePreview, safeCsv } from "@/lib/access/import";
import type { ActionInput } from "@/lib/access/contracts";
import {
  useCenter,
  Modal,
  Field,
  Button,
  TableScroll,
  dateToday,
  supported,
  unavailable,
  downloadFile,
  type ModalData,
} from "./access-ui";

const text = (form: FormData, key: string) =>
  String(form.get(key) || "").trim();
const number = (form: FormData, key: string) => Number(form.get(key));
const weekDays = [
  ["Sunday", "الأحد"],
  ["Monday", "الاثنين"],
  ["Tuesday", "الثلاثاء"],
  ["Wednesday", "الأربعاء"],
  ["Thursday", "الخميس"],
  ["Friday", "الجمعة"],
  ["Saturday", "السبت"],
];
export function CenterForms({
  modal,
  onClose,
}: {
  modal: ModalData;
  onClose: () => void;
}) {
  const context = useCenter();
  const { data, device, busy, act, tell } = context;
  const [preview, setPreview] = useState<ReturnType<typeof peoplePreview>>([]),
    [error, setError] = useState("");
  const selectedDevice = modal.device || device;
  const titles = {
    person: modal.person ? "تعديل موظف الجهاز" : "إضافة موظف",
    device: modal.device ? "تعديل اسم الجهاز داخل البرنامج" : "إضافة جهاز",
    door: modal.door ? "تعديل تعريف الباب" : "إضافة باب",
    shift: "إضافة وردية للحضور",
    holiday: "حفظ عطلة رسمية",
    leave: "تسجيل إجازة",
    account: "إضافة أو تحديث حساب البرنامج",
    plan: "إعداد خطة وصول محلية",
    import: "استيراد موظفين مع المعاينة",
  };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    let input: ActionInput;
    if (modal.kind === "device")
      input = {
        action: "device.save",
        id: modal.device?.id,
        name: text(form, "name"),
        host: text(form, "host"),
        port: number(form, "port"),
        https: form.has("https"),
      };
    else if (modal.kind === "person") {
      if (!selectedDevice) return;
      input = {
        action: "prepare",
        operation: {
          kind: modal.person ? "editPerson" : "addPerson",
          deviceId: selectedDevice.id,
          person: {
            employeeNo: text(form, "employeeNo"),
            name: text(form, "name"),
            begin: text(form, "begin"),
            end: text(form, "end"),
            permanent: form.has("permanent"),
          },
        },
      };
    } else if (modal.kind === "door") {
      if (!selectedDevice) return;
      input = {
        action: "door.save",
        id: modal.door?.id,
        deviceId: selectedDevice.id,
        channel: number(form, "channel"),
        name: text(form, "name"),
        location: text(form, "location"),
        notes: text(form, "notes"),
      };
    } else if (modal.kind === "shift")
      input = {
        action: "shift.save",
        shift: {
          id: `shift-${Date.now()}`,
          name: text(form, "name"),
          start: text(form, "start"),
          end: text(form, "end"),
          graceMinutes: number(form, "grace"),
          earlyGraceMinutes: number(form, "early"),
          maxHours: number(form, "max"),
          breakMinutes: number(form, "break"),
          overtimeEnabled: form.has("overtime"),
          overtimeGraceMinutes: number(form, "overtimeGrace"),
          days: form.getAll("days").map(Number),
        },
      };
    else if (modal.kind === "holiday")
      input = {
        action: "holiday.save",
        date: text(form, "date"),
        name: text(form, "name"),
      };
    else if (modal.kind === "leave")
      input = {
        action: "leave.save",
        personId: text(form, "personId"),
        start: text(form, "begin"),
        end: text(form, "end"),
        note: text(form, "note"),
      };
    else if (modal.kind === "account") {
      const username = text(form, "username").toLowerCase();
      if (!/^[a-z0-9_.-]{3,32}$/.test(username)) { setError("اسم الدخول غير صالح: استخدم من 3 إلى 32 حرفاً إنجليزياً أو أرقاماً أو . _ - بدون مسافات أو حروف عربية."); return; }
      if (text(form, "password").length < 10) { setError("كلمة المرور قصيرة: 10 أحرف على الأقل."); return; }
      if (!text(form, "name").trim()) { setError("اكتب الاسم المعروض للحساب."); return; }
      input = {
        action: "account.save",
        username: text(form, "username").toLowerCase(),
        name: text(form, "name"),
        password: text(form, "password"),
        role: text(form, "role") as "admin" | "operator" | "viewer" | "accountant",
        enabled: form.has("enabled"),
      };
    } else if (modal.kind === "plan") {
      if (!selectedDevice) return;
      input = {
        action: "plan.save",
        deviceId: selectedDevice.id,
        name: text(form, "name"),
        templateNo: number(form, "templateNo"),
        week: form.getAll("days").map((day) => ({
          day: String(day) as "Monday",
          start: text(form, "start"),
          end: text(form, "end"),
        })),
        holidays: [],
      };
    } else return;
    if (await context.run(input, { inline: true, onError: setError }))
      onClose();
  }
  const deviceFeature =
    modal.kind === "person"
      ? modal.person
        ? "users.edit"
        : "users.add"
      : modal.kind === "door"
        ? "doors"
        : null;
  const allowed = !deviceFeature || supported(selectedDevice, deviceFeature);
  if (modal.kind === "person")
    return (
      <EmployeeWorkspace
        person={modal.person}
        device={selectedDevice}
        onClose={onClose}
      />
    );
  return (
    <Modal title={titles[modal.kind]} busy={busy} onClose={onClose}>
      {error ? (
        <p role="alert" className="ac-message error">
          {error}
        </p>
      ) : null}
      {deviceFeature && !allowed ? (
        <p className="ac-message warning">
          {unavailable(selectedDevice, deviceFeature)}
        </p>
      ) : null}
      {modal.kind === "import" ? (
        <div className="ac-stack">
          <p className="ac-muted">
            ملف CSV أو XLSX بعمودي employeeNo وname. حتى 50 موظفاً للدفعة.
            المعاينة لا تكتب شيئاً على الجهاز.
          </p>
          <Field
            label="ملف الموظفين"
            type="file"
            accept=".csv,.xlsx"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 3000000) throw new Error("الملف يتجاوز 3MB.");
                const rows = /\.xlsx$/i.test(file.name)
                  ? sheetRows(new Uint8Array(await file.arrayBuffer()))
                  : csvRows(await file.text());
                setPreview(
                  peoplePreview(
                    rows,
                    new Set(
                      data.people
                        .filter(
                          (person) => person.deviceId === selectedDevice?.id,
                        )
                        .map((person) => person.employeeNo),
                    ),
                  ),
                );
                setError("");
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذر قراءة الملف.",
                );
                setPreview([]);
              }
            }}
          />
          <Button
            onClick={() =>
              downloadFile(
                "employees-template.csv",
                safeCsv([
                  ["employeeNo", "name"],
                  ["100", "اسم الموظف"],
                ]),
                "text/csv;charset=utf-8",
              )
            }
          >
            تنزيل نموذج CSV
          </Button>
          {preview.length ? (
            <>
              <TableScroll label="معاينة ملف الموظفين — جدول قابل للتمرير">
                <table className="ac-table">
                  <thead>
                    <tr>
                      <th>السطر</th>
                      <th>الرقم</th>
                      <th>الاسم</th>
                      <th>المراجعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row) => (
                      <tr key={row.line}>
                        <td>{row.line}</td>
                        <td>{row.employeeNo}</td>
                        <td>{row.name}</td>
                        <td>{row.error || "جاهز للمعاينة النهائية"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
              <p>
                {preview.filter((row) => !row.error).length} صف صالح ·{" "}
                {preview.filter((row) => row.error).length} صف مستبعد
              </p>
            </>
          ) : null}
          <Button
            primary
            disabled={
              busy ||
              !preview.some((row) => !row.error) ||
              !supported(selectedDevice, "users.add") ||
              data.actor.role !== "admin"
            }
            onClick={async () => {
              if (!selectedDevice) return;
              const valid = preview
                .filter((row) => !row.error)
                .map(({ employeeNo, name }) => ({
                  employeeNo,
                  name,
                  begin: dateToday(),
                  end: "2037-12-31",
                  permanent: false,
                }));
              if (
                await act({
                  action: "prepare",
                  operation: {
                    kind: "importPeople",
                    deviceId: selectedDevice.id,
                    people: valid,
                  },
                })
              )
                onClose();
            }}
          >
            معاينة الإضافة إلى الجهاز
          </Button>
          <p className="ac-muted">
            لن يُرسل أي صف قبل خطوة التأكيد المكتوب. الأرقام الموجودة لا
            تُستبدل.
          </p>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="ac-fields">
            {modal.kind === "device" ? (
              <>
                <Field
                  label="اسم الجهاز"
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={modal.device?.name}
                />
                <Field
                  label="عنوان IPv4 للشبكة الخاصة أو Tailscale"
                  name="host"
                  required
                  dir="ltr"
                  defaultValue={modal.device?.host}
                  readOnly={Boolean(modal.device)}
                  placeholder="192.168.1.21"
                />
                <Field
                  label="البورت"
                  name="port"
                  type="number"
                  required
                  min={1}
                  max={65535}
                  defaultValue={modal.device?.port || 80}
                  readOnly={Boolean(modal.device)}
                />
                <label className="ac-check">
                  <input
                    name="https"
                    type="checkbox"
                    defaultChecked={modal.device?.https}
                    disabled={Boolean(modal.device)}
                  />
                  HTTPS بشهادة موثوقة
                </label>
                <p className="ac-muted">
                  هذا التعريف يضيف عنواناً إلى قائمة السماح داخل البرنامج. لا
                  يغير إعدادات الشبكة في البصمة.
                </p>
              </>
            ) : null}
            {modal.kind === "door" ? (
              <>
                <p className="ac-muted ac-field wide">
                  هذا اسم منطقي داخل speed4trading لقناة موجودة فعلياً؛ لا يُنشئ باباً أو
                  قناة في الجهاز.
                </p>
                <Field label="القناة الفعلية">
                  <select
                    name="channel"
                    required
                    defaultValue={
                      modal.door?.channel || selectedDevice?.physicalDoorIds[0]
                    }
                  >
                    {selectedDevice?.physicalDoorIds.map((id) => (
                      <option key={id} value={id}>
                        القناة {id}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="اسم الباب"
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={modal.door?.name}
                />
                <Field
                  label="الموقع"
                  name="location"
                  maxLength={160}
                  defaultValue={modal.door?.location}
                />
                <Field
                  label="ملاحظات"
                  name="notes"
                  maxLength={300}
                  defaultValue={modal.door?.notes}
                />
              </>
            ) : null}
            {modal.kind === "shift" ? (
              <>
                <p className="ac-muted ac-field wide">
                  الصافي = فرق أول وآخر تحقق ناقص استراحة ثابتة تختارها. الإضافي
                  اختياري، بعد نهاية الوردية وبحد الزيادة عن صافيها؛ لا يحسب من
                  الوصول المبكر وحده.
                </p>
                <Field
                  label="استراحة ثابتة تخصم بالدقائق"
                  name="break"
                  type="number"
                  min={0}
                  max={240}
                  defaultValue={0}
                  required
                />
                <label className="ac-check">
                  <input name="overtime" type="checkbox" />
                  تفعيل حساب الإضافي بعد نهاية الوردية
                </label>
                <Field
                  label="سماح الإضافي بالدقائق"
                  name="overtimeGrace"
                  type="number"
                  min={0}
                  max={240}
                  defaultValue={0}
                  required
                />
                <Field
                  label="اسم الوردية"
                  name="name"
                  required
                  maxLength={80}
                />
                <Field
                  label="بداية الوردية"
                  name="start"
                  type="time"
                  required
                  defaultValue="08:00"
                />
                <Field
                  label="نهاية الوردية"
                  name="end"
                  type="time"
                  required
                  defaultValue="16:00"
                />
                <Field
                  label="سماح التأخير بالدقائق"
                  helpTopic="calculations"
                  name="grace"
                  type="number"
                  min={0}
                  max={240}
                  defaultValue={15}
                  required
                />
                <Field
                  label="سماح الانصراف المبكر بالدقائق"
                  name="early"
                  type="number"
                  min={0}
                  max={240}
                  defaultValue={10}
                  required
                />
                <Field
                  label="أقصى مدة منطقية بالساعات"
                  helpTopic="calculations"
                  name="max"
                  type="number"
                  min={1}
                  max={18}
                  defaultValue={14}
                  required
                />
                <fieldset className="ac-field wide">
                  <legend>أيام العمل</legend>
                  <div className="ac-days">
                    {weekDays.map(([, label], index) => (
                      <label className="ac-check" key={label}>
                        <input
                          type="checkbox"
                          name="days"
                          value={index}
                          defaultChecked={index < 5}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p className="ac-muted">
                  نهاية أسبق من البداية تعني وردية تعبر منتصف الليل. قواعد
                  الحضور داخل البرنامج ولا تغير جداول السماح في الجهاز.
                </p>
              </>
            ) : null}
            {modal.kind === "holiday" ? (
              <>
                <Field label="اسم العطلة" name="name" required />
                <Field
                  label="التاريخ"
                  name="date"
                  type="date"
                  required
                  defaultValue={dateToday()}
                />
                <p className="ac-muted">
                  تؤثر على تقرير الحضور فقط. ليست عطلة صلاحيات مطبقة على الجهاز.
                </p>
              </>
            ) : null}
            {modal.kind === "leave" ? (
              <>
                <Field label="الموظف">
                  <select name="personId" required>
                    <option value="">اختر موظفاً</option>
                    {data.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} · {person.employeeNo}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="من"
                  name="begin"
                  type="date"
                  required
                  defaultValue={dateToday()}
                />
                <Field
                  label="إلى"
                  name="end"
                  type="date"
                  required
                  defaultValue={dateToday()}
                />
                <Field label="ملاحظة الإجازة" name="note" maxLength={160} />
                <p className="ac-muted">
                  الإجازة لتقرير الحضور، ولا تسحب إذن دخول الجهاز.
                </p>
              </>
            ) : null}
            {modal.kind === "account" ? (
              <>
                <Field
                  label="اسم الدخول بالإنجليزية (3–32: حروف وأرقام و . _ -) — استخدم الاسم الموجود لتحديث حساب"
                  name="username"
                  required
                  pattern="[A-Za-z0-9_.\-]{3,32}"
                  title="من 3 إلى 32: حروف إنجليزية أو أرقام أو . _ -"
                  dir="ltr"
                  autoComplete="off"
                />
                <Field
                  label="الاسم المعروض"
                  name="name"
                  required
                  maxLength={80}
                />
                <Field
                  label="كلمة مرور جديدة، 10 أحرف على الأقل"
                  name="password"
                  type="password"
                  minLength={10}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                />
                <Field label="الدور">
                  <select name="role" defaultValue="viewer">
                    <option value="viewer">مشاهد — قراءة فقط</option>
                    <option value="accountant">محاسبة — التقارير والحركات فقط (عرض وتصدير)</option>
                    <option value="operator">
                      مشغّل — قراءة ومزامنة وقواعد تقارير
                    </option>
                    <option value="admin">
                      مسؤول — إعدادات وعمليات جهاز مؤكدة
                    </option>
                  </select>
                </Field>
                <label className="ac-check">
                  <input name="enabled" type="checkbox" defaultChecked />
                  الحساب مفعّل
                </label>
                <p className="ac-muted">
                  تُخزّن كلمة المرور مجزأة فقط. التحديث ينهي جلسات الحساب
                  السابق.
                </p>
              </>
            ) : null}
            {modal.kind === "plan" ? (
              <>
                <p className="ac-muted ac-field wide">
                  خطة محلية قابلة للمراجعة؛ حفظها لا يطبقها على عتاد الجهاز.
                </p>
                <Field label="اسم الخطة" name="name" required maxLength={80} />
                <Field
                  label="رقم القالب المقترح"
                  helpTopic="schedules"
                  name="templateNo"
                  type="number"
                  min={1}
                  max={65535}
                  required
                />
                <Field
                  label="من الساعة"
                  name="start"
                  type="time"
                  required
                  defaultValue="08:00"
                />
                <Field
                  label="إلى الساعة"
                  name="end"
                  type="time"
                  required
                  defaultValue="17:00"
                />
                <fieldset className="ac-field wide">
                  <legend>أيام السماح</legend>
                  <div className="ac-days">
                    {weekDays.map(([day, label], index) => (
                      <label className="ac-check" key={day}>
                        <input
                          type="checkbox"
                          name="days"
                          value={day}
                          defaultChecked={index < 5}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : null}
          </div>
          <footer>
            <Button onClick={onClose} disabled={busy}>
              إلغاء
            </Button>
            <Button primary type="submit" disabled={busy || !allowed}>
              {busy ? "جارٍ الحفظ…" : "حفظ داخل البرنامج"}
            </Button>
          </footer>
        </form>
      )}
    </Modal>
  );
}
