import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { importPhotosFn, savePhotoThumbFn } from "@/lib/biometric.functions";
import { Button, useCenter, primePhotos, ProgressBar } from "./access-ui";

/** Downscale a JPEG data URL in the browser (thumbnail kept next to the original on the server). */
async function thumbnail(dataUrl: string, max = 160): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

/** «استيراد صور الموظفين من الجهاز» — separate from the attendance pull; read-only on the device. */
export function PhotoImportButton({ deviceId, people }: { deviceId: string; people: { employeeNo: string }[] }) {
  const { data, busy } = useCenter();
  const run = useServerFn(importPhotosFn), save = useServerFn(savePhotoThumbFn);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const start = async () => {
    const numbers = [...new Set(people.map((p) => p.employeeNo))];
    if (!numbers.length) return setMessage("لا يوجد موظفون. اقرأ الموظفين من الجهاز أولاً.");
    setWorking(true);
    let fromEvent = 0, imported = 0, missing = 0, failed = 0, done = 0;
    try {
      for (let k = 0; k < numbers.length; k += 10) {
        setMessage(`جارٍ استيراد الصور… ${done} / ${numbers.length}`);
        setProgress({ done, total: numbers.length });
        const res = await run({ data: { companyId: data.companyId, deviceId, employeeNos: numbers.slice(k, k + 10) } });
        if (!res.ok) { setMessage(`توقف الاستيراد: ${res.error}`); return; }
        const got: Record<string, string> = {};
        for (const r of res.data.results) {
          done++;
          if (r.status === "imported" && r.photo) {
            try {
              const t = await thumbnail(r.photo);
              await save({ data: { companyId: data.companyId, deviceId, employeeNo: r.employeeNo, thumb: t } });
              got[r.employeeNo] = t; imported++; if (r.source === "event") fromEvent++;
            } catch { failed++; }
          } else if (r.status === "missing") missing++;
          else failed++;
        }
        primePhotos(deviceId, got);
      }
      setMessage(`انتهى الاستيراد: ${imported} صورة${fromEvent ? ` (منها ${fromEvent} من آخر صورة التقطها الجهاز عند البصمة لأن الوجه مسجل على الجهاز بدون صورة محفوظة)` : ""} · ${missing} بلا صورة على الجهاز · ${failed} تعذر تحميل صورتها (الجهاز لديه بصمة وجه بدون صورة محفوظة أو رفض التحميل). (قراءة فقط، لم يُكتب شيء على الجهاز)`);
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <Button disabled={busy || working || !deviceId} onClick={start}>
        {working ? "جارٍ الاستيراد…" : "استيراد صور الموظفين من الجهاز"}
      </Button>
      {working ? <ProgressBar value={progress.done} max={progress.total} label={`استيراد الصور ${progress.done} / ${progress.total}`} /> : null}
      {message ? <span role="status" className="ac-muted">{message}</span> : null}
    </>
  );
}
