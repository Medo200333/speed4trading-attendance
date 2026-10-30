import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Device, LocalPlan } from "./domain";
import { isapi, checkResponse, requireCapability, field } from "./isapi.server";
import { AccessError, privateDirectory } from "./store.server";

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
const segment = z.object({
  week: z.enum(days),
  id: z.number().int().min(1).max(8),
  enable: z.boolean(),
  TimeSegment: z.object({ beginTime: time, endTime: time }),
  authenticationTimesEnabled: z.boolean().optional(),
  authenticationTimes: z.number().int().optional(),
});
const templateSchema = z.object({
  enable: z.boolean(),
  templateName: z.string(),
  weekPlanNo: z.number().int().min(1).max(65535),
  holidayGroupNo: z.string(),
});
const weekSchema = z.object({
  enable: z.boolean(),
  WeekPlanCfg: z.array(segment).max(56),
});
export async function readSchedule(device: Device, templateNo: number) {
  requireCapability(device, "schedules");
  const client = await isapi(device);
  const templateResponse = await client.request(
    `/ISAPI/AccessControl/UserRightPlanTemplate/${templateNo}?format=json`,
  );
  checkResponse(templateResponse);
  const template = templateSchema.safeParse(
    JSON.parse(templateResponse.text).UserRightPlanTemplate,
  );
  if (!template.success)
    throw new AccessError(
      "SCHEDULE_SHAPE",
      "لم تُقرأ بنية قالب صلاحية موثقة؛ لم يُسمح بالكتابة.",
    );
  const response = await client.request(
    `/ISAPI/AccessControl/UserRightWeekPlanCfg/${template.data.weekPlanNo}?format=json`,
  );
  checkResponse(response);
  const week = weekSchema.safeParse(
    JSON.parse(response.text).UserRightWeekPlanCfg,
  );
  if (!week.success)
    throw new AccessError(
      "SCHEDULE_SHAPE",
      "شكل الجدول الأسبوعي غير مثبت؛ لم يُسمح بالكتابة.",
    );
  return { templateNo, template: template.data, week: week.data };
}
export type DeviceSchedule = Awaited<ReturnType<typeof readSchedule>>;
export const scheduleDigest = (value: DeviceSchedule) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function weekPayload(device: Device, plan: LocalPlan) {
  if (plan.holidays.length)
    throw new AccessError(
      "SCHEDULE_HOLIDAYS",
      "تطبيق العطلات يحتاج عقد مجموعة عطلات منفصلاً؛ لن تُهمل العطلات المحلية.",
    );
  const fields =
    device.probes.find((probe) =>
      probe.endpoint.includes("UserRightWeekPlanCfg/capabilities"),
    )?.fields || {};
  const slots = Number(field(fields, "WeekPlanCfg.id.@max"));
  const maxSize = Number(field(fields, "WeekPlanCfg.maxSize"));
  if (
    !Number.isInteger(slots) ||
    slots < 1 ||
    slots > 8 ||
    !Number.isInteger(maxSize) ||
    maxSize < slots * 7
  )
    throw new AccessError(
      "SCHEDULE_LIMIT",
      "يلزم إثبات عدد فترات اليوم وحد الجدول من الجهاز أولاً.",
    );
  const ranges = new Map<string, { start: string; end: string }[]>(
    days.map((day) => [day, []]),
  );
  for (const item of plan.week) {
    if (item.start === item.end)
      throw new AccessError(
        "SCHEDULE_TIME",
        "وقت البداية والنهاية متساويان؛ استخدم فترة محددة صريحة.",
      );
    if (item.start < item.end) ranges.get(item.day)?.push(item);
    else {
      ranges.get(item.day)?.push({ start: item.start, end: "23:59:59" });
      ranges
        .get(days[(days.indexOf(item.day as (typeof days)[number]) + 1) % 7])!
        .push({ start: "00:00", end: item.end });
    }
  }
  const WeekPlanCfg = days.flatMap((day) => {
    const periods = ranges
      .get(day)!
      .sort((a, b) => a.start.localeCompare(b.start));
    if (
      periods.length > slots ||
      periods.some(
        (item, index) => index > 0 && item.start < periods[index - 1].end,
      )
    )
      throw new AccessError(
        "SCHEDULE_TIME",
        "الفترات متداخلة أو تتجاوز حد اليوم المثبت بالجهاز.",
      );
    return Array.from({ length: slots }, (_, index) => {
      const item = periods[index];
      return {
        week: day,
        id: index + 1,
        enable: Boolean(item),
        TimeSegment: {
          beginTime: item ? `${item.start}:00`.slice(0, 8) : "00:00:00",
          endTime: item ? `${item.end}:00`.slice(0, 8) : "00:00:00",
        },
      };
    });
  });
  return { enable: true, WeekPlanCfg };
}
export async function applyWeek(
  device: Device,
  plan: LocalPlan,
  expected: string,
) {
  const current = await readSchedule(device, plan.templateNo);
  if (scheduleDigest(current) !== expected)
    throw new AccessError(
      "STALE",
      "تغير الجدول على الجهاز بعد المعاينة؛ لم يُرسل التغيير.",
    );
  const payload = weekPayload(device, plan);
  const fields =
    device.probes.find((probe) =>
      probe.endpoint.includes("UserRightWeekPlanCfg/capabilities"),
    )?.fields || {};
  const minimum = Number(field(fields, "planNo.@min")),
    maximum = Number(field(fields, "planNo.@max"));
  if (
    !Number.isInteger(minimum) ||
    !Number.isInteger(maximum) ||
    current.template.weekPlanNo < minimum ||
    current.template.weekPlanNo > maximum
  )
    throw new AccessError(
      "SCHEDULE_LIMIT",
      "رقم الجدول خارج حدود الجهاز المقروءة.",
    );
  // A private recovery artifact is durable before the first device write. Restoration requires a new explicit approval.
  await writeFile(
    join(privateDirectory(), `schedule-before-${randomUUID()}.json`),
    JSON.stringify({
      deviceId: device.id,
      serial: device.serial,
      at: new Date().toISOString(),
      ...current,
    }),
    { flag: "wx", mode: 0o600 },
  );
  const client = await isapi(device);
  checkResponse(
    await client.request(
      `/ISAPI/AccessControl/UserRightWeekPlanCfg/${current.template.weekPlanNo}?format=json`,
      "PUT",
      JSON.stringify({ UserRightWeekPlanCfg: payload }),
    ),
  );
  const after = await readSchedule(device, plan.templateNo);
  const canonical = (week: DeviceSchedule["week"]) =>
    JSON.stringify({
      enable: week.enable,
      rows: week.WeekPlanCfg.filter((row) => row.enable)
        .map((row) => [
          row.week,
          row.id,
          row.TimeSegment.beginTime,
          row.TimeSegment.endTime,
        ])
        .sort(),
    });
  if (
    canonical(after.week) !== canonical(payload) ||
    JSON.stringify(after.template) !== JSON.stringify(current.template)
  )
    throw new AccessError(
      "READBACK",
      "لم تتطابق قراءة الجدول بعد الكتابة. راجع النسخة السابقة وسجل التدقيق دون إعادة تلقائية.",
    );
}
