import { createServerFn } from "@tanstack/react-start";

async function guard<T>(minimum: "operator" | "admin", run: () => Promise<T>) {
  const { requireActor } = await import("./access/auth.server");
  const { requireRole, AccessError } = await import("./access/store.server");
  try {
    requireRole(await requireActor(), minimum);
    return { ok: true as const, data: await run() };
  } catch (error) {
    return { ok: false as const, error: error instanceof AccessError ? error.message : "تعذر تنفيذ الطلب." };
  }
}
const mod = () => import("./access/tailscale.server");

export const tsDevicesFn = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(() => guard("operator", async () => (await mod()).listTailscaleDevices()));
export const tsSwitchFn = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(() => guard("admin", async () => (await mod()).switchTailscaleAccount()));
export const reachDeviceFn = createServerFn({ method: "POST" })
  .validator((data: { host: string; port: number }) => ({ host: String(data?.host || "").trim().slice(0, 253), port: Number(data?.port) || 80 }))
  .handler(({ data }) => guard("operator", async () => (await mod()).reachDevice(data.host, data.port)));
