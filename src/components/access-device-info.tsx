import type { Device } from "@/lib/access/domain";
import { Badge, When } from "./access-ui";
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
  return (
    <div className="ac-device-info">
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
