import test from "node:test";
import assert from "node:assert/strict";
import { deviceWritesEnabled } from "./device-writes.ts";

test("device writes are off by default", () => {
  assert.equal(deviceWritesEnabled({}), false);
  assert.equal(deviceWritesEnabled({ SPEED_DEVICE_WRITES: "0" }), false);
  assert.equal(deviceWritesEnabled({ SPEED_DEVICE_WRITES: "" }), false);
});
test("device writes need an explicit opt-in", () => {
  assert.equal(deviceWritesEnabled({ SPEED_DEVICE_WRITES: "1" }), true);
  assert.equal(deviceWritesEnabled({ SPEED_DEVICE_WRITES: "true" }), true);
});
