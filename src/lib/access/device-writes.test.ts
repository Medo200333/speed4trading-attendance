import test from "node:test";
import assert from "node:assert/strict";
import { deviceWritesEnabled } from "./device-writes.ts";

test("device management is enabled by default", () => {
  assert.equal(deviceWritesEnabled({}), true);
  assert.equal(deviceWritesEnabled({ SPEED_DEVICE_WRITES: "" }), true);
  assert.equal(deviceWritesEnabled({ SPEED_DEVICE_WRITES: "1" }), true);
});
test("device writes can be locked to read-only", () => {
  for (const v of ["0", "false", "no", "off", " OFF "]) assert.equal(deviceWritesEnabled({ SPEED_DEVICE_WRITES: v }), false);
});
