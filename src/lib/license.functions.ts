import { createServerFn } from "@tanstack/react-start";

export const licenseStatusFn = createServerFn({ method: "POST" }).handler(async () => {
  const { licenseState, LICENSE_MESSAGES, licenseContact } = await import("./access/license.server");
  const s = licenseState();
  return { enforced: s.enforced, mode: s.mode, reason: s.reason, message: LICENSE_MESSAGES[s.reason] || "", trialEndsAt: s.trialEndsAt, customer: s.customer, expires: s.expires, machineName: s.machine.name, macs: s.machine.macs, requestCode: s.requestCode, ...licenseContact() };
});
export const activateLicenseFn = createServerFn({ method: "POST" })
  .validator((data: { code: string }) => ({ code: String(data?.code || "").slice(0, 4000) }))
  .handler(async ({ data }) => {
    const { activateLicense, LICENSE_MESSAGES } = await import("./access/license.server");
    const verdict = activateLicense(data.code);
    return verdict.ok ? { ok: true as const, customer: verdict.license.customer } : { ok: false as const, error: LICENSE_MESSAGES[verdict.reason] || "كود غير صالح." };
  });
export const licenseRequestFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; company: string }) => ({ email: String(data?.email || "").trim().slice(0, 200), company: String(data?.company || "").trim().slice(0, 200) }))
  .handler(async ({ data }) => {
    const { requestOnlineLicense, REQUEST_ERRORS } = await import("./access/license.server");
    try { const r = await requestOnlineLicense(data); return { ok: true as const, status: r.status }; }
    catch (e) { const m = (e as Error).message; return { ok: false as const, error: REQUEST_ERRORS[m] || "تعذر الوصول لخادم التراخيص. استخدم الطلب اليدوي بالبريد." }; }
  });
export const licensePollFn = createServerFn({ method: "POST" }).handler(async () => {
  const { pollOnlineLicense } = await import("./access/license.server");
  try { return await pollOnlineLicense(); } catch { return { status: "offline" as const }; }
});
