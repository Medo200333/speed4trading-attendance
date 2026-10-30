import { getRequest } from "@tanstack/react-start/server";
import { needsSetup, setupOriginAllowed, validateSetup, SetupError, type SetupInput } from "./first-admin-core";

/** One-time owner setup, only in packaged empty installs and only while zero accounts exist. */
const packaged = () => process.env.SKYLINE_EMPTY_INSTALL === "1" && !process.env.SKYLINE_ADMIN_PASSWORD;
const limiter = globalThis as typeof globalThis & { __speedSetupAttempts?: { count: number; since: number } };
export async function firstAdminNeeded() {
  if (!packaged()) return false;
  const { platformState } = await import("./companies.server");
  return needsSetup(await platformState());
}
export async function createFirstAdmin(input: SetupInput) {
  if (!packaged()) throw new SetupError("SETUP_DISABLED", "إعداد المسؤول الأول غير متاح في هذه النسخة.");
  const request = getRequest();
  const { explicitTrustedOrigins, login } = await import("./auth.server");
  if (!setupOriginAllowed(request.headers.get("origin"), request.headers.get("host") || "", explicitTrustedOrigins()))
    throw new SetupError("ORIGIN", "إنشاء حساب المسؤول متاح فقط من نفس الجهاز الذي يعمل عليه البرنامج.");
  const now = Date.now();
  const bucket = limiter.__speedSetupAttempts && now - limiter.__speedSetupAttempts.since < 60_000 ? limiter.__speedSetupAttempts : { count: 0, since: now };
  if (bucket.count >= 5) throw new SetupError("RATE_LIMIT", "محاولات كثيرة. انتظر دقيقة ثم حاول مجدداً.");
  bucket.count++;
  limiter.__speedSetupAttempts = bucket;
  const valid = validateSetup(input);
  const { setupFirstAdmin } = await import("./companies.server");
  await setupFirstAdmin(valid);
  const result = await login(valid.username, valid.password);
  return { username: valid.username, loggedIn: result.ok };
}
