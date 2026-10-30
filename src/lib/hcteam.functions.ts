import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function admin(min: "admin" | "operator" = "admin") {
  const { requireLegacyActor } = await import("./access/auth.server");
  const { requireRole } = await import("./access/store.server");
  requireRole(await requireLegacyActor(), min);
}
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error && e.message ? e.message : "غير مسموح." });

export const hcTeamStatusFn = createServerFn({ method: "POST" }).handler(async () => {
  try { await admin("operator"); const { hcStatus } = await import("./hcteam.server"); return { ok: true as const, status: hcStatus() }; } catch (e) { return fail(e); }
});
const saveSchema = z.object({
  appKey: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
  secret: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).optional(),
  region: z.string().trim().min(2).max(8),
});
export const hcTeamSaveFn = createServerFn({ method: "POST" })
  .validator((d: z.infer<typeof saveSchema>) => saveSchema.parse(d))
  .handler(async ({ data }) => {
    try { await admin(); const { hcSave } = await import("./hcteam.server"); return { ok: true as const, status: hcSave(data) }; } catch (e) { return fail(e); }
  });
export const hcTeamClearFn = createServerFn({ method: "POST" }).handler(async () => {
  try { await admin(); const { hcClear } = await import("./hcteam.server"); return { ok: true as const, status: hcClear() }; } catch (e) { return fail(e); }
});
export const hcTeamTestFn = createServerFn({ method: "POST" }).handler(async () => {
  try { await admin(); } catch (e) { return fail(e); }
  const { hcTest } = await import("./hcteam.server"); return hcTest();
});
const pullSchema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), pageIndex: z.number().int().min(1).max(500) });
export const hcTeamPullFn = createServerFn({ method: "POST" })
  .validator((d: z.infer<typeof pullSchema>) => pullSchema.parse(d))
  .handler(async ({ data }) => {
    try { await admin("operator"); } catch (e) { return fail(e); }
    const { hcPull } = await import("./hcteam.server"); return hcPull(data.from, data.to, data.pageIndex);
  });
