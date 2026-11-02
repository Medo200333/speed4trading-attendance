// Pure helpers for removing a device from the app's local state only.
// Never talks to the physical device.
type Row = { deviceId?: string; employeeNo?: string };
export type RemovalState = {
  devices: { id: string; name: string; host: string; port: number }[];
  people: Row[];
  events: Row[];
  doors?: Row[];
};
export type RemovalImpact = {
  deviceId: string;
  name: string;
  host: string;
  port: number;
  events: number;
  employees: number;
  deviceOnlyEmployees: number;
  sharedEmployees: number;
};
export function removalImpact(state: RemovalState, deviceId: string): RemovalImpact | null {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device) return null;
  const mine = state.people.filter((p) => p.deviceId === deviceId);
  const elsewhere = new Set(
    state.people.filter((p) => p.deviceId !== deviceId).map((p) => String(p.employeeNo)),
  );
  const shared = mine.filter((p) => elsewhere.has(String(p.employeeNo))).length;
  return {
    deviceId,
    name: device.name,
    host: device.host,
    port: device.port,
    events: state.events.filter((e) => e.deviceId === deviceId).length,
    employees: mine.length,
    deviceOnlyEmployees: mine.length - shared,
    sharedEmployees: shared,
  };
}
export function removeDeviceFromState<S extends RemovalState>(
  state: S,
  deviceId: string,
  options: { removeEvents?: boolean; removeEmployees?: boolean } = {},
): RemovalImpact | null {
  const impact = removalImpact(state, deviceId);
  if (!impact) return null;
  state.devices = state.devices.filter((d) => d.id !== deviceId) as S["devices"];
  if (state.doors) state.doors = state.doors.filter((d) => d.deviceId !== deviceId);
  if (options.removeEvents)
    state.events = state.events.filter((e) => e.deviceId !== deviceId) as S["events"];
  if (options.removeEmployees)
    state.people = state.people.filter((p) => p.deviceId !== deviceId) as S["people"];
  return impact;
}
