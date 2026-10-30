import { createServerFn } from "@tanstack/react-start";

export const discoverDevicesFn = createServerFn({ method: "POST" })
  .validator((data: { deepScan?: boolean }) => ({ deepScan: Boolean(data?.deepScan) }))
  .handler(async ({ data }) => {
    const { requireActor } = await import("./access/auth.server");
    const { AccessError } = await import("./access/store.server");
    try {
      await requireActor();
      const { discoverDevices } = await import("./access/sadp.server");
      return { ok: true as const, data: await discoverDevices(data) };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof AccessError ? error.message : "تعذر فحص الشبكة من الخادم. تأكد أن الخادم متصل بنفس شبكة أجهزة البصمة.",
      };
    }
  });
