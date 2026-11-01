// In-memory (per browser tab) copy of the last Hik-Connect Team pull, shared between the
// attendance screen (which logs in and pulls) and the daily report with photos.
// Never persisted: it holds real employee photos.
import { useSyncExternalStore } from "react";
import type { Punch } from "./attendance";

export type TeamsPull = { punches: Punch[]; people: { employeeNo: string; name: string; photo: string }[]; from: string; to: string; label: string; at: number };
let current: TeamsPull | null = null;
const listeners = new Set<() => void>();
export function publishTeamsPull(next: TeamsPull | null) {
  current = next;
  for (const l of listeners) l();
}
export const teamsPull = () => current;
export function useTeamsPull() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
    () => null,
  );
}
