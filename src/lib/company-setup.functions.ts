import { createServerFn } from "@tanstack/react-start";
/** Existing installs (users already exist): after login, an admin must give the company name/logo once. */
export const companySetupStatusFn = createServerFn({ method: "POST" }).handler(async () => {
  const { currentActor } = await import("./access/auth.server");
  const actor = await currentActor().catch(() => null);
  if (!actor) return { authed: false as const, needs: false, username: "", name: "", admin: false };
  const { platformState } = await import("./access/companies.server");
  const { companySetupNeeded } = await import("./access/company-setup-core");
  const admin = actor.role === "admin";
  return { authed: true as const, needs: admin && companySetupNeeded(await platformState(), actor.companyId), username: actor.username, name: actor.name, admin };
});
export const companySetupSaveFn = createServerFn({ method: "POST" })
  .validator((d: { companyName: string; logo?: string; displayName?: string; newUsername?: string; newPassword?: string; confirm?: string }) => ({
    companyName: String(d?.companyName || "").slice(0, 200), logo: String(d?.logo || "").slice(0, 1_500_000), displayName: String(d?.displayName || "").slice(0, 200),
    newUsername: String(d?.newUsername || "").slice(0, 64), newPassword: String(d?.newPassword || "").slice(0, 256), confirm: String(d?.confirm || "").slice(0, 256),
  }))
  .handler(async ({ data }) => {
    try {
    // The browser validates the name before sending, so an empty name here means the request body was lost/truncated.
    if (!(await import("./company-name")).normalizeCompanyName(data.companyName)) return { ok: false as const, code: "PAYLOAD", error: "لم يصل اسم الشركة إلى الخادم (وصلت البيانات ناقصة). أعد المحاولة؛ وإن تكرر فاختر شعاراً أصغر أو تحقق من الاتصال." };
      const { requireActor } = await import("./access/auth.server");
      const actor = await requireActor();
      if (actor.role !== "admin") return { ok: false as const, error: "الإعداد ده للمسؤول فقط." };
      const { completeCompanySetup } = await import("./access/companies.server");
      const r = await completeCompanySetup(actor, data);
      return { ok: true as const, ...r };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      return { ok: false as const, error: e.code ? e.message || "" : "تعذر حفظ بيانات الشركة. حاول تاني." };
    }
  });
