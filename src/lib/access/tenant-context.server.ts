import { AsyncLocalStorage } from "node:async_hooks";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
export const LEGACY_COMPANY = "legacy";
const globalScope = globalThis as typeof globalThis & {
  __zubaydTenantScope?: AsyncLocalStorage<string>;
};
const scope = (globalScope.__zubaydTenantScope ??=
  new AsyncLocalStorage<string>());
export const baseDirectory = () =>
  resolve(
    process.env.SKYLINE_ACCESS_DATA_DIR ||
      join(process.env.LOCALAPPDATA || homedir(), "SKYLINE", "access-control"),
  );
export function companyContext() {
  return scope.getStore() || LEGACY_COMPANY;
}
export function validateCompanyId(id: string) {
  if (id !== LEGACY_COMPANY && !/^co-[a-f0-9]{24}$/.test(id))
    throw new Error("Invalid company identifier");
  return id;
}
export function companyDirectory(id = companyContext()) {
  validateCompanyId(id);
  return id === LEGACY_COMPANY
    ? baseDirectory()
    : join(baseDirectory(), "companies", id);
}
/** Internal only: authorization is enforced by withCompany before entering this context. */
export function inCompany<T>(id: string, run: () => T): T {
  return scope.run(validateCompanyId(id), run);
}
