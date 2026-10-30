import { createServerFn } from "@tanstack/react-start";
import {
  actionSchema,
  querySchema,
  type ActionInput,
  type QueryInput,
} from "./access/contracts";

/** Domain validation errors are written in Arabic for the user; pass those through instead of a generic message. */
const userMessage = (error: unknown) => {
  const m = error instanceof Error ? error.message : "";
  return /[\u0600-\u06FF]/.test(m) && m.length <= 300 ? m : "";
};
export const centerQueryFn = createServerFn({ method: "POST" })
  .validator((data: QueryInput) => querySchema.parse(data))
  .handler(async ({ data }) => {
    const { requireActor } = await import("./access/auth.server");
    const { AccessError } = await import("./access/store.server");
    try {
      const actor = await requireActor();
      const { tenantQuery: queryCenter } = await import("./access/company-dispatch.server");
      return { ok: true as const, data: await queryCenter(actor, data) };
    } catch (error) {
      return {
        ok: false as const,
        code: error instanceof AccessError ? error.code : "SERVER",
        error:
          error instanceof AccessError
            ? error.message
            : userMessage(error) || "تعذر إكمال الطلب. حاول مجدداً أو راجع التشخيص.",
      };
    }
  });
export const centerActionFn = createServerFn({ method: "POST" })
  .validator((data: ActionInput) => actionSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireActor } = await import("./access/auth.server");
    const { AccessError } = await import("./access/store.server");
    try {
      const actor = await requireActor();
      const { tenantAction: actionCenter } = await import("./access/company-dispatch.server");
      return { ok: true as const, data: await actionCenter(actor, data) };
    } catch (error) {
      return {
        ok: false as const,
        code: error instanceof AccessError ? error.code : "SERVER",
        error:
          error instanceof AccessError
            ? error.message
            : userMessage(error) || "تعذر تأكيد العملية. راجع سجل التدقيق قبل إعادة المحاولة.",
      };
    }
  });
export const centerLogoutFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const { logout } = await import("./access/auth.server");
    return logout();
  },
);
