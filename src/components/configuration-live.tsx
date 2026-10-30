import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { hikLiveConfigurationFn } from "@/lib/configuration-live.functions";
import type { LiveConfigSnapshot, LiveRead, LiveCheckpoint, LiveGroup, LivePhysicalDevice } from "@/lib/configuration-live.server";

type DraftView = {
  areas: { name: string }[];
  devices: { name: string; serial: string; door: string }[];
  departments: { name: string }[];
  persons: { name: string }[];
  levels: { name: string }[];
};

type RemoteRow = { id: string; name: string };
const action = "min-h-11 rounded-md border border-brass px-3 py-2 text-sm text-brass disabled:opacity-40";

function label<T>(value: LiveRead<T>): string {
  if (value.state === "ok") return `${value.records.length} سجل ظاهر (الاكتمال غير مؤكد)`;
  if (value.state === "empty") return "القائمة فارغة لهذا الطلب فقط";
  if (value.state === "denied") return "الجلسة مرفوضة — يلزم تسجيل الدخول";
  if (value.state === "error") return value.http ? `تعذر الاتصال: HTTP ${value.http}` : "تعذر الاتصال أو انتهت المهلة";
  return "UNKNOWN — صيغة الرد غير مؤكدة";
}

function SnapshotRows({
  title, data, kind,
}: {
  title: string;
  data: LiveRead<RemoteRow>;
  kind: "checkpoint" | "group" | "device";
}) {
  return (
    <article className="rounded-md border border-line bg-canvas p-3">
      <h4 className="font-semibold">{title}</h4>
      <p className="mt-1 text-xs text-muted">{label(data)}</p>
      {data.records.length ? (
        <ul className="mt-3 space-y-2">
          {data.records.map((row, index) => (
            <li key={`${row.id}-${index}`} className="rounded-md border border-line px-3 py-2 text-sm">
              <strong>{row.name}</strong>
              <div className="mt-1 break-all text-xs text-muted" dir="ltr">
                {row.id ? `Source ID: ${row.id}` : "Source ID: UNKNOWN"}
              </div>
              {kind !== "group" ? (
                <p className="mt-1 text-xs text-muted">
                  المنطقة: غير متحققة · الباب: غير متحقق
                  {kind === "checkpoint" ? " · نقطة حضور وليست تعريف جهاز مادي" : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">ربط المجموعة بالمنطقة أو الموظفين غير متحقق.</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function LiveConfiguration({
  apiBase, sessionId, draft,
}: {
  apiBase: string;
  sessionId: string;
  draft: DraftView;
}) {
  const read = useServerFn(hikLiveConfigurationFn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<LiveConfigSnapshot | null>(null);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await read({ data: { apiBase, sessionId } });
      if (!result.ok) {
        setSnapshot(null);
        if (result.reason === "TEAM_URL_REJECTED") {
          setError("عنوان API الذي وصل للاستيراد غير مقبول. راجع توافق عنوان الخدمة مع دخول Hik-Connect Team.");
        } else if (result.reason === "SESSION_INVALID") {
          setError("جلسة الاستيراد غير صالحة من حيث الصيغة، رغم أن تسجيل الدخول قد ينجح.");
        } else {
          setError("حدث خطأ داخل خادم الاستيراد (SERVER_FAILURE)، وليس دليلًا على انتهاء جلسة الدخول.");
        }
        return;
      }
      setSnapshot(result.snapshot);
    } catch {
      setSnapshot(null);
      setError("فشل استدعاء الاستيراد عبر التطبيق (RPC_ERROR). ده مختلف عن رفض جلسة Hik-Connect.");
    } finally {
      setBusy(false);
    }
  }

  function downloadSnapshot() {
    if (!snapshot) return;
    const content = JSON.stringify({
      ...snapshot,
      warning: "PARTIAL READ-ONLY SNAPSHOT. NOT A DEVICE BACKUP. DOES NOT CONTAIN PEOPLE, AREAS, DOORS OR BIOMETRICS.",
    }, null, 2);
    const href = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = `SpeedForTraining-live-partial-${snapshot.capturedAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  }

  const checkpointNames = new Set(snapshot?.checkpoints.records.map((r) => r.name) ?? []);
  const draftNames = new Set(draft.devices.map((r) => r.name));
  const similarNames = [...checkpointNames].filter((name) => draftNames.has(name));

  return (
    <section className="rounded-lg border-2 border-brass bg-panel p-3 sm:p-4" aria-label="الإعدادات الحالية من Hik-Connect">
      <h3 className="text-base font-bold">الإعدادات الحالية — Import from Hik-Connect</h3>
      <p className="mt-2 text-sm leading-7 text-muted">
        دي قراءة فعلية من الخدمة عند الضغط فقط، ومنفصلة تمامًا عن خطة التعديل المحلية.
        الأرقام تعني السجلات الظاهرة في الطلب، مش بالضرورة الإجمالي.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={action} disabled={busy} onClick={() => void refresh()}>
          {busy ? "جاري قراءة الموجود…" : "استيراد الإعدادات الحالية — قراءة فقط"}
        </button>
        <button type="button" className={action} disabled={!snapshot} onClick={downloadSnapshot}>
          حفظ لقطة جزئية JSON
        </button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-clay">{error}</p> : null}
      {snapshot ? (
        <>
          <p className="mt-3 text-xs text-muted">
            آخر قراءة: {new Date(snapshot.capturedAt).toLocaleString("ar-EG")}
            {" · "}بيانات مؤقتة في الصفحة، غير محفوظة في localStorage
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <SnapshotRows title="نقاط الحضور الموجودة بالسحابة" data={snapshot.checkpoints as LiveRead<LiveCheckpoint>} kind="checkpoint" />
            <SnapshotRows title="الأجهزة الفعلية (عند توفر مسار معتمد)" data={snapshot.devices as LiveRead<LivePhysicalDevice>} kind="device" />
            <SnapshotRows title="مجموعات الأشخاص في الخدمة" data={snapshot.groups as LiveRead<LiveGroup>} kind="group" />
            <article className="rounded-md border border-line bg-canvas p-3 text-sm leading-7">
              <h4 className="font-semibold">الربط بالمناطق والأبواب</h4>
              <p className="mt-2 text-muted">
                المنطقة الفعلية لكل جهاز، وأرقام الأبواب وتعيينات الأشخاص ومستوى الوصول:
                <strong> غير متحققة من API في هذه القراءة.</strong>
                مش هنستنتجها من أسماء نقاط الحضور، ومش هنعتبرها صفر.
              </p>
            </article>
          </div>
          <div className="mt-4 rounded-md border border-line bg-canvas p-3">
            <h4 className="font-semibold">مقارنة الإعدادات الحالية بالخطة المحلية</h4>
            <p className="mt-2 text-sm leading-7 text-muted">
              السحابة: {snapshot.checkpoints.records.length} نقطة حضور ظاهرة، {snapshot.groups.records.length} مجموعة ظاهرة.
              الخطة المحلية: {draft.areas.length} منطقة، {draft.devices.length} جهاز، {draft.departments.length} قسم،
              {" "}{draft.persons.length} موظف، {draft.levels.length} مستوى وصول.
            </p>
            {similarNames.length ? (
              <p className="mt-2 text-xs text-muted">تشابه أسماء فقط (ليس إثباتًا لتطابق الأجهزة): {similarNames.join("، ")}</p>
            ) : null}
            <p className="mt-2 text-sm text-clay">
              لا يمكن حساب فرق آمن أو تنفيذ Apply قبل التحقق من معرف الجهاز الحقيقي وربطه بالمنطقة والباب.
            </p>
          </div>
          <p className="mt-3 text-xs leading-6 text-muted">
            اللقطة الجزئية ليست Backup كاملًا لإعدادات الأجهزة ولا تحتوي صورًا أو بصمات.
            لا يوجد في هذه الشاشة أي إرسال أو حذف أو تعديل على Hik-Connect.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">لم تُجرَ قراءة حية في هذه الجلسة بعد.</p>
      )}
    </section>
  );
}
