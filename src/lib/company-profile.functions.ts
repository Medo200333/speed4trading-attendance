import { createServerFn } from "@tanstack/react-start";
/** Public read of the customer name/logo (shown on the login screen before sign-in). No accounts or secrets. */
export const companyProfileFn = createServerFn({ method: "POST" }).handler(async () => {
  const { platformState } = await import("./access/companies.server");
  const { profileFrom } = await import("./company-profile");
  const p = await platformState();
  return profileFrom(p.companies[0]);
});
