import type { Device } from "@/lib/access/domain";
import { Badge, Button, When, useCenter } from "./access-ui";
import { hostMismatch } from "@/lib/access/timezone";
import { TimeSyncPanel } from "./time-sync";
export function DeviceInfo({ device }: { device: Device }) {
  const rows = [
    ["الشركة المصنعة", device.info?.manufacturer],
    ["اسم الجهاز المقروء", device.info?.reportedName],
    ["الموديل", device.model],
    ["نوع الجهاز", device.info?.deviceType],
    ["إصدار Firmware", device.firmware],
    ["تاريخ بناء Firmware", device.info?.firmwareBuildDate],
    ["عنوان الاتصال", `${device.host}:${device.port}`],
    [
      "عدد مستخدمي الجهاز",
      device.info?.userCount == null ? null : String(device.info.userCount),
    ],
    [
      "القنوات الفعلية المثبتة",
      device.physicalDoorIds.length ? device.physicalDoorIds.join("، ") : null,
    ],
    ["وقت الجهاز الأصلي", device.clock?.original],
    ["المنطقة الزمنية المقروءة", device.clock?.zone],
    ["إزاحة الوقت", device.clock?.offset],
  ];
  const { data } = useCenter();
  const zoneWarning = hostMismatch(device.clock?.zone, device.clock?.driftSeconds, -new Date().getTimezoneOffset());
  return (
    <div className="ac-device-info">
      {zoneWarning ? (
        <div role="alert" className="ac-message error">
          <p>⏰ {zoneWarning}</p>
          {data.actor.role !== "admin" ? <small>اطلب من المسؤول ضبط التوقيت.</small> : null}
        </div>
      ) : null}
      <TimeSyncPanel devices={[device]} single />
      <div className="ac-item-header">
        <Badge value={device.status} />
        <small>
          آخر قراءة: <When value={device.checkedAt} />
        </small>
      </div>
      <dl className="ac-info-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd
              dir={
                /Firmware|الموديل|عنوان الاتصال|وقت الجهاز|المنطقة الزمنية|إزاحة الوقت/.test(
                  label || "",
                )
                  ? "ltr"
                  : undefined
              }
            >
              {value || "لم يرد من الجهاز"}
            </dd>
          </div>
        ))}
      </dl>
      <p className="ac-muted">
        نجاح هذه القراءة يتطلب مصادقة الجهاز. الحقول غير المقروءة تظل فارغة،
        وعدد القنوات غير المثبت لا يعني عدم وجود أبواب.
      </p>
    </div>
  );
}
