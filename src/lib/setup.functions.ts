import { createServerFn } from "@tanstack/react-start";

export const setupStatusFn = createServerFn({ method: "POST" }).handler(async () => {
  const { firstAdminNeeded } = await import("./access/first-admin.server");
  return { needsSetup: await firstAdminNeeded() };
});
export const setupAdminFn = createServerFn({ method: "POST" })
  .validator((d: { name: string; username: string; password: string; confirm: string; companyName?: string; companyNameEn?: string; logo?: string }) => ({
    name: String(d?.name || "").slice(0, 200), username: String(d?.username || "").slice(0, 64), password: String(d?.password || "").slice(0, 256), confirm: String(d?.confirm || "").slice(0, 256), companyName: String(d?.companyName || "").slice(0, 200), companyNameEn: String(d?.companyNameEn || "").slice(0, 120), logo: String(d?.logo || "").slice(0, 1_500_000),
  }))
  .handler(async ({ data }) => {
    // The browser validates the name before sending, so an empty name here means the request body was lost/truncated.
    if (!(await import("./company-name")).normalizeCompanyName(data.companyName)) return { ok: false as const, code: "PAYLOAD", error: "لم يصل اسم الشركة إلى الخادم (وصلت البيانات ناقصة). أعد المحاولة؛ وإن تكرر فاختر شعاراً أصغر أو تحقق من الاتصال." };
    const { createFirstAdmin } = await import("./access/first-admin.server");
    try {
      return { ok: true as const, ...(await createFirstAdmin(data)) };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      return { ok: false as const, code: e.code || "SERVER", error: e.code ? e.message || "" : "تعذر إنشاء الحساب. حاول مجدداً." };
    }
  });
