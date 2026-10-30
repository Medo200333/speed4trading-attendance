import type { Actor } from "./store.server";
import { AccessError, readState, updateState, runtime } from "./store.server";
import {
  withCompany,
  companyView,
  platformState,
  saveCompanyAccount,
} from "./companies.server";
import { inCompany, LEGACY_COMPANY } from "./tenant-context.server";
import type { ActionInput, QueryInput } from "./contracts";
import { actionCenter, queryCenter } from "./service.server";
// Serialize address ownership checks with the write across all tenants.
let deviceSaveChain: Promise<unknown> = Promise.resolve();
export async function tenantQuery(actor: Actor, input: QueryInput) {
  return withCompany(actor, input.companyId, async (scoped) => {
    const result = await queryCenter(scoped, input);
    if (result.snapshot) {
      Object.assign(result.snapshot, await companyView(scoped));
      const platform = await platformState();
      result.snapshot.accounts =
        scoped.role === "admin"
          ? platform.accounts
              .filter((a) =>
                a.memberships.some((m) => m.companyId === scoped.companyId),
              )
              .map((a) => ({
                username: a.username,
                name: a.name,
                enabled: a.enabled,
                role: a.memberships.find(
                  (m) => m.companyId === scoped.companyId,
                )!.role,
              }))
          : [];
    }
    return result;
  });
}
export async function tenantAction(
  actor: Actor,
  input: ActionInput,
): Promise<Awaited<ReturnType<typeof actionCenter>>> {
  if (input.action === "device.save") {
    const result = deviceSaveChain.catch(() => undefined).then(() => dispatch(actor, input));
    deviceSaveChain = result.then(() => undefined, () => undefined);
    return result;
  }
  return dispatch(actor, input);
}
async function dispatch(actor: Actor, input: ActionInput): Promise<Awaited<ReturnType<typeof actionCenter>>> {
  return withCompany(actor, input.companyId, async (scoped) => {
    if (input.action === "account.save") {
      const result = await saveCompanyAccount(scoped, scoped.companyId!, input);
      inCompany(LEGACY_COMPANY, () => {
        for (const [token, session] of runtime().sessions)
          if (session.username === input.username)
            runtime().sessions.delete(token);
      });
      return result;
    }
    if (input.action === "device.save") {
      const platform = await platformState();
      for (const company of platform.companies.filter(
        (c) => c.id !== scoped.companyId,
      )) {
        const state = await inCompany(company.id, () => readState());
        if (
          state.devices.some(
            (d) => d.host === input.host && d.port === input.port,
          )
        )
          throw new AccessError(
            "DEVICE_OWNERSHIP",
            "هذا العنوان مرتبط بجهاز لدى شركة أخرى. لا يمكن مشاركته دون نقل إداري معتمد.",
          );
      }
      if (
        input.branchId &&
        !platform.companies
          .find((c) => c.id === scoped.companyId)
          ?.branches.some((b) => b.id === input.branchId)
      )
        throw new AccessError("BRANCH", "الفرع لا يتبع الشركة المختارة.");
    }
    const result = await actionCenter(scoped, input);
    if (input.action === "device.save" && result.deviceId && input.branchId !== undefined)
      await updateState((s) => {
        const device = s.devices.find((d) => d.id === result.deviceId);
        if (device) device.branchId = input.branchId || undefined;
      });
    return result;
  });
}
