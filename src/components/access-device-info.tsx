import type { Device } from "@/lib/access/domain";
import { Badge, Button, When, useCenter } from "./access-ui";
import { zoneMismatch } from "@/lib/access/timezone";
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
  const { data, busy, act } = useCenter();
  const zoneWarning = zoneMismatch(device.clock?.zone);
  return (
    <div className="ac-device-info">
      {zoneWarning ? (
        <div role="alert" className="ac-message error">
          <p>{zoneWarning}</p>
          {data.actor.role === "admin" ? (
            <Button
              disabled={busy}
              onClick={() => {
                if (window.confirm(`ضبط المنطقة الزمنية لجهاز «${device.name}» على توقيت مصر؟ سيتغير timeZone فقط (يُسجل في سجل العمليات).`))
                  void act({ action: "time.zone.set", deviceId: device.id });
              }}
            >
              ضبط المنطقة الزمنية
            </Button>
          ) : (
            <small>اطلب من المسؤول ضبط المنطقة الزمنية.</small>
          )}
        </div>
      ) : null}
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
