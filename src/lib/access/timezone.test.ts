import test from "node:test";
import assert from "node:assert/strict";
import { hikZoneFor, localIso, deviceLocalMs, withClock, hostMismatch } from "./timezone.ts";
test("time sync helpers: UTC+2 → CST-2:00:00, localTime with offset, read-back", () => {
  assert.equal(hikZoneFor(120), "CST-2:00:00");
  const ms = Date.parse("2026-11-02T12:52:07Z");
  assert.equal(localIso(ms, 120), "2026-11-02T14:52:07+02:00");
  assert.equal(deviceLocalMs("2026-11-02T14:52:07+02:00"), ms);
  assert.equal(deviceLocalMs("2026-11-02T14:52:07", "CST-2:00:00"), ms);
  const xml = "<Time><timeMode>manual</timeMode><localTime>2026-11-02T13:00:00+01:00</localTime><timeZone>CST-1:00:00</timeZone></Time>";
  assert.equal(withClock(xml, "CST-2:00:00", "2026-11-02T14:52:07+02:00"), "<Time><timeMode>manual</timeMode><localTime>2026-11-02T14:52:07+02:00</localTime><timeZone>CST-2:00:00</timeZone></Time>");
  assert.match(withClock("<Time><timeMode>NTP</timeMode><timeZone>CST+0:00:00</timeZone></Time>", "CST-2:00:00", "X"), /<localTime>X<\/localTime><timeZone>CST-2:00:00/);
  assert.equal(hostMismatch("CST-2:00:00", 5, 120), "");
  assert.match(hostMismatch("CST-3:00:00", 3600, 120), /UTC\+3.*UTC\+2.*متقدمة 60 دقيقة/);
});
