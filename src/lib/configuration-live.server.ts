/**
 * Strictly read-only, bounded Hik-Connect Team inventory snapshot.
 * Checkpoints are NOT physical device records or area/door assignments.
 * Unrecognized response shapes remain UNKNOWN, never empty by assumption.
 */
export type LiveSourceState = "ok" | "empty" | "unknown" | "denied" | "error";
export type LiveRead<T> = {
  state: LiveSourceState;
  http: number;
  records: T[];
  complete: boolean;
  source: string;
};
export type LiveCheckpoint = { id: string; name: string };
export type LiveGroup = { id: string; name: string };
export type LivePhysicalDevice = { id: string; name: string };
export type LiveConfigSnapshot = {
  capturedAt: string;
  kind: "HIK_CONNECT_PARTIAL_READ_ONLY";
  checkpoints: LiveRead<LiveCheckpoint>;
  groups: LiveRead<LiveGroup>;
  devices: LiveRead<LivePhysicalDevice>;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Obj : null;
const cell = (v: unknown): string => (typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) ? String(v).trim().slice(0, 160) : "";
const safeSource = (source: string): LiveRead<never> => ({ state: "unknown", http: 0, records: [], complete: false, source });

function upstream(apiBase: string): string {
  let url: URL;
  try { url = new URL(apiBase.trim()); }
  catch { throw new Error("INVALID_TEAM_URL"); }
  const host = url.hostname.toLowerCase();
  const allowedHost = host === "hikcentralconnect.com" || host.endsWith(".hikcentralconnect.com");
  if (url.protocol !== "https:" || !allowedHost ||
      url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("INVALID_TEAM_URL");
  }
  // Match the existing application's assertPortal behavior: a valid Team API
  // base may include a service prefix. Never silently discard that prefix.
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

async function postRead(base: string, sessionId: string, source: string, body: Obj): Promise<{ state: LiveSourceState; http: number; payload: Obj | null }> {
  try {
    const response = await fetch(base + source, {
      method: "POST",
      redirect: "error",
      headers: {
        clientSource: "0", clientType: "48", lang: "en-US",
        Accept: "application/json", "Content-Type": "application/json",
        Cookie: `JSESSIONID=${sessionId}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const http = response.status;
    if (http === 401 || http === 403) return { state: "denied", http, payload: null };
    if (!response.ok) return { state: "error", http, payload: null };
    if (!response.body) return { state: "unknown", http, payload: null };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let count = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      count += next.value.byteLength;
      if (count > 512_000) {
        await reader.cancel();
        return { state: "unknown", http, payload: null };
      }
      chunks.push(next.value);
    }
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return { state: "unknown", http, payload: null }; }
    const payload = obj(decoded);
    if (!payload || (typeof payload.errorCode === "string" && payload.errorCode !== "0")) {
      return { state: "unknown", http, payload: null };
    }
    const meta = obj(payload.meta);
    if (typeof meta?.code === "number" && meta.code !== 0 && meta.code !== 200) {
      return { state: "unknown", http, payload: null };
    }
    return { state: "ok", http, payload };
  } catch {
    return { state: "error", http: 0, payload: null };
  }
}

async function readCollection<T extends { id: string; name: string }>(
  base: string,
  sessionId: string,
  source: string,
  body: Obj,
  arrayKey: string,
  pageSize: number | null,
): Promise<LiveRead<T>> {
  const response = await postRead(base, sessionId, source, body);
  if (!response.payload) {
    return { ...safeSource(source), state: response.state, http: response.http };
  }
  const data = obj(response.payload.data) ?? response.payload;
  const list = data[arrayKey];
  if (!Array.isArray(list)) {
    return { ...safeSource(source), http: response.http };
  }
  // Use only explicitly returned record identifiers and names; never fabricate a relationship.
  const records: T[] = [];
  const seen = new Set<string>();
  for (const value of list.slice(0, 101)) {
    const record = obj(value);
    if (!record) continue;
    const id = cell(record.elementId ?? record.id ?? record.groupId ?? record.deviceId);
    const name = cell(record.name ?? record.groupName ?? record.deviceName);
    if (!name) continue;
    const dedupe = id ? `id:${id}` : `name:${name}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    records.push({ id, name } as T);
  }
  // No documented total or cursor contract yet: NEVER mark the inventory complete.
  // Empty list is empty for THIS QUERY only, not a globally empty team.
  return {
    state: list.length ? "ok" : "empty", http: response.http,
    source, complete: false,
    records: records.slice(0, 100),
  };
}

export async function readLiveConfiguration(apiBase: string, sessionId: string): Promise<LiveConfigSnapshot> {
  const base = upstream(apiBase);
  if (sessionId.length < 8 || sessionId.length > 4096 || /[\r\n]/.test(sessionId)) {
    throw new Error("INVALID_TEAM_SESSION");
  }
  const [checkpoints, groups, devices] = await Promise.all([
    readCollection<LiveCheckpoint>(base, sessionId, "/hccattendance/checkPoint/v1/list", { page: 1, pageSize: 100, name: "" }, "checkPoints", 100),
    readCollection<LiveGroup>(base, sessionId, "/ccfperson/v1/groups/search", { personGroupSearchRequest: { depthTraversal: true } }, "personGroupList", null),
    // This existing application candidate has not yet been proven. Unknown is not zero.
    readCollection<LivePhysicalDevice>(base, sessionId, "/ccfres/v1/devices/search", { pageIndex: 1, pageSize: 100 }, "deviceList", 100),
  ]);
  return { capturedAt: new Date().toISOString(), kind: "HIK_CONNECT_PARTIAL_READ_ONLY", checkpoints, groups, devices };
}
