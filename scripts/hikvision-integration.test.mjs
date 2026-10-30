import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
import { createTestDevice } from "./hikvision-test-device.mjs";

test("loads the server module, completes HTTP Digest and paginates users after events finish", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
  const device = await createTestDevice();
  try {
    const { testDevice, pullChunk } = await vite.ssrLoadModule("/src/lib/hikvision.server.ts");
    const { allowDeviceTarget } = await vite.ssrLoadModule("/src/lib/access/target.server.ts");
    allowDeviceTarget(device.link.host, device.link.port);
    const probe = await testDevice(device.link);
    assert.equal(probe.ok, true);
    assert.equal(probe.model, "DS-K1A340WX fixture");
    const rejected = await testDevice({ ...device.link, password: "incorrect-fixture-password" });
    assert.equal(rejected.ok, false);
    assert.ok(!JSON.stringify(rejected).includes("incorrect-fixture-password"));
    let state = { ...device.link, startDate: "2026-10-01", endDate: "2026-10-31", timeZone: "Africa/Cairo", eventSearchId: "fixture-events", eventPos: 0, eventsDone: false, variant: 0, pageSize: 10, usersDone: false, userSearchId: "fixture-users", userPos: 0 };
    const people = [];
    const punches = [];
    for (let guard = 0; guard < 5; guard += 1) {
      const result = await pullChunk(state);
      assert.equal(result.ok, true);
      people.push(...result.users);
      punches.push(...result.punches);
      state = { ...state, ...result };
      if (state.eventsDone && state.usersDone) break;
    }
    assert.equal(state.eventsDone, true);
    assert.equal(state.usersDone, true);
    assert.equal(state.eventPos, 57);
    assert.equal(people.length, 123);
    assert.equal(punches.length, 25);
    assert.equal(punches[0].time, "08:30:15");
    assert.deepEqual(device.requests.filter((r) => r.body.AcsEventCond).map((r) => r.body.AcsEventCond.searchResultPosition), [0, 10, 20, 30, 40, 50]);
    assert.deepEqual(device.requests.filter((r) => r.body.UserInfoSearchCond).map((r) => r.body.UserInfoSearchCond.searchResultPosition), [0, 30, 60, 90, 120]);
    const condition = device.requests.find((r) => r.body.AcsEventCond).body.AcsEventCond;
    assert.equal(condition.startTime, "2026-10-01T00:00:00+03:00");
    assert.equal(condition.endTime, "2026-10-31T23:59:59+02:00");
    assert.ok(device.requests.every((r) => r.method === "GET" || /\/Search\?|\/AcsEvent\?/.test(r.path)));
  } finally {
    await device.close();
    await vite.close();
  }
});
