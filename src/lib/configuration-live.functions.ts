import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const liveConfigSchema = z.object({
  apiBase: z.string().trim().min(8).max(160),
  sessionId: z.string().trim().min(8).max(4096),
});

/** Separate server function: no mutations or attendance APIs. */
export const hikLiveConfigurationFn = createServerFn({ method: "POST" })
  .validator((data: z.infer<typeof liveConfigSchema>) => liveConfigSchema.parse(data))
  .handler(async ({ data }) => {
    const { readLiveConfiguration } = await import("./configuration-live.server");
    try {
      const {requireLegacyActor}=await import("./access/auth.server");
      await requireLegacyActor();
      const snapshot = await readLiveConfiguration(data.apiBase, data.sessionId);
      return { ok: true as const, snapshot };
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "INVALID_TEAM_URL") {
        return { ok: false as const, reason: "TEAM_URL_REJECTED" as const };
      }
      if (code === "INVALID_TEAM_SESSION") {
        return { ok: false as const, reason: "SESSION_INVALID" as const };
      }
      return { ok: false as const, reason: "SERVER_FAILURE" as const };
    }
  });
