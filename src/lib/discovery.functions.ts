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

type ActivateInput = { ip: string; httpPort: number; mac: string; password: string; confirm: string };
export const activateDeviceFn = createServerFn({ method: "POST" })
  .validator((d: ActivateInput) => ({ ip: String(d?.ip || ""), httpPort: Number(d?.httpPort) || 80, mac: String(d?.mac || ""), password: String(d?.password || ""), confirm: String(d?.confirm || "") }))
  .handler(async ({ data }) => {
    const { requireActor } = await import("./access/auth.server");
    try {
      const { requireRole } = await import("./access/store.server");
      requireRole(await requireActor(), "admin");
      const { deviceWritesEnabled, READ_ONLY_MESSAGE } = await import("./access/device-writes");
      if (!deviceWritesEnabled()) return { ok: false as const, error: READ_ONLY_MESSAGE };
      if (!/^(10|172|192|100)\.[\d.]+$/.test(data.ip)) return { ok: false as const, error: "عنوان الجهاز مش داخل الشبكة المحلية." };
      const { activateDevice } = await import("./access/activation.server");
      const r = await activateDevice(data, data.password, data.confirm);
      return r.ok ? { ok: true as const, data: { method: r.method } } : { ok: false as const, error: r.error };
    } catch (error) {
      const { AccessError } = await import("./access/store.server");
      if (error instanceof AccessError) return { ok: false as const, error: error.message };
      return { ok: false as const, error: "تعذر تفعيل الجهاز من الخادم. تأكد إنه على نفس الشبكة." };
    }
  });

type NetInput = { mac: string; password: string; dhcp: boolean; ip: string; mask: string; gateway: string; httpPort?: number };
export const modifyDeviceNetworkFn = createServerFn({ method: "POST" })
  .validator((d: NetInput) => ({ mac: String(d?.mac || ""), password: String(d?.password || ""), dhcp: Boolean(d?.dhcp), ip: String(d?.ip || ""), mask: String(d?.mask || ""), gateway: String(d?.gateway || ""), httpPort: Number(d?.httpPort) || undefined }))
  .handler(async ({ data }) => {
    const { requireActor } = await import("./access/auth.server");
    try {
      const { requireRole } = await import("./access/store.server");
      requireRole(await requireActor(), "admin");
      const { deviceWritesEnabled, READ_ONLY_MESSAGE } = await import("./access/device-writes");
      if (!deviceWritesEnabled()) return { ok: false as const, error: READ_ONLY_MESSAGE };
      const { modifyDeviceNetwork } = await import("./access/activation.server");
      const r = await modifyDeviceNetwork(data.mac, data.password, data);
      return r.ok ? { ok: true as const, data: null } : { ok: false as const, error: r.error };
    } catch (error) {
      const { AccessError } = await import("./access/store.server");
      if (error instanceof AccessError) return { ok: false as const, error: error.message };
      return { ok: false as const, error: "تعذر تغيير إعدادات الشبكة." };
    }
  });
