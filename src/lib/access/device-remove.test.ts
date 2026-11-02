import test from "node:test";
import assert from "node:assert/strict";
import { removalImpact, removeDeviceFromState } from "./device-remove-core.ts";
const fresh = () => ({
  devices: [
    { id: "a", name: "bm", host: "192.168.1.24", port: 80 },
    { id: "b", name: "branch", host: "192.168.1.2", port: 80 },
  ],
  people: [
    { deviceId: "a", employeeNo: "1" },
    { deviceId: "a", employeeNo: "2" },
    { deviceId: "b", employeeNo: "1" },
  ],
  events: [{ deviceId: "a" }, { deviceId: "a" }, { deviceId: "b" }],
  doors: [{ deviceId: "a" }, { deviceId: "b" }],
});
test("device removal impact counts records and device-only employees", () => {
  assert.deepEqual(removalImpact(fresh(), "a"), {
    deviceId: "a", name: "bm", host: "192.168.1.24", port: 80,
    events: 2, employees: 2, deviceOnlyEmployees: 1, sharedEmployees: 1,
  });
  assert.equal(removalImpact(fresh(), "x"), null);
});
test("default removal keeps history (events and employees)", () => {
  const s = fresh();
  removeDeviceFromState(s, "a");
  assert.deepEqual(s.devices.map((d) => d.id), ["b"]);
  assert.equal(s.events.length, 3);
  assert.equal(s.people.length, 3);
  assert.equal(s.doors.length, 1);
});
test("removal with data drops only that device's events and employees", () => {
  const s = fresh();
  removeDeviceFromState(s, "a", { removeEvents: true, removeEmployees: true });
  assert.deepEqual(s.events, [{ deviceId: "b" }]);
  assert.deepEqual(s.people, [{ deviceId: "b", employeeNo: "1" }]);
});
