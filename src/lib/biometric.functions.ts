import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const scope = {
  companyId: z
    .string()
    .regex(/^(legacy|co-[a-f0-9]{24})$/)
    .optional(),
};
const person = z.object({
  ...scope,
  deviceId: z.string().min(1).max(100),
  employeeNo: z.string().min(1).max(32),
});
const token = z.string().regex(/^[a-f0-9]{64}$/);
async function context() {
  const { requireActor } = await import("./access/auth.server");
  return {
    actor: await requireActor(),
    withCompany: (await import("./access/companies.server")).withCompany,
    service: await import("./access/biometrics.server"),
  };
}
async function safe<T>(run: () => Promise<T>) {
  try {
    return { ok: true as const, data: await run() };
  } catch (error) {
    const { AccessError } = await import("./access/store.server");
    return {
      ok: false as const,
      code: error instanceof AccessError ? error.code : "BIO_SERVER",
      error:
        error instanceof AccessError
          ? error.message
          : "تعذرت معالجة التسجيل. لم تُسجل نتيجة نجاح؛ راجع حالة الجهاز.",
    };
  }
}
export const biometricInspectFn = createServerFn({ method: "POST" })
  .validator((data: z.infer<typeof person>) => person.parse(data))
  .handler(({ data }) =>
    safe(async () => {
      const { actor, service, withCompany } = await context();
      return withCompany(actor, data.companyId, (scoped) =>
        service.inspectBiometrics(scoped, data.deviceId, data.employeeNo),
      );
    }),
  );
const prepare = person.extend({
  source: z.enum(["phone", "terminal"]),
  photo: z.string().max(280000).optional(),
  replaceExisting: z.boolean().default(false),
});
export const biometricPrepareFn = createServerFn({ method: "POST" })
  .validator((data: z.infer<typeof prepare>) => prepare.parse(data))
  .handler(({ data }) =>
    safe(async () => {
      const { actor, service, withCompany } = await context();
      return withCompany(actor, data.companyId, (scoped) =>
        service.prepareBiometric(scoped, data),
      );
    }),
  );
const commit = z.object({ ...scope, token, phrase: z.string().min(1).max(80) });
export const biometricCommitFn = createServerFn({ method: "POST" })
  .validator((data: z.infer<typeof commit>) => commit.parse(data))
  .handler(({ data }) =>
    safe(async () => {
      const { actor, service, withCompany } = await context();
      return withCompany(actor, data.companyId, (scoped) =>
        service.commitBiometric(scoped, data.token, data.phrase),
      );
    }),
  );
export const biometricCancelFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; companyId?: string }) =>
    z.object({ ...scope, token }).parse(data),
  )
  .handler(({ data }) =>
    safe(async () => {
      const { actor, service, withCompany } = await context();
      return withCompany(actor, data.companyId, (scoped) =>
        service.cancelBiometric(scoped, data.token),
      );
    }),
  );
const status = z.object({
  ...scope,
  jobId: z.string().regex(/^[a-f0-9]{48}$/),
  stop: z.boolean().default(false),
});
export const biometricStatusFn = createServerFn({ method: "POST" })
  .validator((data: z.infer<typeof status>) => status.parse(data))
  .handler(({ data }) =>
    safe(async () => {
      const { actor, service, withCompany } = await context();
      return withCompany(actor, data.companyId, (scoped) =>
        data.stop
          ? service.stopBiometric(scoped, data.jobId)
          : service.biometricJob(scoped, data.jobId),
      );
    }),
  );

const photoImport = z.object({ ...scope, deviceId: z.string().min(1).max(100), employeeNos: z.array(z.string().min(1).max(32)).min(1).max(20) });
/** استيراد صور الموظفين من الجهاز (read-only on the device; independent of the attendance pull). */
export const importPhotosFn = createServerFn({ method: "POST" })
  .validator((data: z.infer<typeof photoImport>) => photoImport.parse(data))
  .handler(({ data }) =>
    safe(async () => {
      const { actor, service, withCompany } = await context();
      return withCompany(actor, data.companyId, (scoped) => service.importDevicePhotos(scoped, data.deviceId, data.employeeNos));
    }),
  );
const thumb = person.extend({ thumb: z.string().max(280000) });
export const savePhotoThumbFn = createServerFn({ method: "POST" })
  .validator((data: z.infer<typeof thumb>) => thumb.parse(data))
  .handler(({ data }) =>
    safe(async () => {
      const { actor, service, withCompany } = await context();
      return withCompany(actor, data.companyId, (scoped) => service.savePhotoThumb(scoped, data.deviceId, data.employeeNo, data.thumb));
    }),
  );
