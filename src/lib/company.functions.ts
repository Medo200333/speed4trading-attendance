import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { companyNameError, normalizeCompanyName } from "./company-name";
const profile = z.object({
  id: z.string().optional(),
  nameAr: z.string().max(4000).transform(normalizeCompanyName),
  nameEn: z.string().max(4000).default("").transform((v) => normalizeCompanyName(v).slice(0, 120)),
  address: z.string().trim().max(300).default(""),
  contact: z.string().trim().max(160).default(""),
  logo: z
    .string()
    .max(1_400_000)
    .regex(/^(?:|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/)
    .default(""),
});
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("company.save"), company: profile }),
  z.object({
    action: z.literal("branch.save"),
    companyId: z.string(),
    branch: z.object({
      id: z.string().optional(),
      name: z.string().trim().min(1).max(120),
      address: z.string().trim().max(300).default(""),
    }),
  }),
]);
export type CompanyInput = z.infer<typeof schema>;
export const companyFn = createServerFn({ method: "POST" })
  .validator((data: CompanyInput) => schema.parse(data))
  .handler(async ({ data }) => {
    const { requireActor } = await import("./access/auth.server"),
      { AccessError } = await import("./access/store.server");
    try {
      const actor = await requireActor(),
        service = await import("./access/companies.server");
      if (data.action === "company.save") {
        const nameError = companyNameError(data.company.nameAr);
        if (nameError) return { ok: false as const, code: "COMPANY_NAME", error: nameError };
        return {
          ok: true as const,
          data: { company: await service.saveCompany(actor, data.company) },
        };
      }
      if (data.action === "branch.save")
        return {
          ok: true as const,
          data: {
            branch: await service.saveBranch(
              actor,
              data.companyId,
              data.branch,
            ),
          },
        };
      return { ok: true as const, data: await service.companyView(actor) };
    } catch (error) {
      return {
        ok: false as const,
        code: error instanceof AccessError ? error.code : "COMPANY_SERVER",
        error:
          error instanceof AccessError
            ? error.message
            : "تعذر حفظ الشركة. أعد المحاولة من نفس الخطوة.",
      };
    }
  });
