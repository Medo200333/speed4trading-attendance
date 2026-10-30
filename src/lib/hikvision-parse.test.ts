import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEventPayload, parseUserPayload, punchesFromPortal } from "./hikvision-parse.ts";

test("keeps only successful verification records and preserves the device wall time", () => {
  const page = parseEventPayload(JSON.stringify({
    AcsEvent: {
      responseStatusStrg: "MORE",
      numOfMatches: 5,
      totalMatches: 57,
      InfoList: [
        { major: 1, minor: 75, employeeNoString: "1", time: "2025-05-01T08:00:00+03:00" },
        { major: 5, minor: 3, employeeNoString: "1", time: "2025-05-01T08:01:00+03:00" },
        { major: 5, minor: 113, employeeNoString: "2", time: "2025-05-01T07:12:00+02:00" },
        { major: 5, minor: 25, employeeNoString: "2", time: "2025-05-01T07:13:00+02:00" },
        { major: 5, minor: 38, employeeNoString: "2", time: "2025-05-01T07:15:30+02:00" },
      ],
    },
  }));
  assert.equal(page.meta.count, 5);
  assert.equal(page.meta.total, 57);
  assert.deepEqual(page.punches.map(({ employeeNo, date, time }) => ({ employeeNo, date, time })), [
    { employeeNo: "2", date: "2025-05-01", time: "07:15:30" },
  ]);
});

test("reads user page metadata independently of attendance", () => {
  const page = parseUserPayload(JSON.stringify({ UserInfoSearch: {
    responseStatusStrg: "MORE",
    numOfMatches: 2,
    totalMatches: 3,
    UserInfo: [{ employeeNo: "1", name: "mk" }, { employeeNo: "2", name: "yousef" }],
  } }));
  assert.equal(page.people.length, 2);
  assert.equal(page.meta.count, 2);
  assert.equal(page.meta.total, 3);
});

test("counts raw events even when an entire page is excluded", () => {
  const page = parseEventPayload(JSON.stringify({ AcsEvent: {
    responseStatusStrg: "MORE", totalMatches: 57,
    InfoList: [{ major: 3, minor: 113 }, { major: 5, minor: 113 }],
  } }));
  assert.equal(page.meta.count, 2);
  assert.equal(page.punches.length, 0);
});

test("keeps Hik-Connect portal records and their original wall time", () => {
  const result = punchesFromPortal({ data: { totalNum: 1, recordList: [{
    personInfo: { personCode: "2", fullName: "yousef" }, deviceTime: "2025-05-01T07:15:30+02:00",
  }] } });
  assert.equal(result.total, 1);
  assert.equal(result.punches[0].employeeNo, "2");
  assert.equal(result.punches[0].time, "07:15:30");
});
