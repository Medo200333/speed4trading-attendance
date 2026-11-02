// In-memory (per browser tab) copy of the last Hik-Connect pulls, shared between the attendance screen
// (which pulls) and the daily report with photos. Two cloud sources are kept apart:
//   "team"    – Hik-Connect Team website login (phone/email + password)
//   "openapi" – Hik-Connect for Teams OpenAPI (customer AK/SK)
// Never persisted: it holds real employee photos.
import { useSyncExternalStore } from "react";
import type { Punch } from "./attendance";

export type TeamsKind = "team" | "openapi";
export type TeamsAttempt = Punch & { device?: string; eventType?: number };
export type TeamsPull = {
  punches: Punch[];
  people: { employeeNo: string; name: string; photo: string }[];
  from: string; to: string; label: string; at: number;
  kind?: TeamsKind;
  /** OpenAPI only: records whose eventType ≠ 110013 («محاولة غير ناجحة»), never counted as attendance. */
  attempts?: TeamsAttempt[];
  /** OpenAPI only: devices whose clock (deviceTime) differs from the cloud time (occurTime). */
  clock?: { device: string; offsetMin: number; samples: number }[];
};
const current: Record<TeamsKind, TeamsPull | null> = { team: null, openapi: null };
const listeners = new Set<() => void>();
export function publishTeamsPull(next: TeamsPull | null, kind: TeamsKind = next?.kind ?? "team") {
  current[kind] = next ? { ...next, kind } : null;
  for (const l of listeners) l();
}
export const teamsPull = (kind: TeamsKind = "team") => current[kind];
export function useTeamsPull(kind: TeamsKind = "team") {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current[kind],
    () => null,
  );
}
