import { useState } from "react";
import type { DeviceSchedule } from "@/lib/access/schedules.server";
import { useCenter, Button, Card, Field, Badge, supported } from "./access-ui";

export function DeviceSchedulePanel() {
  const { selected, device, read, busy } = useCenter();
  const [schedule, setSchedule] = useState<DeviceSchedule | null>(null);
  const [loadedFor, setLoadedFor] = useState("");
  const labels: Record<string, string> = {
    Monday: "الاثنين",
    Tuesday: "الثلاثاء",
    Wednesday: "الأربعاء",
    Thursday: "الخميس",
    Friday: "الجمعة",
    Saturday: "السبت",
    Sunday: "الأحد",
  };
  return (
    <Card title="قراءة جدول صلاحية فعلي">
      <form
        className="ac-fields"
        onSubmit={async (event) => {
          event.preventDefault();
          setSchedule(null);
          const templateNo = Number(
            new FormData(event.currentTarget).get("templateNo"),
          );
          const result = await read({
            action: "schedule",
            deviceId: selected,
            templateNo,
          });
          if (result?.schedule) {
            setSchedule(result.schedule);
            setLoadedFor(selected);
          }
        }}
      >
        <Field
          label="رقم القالب المطلوب قراءته"
          name="templateNo"
          type="number"
          min={1}
          max={65535}
          required
          defaultValue={1}
        />
        <Button
          disabled={busy || !supported(device, "schedules")}
          type="submit"
        >
          قراءة القالب والجدول — دون تغيير
        </Button>
      </form>
      {schedule && loadedFor === selected ? (
        <div className="ac-item" style={{ marginTop: 16 }}>
          <strong>
            {schedule.template.templateName} · قالب {schedule.templateNo}
          </strong>
          <p>
            جدول أسبوعي {schedule.template.weekPlanNo} ·{" "}
            <Badge
              value={
                schedule.template.enable && schedule.week.enable
                  ? "مفعّل على الجهاز"
                  : "معطّل على الجهاز"
              }
            />
          </p>
          <p className="ac-muted">
            مجموعات عطلات الجهاز المرتبطة:{" "}
            {schedule.template.holidayGroupNo || "لا توجد"}. قواعد عطلات الحضور
            المحلية مستقلة.
          </p>
          {schedule.week.WeekPlanCfg.filter((row) => row.enable).map((row) => (
            <p key={`${row.week}:${row.id}`}>
              {labels[row.week]} ·{" "}
              <bdi>
                {row.TimeSegment.beginTime} — {row.TimeSegment.endTime}
              </bdi>
            </p>
          ))}
        </div>
      ) : (
        <p className="ac-muted">
          قراءة فعلية من الجهاز. لا تُنشئ هذه الشاشة قالباً أو إذن دخول.
        </p>
      )}
    </Card>
  );
}
