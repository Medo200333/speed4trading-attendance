import {useState} from "react";
import {useCenter,Card,Field,Button,When,Empty,supported,canOperate,ProgressBar} from "./access-ui";
import {InlineDeviceConnection} from "./inline-device-connection";
export function AttendancePull({start,end,setStart,setEnd}:{start:string;end:string;setStart:(v:string)=>void;setEnd:(v:string)=>void}){
 const {data,device,selected,busy,run,navigate}=useCenter();
 const [error,setError]=useState(""),[connecting,setConnecting]=useState(false);
 const act=(input:Parameters<typeof run>[0])=>{setError("");return run(input,{inline:true,onError:setError});};
 if(!device)return <Empty>اختر جهازاً مسجلاً لدى الشركة أولاً.</Empty>;
 return <>{error&&<p role="alert" className="ac-message error">{error}</p>}<Button disabled={busy} onClick={()=>setConnecting(true)}>إعادة الاتصال هنا دون تغيير الفترة</Button>
           <Card title="قراءة المستخدمين وسجلات الجهاز">
            <p className="ac-muted">
              اختر الفترة بتقويم الجهاز. السحب يقرأ البيانات ولا يغيّر
              المستخدمين أو الأبواب.
            </p>
            <div className="ac-fields">
              <Field
                label="من تاريخ الجهاز"
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
              <Field
                label="إلى تاريخ الجهاز"
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
            {device.sync.running || (busy && device.sync.result === "running") ? (
              <ProgressBar label={`جارٍ السحب… صفحة ${device.sync.pages || 0} · ${device.sync.scanned || 0} سجل مقروء`} />
            ) : null}
            <div className="ac-actions" style={{ marginTop: 16 }}>
              <Button
                primary
                disabled={
                  busy ||
                  device.sync.running ||
                  !canOperate(data.actor.role) ||
                  !device.checkedAt
                }
                onClick={() =>
                  act({
                    action: "sync",
                    deviceId: selected,
                    start,
                    end,
                    usersOnly: false,
                  })
                }
              >
                سحب الآن
              </Button>
              {data.actor.role === "admin" && (
                <Button
                  disabled={busy || device.sync.running || !device.checkedAt}
                  onClick={() =>
                    act({
                      action: "sync.diagnose",
                      deviceId: selected,
                      start,
                      end,
                    })
                  }
                >
                  تشخيص السحب (قراءة فقط)
                </Button>
              )}
              <Button
                disabled={
                  busy ||
                  !canOperate(data.actor.role) ||
                  !supported(device, "users.read")
                }
                onClick={() =>
                  act({
                    action: "sync",
                    deviceId: selected,
                    start,
                    end,
                    usersOnly: true,
                  })
                }
              >
                قراءة الموظفين فقط
              </Button>
            </div>
            <div className="ac-actions" style={{ marginTop: 12 }}>
              <Button
                onClick={() => {
                  setStart("2015-01-01");
                  setEnd("2015-01-03");
                }}
              >
                فحص الفترة القديمة: يناير 2015
              </Button>
              <Button
                onClick={() => {
                  setStart("2026-10-01");
                  setEnd("2026-10-22");
                }}
              >
                فحص أكتوبر 2026
              </Button>
            </div>
            <div className="ac-sync-state" role="status">
              <span
                className={`ac-status-dot ${device.sync.running ? "working" : ""}`}
              />
              {device.sync.running
                ? `جارٍ السحب… ${device.sync.pages} صفحة`
                : "لا توجد مزامنة جارية"}
              {device.sync.result !== "failed" &&
                device.sync.diagnosticStatus !== "failed" && (
                  <span>
                    خام مقروء: {device.sync.scanned} · تحقق صحيح:{" "}
                    {device.sync.valid} · تحقق فريد:{" "}
                    {device.sync.uniqueVerifications ?? "—"} · مكرر مستبعد من
                    التخزين: {device.sync.duplicates} · محفوظ في الفترة:{" "}
                    {device.sync.storedInPeriod ?? "—"} · خارج الفترة:{" "}
                    {device.sync.outsidePeriod ?? "—"}
                  </span>
                )}
            </div>
            <p className="ac-muted">
              آخر سحب أحداث ناجح:{" "}
              <When value={device.sync.lastAttendanceSync || null} />
              {device.sync.period && (
                <>
                  {" "}
                  · فترة آخر محاولة:{" "}
                  <bdi>
                    {device.sync.period.start} — {device.sync.period.end}
                  </bdi>
                </>
              )}
            </p>
            <p className="ac-muted">
              آخر قراءة موظفين ناجحة:{" "}
              <When value={device.sync.lastUsersSync || null} />
            </p>
            {device.sync.result === "success" &&
              device.sync.diagnosticStatus !== "failed" &&
              !device.sync.running &&
              device.sync.uniqueVerifications === 0 && (
                <p role="status" className="ac-message">
                  لا توجد حركات تحقق في الفترة المحددة. أحداث النظام لا تُحتسب
                  حضوراً أو انصرافاً.
                </p>
              )}
            {device.sync.userWarning && (
              <p className="ac-message">{device.sync.userWarning}</p>
            )}
            {device.sync.result === "success" && (
              <div className="ac-actions">
                <Button onClick={() => navigate("events")}>
                  افتح سجل الأحداث بتوقيته الأصلي
                </Button>
                <Button onClick={() => navigate("attendance")}>
                  افتح تقرير فترة السحب
                </Button>
              </div>
            )}
            {device.sync.lastError && (
              <p className="ac-message error">
                {device.sync.lastError}{" "}
                {device.sync.lastErrorCode && (
                  <bdi>({device.sync.lastErrorCode})</bdi>
                )}
              </p>
            )}
            {device.sync.diagnosticStatus === "failed" && (
              <div role="alert" className="ac-message error">
                <strong>
                  فشل قراءة السجلات؛ لا توجد نتيجة مؤكدة للفترة المطلوبة.
                </strong>
                <p>{device.sync.diagnosticFailure?.message}</p>
                <p>
                  العدادات الصفرية ليست نتيجة سحب ناجح. راجع تفاصيل رفض الجهاز
                  أدناه.
                </p>
                {data.actor.role === "admin" && (
                  <details className="ac-details" open>
                    <summary>تفاصيل رفض AcsEvent المنقّاة</summary>
                    <pre
                      dir="ltr"
                      style={{
                        maxWidth: "100%",
                        overflowX: "auto",
                        fontSize: 12,
                      }}
                    >
                      {JSON.stringify(device.sync.diagnosticFailure, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
            {device.sync.diagnostic?.warning && (
              <p className="ac-message">{device.sync.diagnostic.warning}</p>
            )}
            {data.actor.role === "admin" && device.sync.diagnostic && (
              <details className="ac-details">
                <summary>ملخص تشخيص ISAPI الآمن</summary>
                <p>
                  آخر تشخيص ناجح؛ راجع تاريخه وفترته إذا فشلت المحاولة الحالية.{" "}
                  الملخص قراءة مستقلة ولا يثبت الحفظ. لا يحتوي أسماء أو أرقام
                  موظفين أو صوراً أو بيانات اعتماد.
                </p>
                <pre
                  dir="ltr"
                  style={{ maxWidth: "100%", overflowX: "auto", fontSize: 12 }}
                >
                  {JSON.stringify(device.sync.diagnostic, null, 2)}
                </pre>
                {(device.sync.diagnostics || []).map((d) => (
                  <p key={`${d.start}:${d.end}`}>
                    <bdi>
                      {d.start} — {d.end}
                    </bdi>
                    : خام {d.raw} · تحقق فريد {d.uniqueVerifications} ·{" "}
                    <When value={d.at} />
                  </p>
                ))}
              </details>
            )}
            <details className="ac-details">
              <summary>إعداد متقدم: المزامنة التلقائية على الخادم</summary>
              <form
                className="ac-fields"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void act({
                    action: "sync.schedule",
                    deviceId: selected,
                    enabled: form.has("enabled"),
                    intervalSeconds: Number(form.get("interval")),
                  });
                }}
              >
                <Field
                  label="الفاصل بالثواني"
                  name="interval"
                  type="number"
                  min={60}
                  max={86400}
                  defaultValue={device.sync.intervalSeconds}
                  key={selected}
                  required
                />
                <label className="ac-check">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={device.sync.enabled}
                    key={`${selected}:${device.sync.enabled}`}
                  />
                  مزامنة دورية فعلية على الخادم
                </label>
                <Button
                  type="submit"
                  disabled={busy || data.actor.role !== "admin"}
                >
                  حفظ الجدولة
                </Button>
              </form>
              <p className="ac-muted">
                الموعد التالي: <When value={device.sync.nextRun} />. لا تُفعّل
                قبل نجاح الاتصال وتوفر بيانات اعتماد الخادم.
              </p>
            </details>
          </Card>
   
 {connecting&&<InlineDeviceConnection device={device} onClose={()=>setConnecting(false)}/>}</>;
}
