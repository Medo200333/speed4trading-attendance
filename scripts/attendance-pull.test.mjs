import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { createAccessFixture } from "./access-test-device.mjs";
const admin = {
  username: "fixture-admin",
  name: "fixture",
  role: "admin",
  sessionId: "pull-fixture",
};
async function setup() {
  process.env.SKYLINE_ACCESS_DATA_DIR = mkdtempSync(
    join(tmpdir(), "skyline-pull-test-"),
  );
  process.env.SKYLINE_DISABLE_SCHEDULER = "1";
  delete process.env.SKYLINE_VAULT_KEY;
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, watch: null },
    appType: "custom",
  });
  const fixture = await createAccessFixture();
  const store = await vite.ssrLoadModule("/src/lib/access/store.server.ts");
  const service = await vite.ssrLoadModule("/src/lib/access/service.server.ts");
  const protocol = await vite.ssrLoadModule("/src/lib/access/search-page.ts");
  await store.updateState((s) =>
    Object.assign(s.devices[0], {
      host: fixture.link.host,
      port: fixture.link.port,
    }),
  );
  await service.actionCenter(admin, {
    action: "connect",
    deviceId: "hikvision-main",
    username: fixture.link.username,
    password: fixture.link.password,
  });
  return {
    vite,
    fixture,
    store,
    service,
    protocol,
    close: async () => {
      await fixture.close();
      await vite.close();
    },
  };
}
test("strict ISAPI JSON/XML metadata, singleton, empty, invalid pages and Push shape", async () => {
  const c = await setup();
  try {
    const parse = (body) =>
      c.protocol.parseSearchPage(body, "events", 0, "query");
    const page = {
      searchID: "query",
      numOfMatches: "1",
      totalMatches: "1",
      responseStatusStrg: "OK",
      InfoList: {
        major: 5,
        minor: 75,
        time: "2015-01-01T00:01:00+08:00",
        employeeNoString: "1",
      },
    };
    assert.equal(parse(JSON.stringify({ AcsEvent: page })).records.length, 1);
    assert.equal(
      parse(
        '<is:AcsEvent xmlns:is="urn:test"><is:searchID>query</is:searchID><is:numOfMatches>1</is:numOfMatches><is:totalMatches>1</is:totalMatches><is:responseStatusStrg>OK</is:responseStatusStrg><is:InfoList><is:Info><is:major>5</is:major><is:minor>75</is:minor><is:time>2015-01-01T08:00:00+08:00</is:time><is:employeeNoString>&#49;</is:employeeNoString></is:Info></is:InfoList></is:AcsEvent>',
      ).records[0].employeeNoString,
      "1",
    );
    assert.equal(
      parse(
        JSON.stringify({
          AcsEvent: {
            numOfMatches: "0",
            totalMatches: "0",
            responseStatusStrg: "NO MATCH",
          },
        }),
      ).done,
      true,
    );
    for (const changed of [
      { numOfMatches: 2 },
      { totalMatches: 0 },
      { searchID: "other" },
      { numOfMatches: 0, InfoList: [], totalMatches: 2 },
      { responseStatusStrg: "MORE" },
      { InfoList: undefined, matchList: [page.InfoList] },
    ])
      assert.throws(() =>
        parse(JSON.stringify({ AcsEvent: { ...page, ...changed } })),
      );
    assert.throws(() => parse("<html>not an ISAPI response</html>"));
    assert.throws(() =>
      parse('<!DOCTYPE a [<!ENTITY p SYSTEM "file:///x">]><AcsEvent/>'),
    );
    const bounds = c.protocol.eventTimeBounds("2015-01-01", "2015-01-03");
    assert.ok(
      Date.parse(bounds.startTime) < Date.parse("2015-01-01T00:00:00+08:00"),
    );
    assert.ok(
      Date.parse(bounds.endTime) > Date.parse("2015-01-03T23:59:59+08:00"),
    );
  } finally {
    await c.close();
  }
});
test("Digest historical pull: 57 raw / 25 verification / 24 unique; empty October, users-only watermark, diagnostics authorization", async () => {
  const c = await setup();
  try {
    Object.assign(c.fixture.faults, {
      requireEventOffset: true,
      eventStringCounts: true,
      eventCapabilitiesMissing: true,
    });
    await c.service.actionCenter(admin, {
      action: "probe",
      deviceId: "hikvision-main",
    });
    assert.equal(
      (await c.store.readState()).devices[0].capabilities.find(
        (c) => c.feature === "events",
      ).state,
      "unsupported",
    );
    await c.service.synchronize(
      admin,
      "hikvision-main",
      "2015-01-01",
      "2015-01-03",
    );
    let state = await c.store.readState(),
      sync = state.devices[0].sync;
    assert.equal(sync.scanned, 57);
    assert.equal(sync.valid, 25);
    assert.equal(sync.uniqueVerifications, 24);
    assert.equal(sync.duplicates, 1);
    assert.equal(sync.storedInPeriod, 56);
    assert.equal(sync.pages, 6);
    assert.deepEqual(sync.diagnostic.years, ["2015"]);
    assert.deepEqual(sync.diagnostic.offsets, ["+08:00"]);
    assert.ok(
      state.events.every(
        (e) =>
          e.date.startsWith("2015") && e.originalTimestamp.endsWith("+08:00"),
      ),
    );
    assert.equal(
      (
        await c.service.queryCenter(admin, {
          action: "events",
          deviceId: "hikvision-main",
          start: "2015-01-01",
          end: "2015-01-03",
          category: "verification",
        })
      ).eventsPage.total,
      24,
    );
    const attendance = (
      await c.service.queryCenter(admin, {
        action: "attendance",
        deviceId: "hikvision-main",
        start: "2015-01-01",
        end: "2015-01-03",
      })
    ).report;
    assert.ok(attendance.some((r) => r.count > 0 && r.date === "2015-01-01"));
    const previous = JSON.stringify(sync),
      last = state.devices[0].lastSync;
    await c.service.synchronize(
      admin,
      "hikvision-main",
      "2026-10-22",
      "2026-10-22",
      true,
    );
    sync = (await c.store.readState()).devices[0].sync;
    assert.equal(
      sync.lastAttendanceSync,
      JSON.parse(previous).lastAttendanceSync,
    );
    assert.equal((await c.store.readState()).devices[0].lastSync, last);
    assert.equal(sync.scanned, 57);
    assert.deepEqual(sync.period, { start: "2015-01-01", end: "2015-01-03" });
    c.fixture.faults.eventXml = true;
    await c.service.synchronize(
      admin,
      "hikvision-main",
      "2015-01-01",
      "2015-01-03",
    );
    assert.equal((await c.store.readState()).devices[0].sync.duplicates, 57);
    await c.service.synchronize(
      admin,
      "hikvision-main",
      "2026-10-01",
      "2026-10-22",
    );
    state = await c.store.readState();
    sync = state.devices[0].sync;
    assert.equal(sync.result, "success");
    assert.equal(sync.scanned, 0);
    assert.equal(sync.uniqueVerifications, 0);
    assert.equal(sync.lastError, "");
    assert.equal(
      state.events.length,
      56,
      "empty current period must not remove or redate history",
    );
    await assert.rejects(
      c.service.actionCenter(
        { ...admin, role: "operator" },
        {
          action: "sync.diagnose",
          deviceId: "hikvision-main",
          start: "2015-01-01",
          end: "2015-01-03",
        },
      ),
      (e) => e.code === "FORBIDDEN",
    );
    const before = state.events.length;
    await c.service.actionCenter(admin, {
      action: "sync.diagnose",
      deviceId: "hikvision-main",
      start: "2015-01-01",
      end: "2015-01-03",
    });
    state = await c.store.readState();
    assert.equal(state.events.length, before, "diagnostic does not import");
    const serialized = JSON.stringify(state.devices[0].sync.diagnostic);
    assert.ok(
      !/employeeNo|serialNo|pictureURL|password|"mk"|yousef|nonce/i.test(
        serialized,
      ),
    );
    assert.equal(c.fixture.mutations.length, 0);
  } finally {
    await c.close();
  }
});
test("read failures never become empty success; user search failure does not prevent attendance", async () => {
  const c = await setup();
  try {
    c.fixture.faults.repeatedEventPage = true;
    await assert.rejects(
      c.service.synchronize(
        admin,
        "hikvision-main",
        "2015-01-01",
        "2015-01-03",
      ),
      (e) => e.code === "DEVICE_PROTOCOL",
    );
    let sync = (await c.store.readState()).devices[0].sync;
    assert.equal(sync.result, "failed");
    assert.equal(sync.lastAttendanceSync, undefined);
    c.fixture.faults.repeatedEventPage = false;
    c.fixture.faults.brokenEventCount = true;
    await assert.rejects(
      c.service.synchronize(
        admin,
        "hikvision-main",
        "2015-01-01",
        "2015-01-03",
      ),
      (e) => e.code === "DEVICE_PROTOCOL",
    );
    c.fixture.faults.brokenEventCount = false;
    c.fixture.faults.userSearchFailure = true;
    await c.service.synchronize(
      admin,
      "hikvision-main",
      "2015-01-01",
      "2015-01-03",
    );
    sync = (await c.store.readState()).devices[0].sync;
    assert.equal(sync.result, "success");
    assert.equal(sync.uniqueVerifications, 24);
    assert.ok(sync.userWarning);
    assert.equal(c.fixture.mutations.length, 0);
  } finally {
    await c.close();
  }
});

test("HTTP 400 regression: fractional timestamps rejected, second precision succeeds without moving 2015", async () => {
  const c = await setup();
  try {
    c.fixture.faults.rejectFractionalEventTime = true;
    const adapter = await c.vite.ssrLoadModule(
      "/src/lib/access/isapi.server.ts",
    );
    const context = await adapter.eventSearchContext(
      (await c.store.readState()).devices[0],
    );
    const oldBody = {
      AcsEventCond: {
        searchID: "old-regression",
        searchResultPosition: 0,
        maxResults: 30,
        major: 0,
        minor: 0,
        startTime: "2014-12-31T10:00:00.000+00:00",
        endTime: "2015-01-04T13:59:59.000+00:00",
        picEnable: false,
      },
    };
    const rejected = await context.client.request(
      "/ISAPI/AccessControl/AcsEvent?format=json",
      "POST",
      JSON.stringify(oldBody),
    );
    assert.equal(rejected.status, 400);
    assert.match(rejected.text, /fractional seconds/);
    await c.service.synchronize(
      admin,
      "hikvision-main",
      "2015-01-01",
      "2015-01-03",
    );
    const state = await c.store.readState(),
      d = state.devices[0].sync.diagnostic;
    assert.equal(d.raw, 57);
    assert.equal(d.uniqueVerifications, 24);
    assert.equal(d.attempts.length, 1);
    assert.equal(d.attempts[0].http, 200);
    assert.ok(!d.attempts[0].request.AcsEventCond.startTime.includes(".000"));
    assert.ok(
      state.events.every(
        (e) =>
          e.originalTimestamp.endsWith("+08:00") && e.date.startsWith("2015"),
      ),
    );
    assert.equal(c.fixture.mutations.length, 0);
  } finally {
    await c.close();
  }
});
test("HTTP 400 negotiates page size and optional fields only on first page, keeping selected searchID and filters", async () => {
  const c = await setup();
  try {
    Object.assign(c.fixture.faults, {
      eventMaxResults: 10,
      rejectEventPictureFlag: true,
    });
    await c.service.actionCenter(admin, {
      action: "sync.diagnose",
      deviceId: "hikvision-main",
      start: "2015-01-01",
      end: "2015-01-03",
    });
    let state = await c.store.readState(),
      d = state.devices[0].sync.diagnostic;
    assert.equal(d.raw, 57);
    assert.equal(d.uniqueVerifications, 24);
    assert.equal(state.events.length, 0);
    const attempts = d.attempts.filter((a) => a.purpose === "period");
    assert.deepEqual(
      attempts.map((a) => a.http),
      [400, 400, 200],
    );
    assert.match(attempts[0].response.errorMsg, /maxResults/);
    assert.match(attempts[1].response.errorMsg, /picEnable/);
    assert.equal(attempts[2].request.AcsEventCond.picEnable, undefined);
    const selected = attempts[2].request.AcsEventCond;
    const later = c.fixture.requests
      .filter((r) => r.body.AcsEventCond?.searchID === selected.searchID)
      .map((r) => r.body.AcsEventCond);
    assert.deepEqual(
      later.map((r) => r.searchResultPosition),
      [0, 10, 20, 30, 40, 50],
    );
    assert.ok(
      later.every(
        (r) =>
          r.major === 0 &&
          r.minor === 0 &&
          r.maxResults === 10 &&
          r.startTime === selected.startTime &&
          r.endTime === selected.endTime,
      ),
    );
    await c.service.actionCenter(admin, {
      action: "sync.diagnose",
      deviceId: "hikvision-main",
      start: "2026-10-01",
      end: "2026-10-22",
    });
    d = (await c.store.readState()).devices[0].sync.diagnostic;
    assert.equal(d.raw, 0);
    assert.equal(d.uniqueVerifications, 0);
    assert.ok(
      d.attempts.some((a) => a.purpose === "basic" && a.accepted),
      "unfiltered diagnostic success must not become period count",
    );
    assert.equal(c.fixture.mutations.length, 0);
  } finally {
    await c.close();
  }
});
test("legacy major=5 and local-time compatibility disclose limited scope and retain successful face events", async () => {
  const c = await setup();
  try {
    Object.assign(c.fixture.faults, {
      rejectEventMajorZero: true,
      eventLocalTimeOnly: true,
    });
    c.fixture.events[30].minor = 75;
    await c.service.actionCenter(admin, {
      action: "sync.diagnose",
      deviceId: "hikvision-main",
      start: "2015-01-01",
      end: "2015-01-03",
    });
    const d = (await c.store.readState()).devices[0].sync.diagnostic;
    assert.equal(d.scope, "major5");
    assert.match(d.warning, /major=5/);
    assert.equal(d.uniqueVerifications, 24);
    assert.equal(d.codes["5/75"], 1);
    const selected = d.attempts.find(
      (a) => a.purpose === "period" && a.accepted,
    ).request.AcsEventCond;
    assert.equal(selected.major, 5);
    assert.equal(selected.maxResults, 10);
    assert.match(selected.startTime, /T\d{2}:\d{2}:\d{2}$/);
    assert.ok(d.offsets.includes("+08:00"));
    assert.equal(c.fixture.mutations.length, 0);
  } finally {
    await c.close();
  }
});
test("all HTTP 400 failures persist safe ResponseStatus details and never replace prior success with empty counts", async () => {
  const c = await setup();
  try {
    await c.service.synchronize(
      admin,
      "hikvision-main",
      "2015-01-01",
      "2015-01-03",
    );
    const before = await c.store.readState(),
      last = before.devices[0].sync.lastAttendanceSync;
    Object.assign(c.fixture.faults, {
      eventForce400: true,
      eventErrorXml: true,
    });
    await assert.rejects(
      c.service.actionCenter(admin, {
        action: "sync.diagnose",
        deviceId: "hikvision-main",
        start: "2026-10-01",
        end: "2026-10-22",
      }),
      (e) =>
        e.code === "DEVICE_HTTP" && /AcsEventCond rejected/.test(e.message),
    );
    const after = await c.store.readState(),
      sync = after.devices[0].sync;
    assert.equal(sync.diagnosticStatus, "failed");
    assert.equal(sync.lastAttendanceSync, last);
    assert.equal(after.events.length, before.events.length);
    assert.equal(sync.diagnosticFailure.attempts.at(-1).http, 400);
    assert.equal(
      sync.diagnosticFailure.attempts.at(-1).response.subStatusCode,
      "badParameters",
    );
    assert.match(
      sync.diagnosticFailure.attempts.at(-1).excerpt,
      /Invalid Content/,
    );
    assert.equal(
      sync.diagnostic.raw,
      57,
      "retain last successful summary with its own period",
    );
    assert.equal(c.fixture.mutations.length, 0);
  } finally {
    await c.close();
  }
});
test("later-page HTTP 400 never restarts search or silently truncates, and sanitized summaries cannot leak credentials", async () => {
  const c = await setup();
  try {
    c.fixture.faults.eventFailLaterPage = true;
    await assert.rejects(
      c.service.synchronize(
        admin,
        "hikvision-main",
        "2015-01-01",
        "2015-01-03",
      ),
      (e) => e.code === "DEVICE_HTTP",
    );
    const eventRequests = c.fixture.requests.filter((r) => r.body.AcsEventCond);
    assert.deepEqual(
      eventRequests.map((r) => r.body.AcsEventCond.searchResultPosition),
      [0, 10],
    );
    const sync = (await c.store.readState()).devices[0].sync;
    assert.equal(sync.result, "failed");
    assert.equal(sync.lastAttendanceSync, undefined);
    const adapter = await c.vite.ssrLoadModule(
      "/src/lib/access/isapi.server.ts",
    );
    const context = await adapter.eventSearchContext(
      (await c.store.readState()).devices[0],
    );
    const body = {
      ResponseStatus: {
        statusCode: 6,
        errorMsg:
          "x".repeat(500) +
          c.fixture.link.password +
          " username=" +
          c.fixture.link.username +
          " token=secret-token",
      },
      InfoList: [
        { employeeNoString: "DO_NOT_LOG", pictureURL: "http://secret.invalid" },
      ],
      password: c.fixture.link.password,
    };
    const summary = context.client.summarize({
      status: 400,
      text: JSON.stringify(body),
    });
    const serialized = JSON.stringify(summary);
    assert.ok(!serialized.includes(c.fixture.link.password));
    assert.ok(!serialized.includes(c.fixture.link.username));
    assert.ok(!serialized.includes("DO_NOT_LOG"));
    assert.ok(!serialized.includes("secret.invalid"));
    assert.equal(c.fixture.mutations.length, 0);
  } finally {
    await c.close();
  }
});

test("optional time filters rejected: complete unfiltered pagination still selects literal 2015 dates and keeps October separate", async () => {
  const c = await setup();
  try {
    c.fixture.faults.rejectEventTimeFilters = true;
    await c.service.actionCenter(admin, {
      action: "sync.diagnose",
      deviceId: "hikvision-main",
      start: "2015-01-01",
      end: "2015-01-03",
    });
    let d = (await c.store.readState()).devices[0].sync.diagnostic;
    assert.equal(d.raw, 57);
    assert.equal(d.uniqueVerifications, 24);
    assert.equal(d.scope, "all");
    assert.match(d.warning, /الفلاتر الزمنية/);
    const request = d.attempts.find((a) => a.purpose === "period" && a.accepted)
      .request.AcsEventCond;
    assert.equal(request.startTime, undefined);
    assert.equal(request.endTime, undefined);
    await c.service.actionCenter(admin, {
      action: "sync.diagnose",
      deviceId: "hikvision-main",
      start: "2026-10-01",
      end: "2026-10-22",
    });
    d = (await c.store.readState()).devices[0].sync.diagnostic;
    assert.equal(d.raw, 57);
    assert.equal(d.outsidePeriod, 57);
    assert.equal(d.uniqueVerifications, 0);
    assert.equal((await c.store.readState()).events.length, 0);
    assert.equal(c.fixture.mutations.length, 0);
  } finally {
    await c.close();
  }
});
