import { z } from "zod";
const id = z.string().trim().min(1).max(100);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const personInput = z.object({
  employeeNo: z.string().trim().min(1).max(32),
  name: z
    .string()
    .trim()
    .min(1, "الاسم الإنجليزي مطلوب.")
    .max(32, "الاسم الإنجليزي أطول من 32 حرفاً.")
    .regex(/^[A-Za-z0-9 .'-]+$/, "الاسم على الجهاز بالإنجليزية فقط: حروف لاتينية وأرقام ومسافة و . - '")
    .regex(/[A-Za-z]/, "الاسم الإنجليزي يجب أن يحتوي حرفاً لاتينياً."),
  arabicName: z.string().trim().max(64).optional(),
  begin: day,
  end: day,
  permanent: z.boolean(),
  grantDoor: z.boolean().optional(),
});
export const operationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("addPerson"), deviceId: id, person: personInput }),
  z.object({
    kind: z.literal("editPerson"),
    deviceId: id,
    person: personInput,
  }),
  z.object({ kind: z.literal("disablePerson"), deviceId: id, employeeNo: id }),
  z.object({ kind: z.literal("deletePerson"), deviceId: id, employeeNo: id }),
  z.object({
    kind: z.literal("addCard"),
    deviceId: id,
    employeeNo: id,
    cardNo: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
  }),
  z.object({
    kind: z.literal("deleteCard"),
    deviceId: id,
    employeeNo: id,
    cardNo: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
  }),
  z.object({
    kind: z.literal("door"),
    deviceId: id,
    doorNo: z.number().int().min(1).max(256),
    command: z.enum(["open", "close", "alwaysOpen", "alwaysClose"]),
  }),
  z.object({
    kind: z.literal("permission"),
    deviceId: id,
    employeeNo: id,
    doorNos: z.array(z.number().int().min(1).max(256)).min(1).max(64),
    templateNo: z.number().int().min(1).max(65535),
  }),
  z.object({
    kind: z.literal("pin"),
    deviceId: id,
    employeeNo: id,
    pin: z.string().regex(/^\d{4,12}$/),
  }),
  z.object({
    kind: z.literal("importPeople"),
    deviceId: id,
    people: z.array(personInput).min(1).max(50),
  }),
  z.object({ kind: z.literal("applyWeek"), deviceId: id, planId: id }),
]);
export type Operation = z.infer<typeof operationSchema>;
export const shiftSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  start: clock,
  end: clock,
  graceMinutes: z.number().int().min(0).max(240),
  earlyGraceMinutes: z.number().int().min(0).max(240),
  maxHours: z.number().min(1).max(18),
  breakMinutes: z.number().int().min(0).max(240).optional(),
  overtimeEnabled: z.boolean().optional(),
  overtimeGraceMinutes: z.number().int().min(0).max(240).optional(),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
});
const legacyActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("device.save"),
    id: id.optional(),
    name: z.string().trim().min(1).max(80),
    host: z.string().trim().min(1).max(15),
    location: z.string().trim().max(160).optional(),
    port: z.number().int().min(1).max(65535),
    https: z.boolean(),
  }),
  z.object({
    action: z.literal("connect"),
    deviceId: id,
    username: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(128),
  }),
  z.object({ action: z.literal("probe"), deviceId: id }),
  z.object({
    action: z.literal("sync"),
    deviceId: id,
    start: day,
    end: day,
    usersOnly: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("sync.diagnose"),
    deviceId: id,
    start: day,
    end: day,
  }),
  z.object({
    action: z.literal("sync.schedule"),
    deviceId: id,
    enabled: z.boolean(),
    intervalSeconds: z.number().int().min(60).max(86400),
  }),
  z.object({
    action: z.literal("door.save"),
    id: id.optional(),
    deviceId: id,
    channel: z.number().int().min(1).max(256),
    name: z.string().trim().min(1).max(80),
    location: z.string().trim().max(160),
    notes: z.string().trim().max(300),
  }),
  z.object({
    action: z.literal("fingerprint.enroll"),
    deviceId: id,
    employeeNo: id,
    fingerNo: z.number().int().min(1).max(10),
  }),
  z.object({
    action: z.literal("person.metadata"),
    personId: id,
    localEnabled: z.boolean(),
    shiftId: id,
  }),
  z.object({
    action: z.literal("review"),
    eventId: z.string().min(1).max(1000),
    note: z.string().trim().min(1).max(500),
  }),
  z.object({ action: z.literal("shift.save"), shift: shiftSchema }),
  z.object({
    action: z.literal("holiday.save"),
    date: day,
    name: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("leave.save"),
    personId: id,
    start: day,
    end: day,
    note: z.string().trim().max(160),
  }),
  z.object({
    action: z.literal("plan.save"),
    deviceId: id,
    name: z.string().trim().min(1).max(80),
    templateNo: z.number().int().min(1).max(65535),
    week: z
      .array(
        z.object({
          day: z.enum([
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ]),
          start: clock,
          end: clock,
        }),
      )
      .min(1)
      .max(56),
    holidays: z.array(day).max(100),
  }),
  z.object({
    action: z.literal("account.save"),
    username: z
      .string()
      .trim()
      .regex(/^[a-z0-9_.-]{3,32}$/),
    name: z.string().trim().min(1).max(80),
    role: z.enum(["admin", "operator", "viewer", "accountant"]),
    password: z.string().min(10).max(128),
    enabled: z.boolean(),
  }),
  z.object({ action: z.literal("prepare"), operation: operationSchema }),
  z.object({
    action: z.literal("commit"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    phrase: z.string().trim().min(1).max(160),
  }),
]);
const companyScope = z.object({ companyId: z.string().regex(/^(legacy|co-[a-f0-9]{24})$/).optional(), branchId: z.string().max(100).optional() });
export const actionSchema = legacyActionSchema.and(companyScope);
export type ActionInput = z.infer<typeof actionSchema>;
export const querySchema = z.object({
  companyId: z.string().regex(/^(legacy|co-[a-f0-9]{24})$/).optional(),
  action: z.enum([
    "snapshot",
    "events",
    "attendance",
    "cards",
    "credentialCounts",
    "schedule",
    "photo",
    "fingerprint",
  ]),
  deviceId: id.optional(),
  templateNo: z.number().int().min(1).max(65535).optional(),
  employeeNo: id.optional(),
  start: day.optional(),
  end: day.optional(),
  category: z
    .enum(["verification", "denied", "alarm", "system", "unknown", "all"])
    .optional(),
  search: z.string().trim().max(100).optional(),
  page: z.number().int().min(0).max(1000).optional(),
  refresh: z.boolean().optional(),
});
export type QueryInput = z.infer<typeof querySchema>;
export type Confirmation = {
  token: string;
  phrase: string;
  title: string;
  description: string;
  warnings: string[];
  expiresAt: string;
  affected: number;
};
