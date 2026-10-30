import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const linkSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  https: z.boolean(),
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

const chunkSchema = linkSchema.extend({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().trim().min(1).max(64),
  eventSearchId: z.string().trim().min(1).max(32),
  eventPos: z.number().int().min(0).max(1_000_000),
  eventsDone: z.boolean(),
  variant: z.number().int().min(0).max(3),
  pageSize: z.number().int().min(0).max(30),
  usersDone: z.boolean(),
  userSearchId: z.string().trim().max(32),
  userPos: z.number().int().min(0).max(1_000_000),
});

export type DeviceLinkInput = z.infer<typeof linkSchema>;
export type ChunkInput = z.infer<typeof chunkSchema>;

export const testDeviceFn = createServerFn({ method: "POST" })
  .validator((data: DeviceLinkInput) => linkSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireLegacyActor: requireActor } = await import("./access/auth.server");
    const { requireRole, AccessError } = await import("./access/store.server");
    try { requireRole(await requireActor(), "operator"); }
    catch (error) { if (error instanceof AccessError) return { ok: false as const, error: error.message }; throw error; }
    const { testDevice } = await import("./hikvision.server");
    return testDevice(data);
  });

const cloudLoginSchema = z.object({
  account: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(128),
  imageCode: z.string().trim().max(12).optional(),
  smsCode: z.string().trim().max(12).optional(),
  featureCode: z.string().trim().max(64).optional(),
});

const cloudChunkSchema = z.object({
  apiBase: z.string().trim().min(8).max(160),
  sessionId: z.string().trim().min(8).max(4096),
  featureCode: z.string().trim().min(8).max(64),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().trim().min(1).max(64),
  pageIndex: z.number().int().min(1).max(500),
  elementIds: z.string().trim().max(4000).optional(),
  kind: z.enum(["transaction"]).optional(),
});

export type CloudLoginInput = z.infer<typeof cloudLoginSchema>;
export type CloudChunkInput = z.infer<typeof cloudChunkSchema>;

export const hikLoginFn = createServerFn({ method: "POST" })
  .validator((data: CloudLoginInput) => cloudLoginSchema.parse(data))
  .handler(async ({ data }) => {
    const {requireLegacyActor}=await import("./access/auth.server");
    await requireLegacyActor();
    const { hikLogin } = await import("./hik-connect.server");
    return hikLogin(data.account, data.password, data.imageCode ?? "", data.featureCode ?? "", data.smsCode ?? "");
  });

export const hikPullFn = createServerFn({ method: "POST" })
  .validator((data: CloudChunkInput) => cloudChunkSchema.parse(data))
  .handler(async ({ data }) => {
    const {requireLegacyActor}=await import("./access/auth.server");
    await requireLegacyActor();
    const { hikPullChunk } = await import("./hik-connect.server");
    return hikPullChunk(data);
  });

const mapSchema = z.object({
  apiBase: z.string().trim().min(8).max(160),
  sessionId: z.string().trim().min(8).max(4096),
});

export const hikMapFn = createServerFn({ method: "POST" })
  .validator((data: { apiBase: string; sessionId: string }) => mapSchema.parse(data))
  .handler(async ({ data }) => {
    const {requireLegacyActor}=await import("./access/auth.server");
    await requireLegacyActor();
    const { hikReadMap } = await import("./hik-connect.server");
    return hikReadMap(data.apiBase, data.sessionId);
  });

const peopleSchemaInput = z.object({
  apiBase: z.string().trim().min(8).max(160),
  sessionId: z.string().trim().min(8).max(4096),
});

export const hikPeopleSchemaFn = createServerFn({ method: "POST" })
  .validator((data: z.infer<typeof peopleSchemaInput>) => peopleSchemaInput.parse(data))
  .handler(async ({ data }) => {
    const {requireLegacyActor}=await import("./access/auth.server");
    await requireLegacyActor();
    const { hikInspectPeopleSchema } = await import("./hik-connect.server");
    return hikInspectPeopleSchema(data.apiBase, data.sessionId);
  });

export const pullChunkFn = createServerFn({ method: "POST" })
  .validator((data: ChunkInput) => chunkSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireLegacyActor: requireActor } = await import("./access/auth.server");
    const { requireRole, AccessError } = await import("./access/store.server");
    try { requireRole(await requireActor(), "operator"); }
    catch (error) { if (error instanceof AccessError) return { ok: false as const, error: error.message }; throw error; }
    const { pullChunk } = await import("./hikvision.server");
    return pullChunk(data);
  });

const gateSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

export const openGateFn = createServerFn({ method: "POST" })
  .validator((data: { username: string; password: string }) => gateSchema.parse(data))
  .handler(async ({ data }) => {
    const { login } = await import("./access/auth.server");
    return login(data.username, data.password);
  });

export const gateSessionFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireLegacyActor: requireActor } = await import("./access/auth.server");
  try { await requireActor(); return { ok: true }; }
  catch { return { ok: false }; }
});

const photosSchema = linkSchema.extend({ employeeNos: z.array(z.string().trim().min(1).max(32)).max(40) });

export const devicePhotosFn = createServerFn({ method: "POST" })
  .validator((data: z.infer<typeof photosSchema>) => photosSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireLegacyActor: requireActor } = await import("./access/auth.server");
    const { requireRole, AccessError } = await import("./access/store.server");
    try { requireRole(await requireActor(), "operator"); }
    catch (error) { if (error instanceof AccessError) return { ok: false as const, error: error.message }; throw error; }
    const { devicePhotos } = await import("./hikvision.server");
    const { employeeNos, ...link } = data;
    return devicePhotos(link, employeeNos);
  });
